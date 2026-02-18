-- Migration 034: v2 Failure Mode Tables
-- Schema additions for Becoming Protocol v2 Addendum A (Failure Mode Handling)

-- ============================================
-- FAILURE MODE EVENTS
-- Tracks detected failure modes and system responses
-- ============================================
CREATE TABLE IF NOT EXISTS failure_mode_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  failure_mode TEXT NOT NULL CHECK (failure_mode IN (
    'post_release_crash',
    'build_not_do',
    'depression_collapse',
    'voice_avoidance',
    'everything_at_once',
    'weekend_regression',
    'streak_catastrophize',
    'work_stress',
    'identity_crisis'
  )),
  detected_at TIMESTAMPTZ DEFAULT NOW(),
  detection_signals JSONB NOT NULL,
  intervention_type TEXT NOT NULL,
  intervention_content TEXT,
  handler_mode_at_detection TEXT,
  state_snapshot_at_detection JSONB,
  resolved_at TIMESTAMPTZ,
  resolution_signal TEXT,
  effectiveness_score INTEGER CHECK (effectiveness_score >= 1 AND effectiveness_score <= 5),
  notes TEXT
);

-- ============================================
-- TIME CAPSULES
-- Pre-written messages for crisis moments
-- ============================================
CREATE TABLE IF NOT EXISTS time_capsules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  capsule_type TEXT NOT NULL CHECK (capsule_type IN (
    'post_release',
    'identity_crisis',
    'streak_break',
    'depression',
    'motivation_letter',
    'peak_moment_capture'
  )),
  content TEXT NOT NULL,
  authored_during TEXT CHECK (authored_during IN (
    'peak_arousal',
    'high_momentum',
    'session',
    'manual'
  )),
  authored_at TIMESTAMPTZ DEFAULT NOW(),
  state_at_authoring JSONB,
  times_delivered INTEGER DEFAULT 0,
  last_delivered_at TIMESTAMPTZ,
  effectiveness_ratings JSONB DEFAULT '[]'
);

-- ============================================
-- ACTIVITY CLASSIFICATION
-- Tracks what type of activity user is doing
-- ============================================
CREATE TABLE IF NOT EXISTS activity_classification (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  activity_type TEXT NOT NULL CHECK (activity_type IN (
    'protocol_task',
    'building',
    'session',
    'idle',
    'work_stress',
    'offline'
  )),
  started_at TIMESTAMPTZ DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  duration_minutes INTEGER,
  was_interrupted BOOLEAN DEFAULT FALSE,
  interrupted_by TEXT
);

-- ============================================
-- WEEKEND PLANS
-- Weekend-specific engagement tracking
-- ============================================
CREATE TABLE IF NOT EXISTS weekend_plans_v2 (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  weekend_date DATE NOT NULL,
  planned_covert_tasks JSONB DEFAULT '[]',
  planned_shared_activities JSONB DEFAULT '[]',
  completed_covert_tasks JSONB DEFAULT '[]',
  completed_shared_activities JSONB DEFAULT '[]',
  engagement_score INTEGER CHECK (engagement_score >= 1 AND engagement_score <= 10),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, weekend_date)
);

-- ============================================
-- RECOVERY PROTOCOLS
-- Pre-built re-entry plans after failure modes
-- ============================================
CREATE TABLE IF NOT EXISTS recovery_protocols (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  protocol_type TEXT NOT NULL CHECK (protocol_type IN (
    'streak_break',
    'depression_recovery',
    'work_stress_recovery',
    'post_crisis',
    'post_binge'
  )),
  day_plans JSONB NOT NULL,
  generated_at TIMESTAMPTZ DEFAULT NOW(),
  generated_by TEXT DEFAULT 'handler' CHECK (generated_by IN ('handler', 'manual')),
  activated_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  completion_rate NUMERIC,
  led_to_new_streak BOOLEAN
);

-- ============================================
-- CRISIS KIT
-- Curated evidence for identity crisis moments
-- ============================================
CREATE TABLE IF NOT EXISTS crisis_kit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  item_type TEXT NOT NULL CHECK (item_type IN (
    'journal_entry',
    'photo',
    'voice_recording',
    'therapist_quote',
    'peak_moment',
    'commitment',
    'milestone'
  )),
  source_id UUID,
  content_preview TEXT,
  curated_by TEXT DEFAULT 'handler' CHECK (curated_by IN ('handler', 'user', 'both')),
  added_at TIMESTAMPTZ DEFAULT NOW(),
  times_shown INTEGER DEFAULT 0,
  last_shown_at TIMESTAMPTZ,
  user_effectiveness_rating INTEGER CHECK (user_effectiveness_rating >= 1 AND user_effectiveness_rating <= 5)
);

-- ============================================
-- ADD COLUMNS TO user_state (from migration 033)
-- ============================================
ALTER TABLE user_state
ADD COLUMN IF NOT EXISTS current_failure_mode TEXT,
ADD COLUMN IF NOT EXISTS last_release_mood_score INTEGER,
ADD COLUMN IF NOT EXISTS builder_mode_minutes_today INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS protocol_minutes_today INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS weekend_mode_active BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS work_stress_mode_active BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS recovery_protocol_active UUID,
ADD COLUMN IF NOT EXISTS crisis_kit_last_offered TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS consecutive_survival_days INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS tasks_per_day_cap INTEGER,
ADD COLUMN IF NOT EXISTS streak_break_count INTEGER DEFAULT 0;

