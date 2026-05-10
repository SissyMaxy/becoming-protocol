-- 315 — Register pg_cron job for the deploy-fixer edge function.
--
-- Two paths are wired:
--   (a) AFTER INSERT trigger on deploy_health_log (migration 314) —
--       fast path, fires within seconds of a new failure being detected.
--   (b) pg_cron every 10min (this migration) — backstop. Catches:
--         - rows whose trigger fired before the edge fn was deployed
--         - rows the trigger silently dropped (pg_net failures)
--         - rollback automation, which only the cron path checks
--           (the trigger path passes a single health_log_id, so it
--           never has the multi-row context needed for rollback)
--
-- Idempotent: unschedules an existing job of the same name first so
-- this migration can run on top of live state.

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

-- ---------- deploy-fixer-10min ----------
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'deploy-fixer-10min') THEN
    PERFORM cron.unschedule('deploy-fixer-10min');
  END IF;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$ BEGIN
  PERFORM cron.schedule(
    'deploy-fixer-10min',
    '*/10 * * * *',
    $cron$SELECT invoke_edge_function('deploy-fixer', '{}'::jsonb)$cron$
  );
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

NOTIFY pgrst, 'reload schema';
