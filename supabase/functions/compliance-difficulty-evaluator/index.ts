// compliance-difficulty-evaluator — daily band recalculator.
//
// Reads rolling 14-day signals from existing tables:
//   - handler_commitments (status='fulfilled' / 'missed')
//   - slip_log
//   - daily_entries (for streak — consecutive days with entry+no-slip)
// then runs `evaluateBand` from the shared difficulty-band lib and
// upserts compliance_difficulty_state. Logs every band change to
// autonomous_escalation_log so the operator can see auto-adjustments.
//
// Cron: daily. Idempotent within the day — second invocation no-ops
// per user via `next_evaluation_at` gating.
//
// Hard rules:
//   - override_band always wins. If set, we still update the snapshot
//     (compliance_pct_14d, slip_count_14d, streak_days) but DO NOT
//     touch current_difficulty_band.
//   - Caps movement at +/-1 band per pass.
//   - Defaults a fresh user (no row yet) to 'gentle'.
//
// POST { user_id?: string, force?: boolean }

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import {
  evaluateBand, BAND_ORDER,
  type DifficultyBand, type ComplianceSignals,
} from '../_shared/difficulty-band.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const HANDLER_USER_ID = '8c69b9c8-34eb-4147-9fec-3c1a5bc74b6f'
const POSTER_USER_ID = '93327332-7d0d-4888-889a-1607a5776216'

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

interface ExistingState {
  current_difficulty_band: DifficultyBand
  override_band: DifficultyBand | null
  next_evaluation_at: string | null
}

function isBand(v: unknown): v is DifficultyBand {
  return typeof v === 'string' && (BAND_ORDER as string[]).includes(v)
}

async function readState(
  supabase: ReturnType<typeof createClient>,
  userId: string,
): Promise<ExistingState | null> {
  const { data } = await supabase
    .from('compliance_difficulty_state')
    .select('current_difficulty_band, override_band, next_evaluation_at')
    .eq('user_id', userId)
    .maybeSingle()
  if (!data) return null
  const row = data as Record<string, unknown>
  return {
    current_difficulty_band: isBand(row.current_difficulty_band) ? row.current_difficulty_band : 'gentle',
    override_band: isBand(row.override_band) ? row.override_band : null,
    next_evaluation_at: (row.next_evaluation_at as string | null) ?? null,
  }
}

async function readSignals(
  supabase: ReturnType<typeof createClient>,
  userId: string,
): Promise<ComplianceSignals> {
  const since14 = new Date(Date.now() - 14 * 86400_000).toISOString()
  const sinceMidnight = new Date()
  sinceMidnight.setHours(0, 0, 0, 0)

  // 1. Compliance pct: fulfilled / (fulfilled + missed) over 14d.
  const [{ count: fulfilled }, { count: missed }] = await Promise.all([
    supabase
      .from('handler_commitments')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('status', 'fulfilled')
      .gte('fulfilled_at', since14),
    supabase
      .from('handler_commitments')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('status', 'missed')
      .gte('missed_at', since14),
  ])
  const fulfilledN = fulfilled ?? 0
  const missedN = missed ?? 0
  const total = fulfilledN + missedN
  const compliancePct14d = total === 0 ? 100 : Math.round((fulfilledN / total) * 10000) / 100

  // 2. Slip count over 14d
  const { count: slipCount } = await supabase
    .from('slip_log')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('detected_at', since14)
  const slipCount14d = slipCount ?? 0

  // 3. Streak: consecutive days back from today with a fulfilled
  //    commitment AND no slip. We bound at 14 to keep this O(1) and
  //    aligned with the 14-day window the rest of the spec uses.
  let streakDays = 0
  for (let i = 0; i < 14; i++) {
    const dayStart = new Date(Date.now() - i * 86400_000)
    dayStart.setHours(0, 0, 0, 0)
    const dayEnd = new Date(dayStart.getTime() + 86400_000)
    const [{ count: dayFulfilled }, { count: daySlips }] = await Promise.all([
      supabase
        .from('handler_commitments')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('status', 'fulfilled')
        .gte('fulfilled_at', dayStart.toISOString())
        .lt('fulfilled_at', dayEnd.toISOString()),
      supabase
        .from('slip_log')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .gte('detected_at', dayStart.toISOString())
        .lt('detected_at', dayEnd.toISOString()),
    ])
    if ((dayFulfilled ?? 0) > 0 && (daySlips ?? 0) === 0) {
      streakDays++
    } else if (i === 0) {
      // Today might still be in progress; only break the streak if we're
      // looking at a past day. Today with no fulfilled commitments yet
      // doesn't reset — we just don't count it.
      continue
    } else {
      break
    }
  }

  return { compliancePct14d, slipCount14d, streakDays }
}

