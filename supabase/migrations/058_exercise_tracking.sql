-- Exercise Tracking Tables
-- Guided workout sessions, exercise streaks, body measurements

-- ============================================
-- EXERCISE SESSIONS
-- ============================================

CREATE TABLE IF NOT EXISTS exercise_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_type TEXT NOT NULL CHECK (session_type IN ('full', 'mvw', 'gym')),
  template_used TEXT,
  location TEXT DEFAULT 'home' CHECK (location IN ('home', 'gym')),
  exercises_completed JSONB NOT NULL DEFAULT '[]',
  duration_minutes INTEGER,
  device_used BOOLEAN DEFAULT FALSE,
  denial_day INTEGER,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_exercise_sessions_user ON exercise_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_exercise_sessions_user_date ON exercise_sessions(user_id, created_at DESC);

-- ============================================
-- EXERCISE STREAKS
-- ============================================

CREATE TABLE IF NOT EXISTS exercise_streaks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  current_streak_weeks INTEGER DEFAULT 0,
  sessions_this_week INTEGER DEFAULT 0,
  week_start DATE NOT NULL DEFAULT (date_trunc('week', CURRENT_DATE)::date),
  total_sessions INTEGER DEFAULT 0,
  total_mvw_sessions INTEGER DEFAULT 0,
  total_full_sessions INTEGER DEFAULT 0,
  total_gym_sessions INTEGER DEFAULT 0,
  longest_streak_weeks INTEGER DEFAULT 0,
  gym_gate_unlocked BOOLEAN DEFAULT FALSE,
  gym_gate_unlocked_at TIMESTAMPTZ,
  last_session_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id)
);

CREATE INDEX IF NOT EXISTS idx_exercise_streaks_user ON exercise_streaks(user_id);

-- ============================================
-- BODY MEASUREMENTS
-- ============================================

CREATE TABLE IF NOT EXISTS body_measurements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  hips_inches DECIMAL,
  waist_inches DECIMAL,
  hip_waist_ratio DECIMAL GENERATED ALWAYS AS (
    CASE WHEN waist_inches > 0 THEN ROUND(hips_inches / waist_inches, 3) ELSE NULL END
  ) STORED,
  thigh_left_inches DECIMAL,
  thigh_right_inches DECIMAL,
  shoulders_inches DECIMAL,
  weight_lbs DECIMAL,
  notes TEXT,
  measured_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_body_measurements_user ON body_measurements(user_id);
CREATE INDEX IF NOT EXISTS idx_body_measurements_user_date ON body_measurements(user_id, measured_at DESC);

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================

ALTER TABLE exercise_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE exercise_streaks ENABLE ROW LEVEL SECURITY;
ALTER TABLE body_measurements ENABLE ROW LEVEL SECURITY;

-- exercise_sessions
DROP POLICY IF EXISTS "Users can view own exercise sessions" ON exercise_sessions;
CREATE POLICY "Users can view own exercise sessions" ON exercise_sessions
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own exercise sessions" ON exercise_sessions;
CREATE POLICY "Users can insert own exercise sessions" ON exercise_sessions
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own exercise sessions" ON exercise_sessions;
CREATE POLICY "Users can update own exercise sessions" ON exercise_sessions
  FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own exercise sessions" ON exercise_sessions;
CREATE POLICY "Users can delete own exercise sessions" ON exercise_sessions
  FOR DELETE USING (auth.uid() = user_id);

-- exercise_streaks
DROP POLICY IF EXISTS "Users can view own exercise streaks" ON exercise_streaks;
CREATE POLICY "Users can view own exercise streaks" ON exercise_streaks
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own exercise streaks" ON exercise_streaks;
CREATE POLICY "Users can insert own exercise streaks" ON exercise_streaks
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own exercise streaks" ON exercise_streaks;
CREATE POLICY "Users can update own exercise streaks" ON exercise_streaks
  FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own exercise streaks" ON exercise_streaks;
CREATE POLICY "Users can delete own exercise streaks" ON exercise_streaks
  FOR DELETE USING (auth.uid() = user_id);

-- body_measurements
DROP POLICY IF EXISTS "Users can view own body measurements" ON body_measurements;
CREATE POLICY "Users can view own body measurements" ON body_measurements
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own body measurements" ON body_measurements;
CREATE POLICY "Users can insert own body measurements" ON body_measurements
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own body measurements" ON body_measurements;
CREATE POLICY "Users can update own body measurements" ON body_measurements
  FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own body measurements" ON body_measurements;
CREATE POLICY "Users can delete own body measurements" ON body_measurements
  FOR DELETE USING (auth.uid() = user_id);
