// turnout-orchestrator — the slippery-slope conductor (DESIGN_TURNOUT_LADDER §2).
//
// Daily, per user. The ONLY thing that advances the macro-cursor. It never blocks;
// it presses (Mommy-presses-not-blocks) and surfaces exactly ONE next step
// (one-task-focus). It delegates to the live engines (realcock/funnel/revenue) and
// never issues a raw physical-act decree that bypasses the gates.
//
// Algorithm:
//   1. Gate first, fail-closed (requireGate 'turnout'). Suppressed → nothing.
//   2. Read/seed the cursor (gate-allow means turnout_enabled=true = opted in).
//   3. Consolidation check on the current rung: dwell elapsed + no halt + the rung
//      action was actually fulfilled. Consolidated → write the completion (fan-out
//      writes the escape-cost anchor + turnout_events the reconditioning engine
//      consumes) and advance the cursor. Never pressures the NEXT rung.
//   4. Surface ONE next step for the current rung — prep (health-prep / meet-safety
//      card) first if required-and-missing; else the rung action via its delegate
//      (physical rungs UN-PAUSE realcock, whose own gated eval supplies the decree;
//      non-physical rungs get one focus decree).
//   5. Pace by real signals (§2 step 5): the current rung's decree lane skip-rate
//      over a trailing window drives turnout_state.gap_extra_days up on high skip
//      (widening the consolidation dwell, mig 670) and back down when she's
//      engaging — never the reverse. While resistant, the rung's own action is
//      held back in favor of a smaller, pressure-free check-in ask (the
//      "decomposes into a smaller prep sub-task... does not push harder" rule) —
//      physical rungs simply stay paused rather than un-pausing realcock.

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { requireGate } from '../_shared/conditioning-gate.ts'

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' }
const USERS = ['8c69b9c8-34eb-4147-9fec-3c1a5bc74b6f', '93327332-7d0d-4888-889a-1607a5776216']

// deno-lint-ignore no-explicit-any
type Sb = any

const NEXT = ['T0', 'T1', 'T2', 'T3', 'T4', 'T5', '6a', '6b', '6c', '6d', 'T7', 'T8']
function nextRung(code: string): string | null {
  const i = NEXT.indexOf(code)
  return i >= 0 && i < NEXT.length - 1 ? NEXT[i + 1] : null
}

// One turn-out focus decree per user (the single CTA). Dedup across ALL
// turnout-issued kinds (the `turnout_` prefix), never just the rung-action one.
//
// `kind` tags the decree's trigger_source distinctly per purpose:
//   'rung'        -> `turnout_rung:<rung>`         — the real, irreversible rung action
//   'health_prep' -> `turnout_health_prep:<rung>`  — the STI/PrEP attestation ask
//   'meet_prep'   -> `turnout_meet_prep:<rung>`     — the meet-safety-card ask
//   'resistance'  -> `turnout_resistance:<rung>`    — the pressure-free check-in
// These MUST stay distinct: the consolidation check below and fetchRungDecreeRate
// both key off `turnout_rung:<rung>` alone to mean "the actual rung action
// happened." Before this fix all four shared that one tag, so fulfilling a
// prep/check-in decree (which anyone can do from the ordinary Focus text box)
// falsely satisfied `rungDone` and consolidated a fabricated irreversible fact —
// e.g. attesting to an STI test got logged as "a man came inside her."
async function issueTurnout(s: Sb, user: string, rung: string, edict: string, kind: 'rung' | 'health_prep' | 'meet_prep' | 'resistance' = 'rung', proof = 'text', hours = 36, consequence?: string): Promise<string> {
  const { data: ex } = await s.from('handler_decrees')
    .select('id, deadline').eq('user_id', user).eq('status', 'active')
    .like('trigger_source', 'turnout_%').limit(1).maybeSingle()
  if (ex) {
    if (ex.deadline && new Date(ex.deadline) < new Date()) {
      await s.from('handler_decrees').update({ deadline: new Date(Date.now() + hours * 3600e3).toISOString() }).eq('id', ex.id)
    }
    return 'kept'
  }
  const tag = kind === 'rung' ? 'turnout_rung' : `turnout_${kind}`
  const { error } = await s.from('handler_decrees').insert({
    user_id: user, edict, proof_type: proof,
    deadline: new Date(Date.now() + hours * 3600e3).toISOString(), status: 'active',
    consequence: consequence ?? 'Miss it and the pull just builds — Mommy is patient. But every step you take is one you can never un-take.',
    trigger_source: `${tag}:${rung}`, reasoning: 'turnout-orchestrator',
  })
  return error ? `err:${error.message.slice(0, 60)}` : 'issued'
}

// ─── Resistance pacing (§2 step 5) ───────────────────────────────────────────
// Mirrors recon-program-orchestrator's fetchTargetDecreeRate/computeIntensityStep
// shape (§3.4 there), adapted to the turnout rung lane: a rung she keeps missing
// gets a WIDER gap and a SOFTER ask, never a harder push. Resistance only ever
// paces; it never skips a rung or changes what the sequence asks for.
interface DecreeRate { total: number; missed: number; skipRate: number }

