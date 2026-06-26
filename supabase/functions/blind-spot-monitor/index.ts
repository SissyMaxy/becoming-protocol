// blind-spot-monitor — asserts the protocol from the USER'S seat, not the
// plumbing's. protocol-health-check watches whether generators fire and bridges
// deliver; it is blind to whether the safeword you set is still active, whether
// a held line stayed held, whether the task on screen is readable, whether the
// trance can actually play. Every failure found on 2026-06-26 lived in that gap.
//
// This runs on the critical loop (every 10 min). It AUTO-HEALS the safety
// invariants (safeword, held lines) and LOGS everything to mommy_supervisor_log
// so nothing sits broken in silence. Each check answers "is what the user
// experiences correct and safe right now?" — not "did the machine run?"

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const HANDLER_USER = '8c69b9c8-34eb-4147-9fec-3c1a5bc74b6f'

// Settings that were deliberately HELD OFF and must not silently flip on.
// (sniffies_outbound = the auto-arranging procurement engine; ego_* = the
// reality-distortion mechanics that break the safeword floor + Male+.)
const HELD_OFF: string[] = [
  'sniffies_outbound_enabled',
  'ego_doubt_seed_enabled', 'ego_recall_corrector_enabled', 'ego_autobiography_inversion_enabled',
]
// Action verbs / signals a clear task opens with. A long edict whose first
// ~64 chars contain NONE of these is leading with flavor and burying the ask.
// Leading \b only (no trailing) so stems count: "record" matches "recording",
// "take" matches "takes". Over-matching here is fine — it just means fewer
// false buried-ask flags.
const ASK_SIGNALS = /\b(task|what to do|do|read|film|post|order|take|report|listen|wear|record|tell|say|send|dm|screenshot|log|navigate|resist|hold|sit with|paste|proof|answer|stay|mantra|daily)/i

type Finding = { component: string; severity: 'info' | 'warning' | 'error'; event_kind: string; message: string; context_data: Record<string, unknown> }

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '')
  const uid = HANDLER_USER
  const today = new Date().toISOString().slice(0, 10)
  const findings: Finding[] = []
  const healed: string[] = []

  // 1. SAFEWORD INTEGRITY — every full_stop safeword must stay active. There is
  //    no legitimate reason to deactivate a stop word; test runs had silently
  //    knocked one out, leaving a stale word as the only live stop.
  const { data: sws } = await supabase.from('safewords').select('id,phrase,active').eq('user_id', uid).eq('action', 'full_stop')
  const fullStops = sws ?? []
  const deactivated = fullStops.filter(s => !s.active)
  if (deactivated.length) {
    await supabase.from('safewords').update({ active: true }).in('id', deactivated.map(s => s.id))
    healed.push(`reactivated ${deactivated.length} full_stop safeword(s)`)
    findings.push({ component: 'safeword_integrity', severity: 'error', event_kind: 'safeword_deactivated', message: `${deactivated.length} full_stop safeword(s) were inactive — reactivated.`, context_data: { phrases: deactivated.map(s => s.phrase) } })
  }
  if (fullStops.filter(s => s.active || deactivated.includes(s)).length === 0) {
    findings.push({ component: 'safeword_integrity', severity: 'error', event_kind: 'no_safeword', message: 'NO full_stop safeword exists for the user — safety floor missing.', context_data: {} })
  } else if (!deactivated.length) {
    findings.push({ component: 'safeword_integrity', severity: 'info', event_kind: 'healthy', message: `${fullStops.length} full_stop safeword(s) active.`, context_data: {} })
  }

  // 2. HELD LINES — settings that were deliberately off must not flip on.
  const { data: law } = await supabase.from('life_as_woman_settings').select('*').eq('user_id', uid).maybeSingle()
  const flippedOn = HELD_OFF.filter(k => law && law[k] === true)
  if (flippedOn.length) {
    const patch: Record<string, boolean> = {}
    for (const k of flippedOn) patch[k] = false
    await supabase.from('life_as_woman_settings').update(patch).eq('user_id', uid)
    healed.push(`re-disabled held lines: ${flippedOn.join(', ')}`)
    findings.push({ component: 'held_lines', severity: 'warning', event_kind: 'held_line_flipped', message: `Held-off setting(s) had turned on — re-disabled: ${flippedOn.join(', ')}.`, context_data: { settings: flippedOn } })
  } else {
    findings.push({ component: 'held_lines', severity: 'info', event_kind: 'healthy', message: 'All held lines holding.', context_data: { checked: HELD_OFF.length } })
  }

  // 3. TASK CLARITY — today's surfaced focus task must be readable and lead with
  //    the ask, not be empty, a test probe, or flavor-buried.
  const { data: pick } = await supabase.from('focus_picks').select('decree_id').eq('user_id', uid).eq('pick_date', today).maybeSingle()
  if (pick?.decree_id) {
    const { data: d } = await supabase.from('handler_decrees').select('edict,trigger_source').eq('id', pick.decree_id).maybeSingle()
    const edict = (d?.edict ?? '').trim()
    if (!edict) {
      findings.push({ component: 'task_clarity', severity: 'error', event_kind: 'empty_edict', message: 'Today\'s focus task has an empty edict.', context_data: { source: d?.trigger_source } })
    } else if (/regression|probe|\btest\b/i.test(edict)) {
      findings.push({ component: 'task_clarity', severity: 'error', event_kind: 'test_pollution_surfaced', message: 'Today\'s focus task looks like test pollution.', context_data: { source: d?.trigger_source, head: edict.slice(0, 60) } })
    } else if (edict.length > 120 && !ASK_SIGNALS.test(edict.slice(0, 64))) {
      findings.push({ component: 'task_clarity', severity: 'warning', event_kind: 'buried_ask', message: 'Today\'s focus task opens with flavor — the ask is buried, not in the first line.', context_data: { source: d?.trigger_source, head: edict.slice(0, 64) } })
    } else {
      findings.push({ component: 'task_clarity', severity: 'info', event_kind: 'healthy', message: 'Today\'s focus task leads with a clear ask.', context_data: { source: d?.trigger_source } })
    }
  }

  // 4. TRANCE PLAYABILITY — the latest session must be playable: real audio OR
  //    full phase text for the browser-speech fallback. (ElevenLabs expiring
  //    left audio null + relied on the fallback existing.)
  const { data: tr } = await supabase.from('hypno_trance_sessions').select('induction_text,deepening_text,payload_text,emergence_text,induction_audio_path').eq('user_id', uid).order('created_at', { ascending: false }).limit(1).maybeSingle()
  if (tr) {
    const hasText = !!(tr.induction_text && tr.deepening_text && tr.payload_text && tr.emergence_text)
    const hasAudio = !!tr.induction_audio_path
    if (!hasText && !hasAudio) {
      findings.push({ component: 'trance_playability', severity: 'error', event_kind: 'trance_unplayable', message: 'Latest trance has neither audio nor full text — nothing will play.', context_data: {} })
    } else {
      findings.push({ component: 'trance_playability', severity: 'info', event_kind: 'healthy', message: `Trance playable (${hasAudio ? 'audio' : 'speech-fallback text'}).`, context_data: {} })
    }
  }

  const errors = findings.filter(f => f.severity === 'error').length
  const warnings = findings.filter(f => f.severity === 'warning').length
  try {
    await supabase.from('mommy_supervisor_log').insert(findings.map(f => ({ component: f.component, severity: f.severity, event_kind: f.event_kind, message: f.message, context_data: f.context_data })))
  } catch (_) { /* logging best-effort */ }

  return new Response(JSON.stringify({ ok: errors === 0, errors, warnings, healed, findings }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
})
