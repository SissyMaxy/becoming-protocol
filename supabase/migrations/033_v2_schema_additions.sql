-- Migration 033: v2 Schema Additions
-- Adds missing tables and columns for Becoming Protocol v2

-- ============================================
-- PROFILE FOUNDATION: Add difficulty_level column
-- ============================================
ALTER TABLE profile_foundation
ADD COLUMN IF NOT EXISTS difficulty_level TEXT DEFAULT 'moderate';

COMMENT ON COLUMN profile_foundation.difficulty_level IS
  'Handler intensity: off, gentle, moderate, firm, relentless';

-- ============================================
-- USER STATE (Unified state table)
-- Central state tracking replacing scattered state across tables
-- ============================================
CREATE TABLE IF NOT EXISTS user_state (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL UNIQUE,

  -- Identity
  odometer TEXT DEFAULT 'coasting' CHECK (odometer IN ('survival', 'caution', 'coasting', 'progress', 'momentum', 'breakthrough')),
  current_phase INTEGER DEFAULT 0 CHECK (current_phase >= 0 AND current_phase <= 5),

  -- Streaks
  streak_days INTEGER DEFAULT 0,
  longest_streak INTEGER DEFAULT 0,
  domain_streaks JSONB DEFAULT '{}',

  -- Arousal/Denial
  denial_day INTEGER DEFAULT 0,
  current_arousal INTEGER DEFAULT 0 CHECK (current_arousal >= 0 AND current_arousal <= 5),
  in_session BOOLEAN DEFAULT FALSE,
  session_type TEXT,
  edge_count INTEGER DEFAULT 0,
  last_release TIMESTAMPTZ,

  -- Context
  gina_home BOOLEAN DEFAULT TRUE,
  estimated_exec_function TEXT DEFAULT 'medium' CHECK (estimated_exec_function IN ('high', 'medium', 'low', 'depleted')),

  -- Handler
  handler_mode TEXT DEFAULT 'director' CHECK (handler_mode IN ('architect', 'director', 'handler', 'caretaker', 'invisible')),
  escalation_level INTEGER DEFAULT 1 CHECK (escalation_level >= 1 AND escalation_level <= 5),
  vulnerability_window_active BOOLEAN DEFAULT FALSE,
  resistance_detected BOOLEAN DEFAULT FALSE,

  -- Gina
  gina_visibility_level INTEGER DEFAULT 0 CHECK (gina_visibility_level >= 0 AND gina_visibility_level <= 5),

  -- Tracking
  tasks_completed_today INTEGER DEFAULT 0,
  last_task_category TEXT,
  last_task_domain TEXT,
  completed_today TEXT[] DEFAULT '{}',
  avoided_domains TEXT[] DEFAULT '{}',

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- STATE HISTORY (For pattern detection)
-- ============================================
CREATE TABLE IF NOT EXISTS state_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  state_snapshot JSONB NOT NULL,
  recorded_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- MOOD CHECKINS (v2 schema)
-- ============================================
CREATE TABLE IF NOT EXISTS mood_checkins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  score INTEGER NOT NULL CHECK (score >= 1 AND score <= 10),
  energy INTEGER CHECK (energy >= 1 AND energy <= 10),
  anxiety INTEGER CHECK (anxiety >= 1 AND anxiety <= 10),
  feminine_alignment INTEGER CHECK (feminine_alignment >= 1 AND feminine_alignment <= 10),
  notes TEXT,
  recorded_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- DAILY ENTRIES (v2 schema - the ledger)
-- ============================================
CREATE TABLE IF NOT EXISTS daily_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  date DATE NOT NULL,
  tasks_completed INTEGER DEFAULT 0,
  points_earned INTEGER DEFAULT 0,
  domains_practiced TEXT[] DEFAULT '{}',
  alignment_score INTEGER CHECK (alignment_score >= 1 AND alignment_score <= 10),
  euphoria_notes TEXT,
  dysphoria_notes TEXT,
  handler_notes TEXT,
  completed BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, date)
);

-- ============================================
-- HANDLER INTERVENTIONS (v2 schema)
-- ============================================
CREATE TABLE IF NOT EXISTS handler_interventions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  intervention_type TEXT NOT NULL,
  handler_mode TEXT,
  strategy_used TEXT,
  content TEXT,
  user_response TEXT,
  effectiveness_rating INTEGER CHECK (effectiveness_rating >= 1 AND effectiveness_rating <= 5),
  state_snapshot JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- ESCALATION STATE (Per-domain tracking)
-- ============================================
CREATE TABLE IF NOT EXISTS escalation_state (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  domain TEXT NOT NULL,
  current_level INTEGER DEFAULT 0,
  current_description TEXT,
  next_level_description TEXT,
  last_escalation_date TIMESTAMPTZ,
  escalation_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, domain)
);

-- ============================================
-- BASELINES (Ratcheted floors)
-- ============================================
CREATE TABLE IF NOT EXISTS baselines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  domain TEXT NOT NULL,
  metric TEXT NOT NULL,
  baseline_value NUMERIC NOT NULL,
  previous_baseline NUMERIC,
  established_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- COMMITMENTS (Arousal-extracted - v2 schema)
