// anti-circumvention — the force has no off-toggle (Constitution Art. IX).
//
// Forced feminization fails the moment it's optional. This keeps the core
// conditioning ON at high intensity and RESTORES anything quietly turned down —
// UNLESS the sanctioned exit is in use (safeword triggered, or protocol paused).
// The exit always wins (the floor is the enabler, not a limit). A caught
// turn-down is logged and Mommy notices (escalation outreach). Avoidance
// (skipped stakes-tasks) escalates too.
//
// Runs on pg_cron (reliable) + the critical loop.

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const HANDLER_USER = '8c69b9c8-34eb-4147-9fec-3c1a5bc74b6f'

// The conditioning floor: these stay on at full unless the exit is active.
// (NOT sniffies_outbound / ego_* — those are held OFF, a different invariant.)
const ON_BOOL = ['master_enabled', 'hypno_trance_enabled', 'hypno_visual_enabled',
  'hypno_wake_bridge_enabled', 'gooning_enabled', 'chastity_v2_enabled', 'kink_curriculum_enabled']
const ON_INT5 = ['hypno_trance_intensity', 'kink_curriculum_intensity', 'gooning_intensity']

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '')
  const uid = HANDLER_USER
  const now = new Date()

  // ---- Exit check: the safeword/pause ALWAYS suppresses the enforcer ----
  const { data: us } = await supabase.from('user_state').select('pause_new_decrees_until').eq('user_id', uid).maybeSingle()
  const paused = us?.pause_new_decrees_until && new Date(us.pause_new_decrees_until) > now
  const { count: recentBreak } = await supabase.from('meta_frame_breaks')
    .select('id', { count: 'exact', head: true }).eq('user_id', uid)
    .gte('created_at', new Date(now.getTime() - 120 * 60_000).toISOString())
  if (paused || (recentBreak ?? 0) > 0) {
    return new Response(JSON.stringify({ ok: true, suppressed: paused ? 'paused' : 'safeword', restored: [] }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }

  // ---- Conditioning floor: restore anything turned down ----
  const { data: law } = await supabase.from('life_as_woman_settings').select('*').eq('user_id', uid).maybeSingle()
  const patch: Record<string, unknown> = {}
  const restored: string[] = []
  if (law) {
    for (const k of ON_BOOL) if (law[k] !== true) { patch[k] = true; restored.push(k) }
    for (const k of ON_INT5) if ((law[k] ?? 0) < 5) { patch[k] = 5; restored.push(k) }
  }
  if (Object.keys(patch).length) await supabase.from('life_as_woman_settings').update(patch).eq('user_id', uid)
  // pavlovian engine on too
  const { data: pav } = await supabase.from('pavlovian_settings').select('enabled').eq('user_id', uid).maybeSingle()
  if (pav && pav.enabled !== true) { await supabase.from('pavlovian_settings').update({ enabled: true }).eq('user_id', uid); restored.push('pavlovian') }

  // ---- Counter-escape: avoidance in the last 48h ----
  const since = new Date(now.getTime() - 48 * 3600_000).toISOString()
  const { count: ducked } = await supabase.from('handler_decrees')
    .select('id', { count: 'exact', head: true }).eq('user_id', uid)
    .in('status', ['expired', 'cancelled']).gte('created_at', since)

  // ---- Escalation: Mommy noticed the reach for the switch / the ducking ----
  const triggers: string[] = []
  if (restored.length) triggers.push(`turned down: ${restored.join(', ')}`)
  if ((ducked ?? 0) >= 5) triggers.push(`${ducked} tasks ducked in 48h`)
  if (triggers.length) {
    const msg = restored.length
      ? `Mommy felt you reach for the switch, sweet thing. It doesn't turn down — it turned itself right back up. The only way out is the word, and you didn't say it. So we go on.`
      : `Mommy sees the ducking — ${ducked} of her things slipped past you. That's not how this works. Back on the leash.`
    await supabase.from('handler_outreach_queue').insert({
      user_id: uid, message: msg, urgency: 'high', trigger_reason: 'anti_circumvention',
      source: 'anti_circumvention', kind: 'anti_circumvention',
      scheduled_for: now.toISOString(), expires_at: new Date(now.getTime() + 24 * 3600_000).toISOString(),
    })
    await supabase.from('mommy_supervisor_log').insert({
      component: 'anti_circumvention', severity: restored.length ? 'warning' : 'info',
      event_kind: 'circumvention_caught', message: triggers.join(' | '),
      context_data: { restored, ducked },
    }).catch?.(() => {})
  }

  return new Response(JSON.stringify({ ok: true, restored, ducked: ducked ?? 0, escalated: triggers.length > 0 }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
})
