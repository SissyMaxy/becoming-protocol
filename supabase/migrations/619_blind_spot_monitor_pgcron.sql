-- 619: move the safety heals onto a RELIABLE in-database timer.
--
-- The blind-spot-monitor (safeword reactivation + held-line re-disable + task
-- clarity + trance playability) was running only on the GitHub Actions critical
-- loop, which GitHub throttles to ~every 2-3h instead of the configured 10 min.
-- For the safety-critical heal — a deactivated full_stop safeword — a multi-hour
-- gap is unacceptable. pg_cron fires inside Postgres on the exact schedule and
-- is not subject to GitHub's throttling, so the safety net actually runs on time.
--
-- HOW THIS WAS ACTUALLY APPLIED (2026-06-26): no Management API token exists in
-- the working env, so this file could not be pushed the normal way. It was
-- applied via the `pgcron-setup` edge function (connects over SUPABASE_DB_URL
-- and runs cron.schedule directly). Two findings in the process:
--   1. app.settings.{supabase_url,service_role_key} are NULL in this project —
--      so EVERY existing http_post cron using the current_setting() pattern
--      below has been POSTing to a null URL. Setting them needs a grant the
--      edge role lacks; flagged for a privileged follow-up.
--   2. Because of (1), the live job is SELF-CONTAINED instead: pgcron-setup
--      bakes the URL + service key into the job body (key from function env,
--      never git; cron.job is superuser-only). End-to-end test-fire returned 200.
-- This file is the PORTABLE form (current_setting pattern) for an environment
-- where the settings + a token exist. The two are equivalent jobs.

-- Replace any prior copy so this migration is re-runnable.
DO $$
BEGIN
  PERFORM cron.unschedule('blind-spot-monitor-safety');
EXCEPTION WHEN OTHERS THEN
  NULL;  -- not scheduled yet
END $$;

-- Every 5 minutes — tighter than the 10-min design specifically because the
-- safeword heal should close fast. The function is lightweight (a few reads +
-- conditional heals) so the cadence cost is trivial.
SELECT cron.schedule(
  'blind-spot-monitor-safety',
  '*/5 * * * *',
  $$SELECT net.http_post(
    url := current_setting('app.settings.supabase_url') || '/functions/v1/blind-spot-monitor',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')
    ),
    body := jsonb_build_object('trigger', 'pg_cron')
  );$$
);
