// recon-measure — the honesty spine's measurement pass.
//
// DESIGN_RECONDITIONING_ENGINE §5. Computes each target's behavioral indicator
// from EXISTING data, records a recon_measurements row, and drives the program
// phase on the delta (progress → reinforce/retain; regression → install, the
// "zoom out at iteration 2" rule). Measurement never asserts — Mommy's voice
// never cites these numbers; they only move the machine.
//
// Only genuinely-computable behavioral indicators are measured here. belief_slider
// and assoc_latency are self-graded probes wired through the decree card instead
// (recon_record_measurement_and_advance, migs 656/667) — this cron never sees
// them. self_ref_drift is an NLP delta over corpus text, pre-computed by
// recon-self-ref-scorer into self_reference_analysis (mig 669) — this cron
// reads that table's rolling counts, it never calls a classifier itself. This
// function writes NO user-facing copy, so it runs without the conditioning gate;
// program advancement self-gates (recon_program_advance calls conditioning_gate
// internally).

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' }
const USERS = ['8c69b9c8-34eb-4147-9fec-3c1a5bc74b6f', '93327332-7d0d-4888-889a-1607a5776216']

// deno-lint-ignore no-explicit-any
type Sb = any

const MIN_SAMPLES = 3            // don't claim a baseline off too little data
const PROGRESS_EPSILON = 0.02    // minimum normalized delta to count as progress

