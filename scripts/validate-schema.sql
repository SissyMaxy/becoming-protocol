-- Phase A Schema Validation Script
-- Run this in Supabase SQL Editor to validate v2 schema

-- ============================================
-- A1.1 - Profile Tables Exist
-- ============================================
DO $$
DECLARE
  missing_tables TEXT := '';
  missing_columns TEXT := '';
BEGIN
  -- Check profile_foundation
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'profile_foundation') THEN
    missing_tables := missing_tables || 'profile_foundation, ';
  ELSE
    -- Check required columns
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profile_foundation' AND column_name = 'difficulty_level') THEN
      missing_columns := missing_columns || 'profile_foundation.difficulty_level, ';
    END IF;
  END IF;

  -- Check profile_history
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'profile_history') THEN
    missing_tables := missing_tables || 'profile_history, ';
  END IF;

  -- Check profile_arousal
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'profile_arousal') THEN
    missing_tables := missing_tables || 'profile_arousal, ';
  END IF;

  IF missing_tables != '' THEN
    RAISE NOTICE 'A1.1 FAIL - Missing tables: %', missing_tables;
  ELSIF missing_columns != '' THEN
    RAISE NOTICE 'A1.1 PARTIAL - Missing columns: %', missing_columns;
  ELSE
    RAISE NOTICE 'A1.1 PASS - All profile tables exist with required columns';
  END IF;
END $$;

-- ============================================
-- A1.2 - State Tracking Tables Exist
-- ============================================
DO $$
DECLARE
  missing_tables TEXT := '';
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'user_state') THEN
    missing_tables := missing_tables || 'user_state, ';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'state_history') THEN
    missing_tables := missing_tables || 'state_history, ';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'mood_checkins') THEN
    missing_tables := missing_tables || 'mood_checkins, ';
  END IF;

  IF missing_tables != '' THEN
    RAISE NOTICE 'A1.2 FAIL - Missing tables: %', missing_tables;
  ELSE
    RAISE NOTICE 'A1.2 PASS - All state tracking tables exist';
  END IF;
END $$;

-- ============================================
-- A1.3 - Daily Operation Tables Exist
-- ============================================
DO $$
DECLARE
  missing_tables TEXT := '';
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'task_completions') THEN
    missing_tables := missing_tables || 'task_completions, ';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'daily_entries') THEN
    missing_tables := missing_tables || 'daily_entries, ';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'handler_interventions') THEN
    missing_tables := missing_tables || 'handler_interventions, ';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'handler_daily_plans') THEN
    missing_tables := missing_tables || 'handler_daily_plans, ';
  END IF;

  IF missing_tables != '' THEN
    RAISE NOTICE 'A1.3 FAIL - Missing tables: %', missing_tables;
  ELSE
    RAISE NOTICE 'A1.3 PASS - All daily operation tables exist';
  END IF;
END $$;

-- ============================================
-- A1.4 - Ratchet Tables Exist
-- ============================================
DO $$
DECLARE
  missing_tables TEXT := '';
BEGIN
  -- Check for commitments (v2 uses commitments_v2, v1 has arousal_commitments)
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'commitments_v2')
     AND NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'arousal_commitments') THEN
    missing_tables := missing_tables || 'commitments, ';
  END IF;
  -- Check for evidence (v1 has evidence_captures)
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'evidence_captures') THEN
    missing_tables := missing_tables || 'evidence, ';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'investments') THEN
    missing_tables := missing_tables || 'investments, ';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'baselines') THEN
    missing_tables := missing_tables || 'baselines, ';
  END IF;
  -- Check for milestones (v1 has ponr_milestones)
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'ponr_milestones') THEN
    missing_tables := missing_tables || 'milestones, ';
  END IF;

  IF missing_tables != '' THEN
    RAISE NOTICE 'A1.4 FAIL - Missing tables: %', missing_tables;
  ELSE
    RAISE NOTICE 'A1.4 PASS - All ratchet tables exist';
  END IF;
END $$;

-- ============================================
-- A1.5 - Escalation Tables Exist
-- ============================================
DO $$
DECLARE
  missing_tables TEXT := '';
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'escalation_state') THEN
    missing_tables := missing_tables || 'escalation_state, ';
  END IF;
  -- Check for arousal_sessions (v1 has intimate_sessions)
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'intimate_sessions') THEN
    missing_tables := missing_tables || 'arousal_sessions, ';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'content_references') THEN
    missing_tables := missing_tables || 'content_references, ';
  END IF;

  IF missing_tables != '' THEN
    RAISE NOTICE 'A1.5 FAIL - Missing tables: %', missing_tables;
  ELSE
    RAISE NOTICE 'A1.5 PASS - All escalation tables exist';
  END IF;
END $$;

-- ============================================
-- A1.6 - Row Level Security Enabled
-- ============================================
SELECT
  tablename,
  CASE WHEN rowsecurity THEN 'RLS ENABLED' ELSE 'RLS DISABLED - FIX REQUIRED' END as rls_status
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN (
    'profile_foundation', 'profile_history', 'profile_arousal', 'profile_psychology', 'profile_depth',
    'user_state', 'state_history', 'mood_checkins',
    'task_completions', 'daily_entries', 'handler_interventions', 'handler_daily_plans',
    'commitments_v2', 'evidence_captures', 'investments', 'baselines', 'ponr_milestones',
    'escalation_state', 'intimate_sessions', 'content_references',
    'failure_mode_events', 'time_capsules', 'activity_classification', 'recovery_protocols', 'crisis_kit'
  )
ORDER BY tablename;

-- ============================================
-- A1.7 - Foreign Key Integrity Check
-- ============================================
SELECT
  tc.table_name,
  kcu.column_name,
  ccu.table_name AS foreign_table_name,
  ccu.column_name AS foreign_column_name
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu
  ON tc.constraint_name = kcu.constraint_name
  AND tc.table_schema = kcu.table_schema
JOIN information_schema.constraint_column_usage AS ccu
  ON ccu.constraint_name = tc.constraint_name
  AND ccu.table_schema = tc.table_schema
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND tc.table_schema = 'public'
  AND kcu.column_name = 'user_id'
ORDER BY tc.table_name;

-- ============================================
-- Summary: Check unique constraints
-- ============================================
SELECT
  tc.table_name,
  string_agg(kcu.column_name, ', ') as unique_columns
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
  ON tc.constraint_name = kcu.constraint_name
WHERE tc.constraint_type = 'UNIQUE'
  AND tc.table_schema = 'public'
  AND tc.table_name IN ('daily_entries', 'handler_daily_plans', 'escalation_state', 'user_state')
GROUP BY tc.table_name
ORDER BY tc.table_name;
