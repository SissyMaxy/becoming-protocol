// deploy-health-monitor — autonomous deploy/health watcher.
//
// User asked: "does the system read the github deploy logs after a deployment?"
// Previous answer: no. This is the engine that changes that.
//
// Polls every 10 minutes (in this order):
//   0. SELF — checks cron.job_run_details for own jobname; if its previous
//      cron-fired invocation 401'd or errored, writes a high-severity 'self'
//      row immediately so the chicken-and-egg can't recur silently.
//   1. GitHub Actions runs on main (last 24h, conclusion=failure)
//   2. Vercel deployments (last 24h, state ERROR)
//   3. Supabase edge function logs — 5xx + 4xx auth on cron functions +
//      timeouts (504/546) + slow_response (>100s execution time)
//   4. pg_cron failures via cron.job_run_details (last 10 min)
//   5. Postgres health — connection saturation, WAL archive failures
//
// Each failure is hashed (source|ref_id|title) and inserted into
// deploy_health_log only if the same hash isn't already 'open' for the user.
// Resolved failures (run re-passes, deployment redeploys clean) auto-close
// when their successor passes.
//
// POST { user_id?: string } — manual run; cron also fires it.

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const HANDLER_USER_ID = '8c69b9c8-34eb-4147-9fec-3c1a5bc74b6f'
const GITHUB_REPO = 'SissyMaxy/becoming-protocol'
const VERCEL_PROJECT_ID = 'prj_jBaGxGUarXrQg2FvQQmkTGjp3Fki'
const VERCEL_TEAM_ID = 'team_i1DWiJaoA1itV44yE4ST9Wa3'
const SUPABASE_PROJECT_REF = 'atevwvexapiykchvqvhm'
const SELF_JOBNAME = 'deploy-health-monitor-10min'

// Edge function names that run on a cron — a 401/403 from any of these
// means the cron auth chain is broken, not user error. Keep in sync with
// migrations 044/046/etc that register these via cron.schedule.
const CRON_INVOKED_FUNCTIONS = new Set<string>([
  'auto-healer',
  'deploy-health-monitor',
  'handler-task-processor',
  'handler-autonomous',
  'handler-platform',
  'handler-enforcement',
  'wish-classifier',
  'mommy-builder',
  'mommy-deployer',
  'capability-digest',
  'self-improvement',
])

const FUNCTION_TIMEOUT_CAP_MS = 150_000
const FUNCTION_SLOW_THRESHOLD_MS = 100_000
const POSTGRES_CONNECTION_PCT_ALERT = 80

interface Failure {
  source: 'github_actions' | 'vercel' | 'supabase_edge' | 'pg_cron' | 'postgres' | 'self'
  severity: 'critical' | 'high' | 'medium' | 'low'
  ref_id: string
  ref_url: string
  title: string
  detail?: string
  detected_at: string
  raw?: Record<string, unknown>
  function_execution_time_ms?: number
  health_threshold_breached?: Record<string, unknown>
  // Sub-classifier rolled into the dedup hash so different failure modes
  // on the same ref_id (e.g. same edge function timing out vs. 401'ing)
  // don't collapse into one row.
  error_signature?: string
}

function djb2Hash(s: string): string {
  let h = 5381
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0
  return Math.abs(h).toString(36)
}

