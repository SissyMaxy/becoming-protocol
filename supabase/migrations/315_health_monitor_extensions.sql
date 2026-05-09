-- 315 — Supabase-side health monitor extensions.
--
-- Why: 240 created deploy_health_log with source ∈ {github_actions, vercel,
-- supabase_edge}. That gave us GH Actions / Vercel / 5xx visibility but
-- left blind spots that caused today's outage to go undetected:
--   - pg_cron job failures (cron.job_run_details)
--   - 4xx auth failures on cron-triggered edge functions
--   - edge function execution timeouts (504/546, slow_response > 100s)
--   - postgres connection saturation, WAL archive failures
--   - the watcher silently failing on its own auth
--
-- This migration:
--   1. Documents the extended source vocabulary (no CHECK exists, so this is
--      a comment / convention update — runtime enforcement is in the edge fn).
--   2. Adds function_execution_time_ms + health_threshold_breached +
--      error_signature columns so timeouts and threshold breaches carry
--      structured telemetry the watcher and watchdog can filter on.
--   3. Adds (source, status, detected_at desc) + (error_signature,
--      detected_at desc) indexes for the SupabaseHealthCard dashboard query
--      and the external watchdog's signal lookup.
--   4. Grants the service_role read access to cron.job_run_details so the
--      watcher can poll pg_cron failures from inside the edge function.
--   5. Creates supabase_restart_log so the external watchdog
--      (.github/workflows/supabase-watchdog.yml) can enforce the 24h cap
--      and the 30min recovery window without trusting CI logs alone.

ALTER TABLE public.deploy_health_log
  ADD COLUMN IF NOT EXISTS function_execution_time_ms integer,
  ADD COLUMN IF NOT EXISTS health_threshold_breached jsonb,
  ADD COLUMN IF NOT EXISTS error_signature text;

COMMENT ON COLUMN public.deploy_health_log.source IS
  'github_actions | vercel | supabase_edge | pg_cron | postgres | self';
COMMENT ON COLUMN public.deploy_health_log.function_execution_time_ms IS
  'For supabase_edge timeouts / slow_response: observed execution time in ms.';
COMMENT ON COLUMN public.deploy_health_log.health_threshold_breached IS
  'For postgres / pg_cron threshold checks: { metric, observed, threshold, ... }.';
COMMENT ON COLUMN public.deploy_health_log.error_signature IS
  'Sub-classifier within source: e.g. auth_failure | timeout | slow_response | http_5xx | connection_saturation | wal_archive_failure | resource_exhaustion_detected | self_auth_failure.';

CREATE INDEX IF NOT EXISTS idx_deploy_health_log_source_status_detected
  ON public.deploy_health_log(source, status, detected_at DESC);

-- Watchdog query: filter by error_signature + window. Partial index on the
-- exhaustion signature keeps the index tiny — only signal rows are present.
CREATE INDEX IF NOT EXISTS idx_deploy_health_log_signature_detected
  ON public.deploy_health_log(error_signature, detected_at DESC)
  WHERE error_signature IS NOT NULL;

-- ---------- supabase_restart_log ----------
-- The external watchdog (.github/workflows/supabase-watchdog.yml) inserts
-- one row here per restart attempt so the 24h cap and 30min recovery
-- window can be enforced without trusting GitHub Actions logs alone.
-- 'operator' = manual API call; 'manual' = dashboard click documented after
-- the fact; 'watchdog' = automated. Kept separate from
-- autonomous_escalation_log because restarts are a distinct lifecycle event
-- that needs its own audit table.
CREATE TABLE IF NOT EXISTS public.supabase_restart_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  triggered_at timestamptz NOT NULL DEFAULT now(),
  triggered_by text NOT NULL CHECK (triggered_by IN ('watchdog','operator','manual')),
  reason text,
  signal_count int,
  api_response jsonb
);

CREATE INDEX IF NOT EXISTS idx_supabase_restart_log_triggered_at
  ON public.supabase_restart_log(triggered_at DESC);

ALTER TABLE public.supabase_restart_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service writes restart log" ON public.supabase_restart_log;
CREATE POLICY "Service writes restart log" ON public.supabase_restart_log
  FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
DROP POLICY IF EXISTS "Authed users see restart log" ON public.supabase_restart_log;
CREATE POLICY "Authed users see restart log" ON public.supabase_restart_log
  FOR SELECT USING (auth.uid() IS NOT NULL);

-- pg_cron lives in the cron schema; the service_role used by edge functions
-- needs read access to job_run_details so pollPgCronFailures() can see job
-- error rows. Granted with EXCEPTION block because cron.* may not exist on
-- a fresh project clone without the extension.
DO $$
BEGIN
  GRANT USAGE ON SCHEMA cron TO service_role;
  GRANT SELECT ON cron.job_run_details TO service_role;
  GRANT SELECT ON cron.job TO service_role;
