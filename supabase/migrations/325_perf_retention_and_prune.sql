-- Migration 321: retention policies + prune_cron_run_details rewrite
-- (audit 2026-04-30).
--
-- The biggest single win in the pg_stat_statements diagnostic is
-- prune_cron_run_details(): 9.1s mean × 10 calls in window = 91s of
-- straight CPU. The function deletes from cron.job_run_details by
-- start_time, but cron.job_run_details has only a PK on runid (no
-- index on start_time), so every call full-scans 169 MB.
--
-- We don't have CREATE privilege on the cron schema, so we can't add
-- the index. Instead we rewrite the function to use the runid PK,
-- which is monotonically increasing — old rows have small runids — so
-- "delete the oldest N rows" becomes a fast pkey range scan.

-- ──────────────────────────────────────────────────────────────────
-- 1. Rewrite prune_cron_run_details() to use the runid PK.
-- ──────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.prune_cron_run_details()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'cron','pg_catalog'
AS $$
DECLARE
  v_keep constant int := 5000;  -- ~8h of busy logs at current rate
  v_max_runid bigint;
  v_cutoff bigint;
BEGIN
  SELECT max(runid) INTO v_max_runid FROM cron.job_run_details;
  IF v_max_runid IS NULL THEN RETURN; END IF;
  v_cutoff := v_max_runid - v_keep;
  IF v_cutoff <= 0 THEN RETURN; END IF;

  -- Delete in batches of 1000 to keep the lock window short and
  -- avoid blocking the cron writer for long. Loop until done.
  LOOP
    DELETE FROM cron.job_run_details
    WHERE runid IN (
      SELECT runid FROM cron.job_run_details
      WHERE runid <= v_cutoff
      LIMIT 1000
    );
    EXIT WHEN NOT FOUND;
  END LOOP;
END;
$$;

-- ──────────────────────────────────────────────────────────────────
-- 2. Retention policies for log tables (operational, not user content)
-- ──────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.prune_perf_log_tables()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','pg_catalog'
AS $$
DECLARE
  v_invariants_deleted int;
  v_ai_logs_deleted int;
  v_directives_deleted int;
BEGIN
  -- system_invariants_log: 30-day retention. Watchdog re-runs hourly so
  -- old fail records have no audit value beyond a month.
  DELETE FROM public.system_invariants_log
  WHERE checked_at < now() - interval '30 days';
  GET DIAGNOSTICS v_invariants_deleted = ROW_COUNT;

  -- handler_ai_logs: 30-day retention. Action-trace logs, not user
  -- history. Generation_context is preserved on ai_generated_content.
  DELETE FROM public.handler_ai_logs
  WHERE created_at < now() - interval '30 days';
  GET DIAGNOSTICS v_ai_logs_deleted = ROW_COUNT;

  -- handler_directives: 60-day retention but ONLY for terminal-state
  -- directives. Active/pending/executing rows are protected.
  -- Status enum (per migration 152): 'pending','executing','completed',
  -- 'failed','cancelled'.
  DELETE FROM public.handler_directives
  WHERE created_at < now() - interval '60 days'
    AND status IN ('completed', 'failed', 'cancelled');
  GET DIAGNOSTICS v_directives_deleted = ROW_COUNT;

  RETURN jsonb_build_object(
    'system_invariants_log', v_invariants_deleted,
    'handler_ai_logs', v_ai_logs_deleted,
    'handler_directives', v_directives_deleted,
    'pruned_at', now()
  );
END;
$$;

-- ──────────────────────────────────────────────────────────────────
-- 3. Schedule the pruners. prune_cron_run_details runs hourly (was
-- daily); prune_perf_log_tables runs daily.
-- ──────────────────────────────────────────────────────────────────

-- Drop existing schedules for these (idempotent re-registration)
DO $$
BEGIN
  PERFORM cron.unschedule(jobid)
    FROM cron.job
    WHERE jobname IN ('prune_cron_run_details_hourly',
                      'prune_perf_log_tables_daily');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- Hourly at minute :47 (off-peak vs. the staggered cron landscape)
SELECT cron.schedule(
  'prune_cron_run_details_hourly',
  '47 * * * *',
  $job$ SELECT public.prune_cron_run_details() $job$
);

-- Daily at 04:13 (off-peak)
SELECT cron.schedule(
  'prune_perf_log_tables_daily',
  '13 4 * * *',
  $job$ SELECT public.prune_perf_log_tables() $job$
);

-- ──────────────────────────────────────────────────────────────────
-- 4. One-time prune to bring the tables down immediately.
-- ──────────────────────────────────────────────────────────────────
SELECT public.prune_cron_run_details();
SELECT public.prune_perf_log_tables();

-- ──────────────────────────────────────────────────────────────────
-- 5. Tables we DELIBERATELY leave alone (user-facing content / load-
-- bearing history): handler_messages, handler_conversations,
-- handler_outreach_queue, ai_generated_content, paid_conversations,
-- lovense_commands. Per the audit hard rules.
-- ──────────────────────────────────────────────────────────────────
