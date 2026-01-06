-- Migration 020: Denial State Table
-- Tracks user denial/chastity state for conditioning and vulnerability detection

-- ============================================
-- DENIAL STATE
-- Tracks current denial status per user
-- ============================================
CREATE TABLE IF NOT EXISTS denial_state (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL UNIQUE,
  current_denial_day INTEGER DEFAULT 0,
  is_locked BOOLEAN DEFAULT FALSE,
  lock_started_at TIMESTAMPTZ,
  longest_streak INTEGER DEFAULT 0,
  total_denial_days INTEGER DEFAULT 0,
  last_release_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================
ALTER TABLE denial_state ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users access own denial_state" ON denial_state;
CREATE POLICY "Users access own denial_state" ON denial_state
  FOR ALL USING (auth.uid() = user_id);

-- ============================================
-- INDEXES
-- ============================================
CREATE INDEX IF NOT EXISTS idx_denial_state_user_id ON denial_state(user_id);

-- ============================================
-- UPDATED_AT TRIGGER
-- ============================================
CREATE OR REPLACE FUNCTION update_denial_state_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_denial_state_updated_at ON denial_state;
CREATE TRIGGER trigger_denial_state_updated_at
  BEFORE UPDATE ON denial_state
  FOR EACH ROW
  EXECUTE FUNCTION update_denial_state_updated_at();
