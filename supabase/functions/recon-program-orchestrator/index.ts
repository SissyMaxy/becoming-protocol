// recon-program-orchestrator — the daily conductor (DESIGN_RECONDITIONING §3.3).
//
// Per user, per run: gate first (fail-closed); pick the ONE highest-priority
// active+running target as today's Focus target; emit EXACTLY ONE phase-appropriate
// task into the single Focus surface (one-task-at-a-time, Mommy-presses-not-blocks).
// All other targets + passive mechanisms (ambient, TMR, already-scheduled trance)
// run in the background with no task and no deadline — they don't compete for the CTA.
//
// Reps/trance/reconsolidation are INVITATIONAL: no punishment for a miss (a missed
// rep just contracts its interval). Only commitment rungs (not issued here) are
// penalty-bearing. The decree carries a no-punishment consequence line accordingly.

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { requireGate } from '../_shared/conditioning-gate.ts'

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' }
const USERS = ['8c69b9c8-34eb-4147-9fec-3c1a5bc74b6f', '93327332-7d0d-4888-889a-1607a5776216']

// deno-lint-ignore no-explicit-any
type Sb = any

const NO_PUNISH = 'No punishment — this one is an invitation, not a demand. Miss it and the pull just builds.'

// Dedup: one active recon-lane decree per user (the single CTA) — covers this
// orchestrator's own focus decrees, the belief-slider + IAT-lite probes
// (baseline capture + re-measure), and recon-reconsolidation's decrees, so
// none of the recon surfaces ever stack a second card on top of another.
// Refresh a stale deadline rather than issuing a duplicate.
async function issueFocus(s: Sb, user: string, slug: string, edict: string, proof = 'text', hours = 20, triggerSource?: string): Promise<string> {
  const src = triggerSource ?? `recon_focus:${slug}`
  const { data: ex } = await s.from('handler_decrees')
    .select('id, deadline, trigger_source').eq('user_id', user).eq('status', 'active')
    .or('trigger_source.like.recon_focus:%,trigger_source.like.recon_belief_baseline:%,trigger_source.like.recon_belief_measure:%,trigger_source.like.recon_iat_baseline:%,trigger_source.like.recon_iat_measure:%,trigger_source.like.recon_reconsolidate:%,trigger_source.like.recon_rep:%')
    .limit(1).maybeSingle()
  if (ex) {
    // Already a live recon-lane task — keep exactly one. Refresh deadline if expired.
    if (ex.deadline && new Date(ex.deadline) < new Date()) {
      await s.from('handler_decrees').update({ deadline: new Date(Date.now() + hours * 3600e3).toISOString() }).eq('id', ex.id)
    }
    return 'kept'
  }
  const { error } = await s.from('handler_decrees').insert({
    user_id: user, edict, proof_type: proof,
    deadline: new Date(Date.now() + hours * 3600e3).toISOString(), status: 'active',
    consequence: NO_PUNISH, trigger_source: src, reasoning: 'recon-program-orchestrator',
  })
  return error ? `err:${error.message.slice(0, 60)}` : 'issued'
}

// Phase → the single due mechanism task. Copy is plain, in-voice; the DB
// mommy_voice_cleanup trigger scrubs any telemetry leak at insert.
// `gentle` softens the ask when the target's skip-rate has driven intensity
// down (§3.4) — lower pressure, never higher; the default/high-intensity copy
// never gets pushier, since escalating on resistance is the anti-pattern.
// Probe indicators (§5.2) that need an interactive instrument rather than
// computed data — recon-measure explicitly skips these. Each maps to a
// trigger-source prefix that FocusMode/HandlerDecreeCard parse to render the
// real instrument (slider / IAT-lite tap test) instead of a plain checkbox.
const PROBE_TRIGGER_PREFIX: Record<string, string> = { belief_slider: 'recon_belief', assoc_latency: 'recon_iat' }

