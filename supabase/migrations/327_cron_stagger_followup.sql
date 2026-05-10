-- 327_cron_stagger_followup.sql
-- 2026-05-08 — Follow-up to 326. Post-apply audit found two minute slots
-- still at 3 jobs (over the max-2 ceiling):
--
--   :23 — expire_overdue_confessions, mommy-tease-engine,
--          hard-mode-auto-trigger-hourly
--   :47 — prune_cron_run_details_hourly, handler-outreach-auto-hourly,
--          milestone_auto_disclosure_drafts
--
-- 326 caused the :47 issue (handler-outreach-auto-hourly was moved there
-- to escape :17, but :47 already had 2 inhabitants 326 didn't know about).
-- :23 had 3 from prior migrations; only predictive_defection_lockdown was
-- moved by 326.
--
-- Moves (favor relocating non-mommy / non-user-facing jobs):
--   :23 — hard-mode-auto-trigger-hourly  → :25 (empty)
--          (mommy-tease-engine + expire_overdue_confessions stay; both are
--           directly user-facing or near-real-time)
--   :47 — handler-outreach-auto-hourly   → :48 (empty)
--          (prune_cron_run_details_hourly stays — Postgres maintenance;
--           milestone_auto_disclosure_drafts stays — milestone trigger)
--
-- Result: every minute-offset for `M * * * *` hourly jobs has count ≤ 2.

-- ============================================
-- A) :23 collision — move hard-mode-auto-trigger-hourly to :25
-- ============================================

DO $$ BEGIN
  PERFORM cron.alter_job(
    job_id   := (SELECT jobid FROM cron.job WHERE jobname = 'hard-mode-auto-trigger-hourly'),
    schedule := '25 * * * *'
  );
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE '327: hard-mode-auto-trigger-hourly alter skipped: %', SQLERRM;
END $$;

-- ============================================
-- B) :47 collision — move handler-outreach-auto-hourly to :48
-- ============================================

DO $$ BEGIN
  PERFORM cron.alter_job(
    job_id   := (SELECT jobid FROM cron.job WHERE jobname = 'handler-outreach-auto-hourly'),
    schedule := '48 * * * *'
  );
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE '327: handler-outreach-auto-hourly alter skipped: %', SQLERRM;
END $$;

NOTIFY pgrst, 'reload schema';
