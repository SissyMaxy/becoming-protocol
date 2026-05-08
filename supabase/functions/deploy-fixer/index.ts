// deploy-fixer — autonomous code-level fixer for failed deploys.
//
// User directive (2026-04-30): "do whatever is required to fix the issues
// automatically going forward." This is the meta-fix on top of:
//   - deploy-health-monitor : detects failures (writes deploy_health_log)
//   - auto-healer           : fixes DB-state invariants, escalates stuck CI
//   - mommy-builder         : ships feature wishes (NOT deploy fixes)
//
// This function reads open deploy_health_log rows, pulls the build/deploy
// log from Vercel or GitHub, runs the deterministic pattern library
// (./patterns.ts), and either:
//   - auto-patches & pushes a fix branch (small fixes only, build verified)
//   - opens a draft PR (bigger fixes, or build not yet verified)
//   - escalates to autonomous_escalation_log (no pattern matched, or
//     forbidden path, or loop guard tripped)
//
// Hard rules baked in (do not loosen without operator review):
//   - Forbidden paths from forbidden-paths.ts are NEVER auto-patched
//   - Schema migrations are NEVER auto-patched
//   - >10 lines / >3 files → always draft PR, never auto-merge
//   - Same (health_log_id, pattern) twice → loop guard, escalate
//   - Same health_log_id failed 3+ times → loop guard, escalate
//   - Tokens never echoed in logs (use <redacted>)
//
// Triggers:
//   - pg_cron every 10min (backstop)
//   - AFTER INSERT trigger on deploy_health_log (fast path; migration 314)
//   - Manual POST { health_log_id?: string } for one-off

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import {
  matchAll,
  applyPatchFor,
  type PatternMatch,
} from './patterns.ts'
import { pathIsAllowed, refuseReason } from './forbidden-paths.ts'
import {
  listFailedDeployments,
  getDeploymentEvents,
  eventsToBuildLog,
  type VercelDeployment,
} from './vercel-api.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const HANDLER_USER_ID = '8c69b9c8-34eb-4147-9fec-3c1a5bc74b6f'
const GITHUB_REPO = 'SissyMaxy/becoming-protocol'

const MAX_ATTEMPTS_PER_HEALTH_ROW = 3       // loop guard
const SMALL_PATCH_MAX_LINES = 10            // auto-merge threshold (lines)
const SMALL_PATCH_MAX_FILES = 3             // auto-merge threshold (files)

// ============================================================
// Types
// ============================================================

interface DeployHealthRow {
  id: string
  user_id: string
  source: string
  severity: string
  status: string
  ref_id: string | null
  ref_url: string | null
  title: string
  detail: string | null
  raw: Record<string, unknown> | null
  detected_at: string
}

interface FixerOutcome {
  health_log_id: string
  pattern_matched: string | null
  outcome:
    | 'auto_merged'
    | 'pr_opened'
    | 'no_match'
    | 'failed'
    | 'forbidden_path'
    | 'rollback_pr_opened'
    | 'loop_guard_stopped'
  branch?: string
  pr_number?: number
  files_touched?: string[]
  fix_diff_summary?: string
  build_verified_green?: boolean
  failure_reason?: string
}

// ============================================================
// Build-log fetchers
// ============================================================

async function fetchBuildLogForRow(
  row: DeployHealthRow,
  vercelToken: string,
  githubToken: string,
): Promise<string> {
  if (row.source === 'vercel') {
    if (!row.ref_id) return row.detail ?? row.title
    const events = await getDeploymentEvents(vercelToken, row.ref_id)
    const log = eventsToBuildLog(events)
    return log || (row.detail ?? row.title)
  }
  if (row.source === 'github_actions') {
    if (!row.ref_id || !githubToken) return row.detail ?? row.title
    // Fetch the run's logs zip via GH API. The full log endpoint redirects
    // to a pre-signed S3 URL. We follow the redirect and read text. The zip
    // unwrap is too heavy for an edge function; we settle for the raw text
    // body which is enough for pattern matching on tsc errors.
    try {
      const r = await fetch(
        `https://api.github.com/repos/${GITHUB_REPO}/actions/runs/${row.ref_id}/logs`,
        {
          headers: {
            'Authorization': `Bearer ${githubToken}`,
            'Accept': 'application/vnd.github+json',
            'X-GitHub-Api-Version': '2022-11-28',
          },
          redirect: 'follow',
        },
      )
      if (r.ok) {
        // Logs come back as a zip — best-effort: decode as utf-8 and let the
        // pattern regexes do partial matching on the embedded text. If it
        // fails, fall back to the title/detail.
        const text = await r.text()
        if (text && text.length > 100) return text
      }
    } catch (_err) { /* fall through */ }
    return row.detail ?? row.title
  }
  // supabase_edge / preflight: just hand the title+detail to the matcher.
  return [row.title, row.detail ?? ''].join('\n')
}

