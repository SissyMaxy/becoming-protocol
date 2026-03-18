-- Whoop Integration Tables
-- Stores OAuth tokens, daily metrics, and workout data

-- ============================================
-- WHOOP TOKENS
-- ============================================

CREATE TABLE IF NOT EXISTS whoop_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  scopes TEXT[] NOT NULL DEFAULT '{}',
  whoop_user_id INTEGER,
  connected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  disconnected_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id)
);

ALTER TABLE whoop_tokens ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can read own whoop tokens" ON whoop_tokens
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can update own whoop tokens" ON whoop_tokens
  FOR UPDATE USING (auth.uid() = user_id);

-- ============================================
-- WHOOP DAILY METRICS
-- ============================================

CREATE TABLE IF NOT EXISTS whoop_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date DATE NOT NULL,

  -- Recovery
  recovery_score INTEGER,
  hrv_rmssd_milli FLOAT,
  resting_heart_rate INTEGER,
  spo2_percentage FLOAT,
  skin_temp_celsius FLOAT,

  -- Sleep
  sleep_performance_percentage FLOAT,
  sleep_consistency_percentage FLOAT,
  sleep_efficiency_percentage FLOAT,
  total_sleep_duration_milli BIGINT,
  rem_sleep_milli BIGINT,
  deep_sleep_milli BIGINT,
  light_sleep_milli BIGINT,
  awake_milli BIGINT,
  disturbance_count INTEGER,
  respiratory_rate FLOAT,
  sleep_debt_milli BIGINT,

  -- Cycle / Day Strain
  day_strain FLOAT,
  day_kilojoule FLOAT,
  day_average_heart_rate INTEGER,
  day_max_heart_rate INTEGER,

  -- Body
  weight_kilogram FLOAT,

  -- Raw API responses for debugging
  raw_recovery JSONB,
  raw_sleep JSONB,
  raw_cycle JSONB,
  raw_workout JSONB,

  fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE(user_id, date)
);

CREATE INDEX IF NOT EXISTS idx_whoop_metrics_user_date ON whoop_metrics(user_id, date DESC);

ALTER TABLE whoop_metrics ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can read own whoop metrics" ON whoop_metrics
  FOR SELECT USING (auth.uid() = user_id);

-- ============================================
-- WHOOP WORKOUTS
-- ============================================

CREATE TABLE IF NOT EXISTS whoop_workouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  whoop_workout_id TEXT NOT NULL,
  date DATE NOT NULL,
  sport_name TEXT,
  sport_id INTEGER,
  strain FLOAT,
  average_heart_rate INTEGER,
  max_heart_rate INTEGER,
  kilojoule FLOAT,
  distance_meter FLOAT,
  duration_milli BIGINT,
  zone_zero_milli BIGINT,
  zone_one_milli BIGINT,
  zone_two_milli BIGINT,
  zone_three_milli BIGINT,
  zone_four_milli BIGINT,
  zone_five_milli BIGINT,
  raw_data JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, whoop_workout_id)
);

CREATE INDEX IF NOT EXISTS idx_whoop_workouts_user_date ON whoop_workouts(user_id, date DESC);

ALTER TABLE whoop_workouts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can read own whoop workouts" ON whoop_workouts
  FOR SELECT USING (auth.uid() = user_id);
