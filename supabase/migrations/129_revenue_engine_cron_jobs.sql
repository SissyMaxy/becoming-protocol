-- Migration 129: Revenue Engine Cron Jobs
-- Schedule the autonomous revenue engine operations via pg_cron.

-- Every 15 minutes: process AI content queue (auto-poster picks these up)
SELECT cron.schedule(
  'revenue-ai-queue',
  '*/15 * * * *',
  $$SELECT net.http_post(
    url := current_setting('app.settings.supabase_url') || '/functions/v1/handler-revenue',
    body := '{"action": "process_ai_queue"}'::jsonb,
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key'),
      'Content-Type', 'application/json'
    )
  )$$
);

-- Every 3 hours: engagement cycle
SELECT cron.schedule(
  'revenue-engagement',
  '0 */3 * * *',
  $$SELECT net.http_post(
    url := current_setting('app.settings.supabase_url') || '/functions/v1/handler-revenue',
    body := '{"action": "engagement_cycle"}'::jsonb,
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key'),
      'Content-Type', 'application/json'
    )
  )$$
);

-- Daily at midnight: content calendar + vault multiplication + GFE reset
SELECT cron.schedule(
  'revenue-daily-batch',
  '0 0 * * *',
  $$SELECT net.http_post(
    url := current_setting('app.settings.supabase_url') || '/functions/v1/handler-revenue',
    body := '{"action": "daily_batch"}'::jsonb,
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key'),
      'Content-Type', 'application/json'
    )
  )$$
);

-- Daily at 7 AM: GFE morning messages
SELECT cron.schedule(
  'revenue-gfe-morning',
  '0 7 * * *',
  $$SELECT net.http_post(
    url := current_setting('app.settings.supabase_url') || '/functions/v1/handler-revenue',
    body := '{"action": "gfe_morning"}'::jsonb,
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key'),
      'Content-Type', 'application/json'
    )
  )$$
);

-- Daily at 9 PM: GFE evening messages
SELECT cron.schedule(
  'revenue-gfe-evening',
  '0 21 * * *',
  $$SELECT net.http_post(
    url := current_setting('app.settings.supabase_url') || '/functions/v1/handler-revenue',
    body := '{"action": "gfe_evening"}'::jsonb,
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key'),
      'Content-Type', 'application/json'
    )
  )$$
);

-- Weekly Sunday at 11 PM: revenue review + erotica + affiliate content
SELECT cron.schedule(
  'revenue-weekly-batch',
  '0 23 * * 0',
  $$SELECT net.http_post(
    url := current_setting('app.settings.supabase_url') || '/functions/v1/handler-revenue',
    body := '{"action": "weekly_batch"}'::jsonb,
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key'),
      'Content-Type', 'application/json'
    )
  )$$
);
