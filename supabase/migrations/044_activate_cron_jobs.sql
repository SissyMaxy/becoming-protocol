-- Migration 044: Activate pg_cron Jobs
-- Enables automated scheduling for the Handler Autonomous Enforcement System.
--
-- IMPORTANT: pg_cron and pg_net must be enabled in the Supabase Dashboard first:
--   Database > Extensions > Enable "pg_cron" and "pg_net"
--
-- Run this migration AFTER enabling the extensions in the dashboard.

-- ============================================
-- ENABLE EXTENSIONS (idempotent)
-- ============================================
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- ============================================
-- GRANT pg_cron USAGE
-- ============================================
GRANT USAGE ON SCHEMA cron TO postgres;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA cron TO postgres;

-- ============================================
-- HELPER: HTTP caller for edge functions
-- Uses pg_net to invoke Supabase edge functions
-- ============================================

-- Generic edge function invoker
CREATE OR REPLACE FUNCTION invoke_edge_function(
  p_function_name TEXT,
  p_body JSONB DEFAULT '{}'::JSONB
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_url TEXT;
  v_service_key TEXT;
BEGIN
  -- Build the URL from project config
  v_url := current_setting('app.settings.supabase_url', true)
    || '/functions/v1/' || p_function_name;

  -- If app.settings not available, use hardcoded project URL
  IF v_url IS NULL OR v_url = '/functions/v1/' || p_function_name THEN
    v_url := 'https://atevwvexapiykchvqvhm.supabase.co/functions/v1/' || p_function_name;
  END IF;

  v_service_key := current_setting('app.settings.service_role_key', true);

  -- Use pg_net to make async HTTP POST
  PERFORM net.http_post(
    url := v_url,
    body := p_body::TEXT,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || COALESCE(v_service_key, '')
    )
  );
END;
$$;

-- ============================================
-- CRON JOB 1: Daily Plan Generation (4am UTC / 11pm EST)
-- Queues daily plan tasks for all active users
-- ============================================
SELECT cron.schedule(
  'handler-daily-plan-generation',
  '0 4 * * *',
  $$SELECT trigger_daily_plan_generation()$$
);

-- ============================================
-- CRON JOB 2: Process Pending Tasks (every 15 min)
-- Invokes handler-task-processor to clear the queue
-- ============================================
SELECT cron.schedule(
  'handler-task-processor-run',
  '*/15 * * * *',
  $$SELECT invoke_edge_function('handler-task-processor')$$
);

-- ============================================
-- CRON JOB 3: Morning Enforcement (12pm UTC / 7am EST)
-- Morning compliance check and daily initiation
-- ============================================
SELECT cron.schedule(
  'handler-morning-enforcement',
  '0 12 * * *',
  $$SELECT trigger_enforcement_run('morning_enforcement')$$
);

-- ============================================
-- CRON JOB 4: Evening Enforcement (2am UTC / 9pm EST)
-- Evening compliance review, escalation, and narration
-- ============================================
SELECT cron.schedule(
  'handler-evening-enforcement',
  '0 2 * * *',
  $$SELECT trigger_enforcement_run('evening_enforcement')$$
);

-- ============================================
-- CRON JOB 5: Weekly Pattern Analysis (Sundays 3am UTC)
-- Queues pattern analysis for all active users
-- ============================================
SELECT cron.schedule(
  'handler-weekly-analysis',
  '0 3 * * 0',
  $$
  INSERT INTO handler_pending_tasks (user_id, task_type, status, created_at)
  SELECT DISTINCT user_id, 'analyze_patterns', 'pending', NOW()
  FROM enforcement_config
  WHERE enabled = true
  ON CONFLICT (user_id, task_type)
  WHERE status = 'pending'
  DO NOTHING
  $$
);

-- ============================================
-- CRON JOB 6: Task Cleanup (5am UTC daily)
-- Clean up old completed/failed tasks
-- ============================================
SELECT cron.schedule(
  'handler-task-cleanup',
  '0 5 * * *',
  $$SELECT cleanup_old_handler_tasks()$$
);

-- ============================================
-- CRON JOB 7: Process Enforcement Queue (every 15 min, offset)
-- Invokes handler-enforcement to process queued enforcement tasks
-- ============================================
SELECT cron.schedule(
  'handler-enforcement-processor',
  '7,22,37,52 * * * *',
  $$SELECT invoke_edge_function('handler-enforcement')$$
);

-- ============================================
-- VERIFY CRON JOBS
-- ============================================
-- Run this to check all scheduled jobs:
-- SELECT * FROM cron.job ORDER BY jobname;
