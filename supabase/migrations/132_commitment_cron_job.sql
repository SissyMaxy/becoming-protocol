-- Migration 132: Commitment State Machine Cron Job
-- Runs every hour. Advances commitment states through the enforcement pipeline.
-- Queues outreach + push notifications when commitments go overdue.

SELECT cron.schedule(
  'handler-commitment-enforce',
  '0 * * * *',
  $$SELECT net.http_post(
    url := current_setting('app.settings.supabase_url') || '/functions/v1/handler-commitment',
    body := '{"action": "advance_states"}'::jsonb,
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key'),
      'Content-Type', 'application/json'
    )
  )$$
);
