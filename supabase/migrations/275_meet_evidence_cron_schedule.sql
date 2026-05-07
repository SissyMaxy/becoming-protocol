-- 275 — Schedule meet-evidence-cron to run every 15 minutes.
--
-- Closes the loop on user wish #4 (meet evidence).
--
-- pg_cron + pg_net pattern: schedule a cron job that POSTs to the
-- meet-evidence-cron edge function. The function reads hookup_funnel for
-- meets whose 1-hour-after window has passed and fires evidence-capture
-- decrees via mommy-fast-react.

-- Ensure both extensions are present (no-op if already enabled).
-- Wrapped in DO blocks because Supabase pg_cron / pg_net may have prior
-- grants that fail re-creation with SQLSTATE 2BP01 even on IF NOT EXISTS.
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

-- Idempotent: unschedule any prior version of this job before re-creating
DO $$
DECLARE
  jid BIGINT;
BEGIN
  FOR jid IN SELECT jobid FROM cron.job WHERE jobname = 'meet-evidence-cron-15min' LOOP
    PERFORM cron.unschedule(jid);
  END LOOP;
END $$;

SELECT cron.schedule(
  'meet-evidence-cron-15min',
  '*/15 * * * *',
  $cmd$
    SELECT net.http_post(
      url := current_setting('app.settings.supabase_url', true) || '/functions/v1/meet-evidence-cron',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
      ),
      body := '{}'::jsonb
    ) AS request_id;
  $cmd$
);

-- Note: app.settings.supabase_url + app.settings.service_role_key must be
-- set on the database (via `ALTER DATABASE postgres SET app.settings.* = ...`)
-- in the Supabase dashboard or CLI. If they are missing, the cron job will
-- fail silently — which is fine; the function can also be invoked manually
-- via the Supabase function URL.
