-- 330_move_push_crons_to_gh_actions.sql
-- 2026-05-09 — Move the last two minute-grain push lanes out of pg_cron
-- and into GitHub Actions cron.
--
-- Symptom: after 326/327/328/329 stagger + drastic prune (~22 active jobs),
-- `web-push-dispatch-minute` (1-59/5) and `send-notifications-every-minute`
-- (2-59/5) are the only jobs still consistently hitting `job startup
-- timeout` on the current Supabase Pro / Small-compute tier
-- (cron.use_background_workers = off, max_worker_processes = 6).
-- Moving them external eliminates the failure mode without a tier change.
--
-- This is a surgical preview of the broader event-driven plan; the rest of
-- the cron lanes will follow that plan when ready.
--
-- New external schedule: .github/workflows/push-dispatchers.yml fires both
-- functions every 5 min. concurrency.group prevents overlapping runs;
-- per-step `-m 60 || true` keeps a transient failure from going red.
--
-- Hard rule: do not touch any other cron job.
-- ============================================================
-- A) Expand cron_paused_during_emergency.change_type CHECK to admit
--    'moved_external' as a distinct, non-audit-gaming category.
-- ============================================================

DO $$
BEGIN
  ALTER TABLE public.cron_paused_during_emergency
    DROP CONSTRAINT IF EXISTS cron_paused_during_emergency_change_type_check;
  ALTER TABLE public.cron_paused_during_emergency
    ADD CONSTRAINT cron_paused_during_emergency_change_type_check
    CHECK (change_type IN ('unscheduled','reduced','increased','moved_external'));
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE '330: change_type constraint update skipped: %', SQLERRM;
END $$;

-- ============================================================
-- B) Unschedule the two jobs and audit the move.
-- ============================================================

DO $$
DECLARE v_id int;
BEGIN
  SELECT jobid INTO v_id FROM cron.job WHERE jobname = 'web-push-dispatch-minute';
  IF v_id IS NOT NULL THEN PERFORM cron.unschedule(v_id); END IF;

  SELECT jobid INTO v_id FROM cron.job WHERE jobname = 'send-notifications-every-minute';
  IF v_id IS NOT NULL THEN PERFORM cron.unschedule(v_id); END IF;

  INSERT INTO public.cron_paused_during_emergency
    (effective_date, migration, change_type, jobname, old_schedule, new_schedule, command, reason)
  VALUES
    ('2026-05-09'::date, '330', 'moved_external', 'web-push-dispatch-minute',
     '1-59/5 * * * *', 'gh_actions:push-dispatchers.yml', NULL,
     'pg_cron startup timeout on small compute; moved to GH Actions'),
    ('2026-05-09'::date, '330', 'moved_external', 'send-notifications-every-minute',
     '*/5 * * * *',    'gh_actions:push-dispatchers.yml', NULL,
     'same as above')
  ON CONFLICT (migration, jobname) DO NOTHING;
END $$;

-- ============================================================
-- Verify (informational only, no failure raised here):
--
--   SELECT count(*) FILTER (WHERE active) FROM cron.job;
--   -- expect 22 (was 24, minus the two moved)
--
--   SELECT jobname FROM cron.job
--   WHERE jobname IN ('web-push-dispatch-minute', 'send-notifications-every-minute');
--   -- expect: empty
--
--   SELECT count(*) FILTER (WHERE status='failed') AS fails, count(*) AS total
--   FROM cron.job_run_details
--   WHERE start_time > now() - interval '10 minutes';
--   -- expect failure rate to drop sharply within ~10 min
-- ============================================================
