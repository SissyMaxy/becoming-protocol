-- Migration 006: Arousal & Session Tables
-- Arousal states, intimate sessions, commitments, denial tracking, chastity sessions

-- ============================================
-- AROUSAL STATES
-- Point-in-time arousal level records
-- ============================================
CREATE TABLE IF NOT EXISTS arousal_states (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  level INTEGER NOT NULL, -- 1-10
  recorded_at TIMESTAMPTZ DEFAULT NOW(),
  context TEXT,
  denial_day INTEGER,
  notes TEXT
);

-- Fix for pre-existing arousal_states table missing columns
ALTER TABLE arousal_states ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users;
ALTER TABLE arousal_states ADD COLUMN IF NOT EXISTS recorded_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE arousal_states ADD COLUMN IF NOT EXISTS context TEXT;
ALTER TABLE arousal_states ADD COLUMN IF NOT EXISTS denial_day INTEGER;
ALTER TABLE arousal_states ADD COLUMN IF NOT EXISTS notes TEXT;

-- ============================================
-- INTIMATE SESSIONS
-- Edge, goon, hypno, and other sessions
-- ============================================
CREATE TABLE IF NOT EXISTS intimate_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  session_type TEXT NOT NULL, -- edge, goon, hypno, locked_edge, conditioning
  started_at TIMESTAMPTZ DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  edge_count INTEGER DEFAULT 0,
  peak_arousal INTEGER,
  content_consumed JSONB DEFAULT '[]',
  commitments_made JSONB DEFAULT '[]',
  lovense_connected BOOLEAN DEFAULT FALSE,
  lovense_device_id TEXT,
  notes TEXT
);

-- ============================================
-- AROUSAL COMMITMENTS
-- Commitments made during arousal states
-- ============================================
CREATE TABLE IF NOT EXISTS arousal_commitments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES intimate_sessions,
  user_id UUID REFERENCES auth.users NOT NULL,
  commitment_type TEXT NOT NULL, -- escalation, task, purchase, behavior, service
  commitment_value TEXT NOT NULL,
  edge_number INTEGER,
  arousal_level INTEGER,
  accepted BOOLEAN DEFAULT FALSE,
  fulfilled BOOLEAN,
  fulfilled_at TIMESTAMPTZ,
  broken BOOLEAN DEFAULT FALSE,
  broken_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- DENIAL TRACKING
-- Orgasm denial periods
-- ============================================
CREATE TABLE IF NOT EXISTS denial_tracking (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  planned_days INTEGER,
  actual_days INTEGER,
  end_reason TEXT, -- completed, ruined, full_release, emergency
  edge_count_total INTEGER DEFAULT 0,
  notes TEXT
);

-- ============================================
-- CHASTITY SESSIONS
-- Chastity device usage tracking
-- ============================================
CREATE TABLE IF NOT EXISTS chastity_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  locked_at TIMESTAMPTZ DEFAULT NOW(),
  unlocked_at TIMESTAMPTZ,
  planned_hours INTEGER,
  actual_hours INTEGER,
  device_type TEXT,
  early_unlock BOOLEAN DEFAULT FALSE,
  early_unlock_reason TEXT,
  gina_approved BOOLEAN DEFAULT FALSE,
  notes TEXT
);

-- ============================================
-- SESSION CONTENT LOG
-- Content consumed during sessions
-- ============================================
CREATE TABLE IF NOT EXISTS session_content_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES intimate_sessions NOT NULL,
  user_id UUID REFERENCES auth.users NOT NULL,
  content_type TEXT NOT NULL, -- hypno, video, image, audio, text
  content_url TEXT,
  content_description TEXT,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  duration_seconds INTEGER,
  arousal_impact INTEGER, -- how much it affected arousal
  notes TEXT
);

