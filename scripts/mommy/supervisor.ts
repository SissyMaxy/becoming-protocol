/**
 * Mommy supervisor.
 *
 * 2026-05-10 — Maxy: "I want mommy to constantly be building. she needs to
 * either fix issues, evaluate progress and make changes, develop new features
 * or functionality, or posting/engaging with people on my behalf. why isn't
 * this already happening?"
 *
 * This script is the watchdog. It runs every ~10 min from .github/workflows/
 * mommy-supervisor.yml and is the **only** thing that notices when a link in
 * the autonomous loop has gone quiet.
 *
 * Pipeline it watches:
 *
 *   ideate → mommy_code_wishes → kick-builder → mommy-builder → mommy-deploy
 *                                       │
 *                                       └── outreach-draft-generator → outreach-submit
 *
 * Each metric is checked against a threshold. If under threshold AND there's
 * a corrective action available, the supervisor fires it (POST to an edge
 * function or INSERT into a queue) and logs the action to
 * mommy_supervisor_log. The /api/admin/mommy-pulse endpoint reads that log
 * and rolls it up into a green/yellow/red panel.
 *
 * Defensive principles:
 *   - Every action is rate-limited per-action-type to avoid feedback loops
 *     (e.g. don't kick the builder 6 times in a row if the previous kicks
 *     are still mid-flight).
 *   - Every metric query is wrapped in try/catch — a missing table (like
 *     outreach_post_drafts on a stale main) does not abort the whole run.
 *   - Self-heal wishes are throttled too: max 1 per metric per 24h, so a
 *     persistent failure doesn't flood the wish queue.
 *
 * Modes:
 *   --dry        Compute metrics and decide actions but don't fire HTTP /
 *                INSERT anything. Just prints what it would do. Useful for
 *                local sanity-checks without DB write.
 *   --json       Emit the final summary as JSON on stdout (for piping to
 *                automation that wants the raw numbers).
 *   (default)    Live run — fire actions and write to mommy_supervisor_log.
 */
import 'dotenv/config'
import { createClient, SupabaseClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || ''
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('[supervisor] missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const supabase: SupabaseClient = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false },
})

const args = process.argv.slice(2)
const DRY = args.includes('--dry')
const JSON_OUT = args.includes('--json')

type Severity = 'ok' | 'warn' | 'fail'

interface Decision {
  metric: string
  threshold: number | null
  observed: number | null
  severity: Severity
  action: string | null
  target: string | null
  notes: string
  // Filled in after the action fires (status code, latency, etc).
  result?: Record<string, unknown>
}

const decisions: Decision[] = []

function note(d: Decision): void {
  decisions.push(d)
}

function log(msg: string): void {
  if (!JSON_OUT) console.log(`[supervisor] ${msg}`)
}

// ── Action throttle ──────────────────────────────────────────────────────────
// Don't fire the same action twice in <ACTION_COOLDOWN_MIN minutes. Reads the
// last entry for (metric, action_taken) from mommy_supervisor_log. Keeps the
// supervisor idempotent across overlapping cron runs.
const ACTION_COOLDOWN_MIN = 9
async function recentlyTook(metric: string, action: string): Promise<boolean> {
  const since = new Date(Date.now() - ACTION_COOLDOWN_MIN * 60_000).toISOString()
  const { data } = await supabase
    .from('mommy_supervisor_log')
    .select('id')
    .eq('metric', metric)
    .eq('action_taken', action)
    .gte('run_at', since)
    .limit(1)
  return (data ?? []).length > 0
}

// Self-heal wishes are even more throttled — max 1 per metric per 24h.
const SELF_HEAL_COOLDOWN_HOURS = 24
async function selfHealRecentlyEnqueued(metric: string): Promise<boolean> {
  const since = new Date(Date.now() - SELF_HEAL_COOLDOWN_HOURS * 3600_000).toISOString()
  const { data } = await supabase
    .from('mommy_supervisor_log')
    .select('id')
    .eq('metric', metric)
    .eq('action_taken', 'enqueue_self_heal_wish')
    .gte('run_at', since)
    .limit(1)
  return (data ?? []).length > 0
}

