-- ============================================================
-- ADAPTIVE FEMINIZATION INTELLIGENCE SYSTEM - DATABASE SCHEMA
-- Multi-Vector Optimization for Gender Transition
-- ============================================================

-- ============================================================
-- VECTOR DEFINITIONS (Reference Data)
-- ============================================================

CREATE TABLE IF NOT EXISTS vector_definitions (
  id TEXT PRIMARY KEY,
  category TEXT NOT NULL CHECK (category IN ('feminization', 'sissification')),
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  sub_components JSONB NOT NULL DEFAULT '[]',
  milestones JSONB NOT NULL DEFAULT '[]',
  context_factors JSONB NOT NULL DEFAULT '[]',
  cross_vector_dependencies JSONB NOT NULL DEFAULT '[]',
  lock_in_threshold INTEGER NOT NULL DEFAULT 7,
  display_order INTEGER NOT NULL DEFAULT 0,
  icon_name TEXT,
  color TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- USER VECTOR STATE
-- ============================================================

CREATE TABLE IF NOT EXISTS user_vector_states (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  vector_id TEXT NOT NULL REFERENCES vector_definitions(id),

  current_level DECIMAL(4,2) NOT NULL DEFAULT 0,
  sub_component_scores JSONB NOT NULL DEFAULT '{}',
  velocity_trend TEXT NOT NULL DEFAULT 'steady' CHECK (velocity_trend IN ('accelerating', 'steady', 'stalling', 'regressing')),

  last_activity_date TIMESTAMPTZ,
  total_engagement_minutes INTEGER NOT NULL DEFAULT 0,
  streak_days INTEGER NOT NULL DEFAULT 0,
  peak_level DECIMAL(4,2) NOT NULL DEFAULT 0,

  locked_in BOOLEAN NOT NULL DEFAULT false,
  lock_in_date TIMESTAMPTZ,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(user_id, vector_id)
);

CREATE INDEX idx_user_vector_states_user ON user_vector_states(user_id);
CREATE INDEX idx_user_vector_states_vector ON user_vector_states(vector_id);
CREATE INDEX idx_user_vector_states_level ON user_vector_states(user_id, current_level DESC);

-- ============================================================
-- DAILY PRESCRIPTIONS
-- ============================================================

CREATE TABLE IF NOT EXISTS daily_prescriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  valid_until TIMESTAMPTZ NOT NULL,

  context JSONB NOT NULL,
  prescriptions JSONB NOT NULL DEFAULT '[]',

  total_estimated_time INTEGER NOT NULL DEFAULT 0,
  focus_message TEXT,
  adaptive_insights JSONB DEFAULT '[]',

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_daily_prescriptions_user_date ON daily_prescriptions(user_id, generated_at DESC);
CREATE INDEX idx_daily_prescriptions_valid ON daily_prescriptions(user_id, valid_until);

-- ============================================================
-- ENGAGEMENT RECORDS (Learning Data)
-- ============================================================

CREATE TABLE IF NOT EXISTS vector_engagement_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  vector_id TEXT NOT NULL REFERENCES vector_definitions(id),

  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  context JSONB NOT NULL,

  prescribed_priority TEXT CHECK (prescribed_priority IN ('primary', 'secondary', 'tertiary')),
  was_followed BOOLEAN NOT NULL DEFAULT true,
  engagement_quality TEXT NOT NULL DEFAULT 'good' CHECK (engagement_quality IN ('excellent', 'good', 'mediocre', 'poor')),
  duration_minutes INTEGER NOT NULL DEFAULT 0,

  outcome_notes TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_vector_engagement_user_date ON vector_engagement_records(user_id, timestamp DESC);
CREATE INDEX idx_vector_engagement_vector ON vector_engagement_records(vector_id, timestamp DESC);
CREATE INDEX idx_vector_engagement_quality ON vector_engagement_records(user_id, engagement_quality);

-- ============================================================
-- LEARNING PATTERNS
-- ============================================================

CREATE TABLE IF NOT EXISTS user_learning_patterns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  vector_id TEXT NOT NULL REFERENCES vector_definitions(id),

  optimal_time_of_day JSONB DEFAULT '[]',
  optimal_denial_day JSONB DEFAULT '[]',
  optimal_arousal_level JSONB DEFAULT '[]',

  average_engagement_duration INTEGER DEFAULT 0,
  completion_rate DECIMAL(5,2) DEFAULT 0,
  quality_trend TEXT DEFAULT 'stable' CHECK (quality_trend IN ('improving', 'stable', 'declining')),

  context_correlations JSONB DEFAULT '{}',

  last_updated TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(user_id, vector_id)
);