async function pollGitHubActions(): Promise<Failure[]> {
  const token = Deno.env.get('GITHUB_TOKEN') ?? ''
  if (!token) return []
  const since = new Date(Date.now() - 24 * 3600_000).toISOString()
  try {
    const r = await fetch(
      `https://api.github.com/repos/${GITHUB_REPO}/actions/runs?branch=main&status=failure&per_page=20&created=>${since}`,
      { headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/vnd.github+json' } },
    )
    if (!r.ok) {
      console.warn(`[deploy-health] github ${r.status}: ${(await r.text()).slice(0, 200)}`)
      return []
    }
    const data = await r.json() as { workflow_runs?: Array<Record<string, unknown>> }
    const runs = data.workflow_runs ?? []
    return runs.slice(0, 20).map(run => ({
      source: 'github_actions' as const,
      severity: (run.name as string) === 'preflight' ? 'high' as const : 'medium' as const,
      ref_id: String(run.id),
      ref_url: String(run.html_url),
      title: `${run.name} failed (${(run.head_sha as string || '').slice(0, 7)})`,
      detail: `${run.name} on ${run.head_branch}: ${run.conclusion}. Triggered by ${run.event}.`,
      detected_at: new Date().toISOString(),
      raw: { run_id: run.id, sha: run.head_sha, name: run.name, conclusion: run.conclusion, created_at: run.created_at },
    }))
  } catch (err) {
    console.warn('[deploy-health] github fetch failed:', err instanceof Error ? err.message : err)
    return []
  }
}

async function pollVercel(): Promise<Failure[]> {
  const token = Deno.env.get('VERCEL_TOKEN') ?? ''
  if (!token) return []
  const since = Date.now() - 24 * 3600_000
  try {
    const r = await fetch(
      `https://api.vercel.com/v6/deployments?projectId=${VERCEL_PROJECT_ID}&teamId=${VERCEL_TEAM_ID}&since=${since}&limit=30&state=ERROR`,
      { headers: { 'Authorization': `Bearer ${token}` } },
    )
    if (!r.ok) {
      console.warn(`[deploy-health] vercel ${r.status}: ${(await r.text()).slice(0, 200)}`)
      return []
    }
    const data = await r.json() as { deployments?: Array<Record<string, unknown>> }
    const deployments = data.deployments ?? []
    return deployments.slice(0, 20).map(d => ({
      source: 'vercel' as const,
      severity: 'critical' as const,
      ref_id: String(d.uid || d.id),
      ref_url: `https://vercel.com/${(d.creator as { username?: string } | undefined)?.username ?? 'team'}/${d.name}/${d.uid || d.id}`,
      title: `Vercel deploy failed: ${(d.meta as { githubCommitMessage?: string } | undefined)?.githubCommitMessage?.split('\n')[0] ?? d.uid}`,
      detail: `Deployment ${d.uid || d.id} entered state ${d.state}. URL: ${d.url}`,
      detected_at: new Date().toISOString(),
      raw: { id: d.uid || d.id, state: d.state, sha: (d.meta as { githubCommitSha?: string } | undefined)?.githubCommitSha, ts: d.created },
    }))
  } catch (err) {
    console.warn('[deploy-health] vercel fetch failed:', err instanceof Error ? err.message : err)
    return []
  }
}

interface EdgeLogRow {
  event_message?: string
  function_id?: string
  status_code?: number
  execution_time_ms?: number
  timestamp?: string
}

// Pulls the last 1h of edge function logs and classifies each non-2xx /
// slow row into a structured Failure. Three sub-signatures:
//  - http_5xx (>=500) — already covered before this rebuild
//  - auth_failure — 401/403 on cron-invoked function names
//  - timeout — 504 / 546
//  - slow_response — execution_time_ms > FUNCTION_SLOW_THRESHOLD_MS
async function pollEdgeFunction4xxAndTimeouts(): Promise<Failure[]> {
  const pat = Deno.env.get('SUPABASE_PAT') ?? ''
  if (!pat) return []
  const sql = `
    select event_message, function_id, status_code, execution_time_ms, timestamp
    from edge_logs.function_edge_logs
    where timestamp > timestamp_sub(current_timestamp(), interval 1 hour)
      and (
        status_code >= 500
        or status_code in (401, 403)
        or execution_time_ms > ${FUNCTION_SLOW_THRESHOLD_MS}
      )
    order by timestamp desc
    limit 60
  `
  try {
    const r = await fetch(
      `https://api.supabase.com/v1/projects/${SUPABASE_PROJECT_REF}/analytics/endpoints/logs.all?sql=${encodeURIComponent(sql)}`,
      { headers: { 'Authorization': `Bearer ${pat}` } },
    )
    if (!r.ok) {
      console.warn(`[deploy-health] supabase pat ${r.status}`)
      return []
    }
    const data = await r.json() as { result?: EdgeLogRow[] }
    const rows = data.result ?? []
    const out: Failure[] = []
    for (const [i, row] of rows.entries()) {
      const status = Number(row.status_code ?? 0)
      const fnId = String(row.function_id ?? 'unknown')
      const execMs = row.execution_time_ms != null ? Number(row.execution_time_ms) : undefined

      let signature: 'http_5xx' | 'auth_failure' | 'timeout' | 'slow_response'
      let severity: Failure['severity']
      let title: string

      if (status === 504 || status === 546) {
        signature = 'timeout'
        severity = 'high'
        title = `Edge function ${fnId} timed out (${status})`
      } else if (status === 401 || status === 403) {
        // Only a real signal for cron-invoked functions — user-facing 401s
        // are normal (unauth'd browser hits). Skip non-cron functions to
        // keep noise out of the log.
        if (!CRON_INVOKED_FUNCTIONS.has(fnId)) continue
        signature = 'auth_failure'
        // Auth failures on cron functions are critical: they mean the cron
        // chain is silently broken (the failure pattern that caused today's
        // outage to go undetected).
        severity = 'critical'
        title = `Cron function ${fnId} auth failure (${status})`
      } else if (status >= 500) {
        signature = 'http_5xx'
        severity = 'high'
        title = `Edge function ${fnId} returned ${status}`
      } else if (execMs != null && execMs > FUNCTION_SLOW_THRESHOLD_MS) {
        signature = 'slow_response'
        severity = execMs > FUNCTION_TIMEOUT_CAP_MS - 10_000 ? 'high' : 'medium'
        title = `Edge function ${fnId} slow (${execMs}ms, cap ${FUNCTION_TIMEOUT_CAP_MS}ms)`
      } else {
        continue
      }

      out.push({
        source: 'supabase_edge',
        severity,
        ref_id: `${fnId}-${row.timestamp}-${i}`,
        ref_url: `https://supabase.com/dashboard/project/${SUPABASE_PROJECT_REF}/functions/${fnId}/logs`,
        title,
        detail: String(row.event_message || '').slice(0, 500),
        detected_at: new Date().toISOString(),
        raw: { ...row, signature },
        function_execution_time_ms: execMs,
        error_signature: signature,
      })
    }
    return out
  } catch (err) {
    console.warn('[deploy-health] supabase logs fetch failed:', err instanceof Error ? err.message : err)
    return []
  }
}

// Job-criticality mapping → severity. Auto-healer + the watcher itself are
// load-bearing for the whole observability layer; mommy-* keeps the
// autonomous side moving; everything else is best-effort.
function pgCronSeverity(jobname: string): Failure['severity'] {
  if (jobname.includes('auto-healer') || jobname.includes('deploy-health-monitor')) return 'high'
  if (jobname.startsWith('mommy-') || jobname.includes('mommy')) return 'medium'
  return 'low'
}

async function pollPgCronFailures(supabase: SupabaseClient): Promise<Failure[]> {
  const { data, error } = await supabase.rpc('health_pg_cron_failures', { p_window_minutes: 10 })
  if (error) {
    console.warn('[deploy-health] health_pg_cron_failures rpc failed:', error.message)
    return []
  }
  type Row = { jobid: number; jobname: string; runid: number; status: string; return_message: string; start_time: string; end_time: string }
  const rows = (data ?? []) as Row[]
  return rows.map(row => ({
    source: 'pg_cron' as const,
    severity: pgCronSeverity(row.jobname),
    ref_id: `${row.jobname}-${row.runid}`,
    ref_url: `https://supabase.com/dashboard/project/${SUPABASE_PROJECT_REF}/database/cron-jobs`,
    title: `pg_cron ${row.jobname} failed (run ${row.runid})`,
    detail: (row.return_message || 'no error message').slice(0, 1500),
    detected_at: new Date().toISOString(),
    raw: { jobname: row.jobname, runid: row.runid, status: row.status, start_time: row.start_time, end_time: row.end_time },
    error_signature: 'pg_cron_failure',
  }))
}

interface PostgresSnapshot {
  active_connections: number
  max_connections: number
  connection_pct: number
  wal_failed_count: number
  wal_last_failed_time: string | null
  wal_archived_count: number
  wal_last_archived_time: string | null
  longest_idle_seconds: number
}

async function pollPostgresHealth(supabase: SupabaseClient): Promise<Failure[]> {
  const { data, error } = await supabase.rpc('health_postgres_snapshot')
  if (error) {
    console.warn('[deploy-health] health_postgres_snapshot rpc failed:', error.message)
    return []
  }
  const rows = (data ?? []) as PostgresSnapshot[]
  if (rows.length === 0) return []
  const snap = rows[0]
  const out: Failure[] = []

  if (snap.connection_pct >= POSTGRES_CONNECTION_PCT_ALERT) {
    out.push({
      source: 'postgres',
      severity: snap.connection_pct >= 90 ? 'critical' : 'high',
      ref_id: `pg-connections-${new Date().toISOString().slice(0, 13)}`,
      ref_url: `https://supabase.com/dashboard/project/${SUPABASE_PROJECT_REF}/database/connections`,
      title: `Postgres connections ${snap.connection_pct}% (${snap.active_connections}/${snap.max_connections})`,
      detail: `Active: ${snap.active_connections}, max: ${snap.max_connections}. Longest idle: ${Math.round(snap.longest_idle_seconds)}s.`,
      detected_at: new Date().toISOString(),
      raw: { snap },
      health_threshold_breached: {
        metric: 'connection_pct',
        observed: snap.connection_pct,
        threshold: POSTGRES_CONNECTION_PCT_ALERT,
        active: snap.active_connections,
        max: snap.max_connections,
      },
      error_signature: 'connection_saturation',
    })
  }

  // WAL archive: signal a fresh failure only when the failed_count moved.
  // Hash includes failed_count so the same stuck count doesn't keep firing.
  if (snap.wal_failed_count > 0 && snap.wal_last_failed_time) {
    const lastFailed = new Date(snap.wal_last_failed_time).getTime()
    const lastArchived = snap.wal_last_archived_time ? new Date(snap.wal_last_archived_time).getTime() : 0
    // Only alert if the most recent event was a failure (not an archive
    // succeeding after the failure)
    if (lastFailed >= lastArchived) {
      out.push({
        source: 'postgres',
        severity: 'high',
        ref_id: `pg-wal-archive-${snap.wal_failed_count}`,
        ref_url: `https://supabase.com/dashboard/project/${SUPABASE_PROJECT_REF}/database/backups`,
        title: `WAL archive failure count ${snap.wal_failed_count}`,
        detail: `Last failed: ${snap.wal_last_failed_time}. Last archived: ${snap.wal_last_archived_time ?? 'never'}.`,
        detected_at: new Date().toISOString(),
        raw: { snap },
        health_threshold_breached: {
          metric: 'wal_failed_count',
          observed: snap.wal_failed_count,
          threshold: 0,
          last_failed: snap.wal_last_failed_time,
          last_archived: snap.wal_last_archived_time,
        },
        error_signature: 'wal_archive_failure',
      })
    }
  }

  return out
}

// pollResourceExhaustion — composite signal for the external watchdog.
//
// Aggregates four resource-pressure indicators into a single
// 'resource_exhaustion_detected' row that the supabase-watchdog GitHub
// workflow keys off. Cooldown: at most one such row every 30 min so the
// watchdog never sees a runaway. Consecutive-check requirement (>=2
// signals before restart) is enforced on the watchdog side.
//
// Triggers any of:
//   - >=5 distinct pg_cron jobs failed in this 10-min window
//   - connection_pct >= 90 sustained across this tick + >=2 prior postgres
//     rows in the last ~40 min
//   - >5 WAL archive failure rows in the last 1h
//   - PostgREST probe returns 503 (we still write — at 503 PostgREST
//     itself is degraded but supabase-js inserts often still succeed
//     because edge fns talk to PostgREST through a separate path)
async function pollResourceExhaustion(
  supabase: SupabaseClient,
  current: { pgCron: Failure[]; postgres: Failure[] },
): Promise<Failure[]> {
  // Cooldown — skip if we already wrote one in the last 30 min.
  const thirtyMinAgo = new Date(Date.now() - 30 * 60_000).toISOString()
  const { data: recent } = await supabase
    .from('deploy_health_log')
    .select('id')
    .eq('error_signature', 'resource_exhaustion_detected')
    .gte('detected_at', thirtyMinAgo)
    .limit(1)
    .maybeSingle()
  if (recent) return []

  // Trigger 1: distinct cron job failures this tick
  const cronJobs = new Set<string>()
  for (const r of current.pgCron) {
    const j = (r.raw as { jobname?: string } | null)?.jobname
    if (j) cronJobs.add(j)
  }
  const cronFailures = cronJobs.size

  // Trigger 2: connection pool >= 90 sustained
  const fortyMinAgo = new Date(Date.now() - 40 * 60_000).toISOString()
  const { data: connHistory } = await supabase
    .from('deploy_health_log')
    .select('id, health_threshold_breached')
    .eq('source', 'postgres')
    .gte('detected_at', fortyMinAgo)
    .limit(20)
  type HtbRow = { id: string; health_threshold_breached: { metric?: string; observed?: number } | null }
  const priorSaturated = ((connHistory ?? []) as HtbRow[]).filter(r =>
    r.health_threshold_breached?.metric === 'connection_pct' &&
    (r.health_threshold_breached.observed ?? 0) >= 90,
  ).length
  const currentSaturated = current.postgres.some(p =>
    p.health_threshold_breached?.metric === 'connection_pct' &&
    Number(p.health_threshold_breached.observed ?? 0) >= 90,
  )
  const consecutiveSaturation = priorSaturated + (currentSaturated ? 1 : 0)

  // Trigger 3: WAL archive failure rows in last hour
  const oneHourAgo = new Date(Date.now() - 60 * 60_000).toISOString()
  const { count: walFailures } = await supabase
    .from('deploy_health_log')
    .select('id', { count: 'exact', head: true })
    .eq('source', 'postgres')
    .eq('error_signature', 'wal_archive_failure')
    .gte('detected_at', oneHourAgo)

  // Trigger 4: PostgREST probe
  let postgrestStatus = 0
  try {
    const url = `${Deno.env.get('SUPABASE_URL') ?? ''}/rest/v1/`
    const apikey = Deno.env.get('SUPABASE_ANON_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    const probe = await fetch(url, { headers: { apikey }, method: 'GET' })
    postgrestStatus = probe.status
  } catch {
    postgrestStatus = -1
  }
  const postgrestDown = postgrestStatus === 503

  const triggers: string[] = []
  if (cronFailures >= 5) triggers.push(`cron_timeouts=${cronFailures}`)
  if (consecutiveSaturation >= 3) triggers.push(`pool_saturated_consecutive=${consecutiveSaturation}`)
  if ((walFailures ?? 0) > 5) triggers.push(`wal_failures_1h=${walFailures}`)
  if (postgrestDown) triggers.push(`postgrest_503`)

  if (triggers.length === 0) return []

  const metadata = {
    cron_timeouts: cronFailures,
    pool_pct_consecutive: consecutiveSaturation,
    wal_failures_1h: walFailures ?? 0,
    postgrest_status: postgrestStatus,
    triggers,
  }

  return [{
    source: 'self',
    severity: 'high',
    ref_id: `resource-exhaustion-${new Date().toISOString().slice(0, 16)}`,
    ref_url: `https://supabase.com/dashboard/project/${SUPABASE_PROJECT_REF}/database/connections`,
    title: `Resource exhaustion detected: ${triggers.join(', ')}`,
    detail: `Triggers: ${triggers.join('; ')}. The external watchdog will consider a restart if it sees 2+ of these signals.`,
    detected_at: new Date().toISOString(),
    raw: { signature: 'resource_exhaustion_detected', metadata },
    error_signature: 'resource_exhaustion_detected',
    health_threshold_breached: metadata,
  }]
}

// pollSelfHealth — runs FIRST so the watcher checks its own last invocation
// before doing anything else. If the most recent cron-fired run failed
// (e.g. 401 from invoke_edge_function carrying a stale service-role key),
// we still get to write a 'self' row from THIS invocation — because the
// edge function itself is reached via a different code path each time the
// cron fires, and the manual / API-fired fallback can also trigger it.
//
// The chicken-and-egg is solved by: this function always runs from inside
// the edge function (where the service-role client always works), so it
// can always write to deploy_health_log. The only way it's skipped is if
// the edge function itself isn't being invoked at all — and once that
// happens for >2h, the auto-healer FIX 7 escalation picks it up.
async function pollSelfHealth(supabase: SupabaseClient): Promise<Failure[]> {
  const { data, error } = await supabase.rpc('health_self_status', { p_jobname: SELF_JOBNAME })
  if (error) {
    console.warn('[deploy-health] health_self_status rpc failed:', error.message)
    return []
  }
  type Row = { jobname: string; status: string; return_message: string; start_time: string; end_time: string }
  const rows = (data ?? []) as Row[]
  if (rows.length === 0) return []
  const last = rows[0]
  if (last.status === 'succeeded' || last.status === 'starting') return []

  const msg = (last.return_message || '').toLowerCase()
  // Distinguish auth failures (cron→edge invocation rejected) from
  // function-side errors. Auth failures are critical; everything else high.
  const isAuth = msg.includes('401') || msg.includes('403') || msg.includes('unauthorized') || msg.includes('forbidden')
  return [{
    source: 'self',
    severity: isAuth ? 'critical' : 'high',
    ref_id: `self-${last.start_time}`,
    ref_url: `https://supabase.com/dashboard/project/${SUPABASE_PROJECT_REF}/database/cron-jobs`,
    title: isAuth
      ? `deploy-health-monitor cron auth failure — watcher is blind`
      : `deploy-health-monitor last run ${last.status}`,
    detail: (last.return_message || `Status: ${last.status}`).slice(0, 1500),
    detected_at: new Date().toISOString(),
    raw: { last_run: last },
    error_signature: isAuth ? 'self_auth_failure' : 'self_run_failure',
  }]
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ ok: false, error: 'POST only' }), {
      status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  const supabase = createClient(supabaseUrl, serviceKey)

  let body: { user_id?: string } = {}
  try { body = await req.json() } catch { /* allow empty */ }
  const userId = body.user_id || HANDLER_USER_ID

  // Self-check first — so even if every other source fetch fails, the
  // watcher's own status gets recorded.
  const self = await pollSelfHealth(supabase)

  // Run remote pollers in parallel; pg_cron + postgres run via supabase RPC
  // (already same connection, fast)
  const [github, vercel, supabaseEdge, pgCron, postgres] = await Promise.all([
    pollGitHubActions(),
    pollVercel(),
    pollEdgeFunction4xxAndTimeouts(),
    pollPgCronFailures(supabase),
    pollPostgresHealth(supabase),
  ])

  // Composite resource-exhaustion signal — must run after pgCron + postgres
  // because it aggregates their results plus recent history.
  const exhaustion = await pollResourceExhaustion(supabase, { pgCron, postgres })

  const all = [...self, ...github, ...vercel, ...supabaseEdge, ...pgCron, ...postgres, ...exhaustion]

  let inserted = 0
  let skipped = 0
  for (const f of all) {
    const hash = djb2Hash(`${f.source}|${f.ref_id}|${f.title}|${f.error_signature ?? ''}`)
    const { data: existing } = await supabase
      .from('deploy_health_log')
      .select('id')
      .eq('user_id', userId)
      .eq('hash', hash)
      .eq('status', 'open')
      .maybeSingle()
    if (existing) { skipped++; continue }
    const { error } = await supabase.from('deploy_health_log').insert({
      user_id: userId,
      source: f.source,
      severity: f.severity,
      ref_id: f.ref_id,
      ref_url: f.ref_url,
      title: f.title.slice(0, 200),
      detail: f.detail ? f.detail.slice(0, 2000) : null,
      hash,
      detected_at: f.detected_at,
      raw: f.raw ?? null,
      function_execution_time_ms: f.function_execution_time_ms ?? null,
      health_threshold_breached: f.health_threshold_breached ?? null,
      error_signature: f.error_signature ?? null,
    })
    if (!error) inserted++
  }

  return new Response(JSON.stringify({
    ok: true,
    polled: {
      self: self.length,
      github: github.length,
      vercel: vercel.length,
      supabase_edge: supabaseEdge.length,
      pg_cron: pgCron.length,
      postgres: postgres.length,
      resource_exhaustion: exhaustion.length,
    },
    inserted,
    skipped_dedup: skipped,
  }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
})
