// wish-classifier — bridge mommy_ideation_log → mommy_code_wishes.
//
// Daily cron + on-insert trigger. For each unclassified ideation log row,
// extracts candidate features, classifies them via the pure ruleset in
// ./classifier.ts, and inserts wishes with auto_ship_eligible flipped
// based on safety + size + dedup.
//
// Entry shape:
//   POST { trigger: 'cron'|'on_insert'|'manual'|'reevaluation', ideation_log_id?: string }
//
// 2026-05-11 scope authority expansion (migration 367):
//   - Six hard floors total, enforced in classifier.ts:
//       REJECT: minors/CSAM, safeword removal, wrong-repo
//       REVIEW: auth-infra, billing-infra, rls-infra, destructive-user-data,
//               secret-rotation
//     Everything else inside the product kink scope auto-ships.
//   - Daily cap raised to 25 (runaway safety, not review gate). Mommy
//     decides; the builder's --drain cap is the real ceiling.
//   - Audit trail per decision in wish_classifier_decisions (including
//     'rejected' rows for hard-floor REJECT hits — they get an audit row
//     but no mommy_code_wishes insert).

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import {
  ClassificationOutput,
  IdeationFeature,
  IdeationRow,
  WishCandidate,
  classifyCandidate,
  extractCandidates,
  extractFeaturesFromIdeationRow,
  findDedupMatch,
  mapCategoryToWishClass,
  rankForCap,
  DEFAULT_DAILY_CAP,
  DEFAULT_PER_RUN_CANDIDATE_CAP,
  DEFAULT_DEDUP_LOOKBACK_DAYS,
  DEFAULT_REEVALUATION_AGE_DAYS,
  DEFAULT_DEDUP_THRESHOLD,
} from './classifier.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

interface ClassifierRequest {
  trigger?: 'cron' | 'on_insert' | 'manual' | 'reevaluation'
  ideation_log_id?: string
}

