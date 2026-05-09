-- 328_cron_stagger_followup_2.sql
-- 2026-05-08 — Second follow-up to 326. Post-327 audit shows the */5
-- notifier lanes (send-notifications on 2-59/5, web-push on 1-59/5) still
-- create 3-job concurrency at three minute slots per hour because they
-- land on hourly slots that are already at 2:
--
--   :17 — autonomous-compliance-check + defection_risk_scoring_hourly +
--          send-notifications fires here every :17 → 3
--   :37 — response-capture-5min + trigger_reinforcement_scheduler +
--          send-notifications → 3
--   :47 — prune_cron_run_details_hourly + milestone_auto_disclosure_drafts
--          + send-notifications → 3
--
-- Plus a 3-way collision at :23 every hour from */10 overlap:
--   :23 — mommy-tease-engine + expire_overdue_confessions +
--          slip-cluster-detector (every 10 fires at :23) → 3
--
-- And a tighter-than-needed 2-job slot at :53:
--   :53 — defection_sanctuary_amplification (moved here by 326) +
--          slip-cluster-detector (every 10) → 2 (under cap but
--          push to 1 since both targets are non-real-time)
--
-- Move plan — relocate the analytics/scoring/cleanup jobs (NOT the
-- user-facing or every-5-min real-time jobs) to currently-empty offsets
-- in the 28..45 range:
--
--   defection_risk_scoring_hourly        :17 → :30
--   trigger_reinforcement_scheduler      :37 → :34
--   milestone_auto_disclosure_drafts     :47 → :40
--   expire_overdue_confessions           :23 → :28
--   defection_sanctuary_amplification    :53 → :35
--
-- Result for the */5 fire-time peaks:
--   :17 — autonomous-compliance-check + send-notifications = 2
--   :37 — response-capture-5min       + send-notifications = 2
--   :47 — prune_cron_run_details_hourly + send-notifications = 2
--   :23 — mommy-tease-engine + slip-cluster-detector = 2
--   :53 — slip-cluster-detector only  = 1
--
-- All under the max-2 ceiling. The five destination offsets (28, 30, 34,
-- 35, 40) were empty pre-migration; each ends at 1 job. Verified that
-- none collide with send-notifications (2-59/5: 02,07,12,…) nor
-- web-push-dispatch (1-59/5: 01,06,11,…) nor */10 lane (3,4,8,9 +
-- 13,14,…,53,54).

DO $$ BEGIN
  PERFORM cron.alter_job(
    job_id   := (SELECT jobid FROM cron.job WHERE jobname = 'defection_risk_scoring_hourly'),
    schedule := '30 * * * *'
  );
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE '328: defection_risk_scoring_hourly alter skipped: %', SQLERRM;
END $$;

DO $$ BEGIN
  PERFORM cron.alter_job(
    job_id   := (SELECT jobid FROM cron.job WHERE jobname = 'trigger_reinforcement_scheduler'),
    schedule := '34 * * * *'
  );
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE '328: trigger_reinforcement_scheduler alter skipped: %', SQLERRM;
END $$;

DO $$ BEGIN
  PERFORM cron.alter_job(
    job_id   := (SELECT jobid FROM cron.job WHERE jobname = 'milestone_auto_disclosure_drafts'),
    schedule := '40 * * * *'
  );
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE '328: milestone_auto_disclosure_drafts alter skipped: %', SQLERRM;
END $$;

DO $$ BEGIN
  PERFORM cron.alter_job(
    job_id   := (SELECT jobid FROM cron.job WHERE jobname = 'expire_overdue_confessions'),
    schedule := '28 * * * *'
  );
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE '328: expire_overdue_confessions alter skipped: %', SQLERRM;
END $$;

DO $$ BEGIN
  PERFORM cron.alter_job(
    job_id   := (SELECT jobid FROM cron.job WHERE jobname = 'defection_sanctuary_amplification'),
    schedule := '35 * * * *'
  );
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE '328: defection_sanctuary_amplification alter skipped: %', SQLERRM;
END $$;

NOTIFY pgrst, 'reload schema';
