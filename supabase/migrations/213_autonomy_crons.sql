-- Migration 213: Cron schedules for Handler autonomy (idempotent)

-- Self-audit: runs daily at 5am UTC (~midnight EST)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'handler-self-audit-daily') THEN
    PERFORM cron.unschedule('handler-self-audit-daily');
  END IF;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

SELECT cron.schedule(
  'handler-self-audit-daily',
  '0 5 * * *',
  $$SELECT net.http_post(
    url := 'https://atevwvexapiykchvqvhm.supabase.co/functions/v1/handler-self-audit',
    body := '{}'::jsonb,
    headers := jsonb_build_object(
      'Authorization', 'Bearer PLACEHOLDER_SERVICE_KEY',
      'Content-Type', 'application/json'
    )
  )$$
);

-- Outreach auto: runs hourly at :30
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'handler-outreach-auto-hourly') THEN
    PERFORM cron.unschedule('handler-outreach-auto-hourly');
  END IF;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

SELECT cron.schedule(
  'handler-outreach-auto-hourly',
  '30 * * * *',
  $$SELECT net.http_post(
    url := 'https://atevwvexapiykchvqvhm.supabase.co/functions/v1/handler-outreach-auto',
    body := '{}'::jsonb,
    headers := jsonb_build_object(
      'Authorization', 'Bearer PLACEHOLDER_SERVICE_KEY',
      'Content-Type', 'application/json'
    )
  )$$
);

NOTIFY pgrst, 'reload schema';
