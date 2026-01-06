-- Adaptive Feminization Tables
-- Vector-based feminization tracking and personalized prescriptions

-- ============================================
-- USER VECTOR STATES (Current vector positions)
-- ============================================

CREATE TABLE IF NOT EXISTS user_vector_states (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Vector identity
  vector_id TEXT NOT NULL, -- e.g., voice_pitch, movement_grace, etc.
  vector_name TEXT NOT NULL,
  domain TEXT NOT NULL, -- voice, movement, skincare, style, social, identity

  -- Position tracking
  current_position NUMERIC NOT NULL DEFAULT 0, -- 0-100 scale
  baseline_position NUMERIC DEFAULT 0,
  target_position NUMERIC DEFAULT 100,

  -- Velocity and momentum
  velocity NUMERIC DEFAULT 0, -- Current rate of change
  momentum NUMERIC DEFAULT 0, -- Accumulated momentum

  -- Engagement metrics
  engagement_score NUMERIC DEFAULT 0.5, -- 0-1
  last_engagement_at TIMESTAMP WITH TIME ZONE,
  total_engagements INTEGER DEFAULT 0,

  -- Lock-in status
  is_locked_in BOOLEAN DEFAULT FALSE,
  locked_in_at TIMESTAMP WITH TIME ZONE,
  lock_in_threshold NUMERIC DEFAULT 80,

  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  UNIQUE(user_id, vector_id)
);

-- Add missing columns to existing table if needed
ALTER TABLE user_vector_states ADD COLUMN IF NOT EXISTS domain TEXT;
ALTER TABLE user_vector_states ADD COLUMN IF NOT EXISTS vector_name TEXT;
ALTER TABLE user_vector_states ADD COLUMN IF NOT EXISTS baseline_position NUMERIC DEFAULT 0;
ALTER TABLE user_vector_states ADD COLUMN IF NOT EXISTS target_position NUMERIC DEFAULT 100;
ALTER TABLE user_vector_states ADD COLUMN IF NOT EXISTS velocity NUMERIC DEFAULT 0;
ALTER TABLE user_vector_states ADD COLUMN IF NOT EXISTS momentum NUMERIC DEFAULT 0;
ALTER TABLE user_vector_states ADD COLUMN IF NOT EXISTS engagement_score NUMERIC DEFAULT 0.5;
ALTER TABLE user_vector_states ADD COLUMN IF NOT EXISTS last_engagement_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE user_vector_states ADD COLUMN IF NOT EXISTS total_engagements INTEGER DEFAULT 0;
ALTER TABLE user_vector_states ADD COLUMN IF NOT EXISTS is_locked_in BOOLEAN DEFAULT FALSE;
ALTER TABLE user_vector_states ADD COLUMN IF NOT EXISTS locked_in_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE user_vector_states ADD COLUMN IF NOT EXISTS lock_in_threshold NUMERIC DEFAULT 80;

CREATE INDEX IF NOT EXISTS idx_user_vector_states_user_id ON user_vector_states(user_id);
CREATE INDEX IF NOT EXISTS idx_user_vector_states_domain ON user_vector_states(domain);
CREATE INDEX IF NOT EXISTS idx_user_vector_states_locked_in ON user_vector_states(is_locked_in);

-- ============================================
-- DAILY PRESCRIPTIONS (AI-generated daily plans)
-- ============================================

CREATE TABLE IF NOT EXISTS daily_prescriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Date
  prescription_date DATE NOT NULL,

  -- Prescription content
  vectors_targeted TEXT[], -- Vector IDs to work on
  activities JSONB, -- Array of prescribed activities
  intensity_level INTEGER DEFAULT 3 CHECK (intensity_level >= 1 AND intensity_level <= 5),

  -- Context at generation
  arousal_state TEXT,
  denial_day INTEGER,
  phase INTEGER,
  user_state_snapshot JSONB,

  -- Execution tracking
  executed BOOLEAN DEFAULT FALSE,
  execution_notes TEXT,
  compliance_score NUMERIC, -- 0-1

  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  UNIQUE(user_id, prescription_date)
);

-- Add missing columns to daily_prescriptions if needed
ALTER TABLE daily_prescriptions ADD COLUMN IF NOT EXISTS prescription_date DATE;
ALTER TABLE daily_prescriptions ADD COLUMN IF NOT EXISTS vectors_targeted TEXT[];
ALTER TABLE daily_prescriptions ADD COLUMN IF NOT EXISTS activities JSONB;
ALTER TABLE daily_prescriptions ADD COLUMN IF NOT EXISTS intensity_level INTEGER DEFAULT 3;
ALTER TABLE daily_prescriptions ADD COLUMN IF NOT EXISTS arousal_state TEXT;
ALTER TABLE daily_prescriptions ADD COLUMN IF NOT EXISTS denial_day INTEGER;
ALTER TABLE daily_prescriptions ADD COLUMN IF NOT EXISTS phase INTEGER;
ALTER TABLE daily_prescriptions ADD COLUMN IF NOT EXISTS user_state_snapshot JSONB;
ALTER TABLE daily_prescriptions ADD COLUMN IF NOT EXISTS executed BOOLEAN DEFAULT FALSE;
ALTER TABLE daily_prescriptions ADD COLUMN IF NOT EXISTS execution_notes TEXT;
ALTER TABLE daily_prescriptions ADD COLUMN IF NOT EXISTS compliance_score NUMERIC;

