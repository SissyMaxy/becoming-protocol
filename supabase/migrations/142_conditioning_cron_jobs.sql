-- Migration 142: Conditioning Engine Cron Jobs
-- Requires pg_cron and pg_net extensions enabled in Supabase dashboard.

-- ============================================
-- 1. Weekly Hidden Parameter Increment
--    Sundays at midnight UTC
-- ============================================
SELECT cron.schedule(
  'weekly-hidden-increment',
  '0 0 * * 0',
  $$SELECT net.http_post(
    url := current_setting('app.settings.supabase_url') || '/functions/v1/conditioning-engine',
    body := '{"action": "increment_hidden_parameters"}'::jsonb,
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key'),
      'Content-Type', 'application/json'
    )
  )$$
);

-- ============================================
-- 2. Weekly Script Generation
--    Mondays at 3 AM UTC
-- ============================================
SELECT cron.schedule(
  'weekly-script-generation',
  '0 3 * * 1',
  $$SELECT net.http_post(
    url := current_setting('app.settings.supabase_url') || '/functions/v1/conditioning-engine',
    body := '{"action": "generate_weekly_scripts"}'::jsonb,
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key'),
      'Content-Type', 'application/json'
    )
  )$$
);

-- ============================================
-- 3. Nightly Sleep Prescription
--    Daily at 10 PM UTC
-- ============================================
SELECT cron.schedule(
  'nightly-sleep-prescription',
  '0 22 * * *',
  $$SELECT net.http_post(
    url := current_setting('app.settings.supabase_url') || '/functions/v1/conditioning-engine',
    body := '{"action": "prescribe_sleep_content"}'::jsonb,
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key'),
      'Content-Type', 'application/json'
    )
  )$$
);

-- ============================================
-- 4. Daily Post-Hypnotic Check
--    Daily at 9 PM UTC
-- ============================================
SELECT cron.schedule(
  'daily-posthypnotic-check',
  '0 21 * * *',
  $$SELECT net.http_post(
    url := current_setting('app.settings.supabase_url') || '/functions/v1/conditioning-engine',
    body := '{"action": "check_posthypnotic_activations"}'::jsonb,
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key'),
      'Content-Type', 'application/json'
    )
  )$$
);
