-- Migration 004: State Tracking Tables
-- Feminine state logs, streaks, regressions, identity language, pronoun stats, masculine patterns

-- ============================================
-- FEMININE STATE LOGS
-- Regular state check-ins
-- ============================================
CREATE TABLE IF NOT EXISTS feminine_state_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  timestamp TIMESTAMPTZ DEFAULT NOW(),
  state_score INTEGER NOT NULL, -- 1-10 scale
  prompt_type TEXT, -- random_check, morning_check, evening_check, session_end
  context TEXT,
  triggers_present JSONB DEFAULT '[]',
  notes TEXT
);

-- ============================================
-- STATE STREAKS
-- Tracking streaks of various behaviors
-- ============================================
CREATE TABLE IF NOT EXISTS state_streaks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  streak_type TEXT NOT NULL, -- feminine_state, anchor_use, check_in, denial, chastity
  started_at TIMESTAMPTZ NOT NULL,
  ended_at TIMESTAMPTZ,
  threshold_value INTEGER, -- minimum value to maintain streak
  current_value INTEGER,
  longest_duration_minutes INTEGER,
  active BOOLEAN DEFAULT TRUE
);

-- ============================================
-- REGRESSION EVENTS
-- When feminine state drops or regresses
-- ============================================
CREATE TABLE IF NOT EXISTS regression_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  detected_at TIMESTAMPTZ DEFAULT NOW(),
  regression_type TEXT, -- state_drop, anchor_skip, masculine_behavior, resistance_spike
  severity INTEGER, -- 1-10
  context TEXT,
  trigger_cause TEXT,
  intervention_applied TEXT,
  recovery_time_minutes INTEGER,
  notes TEXT
);

-- ============================================
-- IDENTITY LANGUAGE EVENTS
-- Tracking language corrections and shifts
-- ============================================
CREATE TABLE IF NOT EXISTS identity_language_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  event_type TEXT NOT NULL, -- correction, slip, success, reinforcement
  original_text TEXT,
  corrected_text TEXT,
  context TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- PRONOUN STATS
-- Daily pronoun usage statistics
-- ============================================
CREATE TABLE IF NOT EXISTS pronoun_stats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  date DATE NOT NULL,
  feminine_uses INTEGER DEFAULT 0,
  masculine_catches INTEGER DEFAULT 0,
  neutral_uses INTEGER DEFAULT 0,
  ratio DECIMAL, -- feminine/(feminine+masculine)
  streak_days INTEGER DEFAULT 0,
  UNIQUE(user_id, date)
);

-- ============================================
-- MASCULINE PATTERNS
-- Identified masculine behaviors to catch
-- ============================================
CREATE TABLE IF NOT EXISTS masculine_patterns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  category TEXT NOT NULL, -- language, posture, behavior, thought, appearance
  pattern_name TEXT NOT NULL,
  description TEXT,
  first_identified TIMESTAMPTZ DEFAULT NOW(),
  times_caught INTEGER DEFAULT 0,
  times_corrected INTEGER DEFAULT 0,
  status TEXT DEFAULT 'active', -- active, improving, resolved, recurring
  feminine_replacement TEXT,
  replacement_automaticity INTEGER DEFAULT 0 -- 0-100
);

-- ============================================
-- PATTERN CATCHES
-- Individual instances of pattern catches
-- ============================================
CREATE TABLE IF NOT EXISTS pattern_catches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pattern_id UUID REFERENCES masculine_patterns NOT NULL,
  user_id UUID REFERENCES auth.users NOT NULL,
  caught_at TIMESTAMPTZ DEFAULT NOW(),
  context TEXT,
  trigger_cause TEXT,
  correction_applied BOOLEAN DEFAULT FALSE,
  correction_success BOOLEAN
);

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================
ALTER TABLE feminine_state_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE state_streaks ENABLE ROW LEVEL SECURITY;
ALTER TABLE regression_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE identity_language_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE pronoun_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE masculine_patterns ENABLE ROW LEVEL SECURITY;
ALTER TABLE pattern_catches ENABLE ROW LEVEL SECURITY;

-- RLS Policies
DROP POLICY IF EXISTS "Users access own state_logs" ON feminine_state_logs;
CREATE POLICY "Users access own state_logs" ON feminine_state_logs FOR ALL USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users access own streaks" ON state_streaks;
CREATE POLICY "Users access own streaks" ON state_streaks FOR ALL USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users access own regressions" ON regression_events;
CREATE POLICY "Users access own regressions" ON regression_events FOR ALL USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users access own language" ON identity_language_events;
CREATE POLICY "Users access own language" ON identity_language_events FOR ALL USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users access own pronouns" ON pronoun_stats;
CREATE POLICY "Users access own pronouns" ON pronoun_stats FOR ALL USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users access own patterns" ON masculine_patterns;
CREATE POLICY "Users access own patterns" ON masculine_patterns FOR ALL USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users access own catches" ON pattern_catches;
CREATE POLICY "Users access own catches" ON pattern_catches FOR ALL USING (auth.uid() = user_id);

-- ============================================
-- INDEXES
-- ============================================
CREATE INDEX IF NOT EXISTS idx_feminine_state_logs_user_id ON feminine_state_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_feminine_state_logs_timestamp ON feminine_state_logs(user_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_state_streaks_user_id ON state_streaks(user_id);
CREATE INDEX IF NOT EXISTS idx_state_streaks_active ON state_streaks(user_id, active);
CREATE INDEX IF NOT EXISTS idx_state_streaks_type ON state_streaks(user_id, streak_type);
CREATE INDEX IF NOT EXISTS idx_regression_events_user_id ON regression_events(user_id);
CREATE INDEX IF NOT EXISTS idx_regression_events_detected ON regression_events(user_id, detected_at DESC);
CREATE INDEX IF NOT EXISTS idx_identity_language_events_user_id ON identity_language_events(user_id);
CREATE INDEX IF NOT EXISTS idx_identity_language_events_created ON identity_language_events(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pronoun_stats_user_date ON pronoun_stats(user_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_masculine_patterns_user_id ON masculine_patterns(user_id);
CREATE INDEX IF NOT EXISTS idx_masculine_patterns_status ON masculine_patterns(user_id, status);
CREATE INDEX IF NOT EXISTS idx_pattern_catches_user_id ON pattern_catches(user_id);
CREATE INDEX IF NOT EXISTS idx_pattern_catches_pattern ON pattern_catches(pattern_id);
CREATE INDEX IF NOT EXISTS idx_pattern_catches_caught ON pattern_catches(user_id, caught_at DESC);
