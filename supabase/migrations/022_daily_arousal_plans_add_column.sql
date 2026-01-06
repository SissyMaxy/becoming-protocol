-- Migration 022: Add current_arousal_level to daily_arousal_plans
-- This column is used by handler-conditioning.ts to track real-time arousal state
-- throughout the day, separate from the initial arousal_state_at_generation

-- ============================================
-- ADD CURRENT_AROUSAL_LEVEL COLUMN
-- Tracks the user's current arousal level (1-10) during the day
-- Updated as check-ins are completed
-- ============================================
ALTER TABLE daily_arousal_plans
ADD COLUMN IF NOT EXISTS current_arousal_level INTEGER DEFAULT 5
  CHECK (current_arousal_level >= 1 AND current_arousal_level <= 10);

-- Add comment for documentation
COMMENT ON COLUMN daily_arousal_plans.current_arousal_level IS
  'Current arousal level (1-10) updated throughout the day via check-ins. Used for vulnerability detection and escalation readiness scoring.';

-- ============================================
-- OPTIONAL: Backfill existing rows
-- Set current_arousal_level based on arousal_state_at_generation
-- ============================================
UPDATE daily_arousal_plans
SET current_arousal_level = CASE arousal_state_at_generation
  WHEN 'baseline' THEN 3
  WHEN 'building' THEN 5
  WHEN 'sweet_spot' THEN 7
  WHEN 'overload' THEN 9
  WHEN 'desperate' THEN 10
  ELSE 5
END
WHERE current_arousal_level IS NULL OR current_arousal_level = 5;
