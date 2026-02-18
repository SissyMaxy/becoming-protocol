-- Becoming Protocol - Cron Job Setup
-- Run this in Supabase SQL Editor after enabling pg_cron extension
-- Replace YOUR_PROJECT_REF and YOUR_SERVICE_ROLE_KEY with actual values

-- ============================================
-- HANDLER CRON JOBS
-- ============================================

-- 1. Daily Plan Generation (4am UTC daily)
-- Triggers daily plan generation for all active users
SELECT cron.schedule(
  'handler-daily-plan-generation',
  '0 4 * * *',
  $$SELECT trigger_daily_plan_generation()$$
);

-- 2. Weekly Pattern Analysis (3am Sunday UTC)
-- Analyzes user patterns to improve Handler effectiveness
SELECT cron.schedule(
  'handler-weekly-analysis',
  '0 3 * * 0',
  $$
  INSERT INTO handler_pending_tasks (user_id, task_type, status, created_at)
  SELECT DISTINCT user_id, 'analyze_patterns', 'pending', NOW()
  FROM state_logs
  WHERE logged_at > NOW() - INTERVAL '30 days'
  ON CONFLICT (user_id, task_type)
  WHERE status = 'pending'
  DO NOTHING
  $$
);

-- 3. Task Cleanup (5am UTC daily)
-- Removes completed/failed tasks older than 7 days
SELECT cron.schedule(
  'handler-task-cleanup',
  '0 5 * * *',
  $$SELECT cleanup_old_handler_tasks()$$
);

-- 4. Task Processor (every 5 minutes)
-- Processes pending Handler AI tasks
-- NOTE: Replace YOUR_PROJECT_REF and YOUR_SERVICE_ROLE_KEY
/*
SELECT cron.schedule(
  'handler-task-processor',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/handler-task-processor',
    headers := '{"Authorization": "Bearer YOUR_SERVICE_ROLE_KEY", "Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  )
  $$
);
*/

-- ============================================
-- NOTIFICATION CRON JOBS
-- ============================================

-- 5. Schedule Notifications (every 6 hours)
-- Schedules random notifications for users
/*
SELECT cron.schedule(
  'schedule-notifications',
  '0 */6 * * *',
  $$
  SELECT net.http_post(
    url := 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/schedule-notifications',
    headers := '{"Authorization": "Bearer YOUR_SERVICE_ROLE_KEY", "Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  )
  $$
);
*/

-- 6. Send Notifications (every minute)
-- Sends any pending notifications that are due
/*
SELECT cron.schedule(
  'send-notifications',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/send-notifications',
    headers := '{"Authorization": "Bearer YOUR_SERVICE_ROLE_KEY", "Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  )
  $$
);
*/

-- ============================================
-- VERIFICATION
-- ============================================

-- List all scheduled jobs
SELECT jobid, jobname, schedule, command
FROM cron.job
ORDER BY jobname;

-- ============================================
-- MANAGEMENT COMMANDS (for reference)
-- ============================================

-- Unschedule a job:
-- SELECT cron.unschedule('handler-daily-plan-generation');

-- View job run history:
-- SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 20;

-- Manually trigger a job:
-- SELECT trigger_daily_plan_generation();
