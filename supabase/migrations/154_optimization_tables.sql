-- Migration 154: Optimization Tables
-- Tables: denial_cycle_analytics, identity_language_metrics, cross_system_correlations

-- ============================================
-- 1. denial_cycle_analytics
-- ============================================
CREATE TABLE IF NOT EXISTS denial_cycle_analytics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  denial_day INTEGER NOT NULL,

  -- Behavioral metrics for this denial day (aggregated across cycles)
  avg_compliance_rate FLOAT,
  avg_arousal_level FLOAT,
  avg_trance_depth FLOAT,
  vulnerability_window_count INTEGER DEFAULT 0,
  confession_count INTEGER DEFAULT 0,
  task_completion_rate FLOAT,
  session_completion_rate FLOAT,

  -- Sample size
  cycles_observed INTEGER DEFAULT 0,

  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, denial_day)
);

CREATE INDEX IF NOT EXISTS idx_denial_analytics ON denial_cycle_analytics(user_id, denial_day);

ALTER TABLE denial_cycle_analytics ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'denial_cycle_analytics' AND policyname = 'Users own their data'
  ) THEN
    CREATE POLICY "Users own their data" ON denial_cycle_analytics FOR ALL USING (auth.uid() = user_id);
  END IF;
END $$;

-- ============================================
-- 2. identity_language_metrics
-- ============================================
CREATE TABLE IF NOT EXISTS identity_language_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date DATE NOT NULL,

  feminine_pronoun_count INTEGER DEFAULT 0,
  masculine_pronoun_count INTEGER DEFAULT 0,
  name_self_reference_count INTEGER DEFAULT 0,
  embodied_language_count INTEGER DEFAULT 0,
  total_words INTEGER DEFAULT 0,

  feminine_ratio FLOAT,

  UNIQUE(user_id, date)
);

CREATE INDEX IF NOT EXISTS idx_lang_metrics ON identity_language_metrics(user_id, date DESC);

ALTER TABLE identity_language_metrics ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'identity_language_metrics' AND policyname = 'Users own their data'
  ) THEN
    CREATE POLICY "Users own their data" ON identity_language_metrics FOR ALL USING (auth.uid() = user_id);
  END IF;
END $$;

-- ============================================
-- 3. cross_system_correlations
-- ============================================
CREATE TABLE IF NOT EXISTS cross_system_correlations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  correlation_type TEXT NOT NULL,
  factor_a TEXT NOT NULL,
  factor_b TEXT NOT NULL,
  correlation_strength FLOAT,  -- -1 to 1
  sample_size INTEGER,
  description TEXT,

  computed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, correlation_type)
);

ALTER TABLE cross_system_correlations ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'cross_system_correlations' AND policyname = 'Users own their data'
  ) THEN
    CREATE POLICY "Users own their data" ON cross_system_correlations FOR ALL USING (auth.uid() = user_id);
  END IF;
END $$;
