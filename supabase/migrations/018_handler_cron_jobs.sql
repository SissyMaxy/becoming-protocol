-- Migration 018: Handler AI Cron Jobs
-- Automated daily plan generation and maintenance tasks

-- ============================================
-- ENABLE PG_CRON EXTENSION (if not already enabled)
-- ============================================
-- Note: pg_cron must be enabled in the Supabase dashboard under Database > Extensions

-- ============================================
-- DAILY PLAN GENERATION CRON JOB
-- Runs at 4am daily to generate Handler AI plans for all active users
-- ============================================

-- Create a function to generate daily plans for all users
CREATE OR REPLACE FUNCTION trigger_daily_plan_generation()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  user_record RECORD;
BEGIN
  -- Loop through all users who have been active in the last 30 days
  FOR user_record IN
    SELECT DISTINCT user_id
    FROM state_logs
    WHERE logged_at > NOW() - INTERVAL '30 days'
  LOOP
    -- Insert a task to generate daily plan (will be picked up by edge function)
    INSERT INTO handler_pending_tasks (user_id, task_type, status, created_at)
    VALUES (user_record.user_id, 'generate_daily_plan', 'pending', NOW())
    ON CONFLICT (user_id, task_type)
    WHERE status = 'pending'
    DO NOTHING;
  END LOOP;
END;
$$;

-- ============================================
-- HANDLER PENDING TASKS TABLE
-- Queue for async Handler AI tasks
-- ============================================
CREATE TABLE IF NOT EXISTS handler_pending_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  task_type TEXT NOT NULL, -- generate_daily_plan, analyze_patterns, etc.
  status TEXT DEFAULT 'pending', -- pending, processing, completed, failed
  payload JSONB DEFAULT '{}',
  result JSONB,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  UNIQUE(user_id, task_type) -- Only one pending task per user per type
);

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================
ALTER TABLE handler_pending_tasks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users access own pending tasks" ON handler_pending_tasks;
CREATE POLICY "Users access own pending tasks" ON handler_pending_tasks
  FOR ALL USING (auth.uid() = user_id);

-- Service role can access all
DROP POLICY IF EXISTS "Service role full access" ON handler_pending_tasks;
CREATE POLICY "Service role full access" ON handler_pending_tasks
  FOR ALL USING (auth.role() = 'service_role');

-- ============================================
-- INDEXES
-- ============================================
CREATE INDEX IF NOT EXISTS idx_handler_pending_tasks_user_id ON handler_pending_tasks(user_id);
CREATE INDEX IF NOT EXISTS idx_handler_pending_tasks_status ON handler_pending_tasks(status);
CREATE INDEX IF NOT EXISTS idx_handler_pending_tasks_pending ON handler_pending_tasks(user_id, task_type) WHERE status = 'pending';

-- ============================================
-- CRON JOBS (requires pg_cron extension)
-- ============================================

-- Schedule daily plan generation at 4am UTC
-- Note: Run this manually in SQL Editor if cron extension is enabled:
-- SELECT cron.schedule(
--   'handler-daily-plan-generation',
--   '0 4 * * *',
--   $$SELECT trigger_daily_plan_generation()$$
-- );

-- Schedule weekly pattern analysis on Sundays at 3am UTC
-- SELECT cron.schedule(
--   'handler-weekly-analysis',
--   '0 3 * * 0',
--   $$
--   INSERT INTO handler_pending_tasks (user_id, task_type, status, created_at)
--   SELECT DISTINCT user_id, 'analyze_patterns', 'pending', NOW()
--   FROM state_logs
--   WHERE logged_at > NOW() - INTERVAL '30 days'
--   ON CONFLICT (user_id, task_type)
--   WHERE status = 'pending'
--   DO NOTHING
--   $$
-- );

-- ============================================
-- CLEANUP OLD TASKS
-- Keep completed tasks for 7 days
-- ============================================
CREATE OR REPLACE FUNCTION cleanup_old_handler_tasks()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  DELETE FROM handler_pending_tasks
  WHERE status IN ('completed', 'failed')
  AND completed_at < NOW() - INTERVAL '7 days';
END;
$$;

-- Schedule cleanup daily at 5am UTC
-- SELECT cron.schedule(
--   'handler-task-cleanup',
--   '0 5 * * *',
--   $$SELECT cleanup_old_handler_tasks()$$
-- );

-- ============================================
-- TRIGGER: Auto-update timestamps
-- ============================================
CREATE OR REPLACE FUNCTION update_handler_task_status()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'processing' AND OLD.status = 'pending' THEN
    NEW.started_at = NOW();
  ELSIF NEW.status IN ('completed', 'failed') AND OLD.status != NEW.status THEN
    NEW.completed_at = NOW();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS handler_task_status_update ON handler_pending_tasks;
CREATE TRIGGER handler_task_status_update
  BEFORE UPDATE ON handler_pending_tasks
  FOR EACH ROW EXECUTE FUNCTION update_handler_task_status();
