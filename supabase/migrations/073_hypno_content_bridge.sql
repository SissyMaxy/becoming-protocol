-- ============================================
-- Migration 073: Hypno Content Bridge
-- Handler-curated hypno library + capture-integrated sessions.
-- Turns passive hypno consumption into content production.
-- ============================================

-- ============================================
-- HYPNO LIBRARY — Handler-curated content catalog
-- ============================================

CREATE TABLE IF NOT EXISTS hypno_library (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,

  -- Content identity
  title TEXT NOT NULL,
  source_url TEXT,
  file_path TEXT,
  media_type TEXT NOT NULL CHECK (media_type IN ('audio', 'video', 'text')),

  -- Classification (reuses HypnoContentType values)
  content_category TEXT NOT NULL CHECK (content_category IN (
    'feminization', 'sissy_training', 'submission', 'body_acceptance',
    'arousal_denial', 'identity', 'voice', 'behavior', 'relaxation', 'sleep'
  )),
  intensity INTEGER NOT NULL CHECK (intensity BETWEEN 1 AND 5),
  conditioning_targets TEXT[] DEFAULT '{}',

  -- Gating
  min_denial_day INTEGER DEFAULT 0,
  min_protocol_level INTEGER DEFAULT 1,
  requires_cage BOOLEAN DEFAULT false,

  -- Capture metadata
  capture_value INTEGER DEFAULT 0 CHECK (capture_value BETWEEN 0 AND 10),
  capture_type TEXT CHECK (capture_type IS NULL OR capture_type IN (
    'passive', 'flagged', 'active'
  )),

  -- Usage tracking
  times_used INTEGER DEFAULT 0,
  last_used_at TIMESTAMPTZ,

  -- Handler metadata
  handler_notes TEXT,
  is_active BOOLEAN DEFAULT true,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_hypno_library_category ON hypno_library(user_id, content_category, intensity);
CREATE INDEX IF NOT EXISTS idx_hypno_library_denial ON hypno_library(user_id, min_denial_day);
CREATE INDEX IF NOT EXISTS idx_hypno_library_active ON hypno_library(user_id, is_active);

ALTER TABLE hypno_library ENABLE ROW LEVEL SECURITY;
CREATE POLICY hypno_library_user ON hypno_library FOR ALL USING (auth.uid() = user_id);

-- ============================================
-- HYPNO SESSIONS — Sessions with capture integration
-- Separate from bambi_states; bridges at session end
-- ============================================

CREATE TABLE IF NOT EXISTS hypno_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,

  -- Library reference
  library_item_id UUID REFERENCES hypno_library(id) ON DELETE SET NULL,
  content_ids UUID[] DEFAULT '{}',

  -- Session classification
  session_type TEXT NOT NULL CHECK (session_type IN (
    'conditioning',        -- Standard conditioning session
    'sleep',               -- Overnight/bedtime listening
    'edge_adjacent',       -- Running alongside edge session
    'compliance_bypass',   -- Substituted for skipped shoot
    'passive_capture'      -- Explicitly a capture session
  )),

  -- Playback
  started_at TIMESTAMPTZ DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  duration_seconds INTEGER,
  completed BOOLEAN DEFAULT false,

  -- Trance metrics (bridged to bambi_states at session end)
  trance_depth INTEGER CHECK (trance_depth IS NULL OR trance_depth BETWEEN 0 AND 10),
  denial_day_at_start INTEGER,
  arousal_at_start INTEGER,
  post_session_state TEXT CHECK (post_session_state IS NULL OR post_session_state IN (
    'energized', 'compliant', 'foggy', 'aroused', 'peaceful', 'disoriented', 'resistant'
  )),

  -- Capture integration
  capture_mode TEXT CHECK (capture_mode IS NULL OR capture_mode IN (
    'passive', 'flagged', 'active', 'none'
  )),
  captures JSONB DEFAULT '[]',
  -- Each element: { vault_id, timestamp_seconds, capture_type, description }
  vault_ids UUID[] DEFAULT '{}',

  -- Compliance bypass context
  bypass_reason TEXT CHECK (bypass_reason IS NULL OR bypass_reason IN (
    'low_energy', 'shoot_skipped', 'cage_check_only', 'audio_only', 'text_only'
  )),
  original_prescription_type TEXT,

  -- Bambi bridge (set after logBambiSession fires at session end)
  bambi_session_id UUID,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_hypno_sessions_user ON hypno_sessions(user_id, started_at);
CREATE INDEX IF NOT EXISTS idx_hypno_sessions_type ON hypno_sessions(user_id, session_type);
CREATE INDEX IF NOT EXISTS idx_hypno_sessions_active ON hypno_sessions(user_id, ended_at) WHERE ended_at IS NULL;

ALTER TABLE hypno_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY hypno_sessions_user ON hypno_sessions FOR ALL USING (auth.uid() = user_id);

-- ============================================
-- HYPNO SESSION SUMMARY VIEW
-- ============================================

CREATE OR REPLACE VIEW hypno_session_summary AS
SELECT
  user_id,
  COUNT(*) AS total_sessions,
  COUNT(*) FILTER (WHERE session_type = 'compliance_bypass') AS bypass_sessions,
  COUNT(*) FILTER (WHERE completed = true) AS completed_sessions,
  COUNT(*) FILTER (WHERE started_at >= NOW() - INTERVAL '30 days') AS sessions_last_30_days,
  ROUND(AVG(trance_depth)::NUMERIC, 1) AS avg_trance_depth,
  COUNT(*) FILTER (WHERE ARRAY_LENGTH(vault_ids, 1) > 0) AS sessions_with_captures,
  COALESCE(SUM(ARRAY_LENGTH(vault_ids, 1)) FILTER (WHERE ARRAY_LENGTH(vault_ids, 1) > 0), 0) AS total_captures
FROM hypno_sessions
GROUP BY user_id;
