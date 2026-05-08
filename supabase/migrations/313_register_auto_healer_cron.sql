-- 313 — Register auto-healer + deploy-health-monitor crons in source control.
--
-- Why: 246 noted "auto-healer cron + edge function shipped separately
-- (deployed via API)". That meant the cron was created via the Supabase
-- dashboard but never tracked in a migration. If the project is rebuilt
-- from migrations alone, both functions stop firing — and there's no way
-- to audit whether they're currently scheduled.
--
-- Both jobs run every 10 minutes:
--   - deploy-health-monitor — polls GitHub Actions / Vercel / Supabase logs
--     and writes failure rows to deploy_health_log
--   - auto-healer — sweeps invariant drift, orphan rows, and (after this
--     branch's function patch) auto-closes resolved github_actions failures
--     and escalates rows that have been open too long
--
-- Idempotent: if either jobname already exists it's unscheduled before
-- being re-registered, so this can run on top of the live state.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    CREATE EXTENSION pg_cron;
  END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net') THEN
    CREATE EXTENSION pg_net;
  END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- ---------- auto-healer-10min ----------
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'auto-healer-10min') THEN
    PERFORM cron.unschedule('auto-healer-10min');
  END IF;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$ BEGIN
  PERFORM cron.schedule(
    'auto-healer-10min',
    '*/10 * * * *',
    $cron$SELECT invoke_edge_function('auto-healer', '{}'::jsonb)$cron$
  );
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

-- ---------- deploy-health-monitor-10min ----------
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'deploy-health-monitor-10min') THEN
    PERFORM cron.unschedule('deploy-health-monitor-10min');
  END IF;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$ BEGIN
  PERFORM cron.schedule(
    'deploy-health-monitor-10min',
    '*/10 * * * *',
    $cron$SELECT invoke_edge_function('deploy-health-monitor', '{}'::jsonb)$cron$
  );
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

NOTIFY pgrst, 'reload schema';