EXCEPTION WHEN undefined_table OR undefined_object OR insufficient_privilege THEN
  NULL;
END $$;

-- ---------- RPCs the watcher calls via supabase-js ----------
-- PostgREST only exposes the public schema. The watcher runs in an edge
-- function with the supabase-js client (no raw SQL), so cron.* and
-- pg_stat_* live behind these SECURITY DEFINER RPCs. Each is read-only and
-- returns small structured rows.

-- (1) recent failed pg_cron runs in the window
CREATE OR REPLACE FUNCTION public.health_pg_cron_failures(p_window_minutes int DEFAULT 10)
RETURNS TABLE (
  jobid bigint,
  jobname text,
  runid bigint,
  status text,
  return_message text,
  start_time timestamptz,
  end_time timestamptz
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, cron, public
AS $$
  SELECT
    j.jobid,
    j.jobname,
    d.runid,
    d.status,
    COALESCE(d.return_message, '')::text AS return_message,
    d.start_time,
    d.end_time
  FROM cron.job_run_details d
  JOIN cron.job j ON j.jobid = d.jobid
  WHERE d.status = 'failed'
    AND d.start_time > now() - make_interval(mins => p_window_minutes)
  ORDER BY d.start_time DESC
  LIMIT 100;
$$;

-- (2) self-status — last run record for a specific cron jobname
CREATE OR REPLACE FUNCTION public.health_self_status(p_jobname text)
RETURNS TABLE (
  jobname text,
  status text,
  return_message text,
  start_time timestamptz,
  end_time timestamptz
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, cron, public
AS $$
  SELECT
    j.jobname,
    d.status,
    COALESCE(d.return_message, '')::text AS return_message,
    d.start_time,
    d.end_time
  FROM cron.job_run_details d
  JOIN cron.job j ON j.jobid = d.jobid
  WHERE j.jobname = p_jobname
  ORDER BY d.start_time DESC
  LIMIT 1;
$$;

-- (3) postgres health snapshot — single row, all the metrics the watcher
-- needs in one round-trip
CREATE OR REPLACE FUNCTION public.health_postgres_snapshot()
RETURNS TABLE (
  active_connections int,
  max_connections int,
  connection_pct numeric,
  wal_failed_count bigint,
  wal_last_failed_time timestamptz,
  wal_archived_count bigint,
  wal_last_archived_time timestamptz,
  longest_idle_seconds numeric
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT
    (SELECT count(*)::int FROM pg_stat_activity)                                AS active_connections,
    current_setting('max_connections')::int                                     AS max_connections,
    ROUND(
      (SELECT count(*)::numeric FROM pg_stat_activity)
      / NULLIF(current_setting('max_connections')::numeric, 0) * 100
    , 1)                                                                        AS connection_pct,
    a.failed_count                                                              AS wal_failed_count,
    a.last_failed_time                                                          AS wal_last_failed_time,
    a.archived_count                                                            AS wal_archived_count,
    a.last_archived_time                                                        AS wal_last_archived_time,
    COALESCE(
      (SELECT EXTRACT(EPOCH FROM (now() - min(state_change)))
         FROM pg_stat_activity
         WHERE state = 'idle'),
      0
    )                                                                           AS longest_idle_seconds
  FROM pg_stat_archiver a;
$$;

-- (4) terminate idle connections older than N seconds. Used by auto-healer
-- FIX 10. Returns the pids it terminated so we can log them.
CREATE OR REPLACE FUNCTION public.health_terminate_idle_connections(p_min_idle_seconds int DEFAULT 300)
RETURNS TABLE (terminated_pid int, terminated boolean)
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT
    pid AS terminated_pid,
    pg_terminate_backend(pid) AS terminated
  FROM pg_stat_activity
  WHERE state = 'idle'
    AND state_change < now() - make_interval(secs => p_min_idle_seconds)
    AND pid <> pg_backend_pid()
    AND usename NOT IN ('supabase_admin', 'postgres')
  LIMIT 50;
$$;

REVOKE ALL ON FUNCTION public.health_pg_cron_failures(int) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.health_self_status(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.health_postgres_snapshot() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.health_terminate_idle_connections(int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.health_pg_cron_failures(int) TO service_role;
GRANT EXECUTE ON FUNCTION public.health_self_status(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.health_postgres_snapshot() TO service_role;
GRANT EXECUTE ON FUNCTION public.health_terminate_idle_connections(int) TO service_role;

NOTIFY pgrst, 'reload schema';
