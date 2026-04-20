-- Migration 208: Cron schedule for force-processor edge function (idempotent)

-- Unschedule existing (if any) before re-scheduling so re-runs don't duplicate.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'force-processor-5min') THEN
    PERFORM cron.unschedule('force-processor-5min');
  END IF;
EXCEPTION WHEN undefined_table THEN
  -- cron.job table doesn't exist yet; pg_cron not installed. Skip.
  NULL;
END $$;

SELECT cron.schedule(
  'force-processor-5min',
  '*/5 * * * *',
  $$SELECT net.http_post(
    url := current_setting('app.settings.supabase_url') || '/functions/v1/force-processor',
    body := '{}'::jsonb,
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key'),
      'Content-Type', 'application/json'
    )
  )$$
);

NOTIFY pgrst, 'reload schema';
