// exercise-conditioning-watcher — closes the pavlovian loop automatically.
//
// The exercise-conditioning decrees tell Maxy to self-administer the arousal
// reward; relying on her to remember weakens the conditioning. This watcher
// runs on the critical loop (every ~10 min) and, the moment an exercise_cond_*
// decree flips to fulfilled, fires the reward FOR her — tight to the effort,
// every time — and logs the session so the rung self-escalates. Consistent
// reward delivery is what actually wires move -> her -> arousal.
//
// Idempotent: dedups by stamping the source decree id into exercise_sessions
// .notes, so a decree is rewarded once even if it stays in the lookback window
// across runs. No new schema. POST {}.

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const REWARD_PROMPTS = [
  `You just moved for her. Now the other half of the pairing: touch yourself while the burn is still in the muscle, and let your body file it — effort, then her, then this. Two minutes is enough.`,
  `That ache you're feeling is her hips arriving. Reward it. Hand where it burns, slow, and let the pleasure land on the work so your body learns to crave the work.`,
  `Done. Now pair it: arousal on top of the warmth, every time, until your body stops asking why and just wants to move. Take the reward you earned.`,
]

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '')

  // Exercise-conditioning decrees fulfilled in the last 2h (wide; dedup guards).
  const since = new Date(Date.now() - 2 * 3600_000).toISOString()
  const { data: done } = await supabase.from('handler_decrees')
    .select('id, user_id, trigger_source, fulfilled_at')
    .like('trigger_source', 'exercise_cond_%')
    .eq('status', 'fulfilled')
    .gte('fulfilled_at', since)
    .limit(50)

  const rows = (done ?? []) as Array<{ id: string; user_id: string; trigger_source: string }>
  let rewarded = 0, logged = 0
  const acted: string[] = []

  for (const d of rows) {
    const stamp = `decree:${d.id}`
    // Dedup: already processed if a session carries this decree stamp.
    const { data: prior } = await supabase.from('exercise_sessions')
      .select('id').eq('user_id', d.user_id).ilike('notes', `%${stamp}%`).limit(1).maybeSingle()
    if (prior) continue

    // Log the session → rung self-escalates off the real count.
    const { error: sErr } = await supabase.from('exercise_sessions').insert({
      user_id: d.user_id, session_type: 'conditioning', duration_minutes: 8,
      notes: `${stamp} auto-logged by exercise-conditioning-watcher (${d.trigger_source})`,
    })
    if (!sErr) logged++

    // Fire the paired arousal reward, tight to the effort.
    const prompt = REWARD_PROMPTS[rows.indexOf(d) % REWARD_PROMPTS.length]
    const { error: rErr } = await supabase.from('arousal_touch_tasks').insert({
      user_id: d.user_id, prompt, category: 'reward', generated_by: 'exercise_conditioning',
      expires_at: new Date(Date.now() + 12 * 3600_000).toISOString(),
    })
    if (!rErr) rewarded++
    acted.push(d.trigger_source)
  }

  return new Response(JSON.stringify({ ok: true, fulfilled_seen: rows.length, logged, rewarded, acted }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
})
