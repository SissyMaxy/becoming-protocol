-- 282 — Schedules for voice-pitch-watcher and slip-cluster-detector.
-- 2026-05-07.

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
    'voice-pitch-watcher-daily-7am',
    'slip-cluster-detector-10min'
  ]) LOOP
    FOR jid IN SELECT jobid FROM cron.job WHERE jobname = jname LOOP
      PERFORM cron.unschedule(jid);
    END LOOP;
  END LOOP;
END $$;

-- Daily at 7am — voice-pitch-watcher
SELECT cron.schedule(
  'voice-pitch-watcher-daily-7am',
  '0 7 * * *',
  $cmd$
    SELECT net.http_post(
      url := current_setting('app.settings.supabase_url', true) || '/functions/v1/voice-pitch-watcher',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
      ),
      body := '{}'::jsonb
    ) AS request_id;
  $cmd$
);

-- Every 10 min — slip-cluster-detector
-- Offset by 4 min from response-capture (5min) and surface-guarantor (5min,
-- offset 2) so the three cron-driven loads don't collide at the same minute.
SELECT cron.schedule(
  'slip-cluster-detector-10min',
  '4-59/10 * * * *',
  $cmd$
    SELECT net.http_post(
      url := current_setting('app.settings.supabase_url', true) || '/functions/v1/slip-cluster-detector',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
      ),
      body := '{}'::jsonb
    ) AS request_id;
  $cmd$
);
