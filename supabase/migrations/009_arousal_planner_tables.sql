-- Migration 009: Arousal Planner Tables
-- Daily arousal plans with scheduled sessions, check-ins, and milestones

-- ============================================
-- DAILY AROUSAL PLANS
-- Auto-generated daily prescription
-- ============================================
CREATE TABLE IF NOT EXISTS daily_arousal_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  plan_date DATE NOT NULL,

  -- Generation context (snapshot at plan creation)
  generated_at TIMESTAMPTZ DEFAULT NOW(),
  arousal_state_at_generation TEXT NOT NULL, -- baseline, building, sweet_spot, etc.
  denial_day_at_generation INTEGER NOT NULL DEFAULT 0,
  chastity_locked_at_generation BOOLEAN DEFAULT FALSE,

  -- Plan configuration
  plan_intensity TEXT NOT NULL DEFAULT 'moderate', -- light, moderate, intense, extreme
  total_target_edges INTEGER DEFAULT 0,
  total_target_duration_minutes INTEGER DEFAULT 0,

  -- Check-in schedule
  check_in_times JSONB DEFAULT '[]', -- Array of scheduled times (HH:MM)
  check_ins_completed INTEGER DEFAULT 0,
  check_ins_total INTEGER DEFAULT 3,

  -- Status tracking
  status TEXT DEFAULT 'active', -- active, completed, abandoned, expired
  completion_percentage INTEGER DEFAULT 0,

  -- Results
  edges_achieved INTEGER DEFAULT 0,
  state_at_end_of_day TEXT,
  notes TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(user_id, plan_date)
);

-- ============================================
-- PLANNED EDGE SESSIONS
-- Scheduled sessions within a daily plan
-- ============================================
CREATE TABLE IF NOT EXISTS planned_edge_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id UUID REFERENCES daily_arousal_plans ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users NOT NULL,

  -- Scheduling
  scheduled_time TIME NOT NULL,
  scheduled_date DATE NOT NULL,
  time_block TEXT NOT NULL, -- morning, afternoon, evening, night

  -- Session prescription
  session_type TEXT NOT NULL DEFAULT 'edge_training', -- edge_training, denial, anchoring, goon, maintenance
  target_edges INTEGER DEFAULT 3,
  target_duration_minutes INTEGER DEFAULT 15,
  intensity_level TEXT DEFAULT 'moderate', -- gentle, moderate, intense

  -- Optional guidance
  recommended_patterns JSONB DEFAULT '[]',
  affirmation_focus TEXT,
  special_instructions TEXT,

  -- Execution tracking
  status TEXT DEFAULT 'scheduled', -- scheduled, started, completed, skipped, missed
  actual_session_id UUID REFERENCES intimate_sessions,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  actual_edges INTEGER,
  actual_duration_minutes INTEGER,

  -- Feedback
  post_session_state TEXT,
  satisfaction_rating INTEGER CHECK (satisfaction_rating >= 1 AND satisfaction_rating <= 5),

  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- AROUSAL CHECK-INS
-- Scheduled arousal state check-ins
-- ============================================
CREATE TABLE IF NOT EXISTS arousal_check_ins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id UUID REFERENCES daily_arousal_plans ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users NOT NULL,

  -- Scheduling
  scheduled_time TIME NOT NULL,
  scheduled_date DATE NOT NULL,
  check_in_type TEXT NOT NULL, -- morning, midday, evening, post_session

  -- Response (filled when completed)
  status TEXT DEFAULT 'scheduled', -- scheduled, completed, skipped, missed
  completed_at TIMESTAMPTZ,

  -- Arousal snapshot
  arousal_level INTEGER CHECK (arousal_level >= 1 AND arousal_level <= 10),
  aching_intensity INTEGER CHECK (aching_intensity >= 1 AND aching_intensity <= 10),
  physical_signs JSONB DEFAULT '[]', -- leaking, aching, sensitive, throbbing, desperate, calm, numb
  state_reported TEXT, -- baseline, building, sweet_spot, overload, etc.

  -- Context
  notes TEXT,
  prompted_at TIMESTAMPTZ,

  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- CHASTITY MILESTONES
-- Daily chastity-related goals
-- ============================================
CREATE TABLE IF NOT EXISTS chastity_milestones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id UUID REFERENCES daily_arousal_plans ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users NOT NULL,

  -- Milestone definition
  milestone_type TEXT NOT NULL, -- stay_locked, edge_count, maintain_state, duration, denial_day, special
  title TEXT NOT NULL,
  description TEXT,
  target_value INTEGER, -- varies by type (edge count, hours, etc.)
  target_state TEXT, -- for maintain_state type

  -- Timing
  deadline_time TIME,
  unlock_condition TEXT, -- What allows unlocking (if stay_locked type)

  -- Progress tracking
  status TEXT DEFAULT 'pending', -- pending, in_progress, achieved, failed
  current_value INTEGER DEFAULT 0,
  achieved_at TIMESTAMPTZ,

  -- Rewards
  points_value INTEGER DEFAULT 10,
  achievement_unlocked TEXT, -- Achievement ID if this milestone unlocks one

  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================
ALTER TABLE daily_arousal_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE planned_edge_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE arousal_check_ins ENABLE ROW LEVEL SECURITY;
ALTER TABLE chastity_milestones ENABLE ROW LEVEL SECURITY;

-- RLS Policies
DROP POLICY IF EXISTS "Users access own plans" ON daily_arousal_plans;
CREATE POLICY "Users access own plans" ON daily_arousal_plans FOR ALL USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users access own planned_sessions" ON planned_edge_sessions;
CREATE POLICY "Users access own planned_sessions" ON planned_edge_sessions FOR ALL USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users access own check_ins" ON arousal_check_ins;
CREATE POLICY "Users access own check_ins" ON arousal_check_ins FOR ALL USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users access own milestones" ON chastity_milestones;
CREATE POLICY "Users access own milestones" ON chastity_milestones FOR ALL USING (auth.uid() = user_id);

-- ============================================
-- INDEXES
-- ============================================
CREATE INDEX IF NOT EXISTS idx_daily_plans_user_date ON daily_arousal_plans(user_id, plan_date);
CREATE INDEX IF NOT EXISTS idx_daily_plans_status ON daily_arousal_plans(user_id, status);
CREATE INDEX IF NOT EXISTS idx_planned_sessions_plan ON planned_edge_sessions(plan_id);
CREATE INDEX IF NOT EXISTS idx_planned_sessions_date ON planned_edge_sessions(user_id, scheduled_date);
CREATE INDEX IF NOT EXISTS idx_planned_sessions_status ON planned_edge_sessions(user_id, status);
CREATE INDEX IF NOT EXISTS idx_check_ins_plan ON arousal_check_ins(plan_id);
CREATE INDEX IF NOT EXISTS idx_check_ins_date ON arousal_check_ins(user_id, scheduled_date);
CREATE INDEX IF NOT EXISTS idx_check_ins_status ON arousal_check_ins(user_id, status);
CREATE INDEX IF NOT EXISTS idx_milestones_plan ON chastity_milestones(plan_id);
CREATE INDEX IF NOT EXISTS idx_milestones_status ON chastity_milestones(user_id, status);

-- ============================================
-- TRIGGER: Update updated_at on daily_arousal_plans
-- ============================================
DROP TRIGGER IF EXISTS update_daily_arousal_plans_updated_at ON daily_arousal_plans;
CREATE TRIGGER update_daily_arousal_plans_updated_at
  BEFORE UPDATE ON daily_arousal_plans
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