CREATE INDEX idx_learning_patterns_user ON user_learning_patterns(user_id);

-- ============================================================
-- USER LEARNING PROFILE (Aggregate)
-- ============================================================

CREATE TABLE IF NOT EXISTS user_learning_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,

  preferred_vectors JSONB DEFAULT '[]',
  avoided_vectors JSONB DEFAULT '[]',

  optimal_session_length INTEGER DEFAULT 30,
  peak_productivity_times JSONB DEFAULT '[]',
  context_sensitivities JSONB DEFAULT '{}',

  last_updated TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- IRREVERSIBILITY MARKERS
-- ============================================================

CREATE TABLE IF NOT EXISTS irreversibility_markers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  vector_id TEXT NOT NULL REFERENCES vector_definitions(id),

  milestone_name TEXT NOT NULL,
  achieved_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  level INTEGER NOT NULL,
  message TEXT NOT NULL,

  acknowledged BOOLEAN NOT NULL DEFAULT false,
  celebrated_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_irreversibility_markers_user ON irreversibility_markers(user_id, achieved_at DESC);
CREATE INDEX idx_irreversibility_markers_vector ON irreversibility_markers(vector_id);

-- ============================================================
-- LOCK-IN STATUS
-- ============================================================

CREATE TABLE IF NOT EXISTS vector_lock_in_status (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  vector_id TEXT NOT NULL REFERENCES vector_definitions(id),

  is_locked_in BOOLEAN NOT NULL DEFAULT false,
  lock_in_level INTEGER NOT NULL DEFAULT 0,
  lock_in_date TIMESTAMPTZ,

  regression_resistance DECIMAL(5,2) NOT NULL DEFAULT 0,
  permanence_score DECIMAL(5,2) NOT NULL DEFAULT 0,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(user_id, vector_id)
);

CREATE INDEX idx_lock_in_status_user ON vector_lock_in_status(user_id);
CREATE INDEX idx_lock_in_status_locked ON vector_lock_in_status(user_id, is_locked_in) WHERE is_locked_in = true;

-- ============================================================
-- VECTOR PROGRESS HISTORY (For Trends)
-- ============================================================

CREATE TABLE IF NOT EXISTS vector_progress_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  vector_id TEXT NOT NULL REFERENCES vector_definitions(id),

  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  level DECIMAL(4,2) NOT NULL,
  sub_component_scores JSONB NOT NULL DEFAULT '{}',

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_progress_history_user_date ON vector_progress_history(user_id, recorded_at DESC);
CREATE INDEX idx_progress_history_vector ON vector_progress_history(vector_id, recorded_at DESC);

-- Partition hint: Consider partitioning by month for large datasets
-- CREATE INDEX idx_progress_history_month ON vector_progress_history(user_id, date_trunc('month', recorded_at));

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

ALTER TABLE user_vector_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_prescriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE vector_engagement_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_learning_patterns ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_learning_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE irreversibility_markers ENABLE ROW LEVEL SECURITY;
ALTER TABLE vector_lock_in_status ENABLE ROW LEVEL SECURITY;
ALTER TABLE vector_progress_history ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Users own their vector states" ON user_vector_states
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users own their prescriptions" ON daily_prescriptions
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users own their engagement records" ON vector_engagement_records
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users own their learning patterns" ON user_learning_patterns
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users own their learning profile" ON user_learning_profiles
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users own their irreversibility markers" ON irreversibility_markers
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users own their lock-in status" ON vector_lock_in_status
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users own their progress history" ON vector_progress_history
  FOR ALL USING (auth.uid() = user_id);

-- Vector definitions are public read
CREATE POLICY "Vector definitions are public" ON vector_definitions
  FOR SELECT USING (true);

-- ============================================================
-- FUNCTIONS
-- ============================================================

-- Function to update vector state and track history
CREATE OR REPLACE FUNCTION update_vector_progress(
  p_user_id UUID,
  p_vector_id TEXT,
  p_level_delta DECIMAL,
  p_sub_component_id TEXT DEFAULT NULL,
  p_sub_component_delta DECIMAL DEFAULT 0,
  p_engagement_minutes INTEGER DEFAULT 0
)
RETURNS JSONB AS $$
DECLARE
  v_current_state user_vector_states%ROWTYPE;
  v_new_level DECIMAL;
  v_new_sub_scores JSONB;
  v_vector_def vector_definitions%ROWTYPE;
  v_milestones_achieved JSONB := '[]';
  v_new_lock_in BOOLEAN := false;
