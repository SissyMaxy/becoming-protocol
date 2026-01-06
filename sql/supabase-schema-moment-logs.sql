-- Becoming Protocol: Moment Logs Schema
-- Quick euphoria/dysphoria logging with context capture

-- ============================================
-- TABLE: moment_logs
-- ============================================

CREATE TABLE IF NOT EXISTS moment_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Core data
  type TEXT NOT NULL CHECK (type IN ('euphoria', 'dysphoria', 'arousal')),
  intensity INTEGER NOT NULL CHECK (intensity BETWEEN 1 AND 4),
  logged_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Triggers (JSONB array of trigger IDs)
  triggers JSONB DEFAULT '[]',
  custom_trigger_text TEXT,

  -- Optional note
  note TEXT,

  -- Context (auto-captured)
  time_of_day TEXT NOT NULL CHECK (time_of_day IN ('morning', 'afternoon', 'evening', 'night')),
  day_of_week TEXT NOT NULL,
  denial_day INTEGER,
  arousal_state TEXT,
  recent_task_completed TEXT,

  -- Support tracking (dysphoria only)
  support_offered BOOLEAN NOT NULL DEFAULT false,
  support_taken TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- INDEXES
-- ============================================

CREATE INDEX IF NOT EXISTS idx_moment_logs_user_date ON moment_logs(user_id, logged_at DESC);
CREATE INDEX IF NOT EXISTS idx_moment_logs_user_type ON moment_logs(user_id, type);
CREATE INDEX IF NOT EXISTS idx_moment_logs_triggers ON moment_logs USING GIN (triggers);

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================

ALTER TABLE moment_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users own moment_logs" ON moment_logs;
CREATE POLICY "Users own moment_logs" ON moment_logs
  FOR ALL USING (auth.uid() = user_id);

-- ============================================
-- COMMENTS
-- ============================================

COMMENT ON TABLE moment_logs IS 'Quick euphoria/dysphoria moment logging with context capture';
COMMENT ON COLUMN moment_logs.type IS 'Either euphoria or dysphoria';
COMMENT ON COLUMN moment_logs.intensity IS '1=Faint, 2=Nice, 3=Strong, 4=Overwhelming';
COMMENT ON COLUMN moment_logs.triggers IS 'Array of trigger IDs that contributed to this moment';
COMMENT ON COLUMN moment_logs.time_of_day IS 'Auto-captured: morning, afternoon, evening, night';
COMMENT ON COLUMN moment_logs.denial_day IS 'Days into current denial streak when logged';
COMMENT ON COLUMN moment_logs.support_offered IS 'Whether support options were shown (dysphoria only)';
COMMENT ON COLUMN moment_logs.support_taken IS 'Which support option was selected: breathing, affirmation, grounding, skipped';
