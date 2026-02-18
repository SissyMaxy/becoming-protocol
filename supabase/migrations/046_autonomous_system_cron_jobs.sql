-- Migration 046: Handler Autonomous System — Cron Jobs
-- Adds cron jobs for the autonomous content/compliance/financial system.
-- Depends on: 044 (pg_cron + invoke_edge_function), 045 (autonomous system tables)
--
-- Architecture:
--   handler-autonomous edge function handles all actions via `action` parameter.
--   pg_cron invokes it at different intervals for different actions.

-- ============================================
-- CRON JOB: Compliance Check (every 5 minutes)
-- Checks engagement, updates escalation tiers, executes enforcement.
-- ============================================
SELECT cron.schedule(
  'autonomous-compliance-check',
  '*/5 * * * *',
  $$SELECT invoke_edge_function('handler-autonomous', '{"action":"compliance_check"}'::jsonb)$$
);

-- ============================================
-- CRON JOB: Execute Scheduled Posts (every 5 minutes)
-- Posts content to platforms when scheduled_for time is reached.
-- ============================================
SELECT cron.schedule(
  'autonomous-execute-posts',
  '2,7,12,17,22,27,32,37,42,47,52,57 * * * *',
  $$SELECT invoke_edge_function('handler-platform', '{"action":"execute_posts"}'::jsonb)$$
);

-- ============================================
-- CRON JOB: Quick Task Check (every 15 minutes)
-- Generates quick tasks for idle users as positive nudges.
-- ============================================
SELECT cron.schedule(
  'autonomous-quick-task-check',
  '*/15 * * * *',
  $$SELECT invoke_edge_function('handler-autonomous', '{"action":"quick_task_check"}'::jsonb)$$
);

-- ============================================
-- CRON JOB: Daily Cycle (6 AM EST = 11 AM UTC)
-- Morning routine: reset counters, expire old briefs, generate new briefs.
-- ============================================
SELECT cron.schedule(
  'autonomous-daily-cycle',
  '0 11 * * *',
  $$SELECT invoke_edge_function('handler-autonomous', '{"action":"daily_cycle"}'::jsonb)$$
);

-- ============================================
-- CRON JOB: Financial Bleeding (every hour)
-- Processes ongoing financial penalties for noncompliant users.
-- ============================================
SELECT cron.schedule(
  'autonomous-bleeding-process',
  '0 * * * *',
  $$SELECT invoke_edge_function('handler-autonomous', '{"action":"bleeding_process"}'::jsonb)$$
);

-- ============================================
-- CRON JOB: Hourly Analytics Sync
-- Syncs engagement data and revenue from platform accounts.
-- ============================================
SELECT cron.schedule(
  'autonomous-hourly-analytics',
  '30 * * * *',
  $$SELECT invoke_edge_function('handler-autonomous', '{"action":"hourly_analytics"}'::jsonb)$$
);

-- ============================================
-- CRON JOB: Weekly Adaptation (Sunday 3 AM EST = 8 AM UTC)
-- Full pattern analysis, strategy update, content calendar refresh.
-- ============================================
SELECT cron.schedule(
  'autonomous-weekly-adaptation',
  '0 8 * * 0',
  $$SELECT invoke_edge_function('handler-autonomous', '{"action":"weekly_adaptation"}'::jsonb)$$
);

-- ============================================
-- VERIFY ALL AUTONOMOUS CRON JOBS
-- ============================================
-- Run this to see all jobs:
-- SELECT jobname, schedule, command FROM cron.job WHERE jobname LIKE 'autonomous-%' ORDER BY jobname;