// ============================================================
// Loop guard
// ============================================================

async function priorAttemptCount(
  supabase: ReturnType<typeof createClient>,
  healthLogId: string,
): Promise<{ total: number; samePattern: Map<string, number> }> {
  const { data } = await supabase
    .from('deploy_fixer_attempts')
    .select('pattern_matched')
    .eq('health_log_id', healthLogId)
  const rows = (data ?? []) as Array<{ pattern_matched: string | null }>
  const samePattern = new Map<string, number>()
  for (const r of rows) {
    if (r.pattern_matched) {
      samePattern.set(r.pattern_matched, (samePattern.get(r.pattern_matched) ?? 0) + 1)
    }
  }
  return { total: rows.length, samePattern }
}

// ============================================================
// Outcome recording
// ============================================================

async function recordAttempt(
  supabase: ReturnType<typeof createClient>,
  outcome: FixerOutcome,
  attemptNumber: number,
): Promise<void> {
  await supabase.from('deploy_fixer_attempts').insert({
    user_id: HANDLER_USER_ID,
    health_log_id: outcome.health_log_id,
    pattern_matched: outcome.pattern_matched,
    pushed_branch: outcome.branch ?? null,
    pr_number: outcome.pr_number ?? null,
    merged_to_main: outcome.outcome === 'auto_merged',
    outcome: outcome.outcome,
    fix_diff_summary: outcome.fix_diff_summary ?? null,
    files_touched: outcome.files_touched ?? null,
    failure_reason: outcome.failure_reason ?? null,
    build_verified_green: outcome.build_verified_green ?? null,
    attempt_number: attemptNumber,
  })
}

async function escalate(
  supabase: ReturnType<typeof createClient>,
  rationale: string,
  context: Record<string, unknown>,
  severity: 'high' | 'critical' = 'high',
): Promise<void> {
  await supabase.from('autonomous_escalation_log').insert({
    user_id: HANDLER_USER_ID,
    engine: 'deploy_fixer',
    action: 'escalated',
    after_state: { ...context, severity },
    rationale: rationale.slice(0, 1000),
    decided_by: 'deploy_fixer',
  })
}

// ============================================================
// Per-row processing (no push yet — that's the next commit)
// ============================================================

async function processHealthRow(
  supabase: ReturnType<typeof createClient>,
  row: DeployHealthRow,
  vercelToken: string,
  githubToken: string,
): Promise<FixerOutcome> {
  // Loop guard: stop if too many prior attempts.
  const { total, samePattern } = await priorAttemptCount(supabase, row.id)
  if (total >= MAX_ATTEMPTS_PER_HEALTH_ROW) {
    await escalate(supabase, `Loop guard: ${total} prior attempts on health_log ${row.id}; deploy-fixer giving up`, {
      health_log_id: row.id, total_attempts: total, source: row.source,
    }, 'critical')
    return { health_log_id: row.id, pattern_matched: null, outcome: 'loop_guard_stopped', failure_reason: `${total} attempts exhausted` }
  }

  const buildLog = await fetchBuildLogForRow(row, vercelToken, githubToken)
  const matches = matchAll(buildLog)
  if (matches.length === 0) {
    await escalate(supabase, `No pattern matched ${row.source} failure ${row.ref_id}: ${row.title.slice(0, 120)}`, {
      health_log_id: row.id, source: row.source, ref_id: row.ref_id,
    })
    return { health_log_id: row.id, pattern_matched: null, outcome: 'no_match' }
  }

  // Take the first match. Patterns are ordered most-specific-first so the
  // first match is intentional.
  const match = matches[0]

  // Same-pattern loop guard: don't try the same pattern twice on the same
  // row — if it didn't fix it the first time, it won't the second.
  if ((samePattern.get(match.patternId) ?? 0) >= 1) {
    await escalate(supabase, `Same pattern ${match.patternId} already attempted on health_log ${row.id} — escalating`, {
      health_log_id: row.id, pattern: match.patternId,
    }, 'critical')
    return { health_log_id: row.id, pattern_matched: match.patternId, outcome: 'loop_guard_stopped', failure_reason: 'same pattern repeat' }
  }

  // Pattern matched but can't auto-patch (function count, missing env,
  // failed migration). Record the match and escalate with the detail.
  if (!match.canAutoPatch) {
    await escalate(supabase, match.escalationDetail ?? `Pattern ${match.patternId} cannot auto-patch`, {
      health_log_id: row.id, pattern: match.patternId, env_var: match.envVarName,
    })
    return {
      health_log_id: row.id,
      pattern_matched: match.patternId,
      outcome: 'no_match',  // record as no_match so the dashboard counts it as "needs operator"
      failure_reason: match.escalationDetail,
    }
  }

  // Auto-patchable. Forbidden-path check on the file we'd touch.
  if (match.filePath && !pathIsAllowed(match.filePath)) {
    const reason = refuseReason(match.filePath) ?? 'forbidden_path'
    await escalate(supabase, `Refused: pattern ${match.patternId} would touch forbidden path ${match.filePath} (${reason})`, {
      health_log_id: row.id, pattern: match.patternId, file: match.filePath,
    }, 'critical')
    return {
      health_log_id: row.id,
      pattern_matched: match.patternId,
      outcome: 'forbidden_path',
      failure_reason: reason,
    }
  }

  // Skeleton stops here. The push/merge logic in the next commit fetches
  // the file from GitHub, applies the patch, opens a branch, etc.
  // For now, we record a placeholder failed attempt so the loop guard
  // semantics are observable end-to-end during early deploys.
  return await stubPushAndMerge(supabase, row, match)
}

