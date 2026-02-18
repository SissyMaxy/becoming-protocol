-- Task Curation Schema
-- Swipe-based task evaluation and AI preference learning

-- ============================================
-- USER TASK CURATIONS
-- Records individual task evaluation decisions
-- ============================================

CREATE TABLE IF NOT EXISTS user_task_curations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  task_id UUID NOT NULL REFERENCES task_bank(id) ON DELETE CASCADE,

  -- Decision
  decision VARCHAR(20) NOT NULL CHECK (decision IN ('keep', 'reject', 'needs_work')),
  decided_at TIMESTAMPTZ DEFAULT NOW(),

  -- Context at decision (for AI learning)
  intensity_at_decision INT NOT NULL,
  domain_at_decision VARCHAR(30) NOT NULL,
  category_at_decision VARCHAR(30) NOT NULL,
  session_position INT NOT NULL,
  swipe_duration_ms INT,

  -- AI improvement feedback (for needs_work)
  improvement_feedback TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW(),

  -- One decision per task per user
  UNIQUE(user_id, task_id)
);

-- ============================================
-- USER TASK PREFERENCES
-- Learned weights from curation decisions
-- ============================================

CREATE TABLE IF NOT EXISTS user_task_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Learned weights
  category_weights JSONB DEFAULT '{}',
  domain_weights JSONB DEFAULT '{}',
  intensity_comfort INT DEFAULT 1,
  intensity_progression_rate FLOAT DEFAULT 0.1,

  -- Stats
  total_curations INT DEFAULT 0,
  keep_rate FLOAT DEFAULT 0.5,
  last_session_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- One preferences row per user
  UNIQUE(user_id)
);

-- ============================================
-- CURATION SESSIONS
-- Tracks individual curation sessions
-- ============================================

CREATE TABLE IF NOT EXISTS curation_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Timing
  started_at TIMESTAMPTZ DEFAULT NOW(),
  ended_at TIMESTAMPTZ,

  -- Stats
  tasks_shown INT DEFAULT 0,
  tasks_kept INT DEFAULT 0,
  tasks_rejected INT DEFAULT 0,
  tasks_needs_work INT DEFAULT 0,
  max_intensity_reached INT DEFAULT 1,

  -- End state
  session_completed BOOLEAN DEFAULT false,
  ending_reason VARCHAR(20), -- 'exhausted', 'user_exit', 'session_limit'

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- INDEXES
-- ============================================

CREATE INDEX IF NOT EXISTS idx_user_task_curations_user ON user_task_curations(user_id);
CREATE INDEX IF NOT EXISTS idx_user_task_curations_decision ON user_task_curations(decision);
CREATE INDEX IF NOT EXISTS idx_user_task_curations_task ON user_task_curations(task_id);
CREATE INDEX IF NOT EXISTS idx_user_task_preferences_user ON user_task_preferences(user_id);
CREATE INDEX IF NOT EXISTS idx_curation_sessions_user ON curation_sessions(user_id);

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================

ALTER TABLE user_task_curations ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_task_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE curation_sessions ENABLE ROW LEVEL SECURITY;

-- Users can only access their own curations
CREATE POLICY "Users own user_task_curations"
  ON user_task_curations
  FOR ALL
  USING (auth.uid() = user_id);

-- Users can only access their own preferences
CREATE POLICY "Users own user_task_preferences"
  ON user_task_preferences
  FOR ALL
  USING (auth.uid() = user_id);

-- Users can only access their own sessions
CREATE POLICY "Users own curation_sessions"
  ON curation_sessions
  FOR ALL
  USING (auth.uid() = user_id);
