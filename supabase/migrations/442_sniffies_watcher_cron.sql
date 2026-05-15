-- 442 — Schedule sniffies-inbound-watcher every 5 min.
-- Pairs with edge function `sniffies-inbound-watcher` deployed via MCP.
-- Reads new contact_events (platform=sniffies, direction=inbound), scores
-- for hookup / secret-girlfriend / cum-worship signals, queues Mama-voice
-- outreach, auto-creates secret_girlfriend_targets when score ≥ 7.

DO $do$ BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'sniffies-inbound-watcher-5min') THEN
    PERFORM cron.unschedule('sniffies-inbound-watcher-5min');
  END IF;
EXCEPTION WHEN undefined_table THEN NULL; END $do$;

DO $do$ BEGIN
  PERFORM cron.schedule('sniffies-inbound-watcher-5min', '*/5 * * * *',
    $cron$SELECT invoke_edge_function('sniffies-inbound-watcher', '{}'::jsonb)$cron$);
EXCEPTION WHEN undefined_table THEN NULL; END $do$;
