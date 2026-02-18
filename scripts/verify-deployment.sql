-- Becoming Protocol - Deployment Verification
-- Run this in Supabase SQL Editor to check deployment status

-- ============================================
-- TABLE VERIFICATION
-- ============================================

SELECT 'Handler Tables' as category, table_name,
  CASE WHEN table_name IS NOT NULL THEN 'OK' ELSE 'MISSING' END as status
FROM information_schema.tables
WHERE table_schema = 'public'
AND table_name IN (
  'handler_strategies',
  'handler_daily_plans',
  'handler_user_model',
  'handler_escalation_plans',
  'handler_experiments',
  'handler_ai_logs',
  'handler_pending_tasks',
  'planted_triggers',
  'learned_vulnerabilities',
  'influence_attempts',
  'resistance_patterns'
)
ORDER BY table_name;

-- ============================================
-- LOVENSE TABLES
-- ============================================

SELECT 'Lovense Tables' as category, table_name,
  CASE WHEN table_name IS NOT NULL THEN 'OK' ELSE 'MISSING' END as status
FROM information_schema.tables
WHERE table_schema = 'public'
AND table_name IN (
  'lovense_connections',
  'lovense_devices',
  'lovense_commands',
  'haptic_patterns'
)
ORDER BY table_name;

-- ============================================
-- FUNCTION VERIFICATION
-- ============================================

SELECT 'Functions' as category, routine_name as name,
  'OK' as status
FROM information_schema.routines
WHERE routine_schema = 'public'
AND routine_name IN (
  'trigger_daily_plan_generation',
  'cleanup_old_handler_tasks',
  'can_use_haptics'
)
ORDER BY routine_name;

-- ============================================
-- CRON JOB VERIFICATION
-- ============================================

SELECT 'Cron Jobs' as category, jobname as name,
  schedule,
  CASE WHEN active THEN 'ACTIVE' ELSE 'INACTIVE' END as status
FROM cron.job
WHERE jobname LIKE 'handler%'
   OR jobname LIKE 'schedule%'
   OR jobname LIKE 'send%'
ORDER BY jobname;

-- ============================================
-- RECENT ACTIVITY CHECK
-- ============================================

-- Handler AI Logs (last 24h)
SELECT 'Handler AI Calls (24h)' as metric, COUNT(*) as count
FROM handler_ai_logs
WHERE created_at > NOW() - INTERVAL '24 hours';

-- Pending Tasks
SELECT 'Pending Tasks' as metric, COUNT(*) as count
FROM handler_pending_tasks
WHERE status = 'pending';

-- Failed Tasks (last 24h)
SELECT 'Failed Tasks (24h)' as metric, COUNT(*) as count
FROM handler_pending_tasks
WHERE status = 'failed'
AND completed_at > NOW() - INTERVAL '24 hours';

-- Lovense Commands (last 24h)
SELECT 'Lovense Commands (24h)' as metric, COUNT(*) as count
FROM lovense_commands
WHERE created_at > NOW() - INTERVAL '24 hours';

-- Active Users (last 7d)
SELECT 'Active Users (7d)' as metric, COUNT(DISTINCT user_id) as count
FROM state_logs
WHERE logged_at > NOW() - INTERVAL '7 days';

-- ============================================
-- SUMMARY
-- ============================================

SELECT
  'Deployment Status' as report,
  (SELECT COUNT(*) FROM information_schema.tables
   WHERE table_schema = 'public' AND table_name LIKE 'handler%') as handler_tables,
  (SELECT COUNT(*) FROM information_schema.tables
   WHERE table_schema = 'public' AND table_name LIKE 'lovense%') as lovense_tables,
  (SELECT COUNT(*) FROM cron.job WHERE jobname LIKE 'handler%') as cron_jobs,
  (SELECT COUNT(*) FROM handler_ai_logs
   WHERE created_at > NOW() - INTERVAL '24 hours') as ai_calls_24h;