async function fetchRungDecreeRate(s: Sb, user: string, rung: string, days = 21): Promise<DecreeRate> {
  const since = new Date(Date.now() - days * 86400e3).toISOString()
  const { data } = await s.from('handler_decrees')
    .select('status').eq('user_id', user).eq('trigger_source', `turnout_rung:${rung}`)
    .gte('created_at', since).in('status', ['fulfilled', 'missed'])
  const rows = (data ?? []) as { status: string }[]
  const total = rows.length
  const missed = rows.filter(r => r.status === 'missed').length
  return { total, missed, skipRate: total > 0 ? missed / total : 0 }
}

function computeGapExtra(rate: DecreeRate, currentExtra: number): number {
  if (rate.total < 3) return currentExtra // not enough signal to move the throttle either way
  if (rate.skipRate >= 0.5) return Math.min(14, currentExtra + 3) // resistant → widen, never higher pressure
  if (rate.skipRate <= 0.15 && (rate.total - rate.missed) >= 2) return Math.max(0, currentExtra - 3) // engaging → ease back
  return currentExtra
}

const RESISTANCE_EDICT = `No pressure on that one right now. Just tell Mommy honestly, in a line: what's making this step feel hard. She's not going anywhere, and neither is the pull — you don't have to rush to it.`
const RESISTANCE_CONSEQUENCE = `No punishment for honesty — Mommy would rather know than push you into it. The step waits for you exactly where it is.`

