-- 412 — Register sniffies-restart-coach daily cron.
--
-- Runs the restart-coach across all users with master_enabled hookup
-- coaching at 17:13 UTC (≈12:13 PM CST, before the usual chat-active
-- window). Per-run cap of 5 drafts/user keeps the nag rate manageable.

DO $do$ BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'sniffies-restart-coach-daily') THEN
    PERFORM cron.unschedule('sniffies-restart-coach-daily');
  END IF;
EXCEPTION WHEN undefined_table THEN NULL;
END $do$;

DO $do$ BEGIN
  PERFORM cron.schedule(
    'sniffies-restart-coach-daily',
    '13 17 * * *',
    $cron$SELECT invoke_edge_function('sniffies-restart-coach', '{}'::jsonb)$cron$
  );
EXCEPTION WHEN undefined_table THEN NULL;
END $do$;
