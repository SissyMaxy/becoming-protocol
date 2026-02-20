-- Migration 064: Corruption Advancement Engine Support
-- Adds resumption timer columns, maintenance log table, and expanded event types

-- ============================================
-- 1. Expand event type constraint for new types
-- ============================================

ALTER TABLE corruption_events DROP CONSTRAINT IF EXISTS corruption_events_event_type_check;
ALTER TABLE corruption_events ADD CONSTRAINT corruption_events_event_type_check
  CHECK (event_type IN (
    'deployment','milestone','advancement','suspension','resumption',
    'override','cascade','therapist_flag',
    'crisis_suspend','timed_resume','therapist_rollback','maintenance'
  ));

-- ============================================
-- 2. Add resumption timer columns to corruption_state
-- ============================================

ALTER TABLE corruption_state
  ADD COLUMN IF NOT EXISTS resume_after TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS suspension_type TEXT
    CHECK (suspension_type IN ('crisis','therapist','manual'));

-- ============================================
-- 3. Daily maintenance log (idempotency guard)
-- ============================================

CREATE TABLE IF NOT EXISTS corruption_maintenance_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  checks_run JSONB NOT NULL DEFAULT '{}',
  advancements JSONB DEFAULT '[]',
  cascades JSONB DEFAULT '[]',
  resumptions JSONB DEFAULT '[]',
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, date)
);

ALTER TABLE corruption_maintenance_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY corruption_maintenance_user ON corruption_maintenance_log
  FOR ALL USING (auth.uid() = user_id);

CREATE INDEX idx_corruption_maintenance_user
  ON corruption_maintenance_log(user_id, date);