-- ============================================
-- ADD COLUMNS TO mood_checkins (from migration 033)
-- ============================================
ALTER TABLE mood_checkins
ADD COLUMN IF NOT EXISTS context TEXT,
ADD COLUMN IF NOT EXISTS triggered_by TEXT;

-- ============================================
-- ADD COLUMNS TO intimate_sessions (arousal_sessions equivalent)
-- ============================================
ALTER TABLE intimate_sessions
ADD COLUMN IF NOT EXISTS post_session_mood INTEGER,
ADD COLUMN IF NOT EXISTS post_session_identity_score INTEGER,
ADD COLUMN IF NOT EXISTS time_capsule_delivered BOOLEAN DEFAULT FALSE;

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================
ALTER TABLE failure_mode_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE time_capsules ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_classification ENABLE ROW LEVEL SECURITY;
ALTER TABLE weekend_plans_v2 ENABLE ROW LEVEL SECURITY;
ALTER TABLE recovery_protocols ENABLE ROW LEVEL SECURITY;
ALTER TABLE crisis_kit ENABLE ROW LEVEL SECURITY;

-- RLS Policies
DROP POLICY IF EXISTS "Users access own failure_mode_events" ON failure_mode_events;
CREATE POLICY "Users access own failure_mode_events" ON failure_mode_events
  FOR ALL USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users access own time_capsules" ON time_capsules;
CREATE POLICY "Users access own time_capsules" ON time_capsules
  FOR ALL USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users access own activity_classification" ON activity_classification;
CREATE POLICY "Users access own activity_classification" ON activity_classification
  FOR ALL USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users access own weekend_plans_v2" ON weekend_plans_v2;
CREATE POLICY "Users access own weekend_plans_v2" ON weekend_plans_v2
  FOR ALL USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users access own recovery_protocols" ON recovery_protocols;
CREATE POLICY "Users access own recovery_protocols" ON recovery_protocols
  FOR ALL USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users access own crisis_kit" ON crisis_kit;
CREATE POLICY "Users access own crisis_kit" ON crisis_kit
  FOR ALL USING (auth.uid() = user_id);

-- ============================================
-- INDEXES
-- ============================================
CREATE INDEX IF NOT EXISTS idx_failure_mode_events_user ON failure_mode_events(user_id);
CREATE INDEX IF NOT EXISTS idx_failure_mode_events_detected ON failure_mode_events(user_id, detected_at DESC);
CREATE INDEX IF NOT EXISTS idx_failure_mode_events_mode ON failure_mode_events(user_id, failure_mode);
CREATE INDEX IF NOT EXISTS idx_failure_mode_events_unresolved ON failure_mode_events(user_id, resolved_at) WHERE resolved_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_time_capsules_user ON time_capsules(user_id);
CREATE INDEX IF NOT EXISTS idx_time_capsules_type ON time_capsules(user_id, capsule_type);
CREATE INDEX IF NOT EXISTS idx_time_capsules_delivery ON time_capsules(user_id, times_delivered);

CREATE INDEX IF NOT EXISTS idx_activity_classification_user ON activity_classification(user_id);
CREATE INDEX IF NOT EXISTS idx_activity_classification_started ON activity_classification(user_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_classification_type ON activity_classification(user_id, activity_type);

CREATE INDEX IF NOT EXISTS idx_weekend_plans_v2_user_date ON weekend_plans_v2(user_id, weekend_date DESC);

CREATE INDEX IF NOT EXISTS idx_recovery_protocols_user ON recovery_protocols(user_id);
CREATE INDEX IF NOT EXISTS idx_recovery_protocols_active ON recovery_protocols(user_id, activated_at) WHERE completed_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_crisis_kit_user ON crisis_kit(user_id);
CREATE INDEX IF NOT EXISTS idx_crisis_kit_type ON crisis_kit(user_id, item_type);
CREATE INDEX IF NOT EXISTS idx_crisis_kit_shown ON crisis_kit(user_id, times_shown);

-- ============================================
-- HELPER FUNCTIONS
-- ============================================

-- Function to get least-used time capsule of a type
CREATE OR REPLACE FUNCTION get_least_used_capsule(p_user_id UUID, p_capsule_type TEXT)
RETURNS TABLE (
  id UUID,
  content TEXT,
  times_delivered INTEGER
) AS $$
BEGIN
  RETURN QUERY
  SELECT tc.id, tc.content, tc.times_delivered
  FROM time_capsules tc
  WHERE tc.user_id = p_user_id
    AND tc.capsule_type = p_capsule_type
  ORDER BY tc.times_delivered ASC, tc.authored_at DESC
  LIMIT 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to detect consecutive survival days
CREATE OR REPLACE FUNCTION update_consecutive_survival_days()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.odometer = 'survival' THEN
    NEW.consecutive_survival_days = COALESCE(OLD.consecutive_survival_days, 0) + 1;
  ELSE
    NEW.consecutive_survival_days = 0;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_survival_days ON user_state;
CREATE TRIGGER trigger_survival_days
  BEFORE UPDATE OF odometer ON user_state
  FOR EACH ROW
  WHEN (OLD.odometer IS DISTINCT FROM NEW.odometer)
  EXECUTE FUNCTION update_consecutive_survival_days();