interface DecisionInFlight {
  output: ClassificationOutput
  feature: IdeationFeature
  sourceLogId: string | null
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') {
    return jsonRes({ ok: false, error: 'POST only' }, 405)
  }

  let body: ClassifierRequest = {}
  try { body = await req.json() } catch { /* default empty */ }
  const trigger = body.trigger ?? 'manual'

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  )

  // 1. Open run row up-front so failures still leave a telemetry trace
  const { data: runRow, error: runErr } = await supabase
    .from('wish_classifier_runs')
    .insert({ trigger })
    .select('id')
    .single()
  if (runErr || !runRow) {
    return jsonRes({ ok: false, error: `runRow insert failed: ${runErr?.message ?? 'unknown'}` }, 500)
  }
  const runId = (runRow as { id: string }).id

  const errors: string[] = []
  let ideationCount = 0
  let candidatesProduced = 0
  let eligibleCount = 0
  let needsReviewCount = 0
  let skippedDedup = 0
  let cappedCount = 0
  const denialBreakdown: Record<string, number> = {}

  try {
    // 2. Re-evaluation pass FIRST so newly-eligible wishes count toward today's cap
    if (trigger === 'reevaluation') {
      await reevaluateStaleWishes(supabase, runId)
    }

    // 3. Pull unclassified ideation rows
    const ideationRows = await fetchUnclassifiedIdeation(supabase, body.ideation_log_id)
    ideationCount = ideationRows.length

    // 4. Extract + classify candidates per row (cap candidates per ideate run)
    const allDecisions: DecisionInFlight[] = []
    for (const row of ideationRows) {
      const features = extractFeaturesFromIdeationRow(row)
      const candidates = extractCandidates(features)
      const featureCap = features.slice(0, DEFAULT_PER_RUN_CANDIDATE_CAP)
      const candidateCap = candidates.slice(0, DEFAULT_PER_RUN_CANDIDATE_CAP)
      for (let i = 0; i < candidateCap.length; i++) {
        const cand = candidateCap[i]
        const feat = featureCap[i] ?? {}
        const output = classifyCandidate(feat, cand)
        allDecisions.push({ output, feature: feat, sourceLogId: row.id })
        candidatesProduced++
      }
    }

    // 5. Dedup against last 30 days
    const recentWishes = await fetchRecentWishes(supabase, DEFAULT_DEDUP_LOOKBACK_DAYS)
    const dedupSurvivors: DecisionInFlight[] = []
    for (const d of allDecisions) {
      const match = findDedupMatch(d.output.candidate, recentWishes, DEFAULT_DEDUP_THRESHOLD)
      if (match) {
        skippedDedup++
        await logDecision(supabase, runId, d, 'skipped_dedup', { dedup_match_wish_id: match.id })
        continue
      }
      dedupSurvivors.push(d)
    }

    // 6. Apply daily cap on auto-eligible inserts.
    //    'rejected' decisions (hard-floor REJECT hits) get an audit row but
    //    no wish insert — they never enter the queue.
    const rejectedSurvivors = dedupSurvivors.filter(d => d.output.decision === 'rejected')
    for (const d of rejectedSurvivors) {
      await logDecision(supabase, runId, d, 'rejected', {
        denial_reason: `hard_floor_reject: ${d.output.blockers.join(', ')}`,
      })
      for (const b of d.output.blockers) {
        denialBreakdown[b] = (denialBreakdown[b] ?? 0) + 1
      }
    }
    const eligibleSurvivors = dedupSurvivors.filter(d => d.output.decision === 'eligible')
    const reviewSurvivors = dedupSurvivors.filter(d => d.output.decision === 'needs_review')
    eligibleSurvivors.sort((a, b) => rankForCap(a.output, b.output))

    const todayEligibleCount = await countTodayAutoEligible(supabase)
    const remainingCap = Math.max(0, DEFAULT_DAILY_CAP - todayEligibleCount)
    const eligibleToInsert = eligibleSurvivors.slice(0, remainingCap)
    const eligibleCapped = eligibleSurvivors.slice(remainingCap)
    cappedCount = eligibleCapped.length

    // 7. Insert eligible wishes
    for (const d of eligibleToInsert) {
      const wishClass = mapCategoryToWishClass(d.feature.category)
      const wishId = await insertWish(supabase, {
        candidate: d.output.candidate,
        sourceIdeationLogId: d.sourceLogId,
        autoShipEligible: true,
        status: 'queued',
        complexityTier: d.output.sizeTier,
        estimatedFilesTouched: d.output.estimatedFilesTouched,
        autoShipBlockers: null,
        denialReason: null,
        wishClass,
      })
      await logDecision(supabase, runId, d, 'eligible', { resulting_wish_id: wishId })
      eligibleCount++
    }

    // 8. Insert capped-but-otherwise-eligible as needs_review (they roll to next run)
    for (const d of eligibleCapped) {
      const wishClass = mapCategoryToWishClass(d.feature.category)
      const wishId = await insertWish(supabase, {
        candidate: d.output.candidate,
        sourceIdeationLogId: d.sourceLogId,
        autoShipEligible: false,
        status: 'needs_review',
        complexityTier: d.output.sizeTier,
        estimatedFilesTouched: d.output.estimatedFilesTouched,
        autoShipBlockers: ['daily_cap_exceeded'],
        denialReason: `Daily cap of ${DEFAULT_DAILY_CAP} auto-eligible wishes hit; rolled to next run.`,
        wishClass,
      })
      await logDecision(supabase, runId, d, 'skipped_cap', {
        resulting_wish_id: wishId,
        denial_reason: 'daily_cap_exceeded',
      })
    }

    // 9. Insert needs_review wishes (auth/billing/RLS infra or destructive SQL — the hard-floor REVIEW set)
    for (const d of reviewSurvivors) {
      const wishClass = mapCategoryToWishClass(d.feature.category)
      const wishId = await insertWish(supabase, {
        candidate: d.output.candidate,
        sourceIdeationLogId: d.sourceLogId,
        autoShipEligible: false,
        status: 'needs_review',
        complexityTier: d.output.sizeTier,
        estimatedFilesTouched: d.output.estimatedFilesTouched,
        autoShipBlockers: d.output.blockers,
        denialReason: d.output.denialReason,
        wishClass,
      })
      await logDecision(supabase, runId, d, 'needs_review', {
        resulting_wish_id: wishId,
        denial_reason: d.output.denialReason,
      })
      needsReviewCount++
      for (const b of d.output.blockers) {
        denialBreakdown[b] = (denialBreakdown[b] ?? 0) + 1
      }
    }

    // 10. Mark ideation rows as classified so we don't re-process them
    for (const row of ideationRows) {
      await supabase.from('mommy_ideation_log').update({
        classified_at: new Date().toISOString(),
        classifier_run_id: runId,
      }).eq('id', row.id)
    }
  } catch (err) {
    errors.push(`top-level: ${String(err).slice(0, 300)}`)
  }

  // 11. Close out the run row
  await supabase.from('wish_classifier_runs').update({
    run_finished_at: new Date().toISOString(),
    ideation_rows_input: ideationCount,
    candidates_produced: candidatesProduced,
    eligible_count: eligibleCount,
    needs_review_count: needsReviewCount,
    skipped_dedup_count: skippedDedup,
    capped_count: cappedCount,
    denial_breakdown: denialBreakdown,
    errors: errors.length ? errors : null,
  }).eq('id', runId)

  return jsonRes({
    ok: true,
    run_id: runId,
    trigger,
    ideation_rows_input: ideationCount,
    candidates_produced: candidatesProduced,
    eligible_count: eligibleCount,
    needs_review_count: needsReviewCount,
    skipped_dedup_count: skippedDedup,
    capped_count: cappedCount,
    denial_breakdown: denialBreakdown,
    errors: errors.length ? errors : undefined,
  })
})

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function jsonRes(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

async function fetchUnclassifiedIdeation(
  supabase: SupabaseClient,
  ideationLogId?: string,
): Promise<IdeationRow[]> {
  if (ideationLogId) {
    const { data, error } = await supabase
      .from('mommy_ideation_log')
      .select('id, anthropic_raw, openai_raw, openrouter_raw, judged')
      .eq('id', ideationLogId)
    if (error) {
      console.error('fetchUnclassifiedIdeation (by id):', error.message)
      return []
    }
    return (data ?? []) as IdeationRow[]
  }
  const { data, error } = await supabase
    .from('mommy_ideation_log')
    .select('id, anthropic_raw, openai_raw, openrouter_raw, judged')
    .is('classified_at', null)
    .order('created_at', { ascending: true })
    .limit(20)
  if (error) {
    console.error('fetchUnclassifiedIdeation:', error.message)
    return []
  }
  return (data ?? []) as IdeationRow[]
}

async function fetchRecentWishes(supabase: SupabaseClient, lookbackDays: number) {
  const cutoff = new Date(Date.now() - lookbackDays * 86_400_000).toISOString()
  const { data } = await supabase
    .from('mommy_code_wishes')
    .select('id, wish_title, wish_body')
    .gte('created_at', cutoff)
    .limit(500)
  return (data ?? []) as Array<{ id: string; wish_title: string; wish_body: string }>
}

async function countTodayAutoEligible(supabase: SupabaseClient): Promise<number> {
  const startOfDay = new Date()
  startOfDay.setUTCHours(0, 0, 0, 0)
  const { count } = await supabase
    .from('mommy_code_wishes')
    .select('id', { count: 'exact', head: true })
    .eq('source', 'ideate-classifier')
    .eq('auto_ship_eligible', true)
    .gte('created_at', startOfDay.toISOString())
  return count ?? 0
}

interface InsertWishArgs {
  candidate: WishCandidate
  sourceIdeationLogId: string | null
  autoShipEligible: boolean
  status: 'queued' | 'needs_review'
  complexityTier: string
  estimatedFilesTouched: number
  autoShipBlockers: string[] | null
  denialReason: string | null
  wishClass: string
}

async function insertWish(supabase: SupabaseClient, args: InsertWishArgs): Promise<string | null> {
  const { data, error } = await supabase.from('mommy_code_wishes').insert({
    wish_title: args.candidate.title,
    wish_body: args.candidate.body,
    protocol_goal: args.candidate.protocolGoal,
    source: 'ideate-classifier',
    source_ideation_log_id: args.sourceIdeationLogId,
    affected_surfaces: args.candidate.affectedSurfaces,
    priority: 'normal',
    status: args.status,
    wish_class: args.wishClass,
    auto_ship_eligible: args.autoShipEligible,
    complexity_tier: args.complexityTier,
    estimated_files_touched: args.estimatedFilesTouched,
    auto_ship_blockers: args.autoShipBlockers,
    denial_reason: args.denialReason,
    classified_at: new Date().toISOString(),
    classified_by: 'wish_classifier',
  }).select('id').single()
  if (error) {
    console.error('insertWish:', error.message)
    return null
  }
  return (data as { id: string } | null)?.id ?? null
}

async function logDecision(
  supabase: SupabaseClient,
  runId: string,
  d: DecisionInFlight,
  decision: 'eligible' | 'needs_review' | 'rejected' | 'skipped_dedup' | 'skipped_cap' | 'error',
  extra: {
    resulting_wish_id?: string | null
    dedup_match_wish_id?: string | null
    denial_reason?: string | null
  } = {},
) {
  await supabase.from('wish_classifier_decisions').insert({
    run_id: runId,
    source_ideation_log_id: d.sourceLogId,
    candidate_title: d.output.candidate.title,
    candidate_body: d.output.candidate.body.slice(0, 4000),
    decision,
    size_tier: d.output.sizeTier,
    forbidden_path_hits: d.output.forbiddenPathHits,
    safety_signal_hits: d.output.safetySignalHits,
    denial_reason: extra.denial_reason ?? d.output.denialReason,
    dedup_match_wish_id: extra.dedup_match_wish_id ?? null,
    resulting_wish_id: extra.resulting_wish_id ?? null,
  })
}

// ---------------------------------------------------------------------------
// Re-evaluation pass — re-classify stale needs_review wishes that may have
// become safe (or remain unsafe) since their original classification.
// ---------------------------------------------------------------------------

async function reevaluateStaleWishes(supabase: SupabaseClient, runId: string) {
  const cutoff = new Date(Date.now() - DEFAULT_REEVALUATION_AGE_DAYS * 86_400_000).toISOString()
  const { data, error } = await supabase
    .from('mommy_code_wishes')
    .select('id, wish_title, wish_body, protocol_goal, affected_surfaces, complexity_tier, auto_ship_eligible, auto_ship_blockers, status, denial_reason')
    .eq('status', 'needs_review')
    .eq('auto_ship_eligible', false)
    .lte('created_at', cutoff)
    .limit(50)
  if (error) {
    console.error('reevaluateStaleWishes select:', error.message)
    return
  }
  const rows = (data ?? []) as Array<{
    id: string
    wish_title: string
    wish_body: string
    protocol_goal: string
    affected_surfaces: Record<string, unknown> | null
    complexity_tier: string | null
    auto_ship_eligible: boolean
    auto_ship_blockers: string[] | null
    status: string
    denial_reason: string | null
  }>
  for (const w of rows) {
    const candidate: WishCandidate = {
      title: w.wish_title,
      body: w.wish_body,
      protocolGoal: w.protocol_goal,
      affectedSurfaces: (w.affected_surfaces ?? {}) as WishCandidate['affectedSurfaces'],
    }
    const output = classifyCandidate({}, candidate)

    const newEligible = output.decision === 'eligible'
    const tierChanged = output.sizeTier !== (w.complexity_tier ?? '')
    if (newEligible === w.auto_ship_eligible && !tierChanged) continue

    await supabase.from('mommy_code_wishes').update({
      auto_ship_eligible: newEligible,
      status: newEligible ? 'queued' : 'needs_review',
      complexity_tier: output.sizeTier,
      auto_ship_blockers: output.blockers.length ? output.blockers : null,
      denial_reason: output.denialReason,
      classified_at: new Date().toISOString(),
      classified_by: 'wish_classifier',
    }).eq('id', w.id)

    await supabase.from('wish_classifier_decisions').insert({
      run_id: runId,
      candidate_title: w.wish_title,
      candidate_body: w.wish_body.slice(0, 4000),
      decision: newEligible ? 'eligible' : 'needs_review',
      size_tier: output.sizeTier,
      forbidden_path_hits: output.forbiddenPathHits,
      safety_signal_hits: output.safetySignalHits,
      denial_reason: output.denialReason,
      resulting_wish_id: w.id,
    })
  }
}