BEGIN
  -- Get vector definition
  SELECT * INTO v_vector_def FROM vector_definitions WHERE id = p_vector_id;

  -- Get or create user state
  INSERT INTO user_vector_states (user_id, vector_id)
  VALUES (p_user_id, p_vector_id)
  ON CONFLICT (user_id, vector_id) DO NOTHING;

  SELECT * INTO v_current_state
  FROM user_vector_states
  WHERE user_id = p_user_id AND vector_id = p_vector_id;

  -- Calculate new level
  v_new_level := LEAST(10, GREATEST(0, v_current_state.current_level + p_level_delta));

  -- Update sub-component if specified
  v_new_sub_scores := v_current_state.sub_component_scores;
  IF p_sub_component_id IS NOT NULL THEN
    v_new_sub_scores := jsonb_set(
      v_new_sub_scores,
      ARRAY[p_sub_component_id],
      to_jsonb(LEAST(100, GREATEST(0, COALESCE((v_new_sub_scores->p_sub_component_id)::DECIMAL, 0) + p_sub_component_delta)))
    );
  END IF;

  -- Check for lock-in
  IF NOT v_current_state.locked_in AND v_new_level >= v_vector_def.lock_in_threshold THEN
    v_new_lock_in := true;
  END IF;

  -- Update state
  UPDATE user_vector_states SET
    current_level = v_new_level,
    sub_component_scores = v_new_sub_scores,
    peak_level = GREATEST(peak_level, v_new_level),
    total_engagement_minutes = total_engagement_minutes + p_engagement_minutes,
    last_activity_date = NOW(),
    locked_in = locked_in OR v_new_lock_in,
    lock_in_date = CASE WHEN v_new_lock_in THEN NOW() ELSE lock_in_date END,
    updated_at = NOW()
  WHERE user_id = p_user_id AND vector_id = p_vector_id;

  -- Record history
  INSERT INTO vector_progress_history (user_id, vector_id, level, sub_component_scores)
  VALUES (p_user_id, p_vector_id, v_new_level, v_new_sub_scores);

  -- Update lock-in status if needed
  IF v_new_lock_in THEN
    INSERT INTO vector_lock_in_status (user_id, vector_id, is_locked_in, lock_in_level, lock_in_date)
    VALUES (p_user_id, p_vector_id, true, v_new_level::INTEGER, NOW())
    ON CONFLICT (user_id, vector_id) DO UPDATE SET
      is_locked_in = true,
      lock_in_level = EXCLUDED.lock_in_level,
      lock_in_date = NOW(),
      updated_at = NOW();
  END IF;

  RETURN jsonb_build_object(
    'previous_level', v_current_state.current_level,
    'new_level', v_new_level,
    'new_lock_in', v_new_lock_in,
    'sub_component_scores', v_new_sub_scores
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to calculate velocity trend
CREATE OR REPLACE FUNCTION calculate_velocity_trend(
  p_user_id UUID,
  p_vector_id TEXT
)
RETURNS TEXT AS $$
DECLARE
  v_recent_avg DECIMAL;
  v_older_avg DECIMAL;
  v_diff DECIMAL;
BEGIN
  -- Get average level from last 7 days
  SELECT AVG(level) INTO v_recent_avg
  FROM vector_progress_history
  WHERE user_id = p_user_id
    AND vector_id = p_vector_id
    AND recorded_at > NOW() - INTERVAL '7 days';

  -- Get average level from 7-14 days ago
  SELECT AVG(level) INTO v_older_avg
  FROM vector_progress_history
  WHERE user_id = p_user_id
    AND vector_id = p_vector_id
    AND recorded_at BETWEEN NOW() - INTERVAL '14 days' AND NOW() - INTERVAL '7 days';

  IF v_recent_avg IS NULL OR v_older_avg IS NULL THEN
    RETURN 'steady';
  END IF;

  v_diff := v_recent_avg - v_older_avg;

  IF v_diff > 0.5 THEN
    RETURN 'accelerating';
  ELSIF v_diff > 0 THEN
    RETURN 'steady';
  ELSIF v_diff > -0.3 THEN
    RETURN 'stalling';
  ELSE
    RETURN 'regressing';
  END IF;
END;
$$ LANGUAGE plpgsql;

-- Function to get user's current prescription
CREATE OR REPLACE FUNCTION get_active_prescription(p_user_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_prescription daily_prescriptions%ROWTYPE;
BEGIN
  SELECT * INTO v_prescription
  FROM daily_prescriptions
  WHERE user_id = p_user_id
    AND valid_until > NOW()
  ORDER BY generated_at DESC
  LIMIT 1;

  IF v_prescription.id IS NULL THEN
    RETURN NULL;
  END IF;

  RETURN to_jsonb(v_prescription);
END;
$$ LANGUAGE plpgsql;