// ── HTTP invoker (edge functions) ────────────────────────────────────────────
async function invokeEdgeFunction(
  fnName: string,
  body: Record<string, unknown> = {},
): Promise<{ status: number; ms: number; bodyExcerpt: string }> {
  const t0 = Date.now()
  const url = `${SUPABASE_URL.replace(/\/$/, '')}/functions/v1/${fnName}`
  try {
    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SERVICE_KEY}`,
      },
      body: JSON.stringify({ ...body, triggered_by: 'mommy-supervisor' }),
    })
    const text = await resp.text().catch(() => '')
    return { status: resp.status, ms: Date.now() - t0, bodyExcerpt: text.slice(0, 400) }
  } catch (err) {
    return { status: 0, ms: Date.now() - t0, bodyExcerpt: 'fetch_error: ' + String(err).slice(0, 200) }
  }
}

// ── Metrics ──────────────────────────────────────────────────────────────────
//
// Every checker is independent — one failing read should never stop the others.
// Each pushes one Decision into `decisions`.

async function checkBuilderHeartbeat(): Promise<void> {
  // The builder writes mommy_builder_run rows on every attempt (success or
  // failure). If there's no row in the last 30 min AND there are
  // auto_ship_eligible queued wishes, the builder is asleep — kick it.
  const HEARTBEAT_THRESHOLD_MIN = 30
  const since = new Date(Date.now() - HEARTBEAT_THRESHOLD_MIN * 60_000).toISOString()

  let lastRunAgeMin: number | null = null
  let queueDepth = 0

  try {
    const { data: lastRun } = await supabase
      .from('mommy_builder_run')
      .select('started_at')
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (lastRun?.started_at) {
      lastRunAgeMin = Math.round((Date.now() - new Date(lastRun.started_at).getTime()) / 60_000)
    }
  } catch (err) {
    note({
      metric: 'builder_heartbeat_min',
      threshold: HEARTBEAT_THRESHOLD_MIN,
      observed: null,
      severity: 'warn',
      action: null,
      target: null,
      notes: 'mommy_builder_run read failed: ' + String(err).slice(0, 120),
    })
    return
  }

  try {
    const { count } = await supabase
      .from('mommy_code_wishes')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'queued')
      .eq('auto_ship_eligible', true)
      .gte('created_at', since)
    queueDepth = count ?? 0
  } catch { /* */ }

  // Recent rows in mommy_builder_run within the threshold = heartbeat alive.
  if (lastRunAgeMin !== null && lastRunAgeMin <= HEARTBEAT_THRESHOLD_MIN) {
    note({
      metric: 'builder_heartbeat_min',
      threshold: HEARTBEAT_THRESHOLD_MIN,
      observed: lastRunAgeMin,
      severity: 'ok',
      action: null,
      target: null,
      notes: `builder ran ${lastRunAgeMin}min ago`,
    })
    return
  }

  // No recent runs. Check whether there's anything to actually build.
  let totalEligible = 0
  try {
    const { count } = await supabase
      .from('mommy_code_wishes')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'queued')
      .eq('auto_ship_eligible', true)
    totalEligible = count ?? 0
  } catch { /* */ }

  if (totalEligible === 0) {
    note({
      metric: 'builder_heartbeat_min',
      threshold: HEARTBEAT_THRESHOLD_MIN,
      observed: lastRunAgeMin,
      severity: 'ok',
      action: null,
      target: null,
      notes: `builder idle but queue empty (eligible=0)`,
    })
    return
  }

  // Eligible work + stale heartbeat = kick. Throttle to avoid hammering
  // when GH Actions is just slow to start.
  const recently = await recentlyTook('builder_heartbeat_min', 'invoke_kick_builder')
  if (recently) {
    note({
      metric: 'builder_heartbeat_min',
      threshold: HEARTBEAT_THRESHOLD_MIN,
      observed: lastRunAgeMin,
      severity: 'warn',
      action: 'observe_only',
      target: null,
      notes: `stale heartbeat but kick already fired in last ${ACTION_COOLDOWN_MIN}min`,
    })
    return
  }

  if (DRY) {
    note({
      metric: 'builder_heartbeat_min',
      threshold: HEARTBEAT_THRESHOLD_MIN,
      observed: lastRunAgeMin,
      severity: 'fail',
      action: 'invoke_kick_builder',
      target: 'kick-builder',
      notes: `[dry] would kick builder; queue=${totalEligible} eligible`,
    })
    return
  }

  const r = await invokeEdgeFunction('kick-builder', { reason: 'supervisor_heartbeat_stale', force: true })
  note({
    metric: 'builder_heartbeat_min',
    threshold: HEARTBEAT_THRESHOLD_MIN,
    observed: lastRunAgeMin,
    severity: 'fail',
    action: 'invoke_kick_builder',
    target: 'kick-builder',
    notes: `kicked builder; queue=${totalEligible} eligible, queue_24h=${queueDepth}`,
    result: { status: r.status, latency_ms: r.ms, body: r.bodyExcerpt },
  })
}

async function checkQueueDepth(): Promise<void> {
  // If the auto-ship-eligible queue has been empty for 24h+, ideation has
  // stalled. Kick mommy-ideate to refill.
  const IDEATE_COOLDOWN_HOURS = 24
  const since = new Date(Date.now() - IDEATE_COOLDOWN_HOURS * 3600_000).toISOString()

  let totalEligible = 0
  let recentInsertCount = 0
  try {
    const { count: totalCount } = await supabase
      .from('mommy_code_wishes')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'queued')
      .eq('auto_ship_eligible', true)
    totalEligible = totalCount ?? 0

    const { count: recentCount } = await supabase
      .from('mommy_code_wishes')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', since)
    recentInsertCount = recentCount ?? 0
  } catch (err) {
    note({
      metric: 'queue_depth_eligible',
      threshold: 1,
      observed: null,
      severity: 'warn',
      action: null,
      target: null,
      notes: 'mommy_code_wishes read failed: ' + String(err).slice(0, 120),
    })
    return
  }

  if (totalEligible >= 1) {
    note({
      metric: 'queue_depth_eligible',
      threshold: 1,
      observed: totalEligible,
      severity: 'ok',
      action: null,
      target: null,
      notes: `${totalEligible} eligible wishes queued`,
    })
    return
  }

  // Queue is empty. If ideation has also been quiet (no new wishes inserted
  // in 24h), kick it.
  if (recentInsertCount === 0) {
    const recently = await recentlyTook('queue_depth_eligible', 'invoke_ideate')
    if (recently) {
      note({
        metric: 'queue_depth_eligible',
        threshold: 1,
        observed: 0,
        severity: 'warn',
        action: 'observe_only',
        target: null,
        notes: 'queue empty but ideate already invoked recently',
      })
      return
    }
    if (DRY) {
      note({
        metric: 'queue_depth_eligible',
        threshold: 1,
        observed: 0,
        severity: 'fail',
        action: 'invoke_ideate',
        target: 'mommy-ideate',
        notes: '[dry] would invoke mommy-ideate (queue empty + 24h quiet)',
      })
      return
    }
    const r = await invokeEdgeFunction('mommy-ideate', { reason: 'supervisor_queue_empty' })
    note({
      metric: 'queue_depth_eligible',
      threshold: 1,
      observed: 0,
      severity: 'fail',
      action: 'invoke_ideate',
      target: 'mommy-ideate',
      notes: `queue empty, ideate kicked`,
      result: { status: r.status, latency_ms: r.ms, body: r.bodyExcerpt },
    })
    return
  }

  // Queue empty but recent INSERTs exist — that means everything that came
  // in was either rejected, marked review-required, or shipped. That's a
  // healthy "all caught up" state. Yellow not red — no action needed.
  note({
    metric: 'queue_depth_eligible',
    threshold: 1,
    observed: 0,
    severity: 'warn',
    action: null,
    target: null,
    notes: `queue empty but ${recentInsertCount} wishes inserted in last 24h (caught up)`,
  })
}

async function checkOutreachDrafts(): Promise<void> {
  // ≥1 outreach draft generated per 24h is the floor. The drafter cron
  // runs every 6h so 4 attempts/day; if all 4 produced 0 drafts something
  // upstream is broken (no enabled communities, drafter API failing, etc).
  const since = new Date(Date.now() - 24 * 3600_000).toISOString()

  let count: number | null = null
  try {
    const { count: c } = await supabase
      .from('outreach_post_drafts')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', since)
    count = c ?? 0
  } catch (err) {
    // Table missing (348 not merged) — silent skip rather than warn-spam.
    note({
      metric: 'outreach_drafts_24h',
      threshold: 1,
      observed: null,
      severity: 'ok',
      action: null,
      target: null,
      notes: 'outreach_post_drafts unavailable (348 not merged?) — skipping',
    })
    return
  }

  if (count >= 1) {
    note({
      metric: 'outreach_drafts_24h',
      threshold: 1,
      observed: count,
      severity: 'ok',
      action: null,
      target: null,
      notes: `${count} drafts in last 24h`,
    })
    return
  }

  // Before kicking the drafter, sanity-check that there's actually an enabled
  // community to draft INTO. If not, we'd just call drafter into a void.
  let enabledCount = 0
  try {
    const { count: c } = await supabase
      .from('outreach_communities')
      .select('id', { count: 'exact', head: true })
      .eq('enabled', true)
      .is('banned_at', null)
    enabledCount = c ?? 0
  } catch { /* */ }

  if (enabledCount === 0) {
    note({
      metric: 'outreach_drafts_24h',
      threshold: 1,
      observed: 0,
      severity: 'warn',
      action: null,
      target: null,
      notes: 'no enabled communities — user must add communities before outreach can fire',
    })
    return
  }

  const recently = await recentlyTook('outreach_drafts_24h', 'invoke_outreach_drafter')
  if (recently) {
    note({
      metric: 'outreach_drafts_24h',
      threshold: 1,
      observed: 0,
      severity: 'warn',
      action: 'observe_only',
      target: null,
      notes: 'drafter already invoked recently',
    })
    return
  }

  if (DRY) {
    note({
      metric: 'outreach_drafts_24h',
      threshold: 1,
      observed: 0,
      severity: 'fail',
      action: 'invoke_outreach_drafter',
      target: 'outreach-draft-generator',
      notes: `[dry] would invoke drafter; ${enabledCount} enabled communities`,
    })
    return
  }
  const r = await invokeEdgeFunction('outreach-draft-generator', { reason: 'supervisor_drafts_quiet' })
  note({
    metric: 'outreach_drafts_24h',
    threshold: 1,
    observed: 0,
    severity: 'fail',
    action: 'invoke_outreach_drafter',
    target: 'outreach-draft-generator',
    notes: `drafter kicked; ${enabledCount} enabled communities`,
    result: { status: r.status, latency_ms: r.ms, body: r.bodyExcerpt },
  })
}

async function checkOutreachSubmissions(): Promise<void> {
  // ≥1 submitted post per 24h IF there are auto_submit_enabled communities
  // with approved drafts. Otherwise the cron is correctly idle.
  const since = new Date(Date.now() - 24 * 3600_000).toISOString()

  let submittedCount = 0
  let approvedAutoCount = 0

  try {
    const { count: sc } = await supabase
      .from('outreach_post_drafts')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'submitted')
      .gte('submitted_at', since)
    submittedCount = sc ?? 0
  } catch {
    note({
      metric: 'outreach_submissions_24h',
      threshold: 1,
      observed: null,
      severity: 'ok',
      action: null,
      target: null,
      notes: 'outreach_post_drafts unavailable — skipping',
    })
    return
  }

  // Drafts that COULD be submitted — approved + community auto_submit_enabled.
  try {
    const { count: ac } = await supabase
      .from('outreach_post_drafts')
      .select('id, outreach_communities!inner(auto_submit_enabled)', { count: 'exact', head: true })
      .eq('status', 'approved')
      .eq('outreach_communities.auto_submit_enabled', true)
    approvedAutoCount = ac ?? 0
  } catch { /* */ }

  if (submittedCount >= 1) {
    note({
      metric: 'outreach_submissions_24h',
      threshold: 1,
      observed: submittedCount,
      severity: 'ok',
      action: null,
      target: null,
      notes: `${submittedCount} submissions in last 24h`,
    })
    return
  }

  if (approvedAutoCount === 0) {
    // Nothing to submit. That's not a failure — the user hasn't approved any
    // drafts AND/OR no community has auto_submit_enabled. Both are valid
    // states (user is in review-only mode).
    note({
      metric: 'outreach_submissions_24h',
      threshold: 1,
      observed: 0,
      severity: 'ok',
      action: null,
      target: null,
      notes: 'no approved+auto-eligible drafts to submit (review-only mode is fine)',
    })
    return
  }

  // There ARE submittable drafts but submit hasn't fired. Kick it.
  const recently = await recentlyTook('outreach_submissions_24h', 'invoke_outreach_submit')
  if (recently) {
    note({
      metric: 'outreach_submissions_24h',
      threshold: 1,
      observed: 0,
      severity: 'warn',
      action: 'observe_only',
      target: null,
      notes: 'submit already invoked recently',
    })
    return
  }
  if (DRY) {
    note({
      metric: 'outreach_submissions_24h',
      threshold: 1,
      observed: 0,
      severity: 'fail',
      action: 'invoke_outreach_submit',
      target: 'outreach-submit',
      notes: `[dry] would invoke submit; ${approvedAutoCount} approved+auto-eligible drafts waiting`,
    })
    return
  }
  const r = await invokeEdgeFunction('outreach-submit', { reason: 'supervisor_no_submissions' })
  note({
    metric: 'outreach_submissions_24h',
    threshold: 1,
    observed: 0,
    severity: 'fail',
    action: 'invoke_outreach_submit',
    target: 'outreach-submit',
    notes: `submit kicked; ${approvedAutoCount} approved+auto-eligible drafts waiting`,
    result: { status: r.status, latency_ms: r.ms, body: r.bodyExcerpt },
  })
}

async function checkCrashLoop(): Promise<void> {
  // 3+ failed_ci_gate / failed_apply runs on the same wish in last 60 min =
  // crash loop. Mark the wish as auto_ship_eligible=false so the builder
  // stops retrying it, AND enqueue a self-heal wish so Mommy can fix the
  // underlying issue.
  const since = new Date(Date.now() - 60 * 60_000).toISOString()
  let rows: Array<{ wish_id: string; status: string; failure_reason: string | null }> = []

  try {
    const { data } = await supabase
      .from('mommy_builder_run')
      .select('wish_id, status, failure_reason')
      .in('status', ['failed_ci_gate', 'failed_apply', 'failed_drafted'])
      .gte('started_at', since)
    rows = (data ?? []) as typeof rows
  } catch (err) {
    note({
      metric: 'crash_loop',
      threshold: 3,
      observed: null,
      severity: 'warn',
      action: null,
      target: null,
      notes: 'mommy_builder_run read failed: ' + String(err).slice(0, 120),
    })
    return
  }

  // Bucket failures by wish_id.
  const byWish = new Map<string, number>()
  const reasonByWish = new Map<string, string>()
  for (const r of rows) {
    if (!r.wish_id) continue
    byWish.set(r.wish_id, (byWish.get(r.wish_id) ?? 0) + 1)
    if (r.failure_reason) reasonByWish.set(r.wish_id, r.failure_reason)
  }

  const offenders = Array.from(byWish.entries()).filter(([, n]) => n >= 3)

  if (offenders.length === 0) {
    note({
      metric: 'crash_loop',
      threshold: 3,
      observed: rows.length,
      severity: 'ok',
      action: null,
      target: null,
      notes: `${rows.length} failures in last hour, no wish crash-looping`,
    })
    return
  }

  for (const [wishId, n] of offenders) {
    const failureReason = reasonByWish.get(wishId) ?? 'unknown'
    if (DRY) {
      note({
        metric: 'crash_loop',
        threshold: 3,
        observed: n,
        severity: 'fail',
        action: 'mark_wish_review_required',
        target: wishId,
        notes: `[dry] would mark wish ${wishId.slice(0, 8)} review-required (${n} failures: ${failureReason.slice(0, 60)})`,
      })
      continue
    }

    // Mark the wish review-required.
    const { data: prev } = await supabase
      .from('mommy_code_wishes')
      .select('auto_ship_blockers, wish_title')
      .eq('id', wishId)
      .maybeSingle()
    const priorBlockers = Array.isArray(prev?.auto_ship_blockers) ? prev.auto_ship_blockers : []
    const newBlockers = Array.from(new Set([...priorBlockers, 'crash_loop_supervisor']))

    await supabase.from('mommy_code_wishes').update({
      status: 'queued',
      auto_ship_eligible: false,
      auto_ship_blockers: newBlockers,
    }).eq('id', wishId)

    note({
      metric: 'crash_loop',
      threshold: 3,
      observed: n,
      severity: 'fail',
      action: 'mark_wish_review_required',
      target: wishId,
      notes: `wish "${(prev?.wish_title ?? wishId.slice(0, 8)).slice(0, 60)}" had ${n} failures; flagged review-required`,
      result: { wish_id: wishId, prior_blockers: priorBlockers, new_blockers: newBlockers, last_failure: failureReason.slice(0, 200) },
    })

    // Enqueue self-heal wish (max 1 per 24h).
    const healed = await selfHealRecentlyEnqueued('crash_loop')
    if (!healed) {
      const { data: newWish } = await supabase
        .from('mommy_code_wishes')
        .insert({
          wish_title: `[META] mommy-builder crash-loop on wish ${wishId.slice(0, 8)}`,
          wish_body: `mommy-supervisor detected ${n} consecutive failed_ci_gate/failed_apply runs on wish ${wishId} in the last 60 minutes.\n\nFailure reason (most recent): ${failureReason.slice(0, 600)}\n\nThe drafter's draft is fundamentally not passing the local CI gate. Investigate:\n- Is the drafter generating malformed migrations (numbering collision, missing transactions)?\n- Is the drafter touching forbidden paths the gate catches?\n- Is the drafter's schema knowledge stale (column doesn't exist)?\n\nFix the drafter prompt or classifier so this wish can re-enter the queue safely. If the wish itself is bad, mark it rejected and supersede.`,
          protocol_goal: 'Keep the autonomous build loop unblocked — every crash-loop wastes drafter tokens AND blocks the queue.',
          source: 'event_trigger',
          priority: 'high',
          status: 'queued',
          affected_surfaces: { meta_self_heal: true, target_wish_id: wishId, supervisor_metric: 'crash_loop' },
          // Leave classifier to decide tier; default to medium so it doesn't
          // auto-ship a META wish that itself needs human review.
          complexity_tier: 'medium',
          auto_ship_eligible: false,
          auto_ship_blockers: ['meta_self_heal_needs_review'],
          classified_at: new Date().toISOString(),
          classified_by: 'mommy_panel',
        })
        .select('id')
        .single()
      if (newWish?.id) {
        note({
          metric: 'crash_loop',
          threshold: 3,
          observed: n,
          severity: 'fail',
          action: 'enqueue_self_heal_wish',
          target: newWish.id,
          notes: `self-heal wish enqueued for crash-loop on wish ${wishId.slice(0, 8)}`,
          result: { wish_id: newWish.id, target_wish_id: wishId },
        })
      }
    }
  }
}

