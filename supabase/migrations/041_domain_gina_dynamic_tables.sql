-- Migration: Domain, Gina, and Dynamic Task Tables
-- For domain modules, Gina emergence ladder, and dynamic task generator
-- NOTE: Made fully idempotent — safe to re-run against existing schemas.

-- ============================================
-- DOMAIN STATE TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS domain_state (
  domain TEXT PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  current_level INTEGER DEFAULT 1 CHECK (current_level >= 1 AND current_level <= 5),
  tasks_completed INTEGER DEFAULT 0,
  tasks_completed_this_level INTEGER DEFAULT 0,
  streak INTEGER DEFAULT 0,
  last_practice_at TIMESTAMPTZ,
  total_practice_minutes INTEGER DEFAULT 0,
  escalation_position NUMERIC DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_domain_state_user ON domain_state(user_id);
ALTER TABLE domain_state ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN CREATE POLICY "Users can view own domain state" ON domain_state FOR SELECT USING (auth.uid() = user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "Users can update own domain state" ON domain_state FOR UPDATE USING (auth.uid() = user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "Users can insert own domain state" ON domain_state FOR INSERT WITH CHECK (auth.uid() = user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================
-- GINA STATE TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS gina_state (
  id INTEGER PRIMARY KEY DEFAULT 1,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  is_home BOOLEAN DEFAULT TRUE,
  emergence_stage INTEGER DEFAULT 0 CHECK (emergence_stage >= 0 AND emergence_stage <= 5),
  emergence_stage_locked BOOLEAN DEFAULT TRUE,
  interaction_count INTEGER DEFAULT 0,
  positive_interaction_count INTEGER DEFAULT 0,
  last_interaction_at TIMESTAMPTZ,
  last_positive_interaction_at TIMESTAMPTZ,
  disclosure_readiness INTEGER DEFAULT 0 CHECK (disclosure_readiness >= 0 AND disclosure_readiness <= 100),
  seeds_planted INTEGER DEFAULT 0,
  last_stage_advance_at TIMESTAMPTZ,
  stage_stability_days INTEGER DEFAULT 0,
  pending_commitment TEXT,
  therapist_prep_complete BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE gina_state ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN CREATE POLICY "Users can view own Gina state" ON gina_state FOR SELECT USING (auth.uid() = user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "Users can update own Gina state" ON gina_state FOR UPDATE USING (auth.uid() = user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "Users can insert own Gina state" ON gina_state FOR INSERT WITH CHECK (auth.uid() = user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================
-- GINA INTERACTIONS TABLE
-- Note: table may already exist from migration 005 with created_at column
-- and different column names. We add missing columns safely.
-- ============================================

CREATE TABLE IF NOT EXISTS gina_interactions (
  id TEXT PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  type TEXT,
  context TEXT,
  details TEXT,
  emergence_stage INTEGER,
  sentiment TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE gina_interactions ADD COLUMN IF NOT EXISTS details TEXT;
ALTER TABLE gina_interactions ADD COLUMN IF NOT EXISTS emergence_stage INTEGER;
ALTER TABLE gina_interactions ADD COLUMN IF NOT EXISTS sentiment TEXT;

CREATE INDEX IF NOT EXISTS idx_gina_interactions_user ON gina_interactions(user_id);
CREATE INDEX IF NOT EXISTS idx_gina_interactions_created ON gina_interactions(created_at DESC);

ALTER TABLE gina_interactions ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN CREATE POLICY "Users can view own Gina interactions" ON gina_interactions FOR SELECT USING (auth.uid() = user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "Users can insert own Gina interactions" ON gina_interactions FOR INSERT WITH CHECK (auth.uid() = user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================
-- DYNAMIC TASK STATE TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS dynamic_task_state (
  id INTEGER PRIMARY KEY DEFAULT 1,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  pending_tasks JSONB DEFAULT '[]'::jsonb,
  generated_today INTEGER DEFAULT 0,
  last_generation_at TIMESTAMPTZ,
  active_captures INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE dynamic_task_state ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN CREATE POLICY "Users can view own dynamic task state" ON dynamic_task_state FOR SELECT USING (auth.uid() = user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "Users can update own dynamic task state" ON dynamic_task_state FOR UPDATE USING (auth.uid() = user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "Users can insert own dynamic task state" ON dynamic_task_state FOR INSERT WITH CHECK (auth.uid() = user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================
-- TASK COMPLETIONS: add missing columns if table exists from migration 011
-- The original table may have a different schema (UUID id, FK to task_bank).
-- We add columns safely rather than recreating.
-- ============================================

CREATE TABLE IF NOT EXISTS task_completions (
  id TEXT PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  task_id TEXT NOT NULL,
  domain TEXT NOT NULL,
  category TEXT NOT NULL,
  instruction TEXT,
  intensity INTEGER,
  is_dynamic BOOLEAN DEFAULT FALSE,
  dynamic_type TEXT,
  points_earned INTEGER DEFAULT 0,
  duration_actual INTEGER,
  count_actual INTEGER,
  denial_day INTEGER,
  arousal_level INTEGER,
  in_session BOOLEAN DEFAULT FALSE,
  session_id TEXT,
  evidence_url TEXT,
  notes TEXT,
  completed_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add columns that might be missing from the original 011 schema
ALTER TABLE task_completions ADD COLUMN IF NOT EXISTS domain TEXT;
ALTER TABLE task_completions ADD COLUMN IF NOT EXISTS category TEXT;
ALTER TABLE task_completions ADD COLUMN IF NOT EXISTS instruction TEXT;
ALTER TABLE task_completions ADD COLUMN IF NOT EXISTS intensity INTEGER;
ALTER TABLE task_completions ADD COLUMN IF NOT EXISTS is_dynamic BOOLEAN DEFAULT FALSE;
ALTER TABLE task_completions ADD COLUMN IF NOT EXISTS dynamic_type TEXT;
ALTER TABLE task_completions ADD COLUMN IF NOT EXISTS denial_day INTEGER;
ALTER TABLE task_completions ADD COLUMN IF NOT EXISTS arousal_level INTEGER;
ALTER TABLE task_completions ADD COLUMN IF NOT EXISTS in_session BOOLEAN DEFAULT FALSE;
ALTER TABLE task_completions ADD COLUMN IF NOT EXISTS session_id TEXT;
ALTER TABLE task_completions ADD COLUMN IF NOT EXISTS evidence_url TEXT;

-- Indexes (only create on columns that definitely exist)
CREATE INDEX IF NOT EXISTS idx_task_completions_user ON task_completions(user_id);
CREATE INDEX IF NOT EXISTS idx_task_completions_date ON task_completions(completed_at DESC);

ALTER TABLE task_completions ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN CREATE POLICY "Users can view own task completions" ON task_completions FOR SELECT USING (auth.uid() = user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "Users can insert own task completions" ON task_completions FOR INSERT WITH CHECK (auth.uid() = user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================
-- EVENT LOG TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS event_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_event_log_user ON event_log(user_id);
CREATE INDEX IF NOT EXISTS idx_event_log_type ON event_log(event_type);
CREATE INDEX IF NOT EXISTS idx_event_log_created ON event_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_event_log_user_type ON event_log(user_id, event_type);

ALTER TABLE event_log ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN CREATE POLICY "Users can view own events" ON event_log FOR SELECT USING (auth.uid() = user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "Users can insert own events" ON event_log FOR INSERT WITH CHECK (auth.uid() = user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================
-- HELPER FUNCTIONS
-- ============================================

CREATE OR REPLACE FUNCTION get_domain_tasks_today(p_user_id UUID, p_domain TEXT)
RETURNS INTEGER
LANGUAGE sql
STABLE
AS $$
  SELECT COUNT(*)::INTEGER
  FROM task_completions
  WHERE user_id = p_user_id
    AND domain = p_domain
    AND completed_at >= CURRENT_DATE;
$$;

CREATE OR REPLACE FUNCTION get_all_tasks_today(p_user_id UUID)
RETURNS TABLE(task_id TEXT, domain TEXT, category TEXT)
LANGUAGE sql
STABLE
AS $$
  SELECT task_id::TEXT, domain, category
  FROM task_completions
  WHERE user_id = p_user_id
    AND completed_at >= CURRENT_DATE;
$$;

CREATE OR REPLACE FUNCTION is_domain_avoided(p_user_id UUID, p_domain TEXT, p_threshold_days INTEGER DEFAULT 3)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(
    (SELECT last_practice_at < NOW() - (p_threshold_days || ' days')::INTERVAL
     FROM domain_state
     WHERE user_id = p_user_id AND domain = p_domain),
    TRUE
  );
$$;