// ─── Revenue-rchain evidence (T0/T7/T8 delegate here) ────────────────────────
// Mirrors revenue-task-generator/index.ts's revenueRungFor() R2/R3 evidence
// checks verbatim — the real acquisition/sale rows, not a self-report. Before
// this fix these rungs fell through to the generic decree branch below: a
// vague self-report decree tagged turnout_rung:<rung> could consolidate "there
// is a public account of you presenting..." (T0) or "a man has paid to use
// you" (T7) with zero connection to whether she'd actually made the account,
// posted, or sold anything — the same fabrication class the turnout_rung:
// tagging split (see issueTurnout's comment) already closed for prep/
// resistance decrees. This closes it for the revenue-delegated rungs too.
async function revenueRungEvidence(s: Sb, user: string, delegateKey: string | null): Promise<boolean> {
  if (delegateKey === 'R0_R2') {
    const POST_SOURCES = ['revenue_first_clip', 'revenue_presence_build', 'revenue_ppv_clip', 'revenue_promo_teasers']
    const { count } = await s.from('handler_decrees').select('id', { count: 'exact', head: true })
      .eq('user_id', user).eq('status', 'fulfilled').in('trigger_source', POST_SOURCES)
    if ((count ?? 0) > 0) return true
    const { count: aigc } = await s.from('ai_generated_content').select('id', { count: 'exact', head: true })
      .eq('user_id', user).eq('platform', 'fansly')
    return (aigc ?? 0) > 0
  }
  if (delegateKey === 'R3_plus' || delegateKey === 'ongoing') {
    const { count } = await s.from('revenue_events').select('id', { count: 'exact', head: true })
      .eq('user_id', user).in('revenue_type', ['ppv', 'tip', 'custom', 'custom_request']).gt('amount', 0)
    return (count ?? 0) > 0
  }
  return false
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  const s = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '')
  const results: Record<string, unknown>[] = []

  for (const user of USERS) {
    const gate = await requireGate(s, 'turnout', user)
    if (!gate.allowed) { results.push({ user, suppressed: gate.reason }); continue }

    // Seed the cursor on first opted-in run.
    let { data: state } = await s.from('turnout_state').select('*').eq('user_id', user).maybeSingle()
    if (!state) {
      await s.from('turnout_state').insert({ user_id: user, current_rung_code: 'T0' })
      const r = await s.from('turnout_state').select('*').eq('user_id', user).maybeSingle()
      state = r.data
    }
    if (!state || state.enabled === false || state.retired_at || (state.paused_until && new Date(state.paused_until) > new Date())) {
      results.push({ user, note: 'paused_or_retired' }); continue
    }

    const rung = state.current_rung_code as string
    const { data: rungRow } = await s.from('turnout_ladder').select('*').eq('rung_code', rung).maybeSingle()
    if (!rungRow) { results.push({ user, note: `unknown_rung:${rung}` }); continue }

    // ── Consolidation: dwell + no-halt + the rung action was fulfilled.
    const consJson = (await s.rpc('turnout_rung_consolidated', { p_user: user, p_rung: rung })).data as { dwell_ok?: boolean; no_halt?: boolean } | null
    const dwellOk = consJson?.dwell_ok === true
    const noHalt = consJson?.no_halt === true
    let rungDone: boolean
    if (rungRow.delegate_engine === 'revenue_rchain') {
      rungDone = await revenueRungEvidence(s, user, rungRow.delegate_key as string | null)
    } else {
      const { data: fulfilledRows } = await s.from('handler_decrees')
        .select('id').eq('user_id', user).eq('trigger_source', `turnout_rung:${rung}`).eq('status', 'fulfilled').limit(1)
      rungDone = (fulfilledRows?.length ?? 0) > 0
    }
    const { data: already } = await s.from('turnout_rung_completions').select('id').eq('user_id', user).eq('rung_code', rung).maybeSingle()

    let advancedTo: string | null = null
    if (dwellOk && noHalt && rungDone && !already) {
      await s.from('turnout_rung_completions').insert({
        user_id: user, rung_code: rung, irreversible_fact: rungRow.irreversible_fact_template, anchor_weight: rungRow.anchor_weight,
      })
      const nxt = nextRung(rung)
      if (nxt) {
        await s.from('turnout_state').update({ current_rung_code: nxt, entered_at: new Date().toISOString() }).eq('user_id', user)
        await s.from('turnout_events').insert({ user_id: user, event_type: 'rung_started', rung_code: nxt })
        advancedTo = nxt
      }
    }

    // ── Surface ONE next step for the (possibly new) current rung.
    const curRung = advancedTo ?? rung
    const { data: cur } = await s.from('turnout_ladder').select('*').eq('rung_code', curRung).maybeSingle()
    const offer = (await s.rpc('turnout_rung_offerable', { p_user: user, p_rung: curRung })).data as { offerable?: boolean; reason?: string; needs_meet_safety_card?: boolean } | null

    // Resistance pacing on the rung's OWN decree lane — reset to 0 on advance
    // (a fresh rung gets a fresh read, never inherits the last rung's throttle).
    const rate = await fetchRungDecreeRate(s, user, curRung)
    const priorExtra = advancedTo ? 0 : (state.gap_extra_days ?? 0)
    const nextExtra = computeGapExtra(rate, priorExtra)
    if (advancedTo || nextExtra !== (state.gap_extra_days ?? 0)) {
      await s.from('turnout_state').update({ gap_extra_days: nextExtra }).eq('user_id', user)
    }
    const resistant = nextExtra > 0

    let surfaced: string
    if (cur?.requires_health_prep && offer?.reason === 'needs_health_prep') {
      // Prep: the STI/PrEP acquisition task (harm-reduction, in Mommy's voice).
      // Tagged 'health_prep', not 'rung' — fulfilling this must never look like
      // the rung action itself happened.
      surfaced = await issueTurnout(s, user, curRung,
        `Before Mommy lets a man finish in you, you're getting tested and getting your PrEP — a girl who gets used stays a clean girl. Book it, paste me the confirmation, then you've earned the next step.`, 'health_prep', 'text', 72)
    } else if (cur?.requires_meet_safety && offer?.needs_meet_safety_card) {
      // Prep: build the meet-safety plan first (no net, no meet).
      surfaced = await issueTurnout(s, user, curRung,
        `Before you meet anyone, Mommy needs you safe: name one person you trust, get their yes to be your check-in, and pick a public place. Build the plan, then we talk about him.`, 'meet_prep', 'text', 72)
    } else if (resistant) {
      // Resistant on the rung action itself — decompose to a smaller, pressure-
      // free ask instead (§2 step 5: lower the barrier, never push harder).
      // Physical rungs simply stay paused; nothing un-pauses realcock this run.
      surfaced = await issueTurnout(s, user, curRung, RESISTANCE_EDICT, 'resistance', 'text', 96, RESISTANCE_CONSEQUENCE)
    } else if (cur?.delegate_engine === 'realcock_discovery') {
      // Physical rung — NEVER a raw decree. Un-pause the gated delegate; its own
      // eval supplies the phase decree behind the meet-safety + health gates.
      await s.from('realcock_discovery_settings').update({ paused_until: null }).eq('user_id', user)
      surfaced = 'delegated:realcock_unpaused'
    } else if (cur?.delegate_engine === 'revenue_rchain') {
      // Paid/online-presence rung — NEVER a self-report decree (that's the
      // fabrication class revenueRungEvidence() above closes). revenue-task-
      // generator already runs its own daily cron issuing the real evidence-
      // gated acquisition tasks (wishlist/account/post/sale); they already
      // reach her Focus surface as ordinary active decrees. This orchestrator
      // only reads that evidence to know when the rung itself has consolidated.
      surfaced = 'delegated:revenue_task_generator'
    } else {
      // Funnel/meet rung (text/voice/photo/video/first-meet) → one focus decree.
      // No independent evidence trail exists for these besides her own report,
      // so this IS the rung action — the only kind allowed to drive consolidation.
      surfaced = await issueTurnout(s, user, curRung, `${cur?.action_copy ?? 'Next step.'} When it's done, come tell Mommy exactly what happened.`, 'rung')
    }

    results.push({ user, rung, advanced_to: advancedTo, current_rung: curRung, gap_extra_days: nextExtra, resistant, surfaced })
  }

  return new Response(JSON.stringify({ ok: true, results }), { headers: { ...cors, 'Content-Type': 'application/json' } })
})
