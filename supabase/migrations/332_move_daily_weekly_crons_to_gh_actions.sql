-- 332_move_daily_weekly_crons_to_gh_actions.sql
-- 2026-05-09 — Move the 15 edge-function-backed daily/weekly pg_cron jobs
-- out of pg_cron and into GitHub Actions cron.
--
-- Symptom: even after 326-330 stagger/prune (down to ~22 active jobs) and
-- 331 (critical-loop trio moved external), pg_cron continues to hit
-- `job startup timeout` on the current Supabase Pro / Small-compute tier
-- (cron.use_background_workers = off, max_worker_processes = 6). Daily
-- and weekly jobs don't need DB-side cron — moving them external removes
-- the failure mode without a tier change.
--
-- New external schedule: see .github/workflows/cron-*.yml (5 grouped
-- workflows). concurrency.group prevents overlapping runs; per-step
-- `-m 60 || echo` keeps a transient failure visible in the workflow log
-- without failing the job.
--
-- NOT MOVED (DB-internal SQL functions; no edge function exists):
--   * prune_perf_log_tables_daily   — calls SELECT public.prune_perf_log_tables()
--   * compute_daily_compliance_score — calls SELECT compute_daily_compliance_score()
-- These remain in pg_cron alongside prune_cron_run_details_hourly and
-- outreach-expiry-janitor-5min (also DB-internal). They are low-cost
-- daily fires and don't trigger the startup-timeout failure mode.
--
-- Hard rule: do not touch any other cron job.

-- ============================================================
-- Unschedule the 15 jobs and audit the move.
-- (change_type='moved_external' was added to the CHECK in 330.)
-- ============================================================

DO $$
DECLARE
  v_id int;
  v_name text;
  v_old_schedule text;
  v_jobnames text[] := ARRAY[
    -- Mommy / handler daily (cron-mommy-daily.yml)
    'handler-self-audit-daily',
    'mommy-mood-daily',
    'mommy-mantra-daily',
    'mommy-bedtime-daily-22',
    -- Content daily (cron-content-daily.yml)
    'workout-prescriber-daily',
    'capability-digest-daily-7am30',
    -- Calendar daily (cron-calendar-daily.yml)
    'calendar-sync-daily',
    'calendar-place-rituals-daily',
    'wardrobe-expiry-daily',
    -- Every-3-hour (cron-mommy-touch.yml)
    'mommy-touch-cycle',
    -- Weekly (cron-weekly.yml)
    'content-generator-daily',
    'witness-fabrication-daily',
    'cross-platform-consistency-daily',
    'loophole-hunter-daily',
    'disclosure-rehearsal-sunday-9am'
  ];
BEGIN
  FOREACH v_name IN ARRAY v_jobnames LOOP
    SELECT jobid, schedule INTO v_id, v_old_schedule
      FROM cron.job WHERE jobname = v_name;
    IF v_id IS NOT NULL THEN
      PERFORM cron.unschedule(v_id);
    END IF;
    INSERT INTO public.cron_paused_during_emergency
      (effective_date, migration, change_type, jobname, old_schedule, new_schedule, command, reason)
    VALUES
      ('2026-05-09'::date, '332', 'moved_external', v_name,
       COALESCE(v_old_schedule, 'unknown'),
       CASE
         WHEN v_name IN ('handler-self-audit-daily','mommy-mood-daily','mommy-mantra-daily','mommy-bedtime-daily-22')
           THEN 'gh_actions:cron-mommy-daily.yml'
         WHEN v_name IN ('workout-prescriber-daily','capability-digest-daily-7am30')
           THEN 'gh_actions:cron-content-daily.yml'
         WHEN v_name IN ('calendar-sync-daily','calendar-place-rituals-daily','wardrobe-expiry-daily')
           THEN 'gh_actions:cron-calendar-daily.yml'
         WHEN v_name = 'mommy-touch-cycle'
           THEN 'gh_actions:cron-mommy-touch.yml'
         ELSE 'gh_actions:cron-weekly.yml'
       END,
       NULL,
       'pg_cron startup timeout on small compute; daily/weekly cadence does not need DB-side cron')
    ON CONFLICT (migration, jobname) DO NOTHING;
  END LOOP;
END $$;

-- ============================================================
-- Verify (informational only, no failure raised here):
--
--   SELECT count(*) FILTER (WHERE active) FROM cron.job;
--   -- expect baseline_after_331 - 15 (these 15 are now external).
--   -- DB-internal SQL-function jobs that remain:
--   --   prune_cron_run_details_hourly, prune_perf_log_tables_daily,
--   --   compute_daily_compliance_score, outreach-expiry-janitor-5min
--   -- Plus any other unlisted jobs.
--
--   SELECT jobname FROM cron.job
--   WHERE jobname IN (
--     'handler-self-audit-daily','mommy-mood-daily','mommy-mantra-daily',
--     'mommy-bedtime-daily-22','workout-prescriber-daily',
--     'capability-digest-daily-7am30','calendar-sync-daily',
--     'calendar-place-rituals-daily','wardrobe-expiry-daily',
--     'mommy-touch-cycle','content-generator-daily',
--     'witness-fabrication-daily','cross-platform-consistency-daily',
--     'loophole-hunter-daily','disclosure-rehearsal-sunday-9am'
--   );
--   -- expect: empty
--
--   SELECT count(*) FILTER (WHERE status='failed') AS fails, count(*) AS total
--   FROM cron.job_run_details
--   WHERE start_time > now() - interval '15 minutes';
--   -- expect failure rate to drop sharply within ~15 min
-- ============================================================