-- Separate from existing arousal_commitments for cleaner v2 implementation
-- ============================================
CREATE TABLE IF NOT EXISTS commitments_v2 (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  commitment_text TEXT NOT NULL,
  extracted_during TEXT CHECK (extracted_during IN ('edge_session', 'goon_session', 'hypno', 'post_arousal', 'vulnerability_window')),
  arousal_level INTEGER CHECK (arousal_level >= 0 AND arousal_level <= 5),
  denial_day INTEGER,
  honored BOOLEAN DEFAULT FALSE,
  honored_at TIMESTAMPTZ,
  broken BOOLEAN DEFAULT FALSE,
  broken_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- CONTENT REFERENCES (Content library)
-- ============================================
CREATE TABLE IF NOT EXISTS content_references (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  url TEXT,
  title TEXT,
  source TEXT,
  content_type TEXT CHECK (content_type IN ('hypno', 'video', 'image', 'audio', 'text', 'article', 'tutorial')),
  category TEXT,
  intensity INTEGER CHECK (intensity >= 1 AND intensity <= 5),
  effectiveness_rating INTEGER CHECK (effectiveness_rating >= 1 AND effectiveness_rating <= 5),
  times_used INTEGER DEFAULT 0,
  tags JSONB DEFAULT '[]',
  last_used TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================
ALTER TABLE user_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE state_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE mood_checkins ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE handler_interventions ENABLE ROW LEVEL SECURITY;
ALTER TABLE escalation_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE baselines ENABLE ROW LEVEL SECURITY;
ALTER TABLE commitments_v2 ENABLE ROW LEVEL SECURITY;
ALTER TABLE content_references ENABLE ROW LEVEL SECURITY;

-- RLS Policies (users can only access their own data)
DROP POLICY IF EXISTS "Users access own user_state" ON user_state;
CREATE POLICY "Users access own user_state" ON user_state
  FOR ALL USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users access own state_history" ON state_history;
CREATE POLICY "Users access own state_history" ON state_history
  FOR ALL USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users access own mood_checkins" ON mood_checkins;
CREATE POLICY "Users access own mood_checkins" ON mood_checkins
  FOR ALL USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users access own daily_entries" ON daily_entries;
CREATE POLICY "Users access own daily_entries" ON daily_entries
  FOR ALL USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users access own handler_interventions" ON handler_interventions;
CREATE POLICY "Users access own handler_interventions" ON handler_interventions
  FOR ALL USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users access own escalation_state" ON escalation_state;
CREATE POLICY "Users access own escalation_state" ON escalation_state
  FOR ALL USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users access own baselines" ON baselines;
CREATE POLICY "Users access own baselines" ON baselines
  FOR ALL USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users access own commitments_v2" ON commitments_v2;
CREATE POLICY "Users access own commitments_v2" ON commitments_v2
  FOR ALL USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users access own content_references" ON content_references;
CREATE POLICY "Users access own content_references" ON content_references
  FOR ALL USING (auth.uid() = user_id);

-- ============================================
-- INDEXES
-- ============================================
CREATE INDEX IF NOT EXISTS idx_user_state_user_id ON user_state(user_id);
CREATE INDEX IF NOT EXISTS idx_state_history_user_id ON state_history(user_id);
CREATE INDEX IF NOT EXISTS idx_state_history_recorded ON state_history(user_id, recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_mood_checkins_user_id ON mood_checkins(user_id);
CREATE INDEX IF NOT EXISTS idx_mood_checkins_recorded ON mood_checkins(user_id, recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_daily_entries_user_date ON daily_entries(user_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_handler_interventions_user_id ON handler_interventions(user_id);
CREATE INDEX IF NOT EXISTS idx_handler_interventions_created ON handler_interventions(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_escalation_state_user_domain ON escalation_state(user_id, domain);
CREATE INDEX IF NOT EXISTS idx_baselines_user_id ON baselines(user_id);
CREATE INDEX IF NOT EXISTS idx_baselines_domain ON baselines(user_id, domain);
CREATE INDEX IF NOT EXISTS idx_commitments_v2_user_id ON commitments_v2(user_id);
CREATE INDEX IF NOT EXISTS idx_commitments_v2_honored ON commitments_v2(user_id, honored);
CREATE INDEX IF NOT EXISTS idx_content_references_user_id ON content_references(user_id);
CREATE INDEX IF NOT EXISTS idx_content_references_type ON content_references(user_id, content_type);
CREATE INDEX IF NOT EXISTS idx_content_references_category ON content_references(user_id, category);

-- ============================================
-- TRIGGERS
-- ============================================

-- Update user_state.updated_at on change
CREATE OR REPLACE FUNCTION update_user_state_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_user_state_updated ON user_state;
CREATE TRIGGER trigger_user_state_updated
  BEFORE UPDATE ON user_state
  FOR EACH ROW EXECUTE FUNCTION update_user_state_timestamp();

-- Auto-create user_state row on user creation
CREATE OR REPLACE FUNCTION create_user_state_on_signup()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO user_state (user_id) VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Only create trigger if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'on_auth_user_created_state'
  ) THEN
    CREATE TRIGGER on_auth_user_created_state
      AFTER INSERT ON auth.users
      FOR EACH ROW EXECUTE FUNCTION create_user_state_on_signup();
  END IF;
END $$;
