-- 331_move_critical_loop_to_gh_actions.sql
-- 2026-05-09 — Move the */10 critical-loop trio out of pg_cron into
-- GitHub Actions cron.
--
-- Symptom: even after 326-329 stagger + drastic prune (~22 active jobs)
-- and 330 (push lanes moved external), the three protected */10 jobs
--   * auto-healer-10min            (was :08)
--   * deploy-health-monitor-10min  (was :09)
--   * mommy-praise-10min           (was :04)
-- keep hitting `job startup timeout` on the current Supabase Pro /
-- Small-compute tier (cron.use_background_workers = off,
-- max_worker_processes = 6). The libpq auth pool can't handshake
-- adjacent-minute fires.
--
-- New external schedule: .github/workflows/cron-critical-loop.yml
-- fires all three functions every 10 min. concurrency.group prevents
-- overlapping runs; per-step `-m 60 || echo` keeps a transient failure
-- visible in the workflow log without failing the job.
--
-- Drift <1 min and occasional skipped runs are acceptable for these
-- infrastructure healers.
--
-- Hard rule: do not touch any other cron job.

-- ============================================================
-- Unschedule the three jobs and audit the move.
-- (change_type='moved_external' was added to the CHECK in 330.)
-- ============================================================

DO $$
DECLARE v_id int;
BEGIN
  SELECT jobid INTO v_id FROM cron.job WHERE jobname = 'auto-healer-10min';
  IF v_id IS NOT NULL THEN PERFORM cron.unschedule(v_id); END IF;

  SELECT jobid INTO v_id FROM cron.job WHERE jobname = 'deploy-health-monitor-10min';
  IF v_id IS NOT NULL THEN PERFORM cron.unschedule(v_id); END IF;

  SELECT jobid INTO v_id FROM cron.job WHERE jobname = 'mommy-praise-10min';
  IF v_id IS NOT NULL THEN PERFORM cron.unschedule(v_id); END IF;

  INSERT INTO public.cron_paused_during_emergency
    (effective_date, migration, change_type, jobname, old_schedule, new_schedule, command, reason)
  VALUES
    ('2026-05-09'::date, '331', 'moved_external', 'auto-healer-10min',
     '*/10 * * * *', 'gh_actions:cron-critical-loop.yml', NULL,
     'pg_cron startup timeout on small compute even after 329 prune + 330; moved to GH Actions'),
    ('2026-05-09'::date, '331', 'moved_external', 'deploy-health-monitor-10min',
     '*/10 * * * *', 'gh_actions:cron-critical-loop.yml', NULL,
     'same as above'),
    ('2026-05-09'::date, '331', 'moved_external', 'mommy-praise-10min',
     '*/10 * * * *', 'gh_actions:cron-critical-loop.yml', NULL,
     'same as above')
  ON CONFLICT (migration, jobname) DO NOTHING;
END $$;

-- ============================================================
-- Verify (informational only, no failure raised here):
--
--   SELECT count(*) FILTER (WHERE active) FROM cron.job;
--   -- expect baseline_after_330 - 3 (these three are now external)
--
--   SELECT jobname FROM cron.job
--   WHERE jobname IN ('auto-healer-10min',
--                     'deploy-health-monitor-10min',
--                     'mommy-praise-10min');
--   -- expect: empty
--
--   SELECT count(*) FILTER (WHERE status='failed') AS fails, count(*) AS total
--   FROM cron.job_run_details
--   WHERE start_time > now() - interval '10 minutes';
--   -- expect failure rate to drop to ~0 within ~10 min
-- ============================================================