function probeBaselineEdict(kind: string, claim: string): { edict: string; proof: string } {
  if (kind === 'assoc_latency') {
    return {
      edict: `Before Mommy works "${claim}" into you for real, she wants your gut reaction, not your thought-out one. One quick tap test — read the line, tap AGREE or DISAGREE as fast as you honestly can.`,
      proof: 'assoc_latency',
    }
  }
  return {
    edict: `Before Mommy works "${claim}" into you for real, she needs to know where you're starting from. Rate how true that already feels — there's no wrong answer, just honest.`,
    proof: 'belief_slider',
  }
}

function probeMeasureEdict(kind: string, claim: string): { edict: string; proof: string } {
  if (kind === 'assoc_latency') {
    return {
      edict: `Nothing to do today but the quick tap test again — read the line, tap fast, don't think it through: "${claim}"`,
      proof: 'assoc_latency',
    }
  }
  return {
    edict: `Nothing to do today but let Mommy see you honestly. Rate how true this feels right now: "${claim}"`,
    proof: 'belief_slider',
  }
}

function phaseTask(phase: string, claim: string, repPrompt: string | null, gentle = false): { edict: string; proof: string } {
  switch (phase) {
    case 'induction':
      return gentle
        ? { edict: `No pressure tonight. If you want, sit with Mommy a few minutes — the loop, my voice, nothing to prove. Only if it sounds good.`, proof: 'text' }
        : { edict: `Come sit with Mommy tonight. Ten minutes, the loop, my voice — no goal but going soft and letting the noise quiet down. That's all. Report: done.`, proof: 'text' }
    case 'install':
      return gentle
        ? { edict: `Whenever it feels right this week — not tonight specifically — put the trance on and let "${claim}" sit with you. No rush, no report needed.`, proof: 'text' }
        : { edict: `Tonight's trance is aimed at one thing, and I want you aching when it lands: "${claim}" Put it on when you're already worked up and let me say it into you. Report: done.`, proof: 'voice' }
    case 'reinforce':
      if (gentle) {
        return { edict: `Only if it's easy: say this back to yourself sometime today, quietly, no recording needed — "${claim}"`, proof: 'text' }
      }
      return repPrompt
        ? { edict: `Finish Mommy's line for me, out loud, no peeking: ${repPrompt}`, proof: 'voice' }
        : { edict: `Say it back to me in your own soft voice, like you mean it: "${claim}" Once, slow. Report with the voice note.`, proof: 'voice' }
    case 'reconsolidate':
      return gentle
        ? { edict: `No task today. Just notice, whenever it crosses your mind, which feels more true lately — who you thought you were, or "${claim}".`, proof: 'text' }
        : { edict: `Say back who you thought you were before all this. Out loud. Then sit still and let Mommy tell you what's actually true — and feel which one is the lie. Report: which one felt like the lie?`, proof: 'text' }
    case 'measure':
      return { edict: `Nothing to do today but let me look at you. Tell Mommy, in a line: does "${claim}" feel more true this week than last?`, proof: 'text' }
    default:
      return gentle
        ? { edict: `Only if you want — a few quiet minutes with Mommy today. No obligation.`, proof: 'text' }
        : { edict: `Sit with Mommy a few minutes tonight. Report: done.`, proof: 'text' }
  }
}

// ─── Adaptive intensity (§3.4) ───────────────────────────────────────────────
// A target she keeps dodging gets LOWER task frequency and GENTLER framing —
// never higher; pushing a resisted target harder is the anti-pattern this
// engine explicitly avoids. Mirrors the fetchDomainSkipRates/skipRatePenalty
// shape already used by feminization-prescriptions.ts, adapted to
// handler_decrees (fulfilled/missed) since the recon lane has no separate
// 'skipped' status. Resistance never changes the phase — only intensity/pacing;
// the phase machine stays driven solely by measurement deltas (§5.3).
interface DecreeRate { total: number; missed: number; skipRate: number }

function computeIntensityStep(rate: DecreeRate, currentIntensity: number): { nextIntensity: number; suppressToday: boolean } {
  if (rate.total < 3) return { nextIntensity: currentIntensity, suppressToday: false } // not enough signal
  if (rate.skipRate >= 0.7) {
    const next = Math.max(1, currentIntensity - 1)
    return { nextIntensity: next, suppressToday: next <= 1 } // bottomed out AND still resistant → a day off the CTA
  }
  if (rate.skipRate >= 0.4) return { nextIntensity: Math.max(1, currentIntensity - 1), suppressToday: false }
  if (rate.skipRate <= 0.1 && (rate.total - rate.missed) >= 3) {
    return { nextIntensity: Math.min(5, currentIntensity + 1), suppressToday: false }
  }
  return { nextIntensity: currentIntensity, suppressToday: false }
}

