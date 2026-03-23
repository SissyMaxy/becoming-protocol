-- Migration 130: Proactive Outreach Cron Job
-- Runs every 30 minutes. Evaluates outreach triggers for all active users.
-- If triggered, queues outreach + push notification.

SELECT cron.schedule(
  'handler-outreach-eval',
  '*/30 * * * *',
  $$SELECT net.http_post(
    url := current_setting('app.settings.supabase_url') || '/functions/v1/handler-outreach',
    body := '{"action": "evaluate_outreach"}'::jsonb,
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key'),
      'Content-Type', 'application/json'
    )
  )$$
);
