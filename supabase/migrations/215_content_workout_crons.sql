-- Migration 215: Crons for content generator + workout prescriber (idempotent)
-- Content generates at 3am UTC (10pm EST) for the next day.
-- Workout prescribes at 11am UTC (6am EST) for today.

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'content-generator-daily') THEN
    PERFORM cron.unschedule('content-generator-daily');
  END IF;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

SELECT cron.schedule(
  'content-generator-daily',
  '0 3 * * *',
  $$SELECT net.http_post(
    url := 'https://atevwvexapiykchvqvhm.supabase.co/functions/v1/content-generator',
    body := '{}'::jsonb,
    headers := jsonb_build_object(
      'Authorization', 'Bearer PLACEHOLDER_SERVICE_KEY',
      'Content-Type', 'application/json'
    )
  )$$
);

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'workout-prescriber-daily') THEN
    PERFORM cron.unschedule('workout-prescriber-daily');
  END IF;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

SELECT cron.schedule(
  'workout-prescriber-daily',
  '0 11 * * *',
  $$SELECT net.http_post(
    url := 'https://atevwvexapiykchvqvhm.supabase.co/functions/v1/workout-prescriber',
    body := '{}'::jsonb,
    headers := jsonb_build_object(
      'Authorization', 'Bearer PLACEHOLDER_SERVICE_KEY',
      'Content-Type', 'application/json'
    )
  )$$
);

NOTIFY pgrst, 'reload schema';