-- Fix for pre-existing session_content_log table missing columns
ALTER TABLE session_content_log ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users;
ALTER TABLE session_content_log ADD COLUMN IF NOT EXISTS content_type TEXT;
ALTER TABLE session_content_log ADD COLUMN IF NOT EXISTS content_url TEXT;
ALTER TABLE session_content_log ADD COLUMN IF NOT EXISTS content_description TEXT;
ALTER TABLE session_content_log ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE session_content_log ADD COLUMN IF NOT EXISTS ended_at TIMESTAMPTZ;
ALTER TABLE session_content_log ADD COLUMN IF NOT EXISTS duration_seconds INTEGER;
ALTER TABLE session_content_log ADD COLUMN IF NOT EXISTS arousal_impact INTEGER;

-- ============================================
-- EDGE LOGS
-- Individual edge events within sessions
-- ============================================
CREATE TABLE IF NOT EXISTS edge_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES intimate_sessions NOT NULL,
  user_id UUID REFERENCES auth.users NOT NULL,
  edge_number INTEGER NOT NULL,
  arousal_level INTEGER,
  timestamp TIMESTAMPTZ DEFAULT NOW(),
  duration_seconds INTEGER, -- how long at edge
  commitment_prompted BOOLEAN DEFAULT FALSE,
  commitment_accepted BOOLEAN,
  notes TEXT
);

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================
ALTER TABLE arousal_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE intimate_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE arousal_commitments ENABLE ROW LEVEL SECURITY;
ALTER TABLE denial_tracking ENABLE ROW LEVEL SECURITY;
ALTER TABLE chastity_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE session_content_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE edge_logs ENABLE ROW LEVEL SECURITY;

-- RLS Policies
DROP POLICY IF EXISTS "Users access own arousal" ON arousal_states;
CREATE POLICY "Users access own arousal" ON arousal_states FOR ALL USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users access own sessions" ON intimate_sessions;
CREATE POLICY "Users access own sessions" ON intimate_sessions FOR ALL USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users access own commitments" ON arousal_commitments;
CREATE POLICY "Users access own commitments" ON arousal_commitments FOR ALL USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users access own denial" ON denial_tracking;
CREATE POLICY "Users access own denial" ON denial_tracking FOR ALL USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users access own chastity" ON chastity_sessions;
CREATE POLICY "Users access own chastity" ON chastity_sessions FOR ALL USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users access own session_content" ON session_content_log;
CREATE POLICY "Users access own session_content" ON session_content_log FOR ALL USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users access own edge_logs" ON edge_logs;
CREATE POLICY "Users access own edge_logs" ON edge_logs FOR ALL USING (auth.uid() = user_id);

-- ============================================
-- INDEXES
-- ============================================
CREATE INDEX IF NOT EXISTS idx_arousal_states_user_id ON arousal_states(user_id);
CREATE INDEX IF NOT EXISTS idx_arousal_states_recorded ON arousal_states(user_id, recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_intimate_sessions_user_id ON intimate_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_intimate_sessions_started ON intimate_sessions(user_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_intimate_sessions_type ON intimate_sessions(user_id, session_type);
CREATE INDEX IF NOT EXISTS idx_arousal_commitments_user_id ON arousal_commitments(user_id);
CREATE INDEX IF NOT EXISTS idx_arousal_commitments_session ON arousal_commitments(session_id);
CREATE INDEX IF NOT EXISTS idx_arousal_commitments_accepted ON arousal_commitments(user_id, accepted);
CREATE INDEX IF NOT EXISTS idx_arousal_commitments_fulfilled ON arousal_commitments(user_id, fulfilled);
CREATE INDEX IF NOT EXISTS idx_denial_tracking_user_id ON denial_tracking(user_id);
CREATE INDEX IF NOT EXISTS idx_denial_tracking_active ON denial_tracking(user_id, ended_at) WHERE ended_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_chastity_sessions_user_id ON chastity_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_chastity_sessions_active ON chastity_sessions(user_id, unlocked_at) WHERE unlocked_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_session_content_log_session ON session_content_log(session_id);
CREATE INDEX IF NOT EXISTS idx_session_content_log_user ON session_content_log(user_id);
CREATE INDEX IF NOT EXISTS idx_edge_logs_session ON edge_logs(session_id);
CREATE INDEX IF NOT EXISTS idx_edge_logs_user ON edge_logs(user_id);
