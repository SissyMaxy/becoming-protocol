-- ============================================
-- AROUSAL PLANNER SCHEMA
-- Daily arousal plans and state logging
-- ============================================

-- ============================================
-- TABLE: daily_arousal_plans
-- Generated daily arousal prescriptions
-- ============================================

CREATE TABLE IF NOT EXISTS daily_arousal_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plan_date DATE NOT NULL,
  generated_at TIMESTAMPTZ DEFAULT NOW(),

  -- State at generation
  arousal_state_at_generation TEXT NOT NULL,
  denial_day_at_generation INTEGER DEFAULT 0,
  chastity_locked_at_generation BOOLEAN DEFAULT false,

  -- Plan details
  plan_intensity TEXT NOT NULL CHECK (plan_intensity IN ('light', 'moderate', 'intense', 'extreme')),
  total_target_edges INTEGER DEFAULT 0,
  total_target_duration_minutes INTEGER DEFAULT 0,

  -- Check-ins
  check_in_times TEXT[] DEFAULT '{}',
  check_ins_completed INTEGER DEFAULT 0,
  check_ins_total INTEGER DEFAULT 0,

  -- Status tracking
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'partial', 'skipped', 'expired')),
  completion_percentage INTEGER DEFAULT 0 CHECK (completion_percentage >= 0 AND completion_percentage <= 100),
  edges_achieved INTEGER DEFAULT 0,

  -- End of day
  state_at_end_of_day TEXT,
  current_arousal_level INTEGER CHECK (current_arousal_level IS NULL OR (current_arousal_level >= 1 AND current_arousal_level <= 10)),
  edge_count INTEGER DEFAULT 0,

  notes TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(user_id, plan_date)
);

CREATE INDEX IF NOT EXISTS idx_daily_arousal_plans_user_date
ON daily_arousal_plans(user_id, plan_date DESC);

CREATE INDEX IF NOT EXISTS idx_daily_arousal_plans_status
ON daily_arousal_plans(user_id, status);

-- ============================================
-- TABLE: planned_edge_sessions
-- Scheduled edge sessions within a plan
-- ============================================

CREATE TABLE IF NOT EXISTS planned_edge_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id UUID NOT NULL REFERENCES daily_arousal_plans(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Scheduling
  scheduled_time TEXT NOT NULL,
  scheduled_date DATE NOT NULL,
  time_block TEXT NOT NULL CHECK (time_block IN ('morning', 'afternoon', 'evening', 'night')),

  -- Session details
  session_type TEXT NOT NULL CHECK (session_type IN ('edge_training', 'denial', 'maintenance', 'goon', 'quick_tease')),
  target_edges INTEGER DEFAULT 0,
  target_duration_minutes INTEGER DEFAULT 0,
  intensity_level TEXT NOT NULL CHECK (intensity_level IN ('gentle', 'moderate', 'intense')),

  -- Guidance
  recommended_patterns TEXT[],
  affirmation_focus TEXT,
  special_instructions TEXT,

  -- Status
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'in_progress', 'completed', 'skipped', 'missed')),
  actual_session_id UUID,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,

  -- Results
  actual_edges INTEGER,
  actual_duration_minutes INTEGER,
  post_session_state TEXT,
  satisfaction_rating INTEGER CHECK (satisfaction_rating IS NULL OR (satisfaction_rating >= 1 AND satisfaction_rating <= 5)),

  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_planned_edge_sessions_plan
ON planned_edge_sessions(plan_id);

CREATE INDEX IF NOT EXISTS idx_planned_edge_sessions_user_date
ON planned_edge_sessions(user_id, scheduled_date);

-- ============================================
-- TABLE: arousal_check_ins
-- Scheduled check-ins throughout the day
-- ============================================

CREATE TABLE IF NOT EXISTS arousal_check_ins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id UUID NOT NULL REFERENCES daily_arousal_plans(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Scheduling
  scheduled_time TEXT NOT NULL,
  scheduled_date DATE NOT NULL,
  check_in_type TEXT NOT NULL CHECK (check_in_type IN ('morning', 'midday', 'afternoon', 'evening', 'night', 'pre_session', 'post_session')),

  -- Status
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'skipped', 'missed')),
  completed_at TIMESTAMPTZ,

  -- Reported data
  arousal_level INTEGER CHECK (arousal_level IS NULL OR (arousal_level >= 1 AND arousal_level <= 10)),
  aching_intensity INTEGER CHECK (aching_intensity IS NULL OR (aching_intensity >= 1 AND aching_intensity <= 10)),
  physical_signs TEXT[],
  state_reported TEXT,
  notes TEXT,

  prompted_at TIMESTAMPTZ,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_arousal_check_ins_plan