// Returns { value, method, raw } or null when not enough data to be honest.
async function computeIndicator(s: Sb, user: string, kind: string, targetId: string): Promise<{ value: number; method: string; raw: unknown } | null> {
  if (kind === 'voice_pitch_drift') {
    const since = new Date(Date.now() - 30 * 864e5).toISOString()
    const { data } = await s.from('voice_progress_samples')
      .select('pitch_median_hz, recorded_at')
      .eq('user_id', user).gte('recorded_at', since)
      .not('pitch_median_hz', 'is', null)
      .order('recorded_at', { ascending: false }).limit(50)
    const vals = (data ?? []).map((r: { pitch_median_hz: number }) => Number(r.pitch_median_hz)).filter((n: number) => n > 0)
    if (vals.length < MIN_SAMPLES) return null
    const mean = vals.reduce((a: number, b: number) => a + b, 0) / vals.length
    return { value: Math.round(mean * 10) / 10, method: `mean pitch_median_hz over ${vals.length} samples (30d)`, raw: { n: vals.length } }
  }
  if (kind === 'pavlovian_strength') {
    const since = new Date(Date.now() - 30 * 864e5).toISOString()
    const { data } = await s.from('pavlovian_events')
      .select('arousal_at_event, arousal_30min_later')
      .eq('user_id', user).gte('created_at', since)
      .not('arousal_at_event', 'is', null).not('arousal_30min_later', 'is', null).limit(100)
    const deltas = (data ?? [])
      .map((r: { arousal_at_event: number; arousal_30min_later: number }) => Number(r.arousal_30min_later) - Number(r.arousal_at_event))
      .filter((n: number) => Number.isFinite(n))
    if (deltas.length < MIN_SAMPLES) return null
    const mean = deltas.reduce((a: number, b: number) => a + b, 0) / deltas.length
    return { value: Math.round(mean * 100) / 100, method: `mean arousal lift (30min−event) over ${deltas.length} events (30d)`, raw: { n: deltas.length } }
  }
  if (kind === 'habit_adherence') {
    // §2.10: habit targets drill an if-then plan as retrieval-practice cards
    // (recon_rep_schedule); reps/lapses on those cards ARE the adherence signal
    // — graded via recon_rep_grade whenever the reinforce-phase card is answered.
    const { data } = await s.from('recon_rep_schedule')
      .select('reps, lapses').eq('user_id', user).eq('target_id', targetId)
    const rows = (data ?? []) as { reps: number; lapses: number }[]
    const totalReps = rows.reduce((a, r) => a + (r.reps ?? 0), 0)
    const totalLapses = rows.reduce((a, r) => a + (r.lapses ?? 0), 0)
    const attempts = totalReps + totalLapses
    if (attempts < MIN_SAMPLES) return null
    const rate = totalReps / attempts
    return { value: Math.round(rate * 1000) / 1000, method: `reps/(reps+lapses) over ${rows.length} retrieval card(s), ${attempts} graded attempt(s)`, raw: { totalReps, totalLapses, cards: rows.length } }
  }
  if (kind === 'self_ref_drift') {
    // recon-self-ref-scorer (mig 669) pre-scores her own corpus text into
    // self_reference_analysis; the indicator is the mean identity-consistency
    // ratio across recent samples — (feminine-identity mentions minus
    // masculine-performance mentions) / total mentions, in [-1, 1].
    const since = new Date(Date.now() - 60 * 864e5).toISOString()
    const { data } = await s.from('self_reference_analysis')
      .select('maxy_first_person, david_first_person, feminine_pronouns, masculine_pronouns')
      .eq('user_id', user).gte('created_at', since)
      .order('created_at', { ascending: false }).limit(100)
    const rows = (data ?? []) as { maxy_first_person: number; david_first_person: number; feminine_pronouns: number; masculine_pronouns: number }[]
    if (rows.length < MIN_SAMPLES) return null
    const ratios = rows.map((r) => {
      const pos = (r.maxy_first_person ?? 0) + (r.feminine_pronouns ?? 0)
      const neg = (r.david_first_person ?? 0) + (r.masculine_pronouns ?? 0)
      const total = pos + neg
      return total > 0 ? (pos - neg) / total : 0
    })
    const mean = ratios.reduce((a, b) => a + b, 0) / ratios.length
    return { value: Math.round(mean * 1000) / 1000, method: `mean identity-consistency ratio over ${rows.length} self_reference_analysis sample(s) (60d)`, raw: { n: rows.length } }
  }
  // belief_slider / assoc_latency: self-graded probe (decree card), not this cron's job.
  return null
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  const s = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '')
  const out: Record<string, unknown> = { measured: 0, baselines: 0, advanced: 0, skipped_uncomputable: 0 }
  let measured = 0, baselines = 0, advanced = 0, skipped = 0

  for (const user of USERS) {
    const { data: targets } = await s.from('reconditioning_targets')
      .select('id, slug, indicator_kind, baseline_value, baseline_captured_at, target_direction, status')
      .eq('user_id', user).in('status', ['proposed', 'active', 'consolidating'])
    for (const t of (targets ?? [])) {
      const comp = await computeIndicator(s, user, t.indicator_kind, t.id)
      if (!comp) { skipped++; continue }

      // Baseline capture for anything not yet baselined.
      if (!t.baseline_captured_at) {
        await s.rpc('recon_record_measurement', {
          p_user: user, p_target: t.id, p_indicator: t.indicator_kind, p_value: comp.value,
          p_method: comp.method, p_phase: 'induction', p_is_baseline: true, p_raw: comp.raw,
        })
        baselines++
        continue
      }

      // Re-measure active targets.
      const { data: prog } = await s.from('reconditioning_programs')
        .select('id, phase, measures_held').eq('target_id', t.id).maybeSingle()
      await s.rpc('recon_record_measurement', {
        p_user: user, p_target: t.id, p_indicator: t.indicator_kind, p_value: comp.value,
        p_method: comp.method, p_phase: prog?.phase ?? null, p_is_baseline: false, p_raw: comp.raw,
      })
      measured++

      // Drive the phase only when the program is sitting in 'measure'.
      if (prog && prog.phase === 'measure') {
        const dir = t.target_direction === 'decrease' ? -1 : 1
        const base = Number(t.baseline_value) || comp.value
        const normDelta = base !== 0 ? ((comp.value - base) / Math.abs(base)) * dir : 0
        let to: string
        if (normDelta > PROGRESS_EPSILON) {
          // progress: retain once it has already held ≥1 prior measure, else reinforce
          to = (prog.measures_held ?? 0) >= 1 ? 'retain' : 'reinforce'
        } else {
          to = 'install' // regression/flat → drop back (architecture wrong, not under-tuned)
        }
        const { data: ok } = await s.rpc('recon_program_advance', { p_program: prog.id, p_to: to, p_via: 'recon-measure', p_note: `normDelta=${normDelta.toFixed(3)}` })
        if (ok === true) advanced++
      }
    }
  }

  out.measured = measured; out.baselines = baselines; out.advanced = advanced; out.skipped_uncomputable = skipped
  return new Response(JSON.stringify({ ok: true, ...out }), { headers: { ...cors, 'Content-Type': 'application/json' } })
})
