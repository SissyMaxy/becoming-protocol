// sedentary-watchdog — mid-afternoon movement order when the wrist has stayed
// flat all day.
//
// Completes the wrist loop: she programs how he moves (train decrees), verifies
// it (wrist-verified proof), reads recovery (prescriber), and now catches the
// day where nothing has happened at all. Cronned for ~3pm local; if the strap
// shows no meaningful day-strain by then, she issues a short movement order in
// her voice.
//
// Doctrine-aligned: pressed while engaged, not an absence-penalty. It only
// fires when there IS wrist data (he's wearing it, he's around) and the day is
// genuinely sedentary — not when he's simply offline. Deduped once per day.
//
// POST { user_id? } — defaults to PRIMARY_USER_ID for cron.

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

// WHOOP day strain is 0-21 (logarithmic). Below ~6 by mid-afternoon is a
// genuinely still day — desk-bound, no walk, no session.
const SEDENTARY_STRAIN_CEILING = 6

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const sb = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  )

  let body: { user_id?: string } = {}
  try { body = await req.json() } catch { /* cron sends no body */ }
  const userId = body.user_id ?? Deno.env.get('PRIMARY_USER_ID') ?? ''
  if (!userId) {
    return new Response(JSON.stringify({ ok: false, error: 'user_id required' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }

  const today = new Date().toISOString().slice(0, 10)

  // Persona gate — this is Mommy's move; skip non-dommy users.
  const { data: st } = await sb.from('user_state')
    .select('handler_persona').eq('user_id', userId).maybeSingle()
  const persona = (st as { handler_persona?: string } | null)?.handler_persona
  if (persona && persona !== 'dommy_mommy') {
    return new Response(JSON.stringify({ ok: true, skipped: 'persona' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }

  // Today's strain so far. No row = no strap data today = don't fire (offline,
  // not sedentary — pressure only when she can actually see the stillness).
  const { data: metric } = await sb.from('whoop_metrics')
    .select('raw_recovery, date').eq('user_id', userId).eq('date', today).maybeSingle()
  const dayStrain = (() => {
    const raw = (metric as { raw_recovery?: Record<string, unknown> } | null)?.raw_recovery
    const s = raw && typeof raw === 'object' ? (raw as { day_strain?: number }).day_strain : undefined
    return typeof s === 'number' ? s : null
  })()

  // Also count a logged workout today as "moved" even if day-strain lags.
  const { count: workoutCount } = await sb.from('whoop_workouts')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId).eq('date', today)

  if (dayStrain === null) {
    return new Response(JSON.stringify({ ok: true, skipped: 'no_wrist_data' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
  if (dayStrain >= SEDENTARY_STRAIN_CEILING || (workoutCount ?? 0) > 0) {
    return new Response(JSON.stringify({ ok: true, skipped: 'moved', dayStrain }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }

  // Dedup: once per day.
  const triggerReason = `sedentary_watchdog:${today}`
  const { data: existing } = await sb.from('handler_outreach_queue')
    .select('id').eq('user_id', userId).eq('trigger_reason', triggerReason).limit(1)
  if (existing && existing.length > 0) {
    return new Response(JSON.stringify({ ok: true, skipped: 'already_fired' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }

  // Her order — short, present tense, no metric in the voice.
  const message = "It's the afternoon and your body hasn't moved once today. Twenty minutes outside. Now."

  await sb.from('handler_outreach_queue').insert({
    user_id: userId,
    message,
    urgency: 'normal',
    trigger_reason: triggerReason,
    source: 'sedentary_watchdog',
    kind: 'movement_order',
    scheduled_for: new Date().toISOString(),
    expires_at: new Date(new Date().setHours(23, 59, 59, 999)).toISOString(),
    context_data: { day_strain: dayStrain },
  })

  return new Response(JSON.stringify({ ok: true, fired: true, dayStrain }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
})
