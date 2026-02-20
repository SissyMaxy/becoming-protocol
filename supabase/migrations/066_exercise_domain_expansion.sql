-- Exercise Domain Expansion
-- Domain progression config, exercise weight/band progression tracking

-- ============================================
-- 1. Exercise Domain Config (per-user level + preferences)
-- ============================================

CREATE TABLE IF NOT EXISTS exercise_domain_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  domain_level INTEGER DEFAULT 1 CHECK (domain_level BETWEEN 1 AND 5),
  tasks_completed_this_level INTEGER DEFAULT 0,
  target_sessions_per_week INTEGER DEFAULT 3,
  preferred_workout_days TEXT[] DEFAULT '{}',
  equipment_owned TEXT[] DEFAULT '{}',
  novelty_rotation_index INTEGER DEFAULT 0,
  last_novelty_swap_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id)
);

ALTER TABLE exercise_domain_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own exercise domain config" ON exercise_domain_config
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own exercise domain config" ON exercise_domain_config
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own exercise domain config" ON exercise_domain_config
  FOR UPDATE USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_exercise_domain_config_user
  ON exercise_domain_config(user_id);

-- ============================================
-- 2. Exercise Progressions (weight/band tracking per exercise)
-- ============================================

CREATE TABLE IF NOT EXISTS exercise_progressions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  exercise_name TEXT NOT NULL,
  weight_lbs DECIMAL,
  band_level TEXT,
  notes TEXT,
  recorded_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE exercise_progressions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own exercise progressions" ON exercise_progressions
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own exercise progressions" ON exercise_progressions
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_exercise_progressions_user
  ON exercise_progressions(user_id, exercise_name, recorded_at DESC);