ON arousal_check_ins(plan_id);

CREATE INDEX IF NOT EXISTS idx_arousal_check_ins_user_date
ON arousal_check_ins(user_id, scheduled_date);

-- ============================================
-- TABLE: chastity_milestones
-- Daily milestones and goals
-- ============================================

CREATE TABLE IF NOT EXISTS chastity_milestones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id UUID NOT NULL REFERENCES daily_arousal_plans(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  milestone_type TEXT NOT NULL CHECK (milestone_type IN ('edge_count', 'denial_day', 'time_locked', 'state_reached', 'practice_completed', 'custom')),
  title TEXT NOT NULL,
  description TEXT,

  -- Target
  target_value INTEGER,
  target_state TEXT,
  deadline_time TEXT,
  unlock_condition TEXT,

  -- Status
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'failed', 'skipped')),
  current_value INTEGER DEFAULT 0,
  achieved_at TIMESTAMPTZ,

  -- Rewards
  points_value INTEGER DEFAULT 0,
  achievement_unlocked TEXT,

  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chastity_milestones_plan
ON chastity_milestones(plan_id);

-- ============================================
-- NOTE: state_logs already exists as a view in your database
-- If you need a table instead, drop the view first:
-- DROP VIEW IF EXISTS state_logs;
-- Then uncomment the table creation below
-- ============================================

-- CREATE TABLE IF NOT EXISTS state_logs (
--   id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
--   user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
--   logged_at TIMESTAMPTZ DEFAULT NOW(),
--   arousal_level INTEGER CHECK (arousal_level IS NULL OR (arousal_level >= 1 AND arousal_level <= 10)),
--   arousal_state TEXT,
--   aching_intensity INTEGER CHECK (aching_intensity IS NULL OR (aching_intensity >= 1 AND aching_intensity <= 10)),
--   feminization_receptivity INTEGER CHECK (feminization_receptivity IS NULL OR (feminization_receptivity >= 1 AND feminization_receptivity <= 10)),
--   denial_day INTEGER,
--   is_locked BOOLEAN DEFAULT false,
--   edge_count_today INTEGER DEFAULT 0,
--   log_type TEXT DEFAULT 'manual' CHECK (log_type IN ('manual', 'check_in', 'session_start', 'session_end', 'milestone', 'system')),
--   trigger_source TEXT,
--   physical_signs JSONB DEFAULT '[]',
--   notes TEXT,
--   created_at TIMESTAMPTZ DEFAULT NOW()
-- );

-- ============================================
-- RLS POLICIES
-- ============================================

ALTER TABLE daily_arousal_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE planned_edge_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE arousal_check_ins ENABLE ROW LEVEL SECURITY;
ALTER TABLE chastity_milestones ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users own daily_arousal_plans" ON daily_arousal_plans;
DROP POLICY IF EXISTS "Users own planned_edge_sessions" ON planned_edge_sessions;
DROP POLICY IF EXISTS "Users own arousal_check_ins" ON arousal_check_ins;
DROP POLICY IF EXISTS "Users own chastity_milestones" ON chastity_milestones;

-- Create policies
CREATE POLICY "Users own daily_arousal_plans" ON daily_arousal_plans FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users own planned_edge_sessions" ON planned_edge_sessions FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users own arousal_check_ins" ON arousal_check_ins FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users own chastity_milestones" ON chastity_milestones FOR ALL USING (auth.uid() = user_id);

-- ============================================
-- HELPER FUNCTIONS
-- ============================================

-- Function to get today's active plan
CREATE OR REPLACE FUNCTION get_todays_plan(p_user_id UUID)
RETURNS SETOF daily_arousal_plans AS $$
BEGIN
  RETURN QUERY
  SELECT *
  FROM daily_arousal_plans
  WHERE user_id = p_user_id
    AND plan_date = CURRENT_DATE
    AND status = 'active'
  LIMIT 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
