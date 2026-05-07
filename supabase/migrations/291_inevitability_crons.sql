-- 291 — Cron schedules for the inevitability tier. 2026-05-07.

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
    'bind-enforcer-hourly',
    'transition-tracking-prompter-daily-8am30',
    'counter-escape-detector-hourly'
  ]) LOOP
    FOR jid IN SELECT jobid FROM cron.job WHERE jobname = jname LOOP
      PERFORM cron.unschedule(jid);
    END LOOP;
  END LOOP;
END $$;

-- Hourly — bind-enforcer
SELECT cron.schedule(
  'bind-enforcer-hourly',
  '12 * * * *',  -- :12 each hour, off-cycle from other crons
  $cmd$
    SELECT net.http_post(
      url := current_setting('app.settings.supabase_url', true) || '/functions/v1/bind-enforcer-cron',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
      ),
      body := '{}'::jsonb
    ) AS request_id;
  $cmd$
);

-- Daily 8:30am — transition-tracking-prompter
SELECT cron.schedule(
  'transition-tracking-prompter-daily-8am30',
  '30 8 * * *',
  $cmd$
    SELECT net.http_post(
      url := current_setting('app.settings.supabase_url', true) || '/functions/v1/transition-tracking-prompter',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
      ),
      body := '{}'::jsonb
    ) AS request_id;
  $cmd$
);

-- Hourly — counter-escape-detector
SELECT cron.schedule(
  'counter-escape-detector-hourly',
  '23 * * * *',  -- :23 each hour, off-cycle
  $cmd$
    SELECT net.http_post(
      url := current_setting('app.settings.supabase_url', true) || '/functions/v1/counter-escape-detector',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
      ),
      body := '{}'::jsonb
    ) AS request_id;
  $cmd$
);