// Stub that simulates the future push/merge step. Replaced in the next
// commit by real github-api calls. Kept here so the orchestrator can be
// shipped and observed in isolation while push logic is reviewed.
async function stubPushAndMerge(
  _supabase: ReturnType<typeof createClient>,
  row: DeployHealthRow,
  match: PatternMatch,
): Promise<FixerOutcome> {
  return {
    health_log_id: row.id,
    pattern_matched: match.patternId,
    outcome: 'failed',
    failure_reason: 'push/merge not yet wired (skeleton commit) — fix lands in deploy-fixer push commit',
    files_touched: match.filePath ? [match.filePath] : [],
  }
}

// ============================================================
// Entry point
// ============================================================

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ ok: false, error: 'POST only' }), {
      status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  )
  const vercelToken = Deno.env.get('VERCEL_TOKEN') ?? ''
  const githubToken = Deno.env.get('GITHUB_TOKEN') ?? ''

  let body: { health_log_id?: string; reason?: string } = {}
  try { body = await req.json() } catch { /* allow empty */ }

  // Two modes:
  //   (a) Single-row: triggered by the AFTER INSERT trigger on
  //       deploy_health_log → process exactly that row.
  //   (b) Sweep: triggered by cron — process all open vercel/github_actions
  //       rows up to a small cap so a single tick isn't unbounded.
  let rows: DeployHealthRow[] = []
  if (body.health_log_id) {
    const { data } = await supabase
      .from('deploy_health_log')
      .select('id, user_id, source, severity, status, ref_id, ref_url, title, detail, raw, detected_at')
      .eq('id', body.health_log_id)
      .maybeSingle()
    if (data) rows = [data as DeployHealthRow]
  } else {
    const { data } = await supabase
      .from('deploy_health_log')
      .select('id, user_id, source, severity, status, ref_id, ref_url, title, detail, raw, detected_at')
      .eq('status', 'open')
      .in('source', ['vercel', 'github_actions'])
      .order('detected_at', { ascending: false })
      .limit(10)
    rows = (data ?? []) as DeployHealthRow[]
  }

  // Cross-deploy rollback trigger: count consecutive ERROR rows on
  // production. Stub for now — implemented in the rollback commit.
  await maybeOpenRollbackPr(supabase, rows, vercelToken, githubToken)

  const outcomes: FixerOutcome[] = []
  for (const row of rows) {
    try {
      const { total } = await priorAttemptCount(supabase, row.id)
      const outcome = await processHealthRow(supabase, row, vercelToken, githubToken)
      outcomes.push(outcome)
      await recordAttempt(supabase, outcome, total + 1)
    } catch (err) {
      const failureReason = err instanceof Error ? err.message.slice(0, 500) : String(err).slice(0, 500)
      const failed: FixerOutcome = {
        health_log_id: row.id,
        pattern_matched: null,
        outcome: 'failed',
        failure_reason: failureReason,
      }
      outcomes.push(failed)
      const { total } = await priorAttemptCount(supabase, row.id)
      await recordAttempt(supabase, failed, total + 1)
      await escalate(supabase, `deploy-fixer crashed on health_log ${row.id}: ${failureReason}`, {
        health_log_id: row.id, source: row.source,
      })
    }
  }

  return new Response(JSON.stringify({
    ok: true,
    rows_examined: rows.length,
    outcomes: outcomes.map(o => ({ health_log_id: o.health_log_id, pattern: o.pattern_matched, outcome: o.outcome })),
  }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
})

// Stubbed in the skeleton commit; implemented in the rollback commit.
async function maybeOpenRollbackPr(
  _supabase: ReturnType<typeof createClient>,
  _rows: DeployHealthRow[],
  _vercelToken: string,
  _githubToken: string,
): Promise<void> {
  // Implemented in commit 5 (rollback automation).
  return
}

// Re-exports so the (Vercel-shaped) deployment type and the
// per-row outcome are visible at the package boundary if a future
// caller wants to import them. Kept here to suppress unused-import
// warnings under Deno's strict type-check.
export type { VercelDeployment, FixerOutcome }