CREATE INDEX IF NOT EXISTS idx_daily_prescriptions_user_id ON daily_prescriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_daily_prescriptions_date ON daily_prescriptions(prescription_date);
CREATE INDEX IF NOT EXISTS idx_daily_prescriptions_user_date ON daily_prescriptions(user_id, prescription_date);

-- ============================================
-- VECTOR PROGRESS HISTORY (Progress over time)
-- ============================================

CREATE TABLE IF NOT EXISTS vector_progress_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  vector_id TEXT NOT NULL,

  -- Position at this point
  position NUMERIC NOT NULL,
  velocity NUMERIC,

  -- What caused this update
  update_type TEXT, -- activity, decay, boost, reset
  update_source TEXT, -- task_id, drill_id, etc.
  update_notes TEXT,

  recorded_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_vector_progress_history_user_id ON vector_progress_history(user_id);
CREATE INDEX IF NOT EXISTS idx_vector_progress_history_vector_id ON vector_progress_history(vector_id);
CREATE INDEX IF NOT EXISTS idx_vector_progress_history_recorded_at ON vector_progress_history(recorded_at);

-- ============================================
-- IRREVERSIBILITY MARKERS (Point of no return tracking)
-- ============================================

CREATE TABLE IF NOT EXISTS irreversibility_markers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Marker identity
  marker_type TEXT NOT NULL, -- ceremony, commitment, threshold, etc.
  marker_name TEXT NOT NULL,
  description TEXT,

  -- Source
  source_type TEXT, -- ceremony_id, commitment_id, vector_id
  source_id TEXT,

  -- Effect
  effect_type TEXT, -- lock_name, permanent_penalty, unlock_content
  effect_params JSONB,

  -- Status
  active BOOLEAN DEFAULT TRUE,
  triggered_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add missing columns to irreversibility_markers if needed
ALTER TABLE irreversibility_markers ADD COLUMN IF NOT EXISTS marker_type TEXT;
ALTER TABLE irreversibility_markers ADD COLUMN IF NOT EXISTS marker_name TEXT;
ALTER TABLE irreversibility_markers ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE irreversibility_markers ADD COLUMN IF NOT EXISTS source_type TEXT;
ALTER TABLE irreversibility_markers ADD COLUMN IF NOT EXISTS source_id TEXT;
ALTER TABLE irreversibility_markers ADD COLUMN IF NOT EXISTS effect_type TEXT;
ALTER TABLE irreversibility_markers ADD COLUMN IF NOT EXISTS effect_params JSONB;
ALTER TABLE irreversibility_markers ADD COLUMN IF NOT EXISTS active BOOLEAN DEFAULT TRUE;
ALTER TABLE irreversibility_markers ADD COLUMN IF NOT EXISTS triggered_at TIMESTAMP WITH TIME ZONE;

CREATE INDEX IF NOT EXISTS idx_irreversibility_markers_user_id ON irreversibility_markers(user_id);
CREATE INDEX IF NOT EXISTS idx_irreversibility_markers_type ON irreversibility_markers(marker_type);
CREATE INDEX IF NOT EXISTS idx_irreversibility_markers_active ON irreversibility_markers(active);

-- ============================================
-- VECTOR LOCK-IN STATUS (Permanent progress)
-- ============================================

CREATE TABLE IF NOT EXISTS vector_lock_in_status (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  vector_id TEXT NOT NULL,

  -- Lock-in info
  locked_in_position NUMERIC NOT NULL,
  locked_in_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  -- How it was locked
  lock_in_method TEXT, -- threshold, ceremony, commitment
  lock_in_source TEXT, -- ceremony_id, etc.

  -- Evidence
  evidence_snapshot JSONB,

  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  UNIQUE(user_id, vector_id)
);

CREATE INDEX IF NOT EXISTS idx_vector_lock_in_status_user_id ON vector_lock_in_status(user_id);

-- ============================================
-- VECTOR ENGAGEMENT RECORDS (Individual engagements)
-- ============================================