async function checkCiFailures(): Promise<void> {
  // ci_local_failures opened in last 24h that haven't been resolved.
  // If ≥5 unresolved, enqueue a self-heal wish for Mommy to mine the
  // pattern and propose an auto-fix recipe for deploy-fixer.
  const since = new Date(Date.now() - 24 * 3600_000).toISOString()
  let openCount = 0
  try {
    // ci_local_failures has a `resolved_at` column per migration 364.
    const { count } = await supabase
      .from('ci_local_failures')
      .select('id', { count: 'exact', head: true })
      .is('resolved_at', null)
      .gte('first_seen_at', since)
    openCount = count ?? 0
  } catch {
    note({
      metric: 'ci_failures_open_24h',
      threshold: 5,
      observed: null,
      severity: 'ok',
      action: null,
      target: null,
      notes: 'ci_local_failures unavailable — skipping',
    })
    return
  }

  if (openCount < 5) {
    note({
      metric: 'ci_failures_open_24h',
      threshold: 5,
      observed: openCount,
      severity: openCount === 0 ? 'ok' : 'warn',
      action: null,
      target: null,
      notes: `${openCount} unresolved CI failures in last 24h`,
    })
    return
  }

  const healed = await selfHealRecentlyEnqueued('ci_failures_open_24h')
  if (healed) {
    note({
      metric: 'ci_failures_open_24h',
      threshold: 5,
      observed: openCount,
      severity: 'warn',
      action: 'observe_only',
      target: null,
      notes: 'self-heal wish already enqueued in last 24h',
    })
    return
  }

  if (DRY) {
    note({
      metric: 'ci_failures_open_24h',
      threshold: 5,
      observed: openCount,
      severity: 'fail',
      action: 'enqueue_self_heal_wish',
      target: null,
      notes: `[dry] would enqueue CI-pattern self-heal wish (${openCount} unresolved)`,
    })
    return
  }

  const { data: newWish } = await supabase
    .from('mommy_code_wishes')
    .insert({
      wish_title: `[META] mine ${openCount} unresolved CI failures into auto-fix recipes`,
      wish_body: `mommy-supervisor saw ${openCount} unresolved ci_local_failures rows in the last 24h. The deploy-fixer pipeline is supposed to mine recurring patterns into auto-fix recipes — that's not happening fast enough.\n\nInvestigate:\n- Cluster the open failures by signature; what's the most common class?\n- For top class(es), is there a deterministic fix script that could ship as a recipe?\n- If the failure is config drift (baselines stale, snapshots out of date), can the recipe be a single 'refresh-baselines' action?\n\nDeliverable: at least one new auto-fix recipe wired into deploy-fixer.`,
      protocol_goal: 'Keep the gate green — recurring CI failures should self-heal, not queue up.',
      source: 'event_trigger',
      priority: 'normal',
      status: 'queued',
      affected_surfaces: { meta_self_heal: true, supervisor_metric: 'ci_failures_open_24h', open_count: openCount },
      complexity_tier: 'medium',
      auto_ship_eligible: false,
      auto_ship_blockers: ['meta_self_heal_needs_review'],
      classified_at: new Date().toISOString(),
      classified_by: 'mommy_panel',
    })
    .select('id')
    .single()

  note({
    metric: 'ci_failures_open_24h',
    threshold: 5,
    observed: openCount,
    severity: 'fail',
    action: 'enqueue_self_heal_wish',
    target: newWish?.id ?? null,
    notes: `${openCount} unresolved CI failures; self-heal wish enqueued`,
    result: { wish_id: newWish?.id ?? null, open_count: openCount },
  })
}

