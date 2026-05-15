-- 433 — Schedule mama-confession-processor edge function every 5 min.
-- Pairs with migration 432 (mama_confessions schema). Edge function
-- transcribes pending audio + queues Mama-voice reply outreach.

DO $do$ BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'mama-confession-processor-5min') THEN
    PERFORM cron.unschedule('mama-confession-processor-5min');
  END IF;
EXCEPTION WHEN undefined_table THEN NULL;
END $do$;

DO $do$ BEGIN
  PERFORM cron.schedule(
    'mama-confession-processor-5min',
    '*/5 * * * *',
    $cron$SELECT invoke_edge_function('mama-confession-processor', '{}'::jsonb)$cron$
  );
EXCEPTION WHEN undefined_table THEN NULL;
END $do$;
