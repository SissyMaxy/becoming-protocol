/**
 * /api/admin/mommy-pulse — supervisor status feed for /admin.
 *
 * Returns:
 *   - status_by_metric: latest severity (ok/warn/fail) per metric, with the
 *     most recent observation + threshold + notes
 *   - recent_actions: last 24h of supervisor actions, newest first
 *   - rolling_counts: ok/warn/fail counts in last 24h (for the dot color
 *     of the green/yellow/red panel header)
 *   - queue_snapshot: live counts from mommy_code_wishes + mommy_builder_run
 *     so the UI can show "queue depth", "shipped today", "last build" without
 *     waiting for the supervisor to log them
 *
 * Auth: any authenticated user. The supervisor log is service-role only at
 * the table level, but this endpoint reads with the service-role key and
 * returns a safe summary (no raw user data leaks; everything in
 * mommy_supervisor_log is operational).
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || '',
)

// Metric → display label mapping. Keep in sync with scripts/mommy/supervisor.ts.
// Order is meaningful — drives panel layout top-to-bottom.
const METRIC_DISPLAY: Array<{ metric: string; label: string; group: string }> = [
  { metric: 'builder_heartbeat_min',  label: 'Builder heartbeat',     group: 'build' },
  { metric: 'queue_depth_eligible',   label: 'Wish queue',            group: 'build' },
  { metric: 'crash_loop',             label: 'Crash-loop guard',      group: 'build' },
  { metric: 'ci_failures_open_24h',   label: 'CI failures (24h)',     group: 'build' },
  { metric: 'outreach_drafts_24h',    label: 'Outreach drafts (24h)', group: 'outreach' },
  { metric: 'outreach_submissions_24h', label: 'Outreach submits (24h)', group: 'outreach' },
]

interface SupervisorRow {
  id: string
  run_at: string
  metric: string
  threshold_value: number | null
  observed_value: number | null
  severity: 'ok' | 'warn' | 'fail'
  action_taken: string | null
  action_target: string | null
  action_result: Record<string, unknown> | null
  notes: string | null
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'GET only' })
  }

  // Authenticate. The token verifies the caller is signed in, but we don't
  // filter by user_id — supervisor data is operational, not per-user.
  const authHeader = req.headers.authorization || ''
  const token = authHeader.replace('Bearer ', '')
  if (!token) return res.status(401).json({ error: 'no auth token' })
  const { data: { user }, error: authError } = await supabase.auth.getUser(token)
  if (authError || !user) return res.status(401).json({ error: 'unauthorized' })

  try {
    const since24h = new Date(Date.now() - 24 * 3600_000).toISOString()

    // ── 1. Latest entry per metric (rolled up via in-memory pass) ───────────
    const { data: recent } = await supabase
      .from('mommy_supervisor_log')
      .select('*')
      .gte('run_at', since24h)
      .order('run_at', { ascending: false })
      .limit(2000)

    const recentRows = (recent ?? []) as SupervisorRow[]

    const latestByMetric = new Map<string, SupervisorRow>()
    for (const row of recentRows) {
      if (!latestByMetric.has(row.metric)) latestByMetric.set(row.metric, row)
    }

    const status_by_metric = METRIC_DISPLAY.map(({ metric, label, group }) => {
      const r = latestByMetric.get(metric) ?? null
      return {
        metric,
        label,
        group,
        severity: r?.severity ?? 'unknown',
        observed: r?.observed_value ?? null,
        threshold: r?.threshold_value ?? null,
        notes: r?.notes ?? null,
        last_run_at: r?.run_at ?? null,
        last_action: r?.action_taken ?? null,
      }
    })

    // ── 2. Recent actions (only rows with action_taken set) ─────────────────
    const recent_actions = recentRows
      .filter(r => r.action_taken && r.action_taken !== 'observe_only')
      .slice(0, 20)
      .map(r => ({
        run_at: r.run_at,
        metric: r.metric,
        action: r.action_taken,
        target: r.action_target,
        severity: r.severity,
        notes: r.notes,
        result: r.action_result,
      }))

    // ── 3. Rolling counts ────────────────────────────────────────────────────
    let okCount = 0, warnCount = 0, failCount = 0
    for (const r of recentRows) {
      if (r.severity === 'ok') okCount++
      else if (r.severity === 'warn') warnCount++
      else if (r.severity === 'fail') failCount++
    }

    // ── 4. Queue snapshot (live, not from the log) ──────────────────────────
    const queueSnapshot: Record<string, unknown> = {}
    try {
      const { count: queuedEligible } = await supabase
        .from('mommy_code_wishes')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'queued')
        .eq('auto_ship_eligible', true)
      queueSnapshot.queued_auto_ship_eligible = queuedEligible ?? 0

      const { count: queuedTotal } = await supabase
        .from('mommy_code_wishes')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'queued')
      queueSnapshot.queued_total = queuedTotal ?? 0

      const { count: shippedToday } = await supabase
        .from('mommy_code_wishes')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'shipped')
        .gte('shipped_at', since24h)
      queueSnapshot.shipped_24h = shippedToday ?? 0

      const { data: lastBuild } = await supabase
        .from('mommy_builder_run')
        .select('started_at, status, wish_id')
        .order('started_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      queueSnapshot.last_build = lastBuild ?? null
    } catch (err) {
      queueSnapshot._error = String(err).slice(0, 200)
    }

    return res.status(200).json({
      timestamp: new Date().toISOString(),
      // Header dot for the panel — worst-of in last hour wins.
      header_severity: failCount > 0 ? 'fail' : warnCount > 0 ? 'warn' : okCount > 0 ? 'ok' : 'unknown',
      rolling_counts_24h: { ok: okCount, warn: warnCount, fail: failCount, total: recentRows.length },
      status_by_metric,
      recent_actions,
      queue_snapshot: queueSnapshot,
    })
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : 'unknown' })
  }
}