// ── Persist + report ─────────────────────────────────────────────────────────

async function persistDecisions(): Promise<void> {
  if (DRY) {
    log('dry mode — not writing to mommy_supervisor_log')
    return
  }
  if (decisions.length === 0) return

  const rows = decisions.map(d => ({
    metric: d.metric,
    threshold_value: d.threshold,
    observed_value: d.observed,
    severity: d.severity,
    action_taken: d.action,
    action_target: d.target,
    action_result: d.result ?? null,
    notes: d.notes.slice(0, 300),
  }))

  const { error } = await supabase.from('mommy_supervisor_log').insert(rows)
  if (error) {
    console.error(`[supervisor] insert failed: ${error.message}`)
  }
}

function summarize(): { total: number; ok: number; warn: number; fail: number; actions_fired: number } {
  const total = decisions.length
  const ok = decisions.filter(d => d.severity === 'ok').length
  const warn = decisions.filter(d => d.severity === 'warn').length
  const fail = decisions.filter(d => d.severity === 'fail').length
  const actions_fired = decisions.filter(d => d.action && d.action !== 'observe_only').length
  return { total, ok, warn, fail, actions_fired }
}

(async () => {
  log(`mode=${DRY ? 'DRY' : 'LIVE'}`)

  // Run checkers in parallel — they don't interact and parallel makes the
  // total run-time the cost of the slowest checker, not the sum.
  await Promise.all([
    checkBuilderHeartbeat().catch(err => log(`builder_heartbeat err: ${String(err).slice(0, 200)}`)),
    checkQueueDepth().catch(err => log(`queue_depth err: ${String(err).slice(0, 200)}`)),
    checkOutreachDrafts().catch(err => log(`outreach_drafts err: ${String(err).slice(0, 200)}`)),
    checkOutreachSubmissions().catch(err => log(`outreach_submissions err: ${String(err).slice(0, 200)}`)),
    checkCrashLoop().catch(err => log(`crash_loop err: ${String(err).slice(0, 200)}`)),
    checkCiFailures().catch(err => log(`ci_failures err: ${String(err).slice(0, 200)}`)),
  ])

  await persistDecisions()

  const sum = summarize()
  if (JSON_OUT) {
    process.stdout.write(JSON.stringify({ summary: sum, decisions }, null, 2) + '\n')
  } else {
    log(`done — ${sum.ok} ok / ${sum.warn} warn / ${sum.fail} fail / ${sum.actions_fired} actions fired`)
    for (const d of decisions) {
      const tag = d.severity === 'ok' ? '✓' : d.severity === 'warn' ? '⚠' : '✗'
      const action = d.action ? ` [${d.action}${d.target ? ` → ${d.target.slice(0, 30)}` : ''}]` : ''
      log(`  ${tag} ${d.metric.padEnd(28)} obs=${d.observed ?? '—'} thr=${d.threshold ?? '—'}${action} ${d.notes}`)
    }
  }

  // Exit 0 even on 'fail' decisions — the supervisor's job is to log + act,
  // not to fail the cron run. A non-zero exit would just make GH Actions
  // light up red on every legitimate intervention.
  process.exit(0)
})().catch(err => {
  console.error('[supervisor] fatal:', err)
  process.exit(1)
})
