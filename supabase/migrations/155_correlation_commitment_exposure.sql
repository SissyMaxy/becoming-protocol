-- Migration 155: P10.8-P10.10 — Correlation Engine, Commitment Ladder, Gina Micro-Exposure
-- Tables: commitment_ladder_progress, gina_micro_exposures
-- (cross_system_correlations already exists in migration 154)

-- ============================================
-- 1. commitment_ladder_progress
-- ============================================
CREATE TABLE IF NOT EXISTS commitment_ladder_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  domain TEXT NOT NULL,
  current_level INTEGER DEFAULT 0,
  attempts_at_level INTEGER DEFAULT 0,
  completions_at_level INTEGER DEFAULT 0,
  last_attempt_at TIMESTAMPTZ,
  level_history JSONB DEFAULT '[]',
  UNIQUE(user_id, domain)
);

CREATE INDEX IF NOT EXISTS idx_commitment_ladder_user
  ON commitment_ladder_progress(user_id, domain);

ALTER TABLE commitment_ladder_progress ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'commitment_ladder_progress' AND policyname = 'Users own their data'
  ) THEN
    CREATE POLICY "Users own their data" ON commitment_ladder_progress FOR ALL USING (auth.uid() = user_id);
  END IF;
END $$;

-- ============================================
-- 2. gina_micro_exposures
-- ============================================
CREATE TABLE IF NOT EXISTS gina_micro_exposures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  channel TEXT NOT NULL,
  exposure TEXT NOT NULL,
  risk INTEGER NOT NULL DEFAULT 1,
  gina_response TEXT,  -- positive, neutral, negative, not_noticed
  prescribed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_micro_exposures_user
  ON gina_micro_exposures(user_id, channel, prescribed_at DESC);

ALTER TABLE gina_micro_exposures ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'gina_micro_exposures' AND policyname = 'Users own their data'
  ) THEN
    CREATE POLICY "Users own their data" ON gina_micro_exposures FOR ALL USING (auth.uid() = user_id);
  END IF;
END $$;
