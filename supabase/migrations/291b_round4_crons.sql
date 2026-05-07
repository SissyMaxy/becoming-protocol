-- 285 — Round 4 cron schedules. 2026-05-07.

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

DO $$
DECLARE
  jname TEXT;
  jid BIGINT;
BEGIN
  FOR jname IN SELECT unnest(ARRAY[
    'confession-watcher-5min',
    'ghosting-detector-daily-8am'
  ]) LOOP
    FOR jid IN SELECT jobid FROM cron.job WHERE jobname = jname LOOP
      PERFORM cron.unschedule(jid);
    END LOOP;
  END LOOP;
END $$;

-- Every 5 min — confession-watcher.
-- Offset by 1 min from response-capture (5min) to spread DB load.
SELECT cron.schedule(
  'confession-watcher-5min',
  '1-59/5 * * * *',
  $cmd$
    SELECT net.http_post(
      url := current_setting('app.settings.supabase_url', true) || '/functions/v1/confession-watcher-cron',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
      ),
      body := '{}'::jsonb
    ) AS request_id;
  $cmd$
);

-- Daily at 8am — ghosting-detector
-- (1h before voice-pitch-watcher at 7am ... actually voice is 7am, this 8am)
SELECT cron.schedule(
  'ghosting-detector-daily-8am',
  '0 8 * * *',
  $cmd$
    SELECT net.http_post(
      url := current_setting('app.settings.supabase_url', true) || '/functions/v1/ghosting-detector',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
      ),
      body := '{}'::jsonb
    ) AS request_id;
  $cmd$
);