async function evaluateOne(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  force: boolean,
): Promise<Record<string, unknown>> {
  const existing = await readState(supabase, userId)

  // Idempotence: skip if a previous pass set next_evaluation_at into
  // the future and we're not forcing.
  if (!force && existing?.next_evaluation_at) {
    if (new Date(existing.next_evaluation_at) > new Date()) {
      return { user_id: userId, skipped: 'before_next_eval' }
    }
  }

  const signals = await readSignals(supabase, userId)
  const current: DifficultyBand = existing?.current_difficulty_band ?? 'gentle'
  const override = existing?.override_band ?? null

  // If the user has locked the band manually, never move it.
  if (override) {
    const next = new Date(Date.now() + 24 * 3600_000).toISOString()
    await supabase
      .from('compliance_difficulty_state')
      .upsert({
        user_id: userId,
        current_difficulty_band: current,
        override_band: override,
        compliance_pct_14d: signals.compliancePct14d,
        slip_count_14d: signals.slipCount14d,
        streak_days: signals.streakDays,
        last_evaluated_at: new Date().toISOString(),
        next_evaluation_at: next,
        last_change_reason: 'override_held',
      }, { onConflict: 'user_id' })
    return {
      user_id: userId,
      band: current,
      override_band: override,
      reason: 'override_held',
      changed: false,
      signals,
    }
  }

  const evaluation = evaluateBand(current, signals)
  const nextBand = evaluation.next
  const nextEvalAt = new Date(Date.now() + 24 * 3600_000).toISOString()

  await supabase
    .from('compliance_difficulty_state')
    .upsert({
      user_id: userId,
      current_difficulty_band: nextBand,
      override_band: null,
      compliance_pct_14d: signals.compliancePct14d,
      slip_count_14d: signals.slipCount14d,
      streak_days: signals.streakDays,
      last_evaluated_at: new Date().toISOString(),
      next_evaluation_at: nextEvalAt,
      last_change_reason: evaluation.reason,
    }, { onConflict: 'user_id' })

  // Log only ACTUAL changes — stable passes don't pollute the audit trail.
  if (evaluation.changed) {
    await supabase.from('autonomous_escalation_log').insert({
      user_id: userId,
      engine: 'compliance_difficulty',
      action: nextBand === 'recovery'
        ? 'decreased'
        : (BAND_ORDER.indexOf(nextBand) > BAND_ORDER.indexOf(current) ? 'increased' : 'decreased'),
      before_state: { band: current, ...signals },
      after_state: { band: nextBand, ...signals },
      rationale: evaluation.reason,
      decided_by: 'compliance-difficulty-evaluator',
    })
  }

  return {
    user_id: userId,
    band: nextBand,
    previous_band: current,
    reason: evaluation.reason,
    changed: evaluation.changed,
    signals,
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return jsonResponse({ ok: false, error: 'POST only' }, 405)

  let body: { user_id?: string; force?: boolean } = {}
  try { body = await req.json() } catch { /* */ }
  const force = !!body.force

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  )

  // Targets: explicit user, or both Handler + poster ids by default.
  const targets = body.user_id
    ? [body.user_id]
    : [HANDLER_USER_ID, POSTER_USER_ID]

  const results: Array<Record<string, unknown>> = []
  for (const uid of targets) {
    try {
      results.push(await evaluateOne(supabase, uid, force))
    } catch (err) {
      results.push({ user_id: uid, error: err instanceof Error ? err.message : String(err) })
    }
  }

  return jsonResponse({ ok: true, results })
})
