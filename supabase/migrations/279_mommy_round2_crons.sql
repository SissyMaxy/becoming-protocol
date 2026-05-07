-- 279 — Cron schedules for the round-2 builds.
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

-- Idempotent unschedule helper
DO $$
DECLARE
  jname TEXT;
  jid BIGINT;
BEGIN
  FOR jname IN SELECT unnest(ARRAY[
    'response-capture-5min',
    'surface-guarantor-5min',
    'mommy-ambient-15min',
    'hrt-booking-daily-9am'
  ]) LOOP
    FOR jid IN SELECT jobid FROM cron.job WHERE jobname = jname LOOP
      PERFORM cron.unschedule(jid);
    END LOOP;
  END LOOP;
END $$;

-- response-capture: every 5 min, polls handler_outreach_queue for replies
SELECT cron.schedule(
  'response-capture-5min',
  '*/5 * * * *',
  $cmd$
    SELECT net.http_post(
      url := current_setting('app.settings.supabase_url', true) || '/functions/v1/response-capture-cron',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
      ),
      body := '{}'::jsonb
    ) AS request_id;
  $cmd$
);

-- surface-guarantor: every 5 min, enforces visible-before-penalized
-- (offset by 2 min from response-capture to spread DB load)
SELECT cron.schedule(
  'surface-guarantor-5min',
  '2-59/5 * * * *',
  $cmd$
    SELECT net.http_post(
      url := current_setting('app.settings.supabase_url', true) || '/functions/v1/surface-guarantor-cron',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
      ),
      body := '{}'::jsonb
    ) AS request_id;
  $cmd$
);

-- ambient_check: every 15 min, fires mommy-fast-react with no specific event;
-- model decides if a moment is open. Source key includes ISO date+hour-quarter
-- for natural per-tick dedup.
SELECT cron.schedule(
  'mommy-ambient-15min',
  '*/15 * * * *',
  $cmd$
    SELECT net.http_post(
      url := current_setting('app.settings.supabase_url', true) || '/functions/v1/mommy-fast-react',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
      ),
      body := jsonb_build_object(
        'event_kind', 'ambient_check',
        'source_key', 'ambient:' || to_char(now(), 'YYYY-MM-DD"T"HH24":"') || lpad((extract(minute from now())::int / 15 * 15)::text, 2, '0'),
        'context', jsonb_build_object('cron_tick_at', now())
      )
    ) AS request_id;
  $cmd$
);

-- hrt-booking-worker: daily at 9am — checks each known user for an HRT
-- push opportunity (recent confession mentioning HRT, meet evidence, Gina
-- shifted toward, resonant denial day, or 14d silent period).
SELECT cron.schedule(
  'hrt-booking-daily-9am',
  '0 9 * * *',
  $cmd$
    SELECT net.http_post(
      url := current_setting('app.settings.supabase_url', true) || '/functions/v1/hrt-booking-worker',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
      ),
      body := '{}'::jsonb
    ) AS request_id;
  $cmd$
);