CREATE TABLE IF NOT EXISTS vector_engagement_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  vector_id TEXT NOT NULL,

  -- Engagement info
  engagement_type TEXT NOT NULL, -- task, drill, session, etc.
  engagement_source TEXT, -- task_id, drill_id, etc.

  -- Results
  position_delta NUMERIC, -- Change in position
  engagement_quality NUMERIC, -- 0-1 quality score
  duration_minutes INTEGER,

  -- Context
  arousal_state TEXT,
  denial_day INTEGER,

  engaged_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add missing columns to vector_engagement_records if needed
ALTER TABLE vector_engagement_records ADD COLUMN IF NOT EXISTS engagement_type TEXT;
ALTER TABLE vector_engagement_records ADD COLUMN IF NOT EXISTS engagement_source TEXT;
ALTER TABLE vector_engagement_records ADD COLUMN IF NOT EXISTS position_delta NUMERIC;
ALTER TABLE vector_engagement_records ADD COLUMN IF NOT EXISTS engagement_quality NUMERIC;
ALTER TABLE vector_engagement_records ADD COLUMN IF NOT EXISTS duration_minutes INTEGER;
ALTER TABLE vector_engagement_records ADD COLUMN IF NOT EXISTS arousal_state TEXT;
ALTER TABLE vector_engagement_records ADD COLUMN IF NOT EXISTS denial_day INTEGER;
ALTER TABLE vector_engagement_records ADD COLUMN IF NOT EXISTS engaged_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_vector_engagement_records_user_id ON vector_engagement_records(user_id);
CREATE INDEX IF NOT EXISTS idx_vector_engagement_records_vector_id ON vector_engagement_records(vector_id);
CREATE INDEX IF NOT EXISTS idx_vector_engagement_records_engaged_at ON vector_engagement_records(engaged_at);

-- ============================================
-- USER LEARNING PATTERNS (AI learning about user)
-- ============================================

CREATE TABLE IF NOT EXISTS user_learning_patterns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Pattern data
  pattern_type TEXT NOT NULL, -- engagement_time, resistance_trigger, etc.
  pattern_data JSONB NOT NULL,

  -- Confidence
  confidence NUMERIC DEFAULT 0.5,
  data_points INTEGER DEFAULT 0,

  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  UNIQUE(user_id, pattern_type)
);

CREATE INDEX IF NOT EXISTS idx_user_learning_patterns_user_id ON user_learning_patterns(user_id);

-- ============================================
-- USER LEARNING PROFILES (Comprehensive user model)
-- ============================================

CREATE TABLE IF NOT EXISTS user_learning_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Engagement preferences
  optimal_session_length INTEGER, -- minutes
  optimal_time_of_day TEXT, -- morning, afternoon, evening, night
  optimal_days_of_week INTEGER[], -- 0-6

  -- Content preferences
  preferred_intensity INTEGER DEFAULT 3,
  content_preferences JSONB, -- { type: weight } mapping
  avoided_content JSONB,

  -- Response patterns
  resistance_triggers TEXT[],
  compliance_accelerators TEXT[],
  breakthrough_indicators TEXT[],

  -- Effectiveness tracking
  vector_effectiveness JSONB, -- { vector_id: effectiveness_score }
  activity_effectiveness JSONB, -- { activity_type: effectiveness_score }

  -- Model confidence
  model_confidence NUMERIC DEFAULT 0.1,
  total_data_points INTEGER DEFAULT 0,

  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  UNIQUE(user_id)
);

CREATE INDEX IF NOT EXISTS idx_user_learning_profiles_user_id ON user_learning_profiles(user_id);

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================

ALTER TABLE user_vector_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_prescriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE vector_progress_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE irreversibility_markers ENABLE ROW LEVEL SECURITY;
ALTER TABLE vector_lock_in_status ENABLE ROW LEVEL SECURITY;
ALTER TABLE vector_engagement_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_learning_patterns ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_learning_profiles ENABLE ROW LEVEL SECURITY;

-- All tables: Users can only access their own data
DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOR tbl IN SELECT unnest(ARRAY[
    'user_vector_states',
    'daily_prescriptions',
    'vector_progress_history',
    'irreversibility_markers',
    'vector_lock_in_status',
    'vector_engagement_records',
    'user_learning_patterns',
    'user_learning_profiles'
  ]) LOOP
    EXECUTE format('DROP POLICY IF EXISTS "Users can view own data" ON %I', tbl);
    EXECUTE format('CREATE POLICY "Users can view own data" ON %I FOR SELECT USING (auth.uid() = user_id)', tbl);

    EXECUTE format('DROP POLICY IF EXISTS "Users can insert own data" ON %I', tbl);
    EXECUTE format('CREATE POLICY "Users can insert own data" ON %I FOR INSERT WITH CHECK (auth.uid() = user_id)', tbl);

    EXECUTE format('DROP POLICY IF EXISTS "Users can update own data" ON %I', tbl);
    EXECUTE format('CREATE POLICY "Users can update own data" ON %I FOR UPDATE USING (auth.uid() = user_id)', tbl);
  END LOOP;
END $$;