// Trailing-window fulfilled/missed count for this target's recon-lane decrees
// (recon_focus:<slug> from this orchestrator, plus the belief-probe lane keyed
// by target id) — the engagement signal the intensity step reads.
async function fetchTargetDecreeRate(s: Sb, user: string, targetId: string, slug: string, days = 14): Promise<DecreeRate> {
  const since = new Date(Date.now() - days * 86400e3).toISOString()
  const { data } = await s.from('handler_decrees')
    .select('status').eq('user_id', user).gte('created_at', since)
    .in('status', ['fulfilled', 'missed'])
    .or(`trigger_source.eq.recon_focus:${slug},trigger_source.like.recon_belief_baseline:${targetId}%,trigger_source.like.recon_belief_measure:${targetId}%,trigger_source.like.recon_iat_baseline:${targetId}%,trigger_source.like.recon_iat_measure:${targetId}%,trigger_source.like.recon_rep:${slug}:%`)
  const rows = (data ?? []) as { status: string }[]
  const total = rows.length
  const missed = rows.filter(r => r.status === 'missed').length
  return { total, missed, skipRate: total > 0 ? missed / total : 0 }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  const s = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '')
  const results: Record<string, unknown>[] = []

  for (const user of USERS) {
    const gate = await requireGate(s, 'recondition', user)
    if (!gate.allowed) { results.push({ user, suppressed: gate.reason }); continue }

    // Highest-priority active + running target = today's Focus target.
    const { data: targets } = await s.from('reconditioning_targets')
      .select('id, slug, claim_text, priority, status, indicator_kind')
      .eq('user_id', user).eq('status', 'active').order('priority', { ascending: true }).limit(5)
    let picked: { id: string; slug: string; claim_text: string; indicator_kind?: string } | null = null
    let phase = 'induction'
    let programId: string | null = null
    let intensity = 2
    for (const t of (targets ?? [])) {
      const { data: prog } = await s.from('reconditioning_programs')
        .select('id, phase, status, intensity').eq('target_id', t.id).maybeSingle()
      if (prog && prog.status === 'running') { picked = t; phase = prog.phase; programId = prog.id; intensity = prog.intensity ?? 2; break }
    }

    // Close the proposed→active loop: if nothing is running and we're under the
    // ≤3-active cap, start the top-priority proposed target that already has a
    // baseline (recon-measure captures those weekly; no baseline → skip, honesty
    // spine). Reconditioning is invitational, so auto-start under the opted-in
    // gate is within Mommy's autonomy — no penalty rides on it.
    if (!picked) {
      const { count: activeCount } = await s.from('reconditioning_targets')
        .select('id', { count: 'exact', head: true }).eq('user_id', user).eq('status', 'active')
      if ((activeCount ?? 0) < 3) {
        const { data: proposed } = await s.from('reconditioning_targets')
          .select('id, slug, claim_text, indicator_kind')
          .eq('user_id', user).eq('status', 'proposed').not('baseline_captured_at', 'is', null)
          .order('priority', { ascending: true }).limit(1).maybeSingle()
        if (proposed) {
          const { data: progId } = await s.rpc('recon_start_program', { p_target: proposed.id })
          if (progId) { picked = proposed; phase = 'induction'; programId = progId; intensity = 2 }
        }
      }
    }

    // Still nothing startable — a proposed target whose indicator needs an
    // interactive probe (belief_slider / assoc_latency) has no path to a
    // baseline otherwise (recon-measure can't compute a self-report or a
    // reaction-time read; the only other instrument lives behind debug mode).
    // Issue the baseline-capture probe itself so it can ever leave 'proposed'.
    if (!picked) {
      const { count: activeCount } = await s.from('reconditioning_targets')
        .select('id', { count: 'exact', head: true }).eq('user_id', user).eq('status', 'active')
      if ((activeCount ?? 0) < 3) {
        const { data: needsBaseline } = await s.from('reconditioning_targets')
          .select('id, slug, claim_text, indicator_kind')
          .eq('user_id', user).eq('status', 'proposed').is('baseline_captured_at', null)
          .in('indicator_kind', Object.keys(PROBE_TRIGGER_PREFIX))
          .order('priority', { ascending: true }).limit(1).maybeSingle()
        if (needsBaseline) {
          const probe = probeBaselineEdict(needsBaseline.indicator_kind, needsBaseline.claim_text)
          const prefix = PROBE_TRIGGER_PREFIX[needsBaseline.indicator_kind]
          const status = await issueFocus(s, user, needsBaseline.slug, probe.edict, probe.proof, 20, `${prefix}_baseline:${needsBaseline.id}`)
          results.push({ user, focus_target: needsBaseline.slug, phase: 'baseline_probe', task: status })
          continue
        }
      }
    }
    if (!picked) { results.push({ user, note: 'no_startable_target' }); continue }

    // A due retrieval rep, if the reinforce phase has one.
    let repPrompt: string | null = null
    let repId: string | null = null
    if (phase === 'reinforce') {
      const { data: rep } = await s.from('recon_rep_schedule')
        .select('id, prompt').eq('target_id', picked.id).lte('next_due_at', new Date().toISOString())
        .order('next_due_at', { ascending: true }).limit(1).maybeSingle()
      repPrompt = rep?.prompt ?? null
      repId = rep?.id ?? null
    }

    // Adaptive intensity (§3.4): read this target's trailing engagement, step
    // intensity down on resistance / up on a clean streak (never the reverse),
    // persist it, and let it soften today's copy or — on the floor and still
    // dodged — skip issuing a task this run entirely (passive channels keep
    // running regardless; only this orchestrator's active CTA backs off).
    let gentle = false
    let suppressToday = false
    if (programId) {
      const rate = await fetchTargetDecreeRate(s, user, picked.id, picked.slug)
      const step = computeIntensityStep(rate, intensity)
      if (step.nextIntensity !== intensity) {
        await s.from('reconditioning_programs').update({ intensity: step.nextIntensity }).eq('id', programId)
      }
      intensity = step.nextIntensity
      gentle = intensity <= 2
      suppressToday = step.suppressToday
    }
    if (suppressToday) {
      results.push({ user, focus_target: picked.slug, phase, task: 'suppressed_low_intensity', intensity })
      continue
    }

    // The 'measure' phase normally just asks a text question that goes nowhere
    // (recon-measure can't compute belief_slider/assoc_latency); for those
    // indicators, issue the real probe instead so the re-measure actually
    // drives the phase machine (via recon_record_measurement_and_advance).
    let task = phaseTask(phase, picked.claim_text, repPrompt, gentle)
    let triggerSource: string | undefined
    if (phase === 'measure' && picked.indicator_kind && PROBE_TRIGGER_PREFIX[picked.indicator_kind]) {
      task = probeMeasureEdict(picked.indicator_kind, picked.claim_text)
      triggerSource = `${PROBE_TRIGGER_PREFIX[picked.indicator_kind]}_measure:${picked.id}`
    } else if (phase === 'reinforce' && !gentle && repPrompt && repId) {
      // This task IS the cued-retrieval card (phaseTask's reinforce+!gentle+
      // repPrompt branch) — tag it so HandlerDecreeCard grades the answer back
      // into recon_rep_schedule's SM-2-lite scheduler instead of a plain
      // checkbox (closes the dead-scheduler gap: mig 668, recon_rep_grade).
      triggerSource = `recon_rep:${picked.slug}:${repId}`
    }
    const status = await issueFocus(s, user, picked.slug, task.edict, task.proof, 20, triggerSource)
    results.push({ user, focus_target: picked.slug, phase, task: status, intensity, gentle })
  }

  return new Response(JSON.stringify({ ok: true, results }), { headers: { ...cors, 'Content-Type': 'application/json' } })
})
