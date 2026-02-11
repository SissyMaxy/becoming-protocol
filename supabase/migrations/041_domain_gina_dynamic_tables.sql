-- Migration: Domain, Gina, and Dynamic Task Tables
-- For domain modules, Gina emergence ladder, and dynamic task generator

-- ============================================
-- DOMAIN STATE TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS domain_state (
  domain TEXT PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Level progression
  current_level INTEGER DEFAULT 1 CHECK (current_level >= 1 AND current_level <= 5),
  tasks_completed INTEGER DEFAULT 0,
  tasks_completed_this_level INTEGER DEFAULT 0,

  -- Streak tracking
  streak INTEGER DEFAULT 0,
  last_practice_at TIMESTAMPTZ,

  -- Time tracking
  total_practice_minutes INTEGER DEFAULT 0,

  -- Escalation
  escalation_position NUMERIC DEFAULT 0,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for user lookups
CREATE INDEX IF NOT EXISTS idx_domain_state_user ON domain_state(user_id);

-- RLS
ALTER TABLE domain_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own domain state"
  ON domain_state FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update own domain state"
  ON domain_state FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own domain state"
  ON domain_state FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- ============================================
-- GINA STATE TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS gina_state (
  id INTEGER PRIMARY KEY DEFAULT 1,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Presence
  is_home BOOLEAN DEFAULT TRUE,

  -- Emergence ladder (0-5)
  emergence_stage INTEGER DEFAULT 0 CHECK (emergence_stage >= 0 AND emergence_stage <= 5),
  emergence_stage_locked BOOLEAN DEFAULT TRUE,

  -- Interaction tracking
  interaction_count INTEGER DEFAULT 0,
  positive_interaction_count INTEGER DEFAULT 0,
  last_interaction_at TIMESTAMPTZ,
  last_positive_interaction_at TIMESTAMPTZ,

  -- Disclosure tracking
  disclosure_readiness INTEGER DEFAULT 0 CHECK (disclosure_readiness >= 0 AND disclosure_readiness <= 100),
  seeds_planted INTEGER DEFAULT 0,

  -- Stage stability
  last_stage_advance_at TIMESTAMPTZ,
  stage_stability_days INTEGER DEFAULT 0,

  -- Pending items
  pending_commitment TEXT,

  -- Prerequisites
  therapist_prep_complete BOOLEAN DEFAULT FALSE,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS
ALTER TABLE gina_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own Gina state"
  ON gina_state FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update own Gina state"
  ON gina_state FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own Gina state"
  ON gina_state FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- ============================================
-- GINA INTERACTIONS TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS gina_interactions (
  id TEXT PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Interaction details
  type TEXT NOT NULL CHECK (type IN ('positive', 'neutral', 'negative', 'disclosure', 'seed')),
  context TEXT NOT NULL,
  details TEXT,

  -- State at time of interaction
  emergence_stage INTEGER NOT NULL,

  -- Outcome
  sentiment TEXT CHECK (sentiment IN ('receptive', 'neutral', 'uncomfortable', 'supportive')),

  -- Timestamp
  timestamp TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_gina_interactions_user ON gina_interactions(user_id);
CREATE INDEX IF NOT EXISTS idx_gina_interactions_timestamp ON gina_interactions(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_gina_interactions_type ON gina_interactions(type);

-- RLS
ALTER TABLE gina_interactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own Gina interactions"
  ON gina_interactions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own Gina interactions"
  ON gina_interactions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- ============================================
-- DYNAMIC TASK STATE TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS dynamic_task_state (
  id INTEGER PRIMARY KEY DEFAULT 1,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Pending tasks (JSONB array)
  pending_tasks JSONB DEFAULT '[]'::jsonb,

  -- Generation tracking
  generated_today INTEGER DEFAULT 0,
  last_generation_at TIMESTAMPTZ,

  -- Capture tracking
  active_captures INTEGER DEFAULT 0,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS
ALTER TABLE dynamic_task_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own dynamic task state"
  ON dynamic_task_state FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update own dynamic task state"
  ON dynamic_task_state FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own dynamic task state"
  ON dynamic_task_state FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- ============================================
-- TASK COMPLETION HISTORY TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS task_completions (
  id TEXT PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Task identification
  task_id TEXT NOT NULL,
  domain TEXT NOT NULL,
  category TEXT NOT NULL,

  -- Task details
  instruction TEXT,
  intensity INTEGER CHECK (intensity >= 1 AND intensity <= 5),
  is_dynamic BOOLEAN DEFAULT FALSE,
  dynamic_type TEXT,

  -- Completion details
  points_earned INTEGER DEFAULT 0,
  duration_actual INTEGER,  -- minutes
  count_actual INTEGER,

  -- Context at completion
  denial_day INTEGER,
  arousal_level INTEGER,
  in_session BOOLEAN DEFAULT FALSE,
  session_id TEXT,

  -- Evidence
  evidence_url TEXT,
  notes TEXT,

  -- Timestamp
  completed_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_task_completions_user ON task_completions(user_id);
CREATE INDEX IF NOT EXISTS idx_task_completions_date ON task_completions(completed_at DESC);
CREATE INDEX IF NOT EXISTS idx_task_completions_domain ON task_completions(domain);
CREATE INDEX IF NOT EXISTS idx_task_completions_user_date ON task_completions(user_id, completed_at);

-- RLS
ALTER TABLE task_completions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own task completions"
  ON task_completions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own task completions"
  ON task_completions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- ============================================
-- EVENT LOG TABLE (for event bus persistence)
-- ============================================

CREATE TABLE IF NOT EXISTS event_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Event data
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL,

  -- Timestamp
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for querying
CREATE INDEX IF NOT EXISTS idx_event_log_user ON event_log(user_id);
CREATE INDEX IF NOT EXISTS idx_event_log_type ON event_log(event_type);
CREATE INDEX IF NOT EXISTS idx_event_log_created ON event_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_event_log_user_type ON event_log(user_id, event_type);

-- RLS
ALTER TABLE event_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own events"
  ON event_log FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own events"
  ON event_log FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- ============================================
-- HELPER FUNCTIONS
-- ============================================

-- Function to get tasks completed today for a domain
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

-- Function to get all tasks completed today
CREATE OR REPLACE FUNCTION get_all_tasks_today(p_user_id UUID)
RETURNS TABLE(task_id TEXT, domain TEXT, category TEXT)
LANGUAGE sql
STABLE
AS $$
  SELECT task_id, domain, category
  FROM task_completions
  WHERE user_id = p_user_id
    AND completed_at >= CURRENT_DATE;
$$;

-- Function to check if domain is avoided (no practice in N days)
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
