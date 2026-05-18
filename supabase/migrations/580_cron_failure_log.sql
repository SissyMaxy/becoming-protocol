-- 580 — Cron failure log + classifier (public schema wrapper).
--
-- The pg_cron internal table cron.job_run_details has no error_message
-- column and Supabase blocks DDL on the cron schema. So we build a
-- public-schema wrapper that snapshots failing runs with classified
-- failure modes, enabling auto-recovery strategies.
--
-- Strategy:
--   1. cron_failure_log table — public schema, ALTERable, indexed.
--   2. snapshot_cron_failures() — every 10min, scans cron.job_run_details
--      for status='failed' rows newer than last snapshot, classifies the
--      return_message, writes to cron_failure_log.
--   3. classify_cron_failure(text) → text — pattern-matches return_message
--      against known classes: timeout, rate_limit, missing_table,
--      missing_function, permission_denied, deadlock, unknown.
--   4. cron_job_health view — joins cron.job + last_failure_class +
--      consecutive_failures so /admin can render at-a-glance.

CREATE TABLE IF NOT EXISTS cron_failure_log (
  id BIGSERIAL PRIMARY KEY,
  job_id BIGINT NOT NULL,
  job_name TEXT NOT NULL,
  run_id BIGINT,
  failure_class TEXT NOT NULL,
  return_message TEXT,
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  duration_sec REAL,
  snapshotted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (job_id, run_id)
);
CREATE INDEX IF NOT EXISTS idx_cron_fail_job_recent
  ON cron_failure_log (job_name, snapshotted_at DESC);
CREATE INDEX IF NOT EXISTS idx_cron_fail_class
  ON cron_failure_log (failure_class, snapshotted_at DESC);

ALTER TABLE cron_failure_log ENABLE ROW LEVEL SECURITY;
DO $do$ BEGIN
  CREATE POLICY cfl_service ON cron_failure_log FOR ALL TO service_role USING (TRUE) WITH CHECK (TRUE);
EXCEPTION WHEN duplicate_object THEN NULL; END $do$;
-- authenticated read for /admin
DO $do$ BEGIN
  CREATE POLICY cfl_authed_read ON cron_failure_log FOR SELECT TO authenticated USING (TRUE);
EXCEPTION WHEN duplicate_object THEN NULL; END $do$;

-- Classifier
CREATE OR REPLACE FUNCTION classify_cron_failure(p_message TEXT)
RETURNS TEXT LANGUAGE plpgsql IMMUTABLE AS $fn$
BEGIN
  IF p_message IS NULL OR p_message = '' THEN RETURN 'unknown'; END IF;

  IF p_message ~* '(canceling statement due to statement timeout|query_canceled)' THEN RETURN 'statement_timeout'; END IF;
  IF p_message ~* '(deadlock detected|40P01)' THEN RETURN 'deadlock'; END IF;
  IF p_message ~* '(rate.?limit|429|too many requests)' THEN RETURN 'rate_limit'; END IF;
  IF p_message ~* 'relation ".+" does not exist' THEN RETURN 'missing_table'; END IF;
  IF p_message ~* 'function .* does not exist' THEN RETURN 'missing_function'; END IF;
  IF p_message ~* 'column ".+" of relation ".+" does not exist|column ".+" does not exist' THEN RETURN 'missing_column'; END IF;
  IF p_message ~* '(permission denied|42501)' THEN RETURN 'permission_denied'; END IF;
  IF p_message ~* 'violates check constraint' THEN RETURN 'check_constraint_violation'; END IF;
  IF p_message ~* 'violates (foreign key|not-null|unique) constraint' THEN RETURN 'constraint_violation'; END IF;
  IF p_message ~* '(connection|server closed|terminated|55P03)' THEN RETURN 'connection_lost'; END IF;
  IF p_message ~* '(could not (connect|resolve)|timeout|HTTPSConnection)' THEN RETURN 'network'; END IF;

  RETURN 'unknown';
END $fn$;

-- Snapshot function.
CREATE OR REPLACE FUNCTION snapshot_cron_failures()
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE v_count INT := 0;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    RETURN 0;
  END IF;

  INSERT INTO cron_failure_log (
    job_id, job_name, run_id, failure_class, return_message,
    started_at, ended_at, duration_sec
  )
  SELECT
    jrd.jobid,
    j.jobname,
    jrd.runid,
    classify_cron_failure(jrd.return_message),
    jrd.return_message,
    jrd.start_time,
    jrd.end_time,
    EXTRACT(EPOCH FROM (jrd.end_time - jrd.start_time))::real
  FROM cron.job_run_details jrd
  JOIN cron.job j ON j.jobid = jrd.jobid
  WHERE jrd.status = 'failed'
    AND jrd.end_time > now() - interval '15 minutes'
  ON CONFLICT (job_id, run_id) DO NOTHING;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END $fn$;

-- View: per-job health snapshot.
CREATE OR REPLACE VIEW cron_job_health AS
WITH last_fail AS (
  SELECT DISTINCT ON (job_name)
    job_name, failure_class, return_message, snapshotted_at AS last_failure_at
    FROM cron_failure_log
   ORDER BY job_name, snapshotted_at DESC
),
fail_counts AS (
  SELECT job_name, COUNT(*) AS failures_24h
    FROM cron_failure_log
   WHERE snapshotted_at > now() - interval '24 hours'
   GROUP BY job_name
)
SELECT
  j.jobid,
  j.jobname AS job_name,
  j.schedule,
  j.active,
  lf.last_failure_class,
  lf.last_failure_message,
  lf.last_failure_at,
  COALESCE(fc.failures_24h, 0) AS failures_24h
  FROM cron.job j
  LEFT JOIN (SELECT job_name AS jn, failure_class AS last_failure_class,
                    return_message AS last_failure_message, last_failure_at
               FROM last_fail) lf ON lf.jn = j.jobname
  LEFT JOIN fail_counts fc ON fc.job_name = j.jobname;

-- Schedule the snapshot every 10 minutes.
DO $cron$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('snapshot_cron_failures');
  END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END $cron$;
DO $cron$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.schedule('snapshot_cron_failures', '*/10 * * * *',
      $$SELECT snapshot_cron_failures();$$);
  END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END $cron$;

-- Initial sweep.
SELECT snapshot_cron_failures();
