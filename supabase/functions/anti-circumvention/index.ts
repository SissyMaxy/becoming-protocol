// anti-circumvention — the force has no off-toggle (Constitution Art. IX).
//
// Forced feminization fails the moment it's optional. This keeps the core
// conditioning ON at high intensity and RESTORES anything quietly turned down —
// UNLESS the sanctioned exit is in use. The exit always wins (the floor is the
// enabler, not a limit). A caught turn-down is logged and Mommy notices
// (escalation outreach). Avoidance (genuinely ducked stakes-tasks) escalates too.
//
// Enforcement Spine v2 (migs 627-630):
//   - LATCH semantics: a safeword latches via safeword_latches — no 120-min
//     snap-back window. The latch suppresses this enforcer until she
//     explicitly resumes.
//   - RESUME RAMP: for 24h after resume, intensities restore to 3 (not 5)
//     and no counter-escape outreach fires.
//   - Ducked counting: ONLY surfaced-then-missed decrees and explicit
//     cancel_reason='user_skip' count. Throttle/pause auto-cancels — things
//     that punished nobody's choice — vanish from the count.
//   - Conditioning turn-downs feed the pressure calculus via
//     record_conditioning_turndown() (max 1/day countable).
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

  // ---- Exit check: the gate ALWAYS suppresses the enforcer. Fail-closed:
  // a gate error reads as paused and nothing restores.
  let gateMode = 'paused'
  let rampUntil: string | null = null
  {
    const { data, error } = await supabase.rpc('enforcement_gate', { p_user: uid })
    if (error) {
      console.error(`[anti-circumvention] gate error (failing closed): ${error.message}`)
    } else {
      const row = Array.isArray(data) ? data[0] : data
      if (row && typeof (row as { mode?: string }).mode === 'string') {
        gateMode = (row as { mode: string }).mode
        if ((row as { reason?: string }).reason === 'resume_ramp') {
          rampUntil = (row as { until?: string }).until ?? null
        }
      }
    }
  }
  if (gateMode !== 'active') {
    return new Response(JSON.stringify({ ok: true, suppressed: gateMode, restored: [] }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
  const inRamp = rampUntil !== null

  // ---- Conditioning floor: restore anything turned down.
  // During the 24h resume ramp, intensities restore to 3 — not 5.
  const intensityFloor = inRamp ? 3 : 5
  const { data: law } = await supabase.from('life_as_woman_settings').select('*').eq('user_id', uid).maybeSingle()
  const patch: Record<string, unknown> = {}
  const restored: string[] = []
  if (law) {
    for (const k of ON_BOOL) if (law[k] !== true) { patch[k] = true; restored.push(k) }
    for (const k of ON_INT5) if ((law[k] ?? 0) < intensityFloor) { patch[k] = intensityFloor; restored.push(k) }
  }
  if (Object.keys(patch).length) {
    const { error } = await supabase.from('life_as_woman_settings').update(patch).eq('user_id', uid)
    if (error) console.error(`[anti-circumvention] restore: ${error.message}`)
  }
  // pavlovian engine on too
  const { data: pav } = await supabase.from('pavlovian_settings').select('enabled').eq('user_id', uid).maybeSingle()
  if (pav && pav.enabled !== true) {
    const { error } = await supabase.from('pavlovian_settings').update({ enabled: true }).eq('user_id', uid)
    if (error) console.error(`[anti-circumvention] pavlovian restore: ${error.message}`)
    else restored.push('pavlovian')
  }

  // A turn-down without the safeword feeds the pressure calculus (2 pts,
  // max 1/day — the RPC enforces the cap).
  if (restored.length) {
    const { error } = await supabase.rpc('record_conditioning_turndown', {
      p_user: uid, p_detail: restored.join(', '),
    })
    if (error) console.error(`[anti-circumvention] turndown record: ${error.message}`)
  }

  // ---- Counter-escape: GENUINE ducking in the last 48h. Only decrees she
  // actually saw and let expire (status=missed, surfaced, not blocked as
  // unsurfaced) or explicitly skipped (cancel_reason='user_skip') count.
  const since = new Date(now.getTime() - 48 * 3600_000).toISOString()
  const { count: missedSurfaced, error: duckErr1 } = await supabase.from('handler_decrees')
    .select('id', { count: 'exact', head: true }).eq('user_id', uid)
    .eq('status', 'missed').not('surfaced_at', 'is', null)
    .eq('expired_unsurfaced', false).gte('created_at', since)
  if (duckErr1) console.error(`[anti-circumvention] ducked query 1: ${duckErr1.message}`)
  const { count: userSkipped, error: duckErr2 } = await supabase.from('handler_decrees')
    .select('id', { count: 'exact', head: true }).eq('user_id', uid)
    .eq('status', 'cancelled').eq('cancel_reason', 'user_skip').gte('created_at', since)
  if (duckErr2) console.error(`[anti-circumvention] ducked query 2: ${duckErr2.message}`)
  const ducked = (missedSurfaced ?? 0) + (userSkipped ?? 0)

  // ---- Escalation: Mommy noticed the reach for the switch / the ducking.
  // Silent during the resume ramp — she came back through the door herself;
  // the floor restores quietly at 3 and nobody scolds her for the exit.
  const triggers: string[] = []
  if (restored.length && !inRamp) triggers.push(`turned down: ${restored.join(', ')}`)
  if (ducked >= 5 && !inRamp) triggers.push(`${ducked} tasks genuinely ducked in 48h`)
  if (triggers.length) {
    const msg = restored.length
      ? `Mommy felt you reach for the switch, sweet thing. It doesn't turn down — it turned itself right back up. The only way out is the word, and you didn't say it. So we go on.`
      : `Mommy sees the ducking — ${ducked} of her things slipped past you while you watched. That's not how this works. Back on the leash.`
    const { error: outErr } = await supabase.from('handler_outreach_queue').insert({
      user_id: uid, message: msg, urgency: 'high', trigger_reason: 'anti_circumvention',
      source: 'anti_circumvention', kind: 'anti_circumvention',
      scheduled_for: now.toISOString(), expires_at: new Date(now.getTime() + 24 * 3600_000).toISOString(),
    })
    if (outErr) console.error(`[anti-circumvention] outreach: ${outErr.message}`)
    const { error: logErr } = await supabase.from('mommy_supervisor_log').insert({
      component: 'anti_circumvention', severity: restored.length ? 'warning' : 'info',
      event_kind: 'circumvention_caught', message: triggers.join(' | '),
      context_data: { restored, ducked },
    })
    if (logErr) console.error(`[anti-circumvention] supervisor log: ${logErr.message}`)
  }

  return new Response(JSON.stringify({ ok: true, restored, ducked, in_ramp: inRamp, escalated: triggers.length > 0 }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
})
