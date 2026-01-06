-- ============================================
-- EDGE SESSION SYSTEM
-- Becoming Protocol - Arousal Session Layer
-- ============================================

-- Edge sessions
CREATE TABLE IF NOT EXISTS edge_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Config
  session_type VARCHAR(20) NOT NULL CHECK (session_type IN ('anchoring', 'reward', 'maintenance', 'goon')),
  ai_control_level VARCHAR(20) NOT NULL DEFAULT 'guided' CHECK (ai_control_level IN ('suggestions', 'guided', 'full')),
  target_edges INT,
  time_limit_minutes INT,

  -- Timing
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  duration_seconds INT,

  -- Performance
  edges_reached INT DEFAULT 0,
  peak_intensity INT DEFAULT 0,
  average_intensity DECIMAL(4,2),
  total_haptic_commands INT DEFAULT 0,

  -- State at session
  arousal_state_start VARCHAR(20),
  arousal_state_end VARCHAR(20),
  denial_day_at_start INT DEFAULT 0,

  -- Content
  content_viewed TEXT[] DEFAULT '{}',
  content_tier_accessed INT DEFAULT 1,

  -- Auctions
  auctions_presented INT DEFAULT 0,
  auctions_accepted INT DEFAULT 0,

  -- Completion
  completion_type VARCHAR(20) CHECK (completion_type IN ('denial', 'ruined', 'hands_free', 'full', 'emergency_stop', NULL)),
  completion_notes TEXT,

  -- Feedback
  feeling VARCHAR(50),
  reflection TEXT,
  rating INT CHECK (rating >= 1 AND rating <= 5),

  -- Status
  status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'paused', 'completed', 'abandoned')),

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Edge events within sessions
CREATE TABLE IF NOT EXISTS edge_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES edge_sessions(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,

  edge_number INT NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  time_from_start_seconds INT,
  time_since_last_edge_seconds INT,
  intensity_at_edge INT,
  haptic_pattern_active VARCHAR(50),
  content_displayed UUID,
  auction_triggered BOOLEAN DEFAULT FALSE,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Session commitments (from auctions)
CREATE TABLE IF NOT EXISTS session_commitments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES edge_sessions(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,

  auction_edge_number INT,
  option_id VARCHAR(50),
  option_label TEXT NOT NULL,
  commitment_type VARCHAR(30) NOT NULL CHECK (commitment_type IN ('edges', 'denial', 'lock', 'content', 'task')),
  commitment_value JSONB NOT NULL,

  arousal_level_when_made INT,
  made_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  due_at TIMESTAMPTZ,

  fulfilled BOOLEAN DEFAULT FALSE,
  fulfilled_at TIMESTAMPTZ,
  broken BOOLEAN DEFAULT FALSE,
  broken_at TIMESTAMPTZ,
  broken_penalty_applied BOOLEAN DEFAULT FALSE,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Session content log
CREATE TABLE IF NOT EXISTS session_content_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES edge_sessions(id) ON DELETE CASCADE,
  content_id UUID,

  shown_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  duration_shown_seconds INT,
  session_phase VARCHAR(20),
  user_interaction VARCHAR(30) DEFAULT 'viewed' CHECK (user_interaction IN ('viewed', 'skipped', 'favorited')),

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Session affirmations shown
CREATE TABLE IF NOT EXISTS session_affirmations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES edge_sessions(id) ON DELETE CASCADE,

  affirmation_text TEXT NOT NULL,
  affirmation_pool VARCHAR(30),
  shown_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  session_phase VARCHAR(20),

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- User session stats (denormalized for quick access)
CREATE TABLE IF NOT EXISTS user_session_stats (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,

  total_sessions INT DEFAULT 0,
  total_edges INT DEFAULT 0,
  total_duration_seconds INT DEFAULT 0,
  total_commitments_made INT DEFAULT 0,
  total_commitments_kept INT DEFAULT 0,
  total_commitments_broken INT DEFAULT 0,

  denial_completions INT DEFAULT 0,
  ruined_completions INT DEFAULT 0,
  hands_free_completions INT DEFAULT 0,
  full_completions INT DEFAULT 0,

  peak_edges_single_session INT DEFAULT 0,
  peak_duration_seconds INT DEFAULT 0,
  longest_denial_streak INT DEFAULT 0,
  current_denial_day INT DEFAULT 0,

  last_session_at TIMESTAMPTZ,
  last_release_at TIMESTAMPTZ,
  last_session_type VARCHAR(20),

  goon_mode_unlocked BOOLEAN DEFAULT FALSE,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- RLS POLICIES
-- ============================================

ALTER TABLE edge_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE edge_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE session_commitments ENABLE ROW LEVEL SECURITY;
ALTER TABLE session_content_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE session_affirmations ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_session_stats ENABLE ROW LEVEL SECURITY;

-- Edge sessions policies
CREATE POLICY "Users can view own sessions" ON edge_sessions
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own sessions" ON edge_sessions
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own sessions" ON edge_sessions
  FOR UPDATE USING (auth.uid() = user_id);

-- Edge events policies
CREATE POLICY "Users can view own edge events" ON edge_events
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own edge events" ON edge_events
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Session commitments policies
CREATE POLICY "Users can view own commitments" ON session_commitments
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own commitments" ON session_commitments
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own commitments" ON session_commitments
  FOR UPDATE USING (auth.uid() = user_id);

-- Session content log policies
CREATE POLICY "Users can view own content log" ON session_content_log
  FOR SELECT USING (session_id IN (SELECT id FROM edge_sessions WHERE user_id = auth.uid()));
CREATE POLICY "Users can insert own content log" ON session_content_log
  FOR INSERT WITH CHECK (session_id IN (SELECT id FROM edge_sessions WHERE user_id = auth.uid()));

-- Session affirmations policies
CREATE POLICY "Users can view own affirmations" ON session_affirmations
  FOR SELECT USING (session_id IN (SELECT id FROM edge_sessions WHERE user_id = auth.uid()));
CREATE POLICY "Users can insert own affirmations" ON session_affirmations
  FOR INSERT WITH CHECK (session_id IN (SELECT id FROM edge_sessions WHERE user_id = auth.uid()));

-- User session stats policies
CREATE POLICY "Users can view own stats" ON user_session_stats
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own stats" ON user_session_stats
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own stats" ON user_session_stats
  FOR UPDATE USING (auth.uid() = user_id);

-- ============================================
-- INDEXES
-- ============================================

CREATE INDEX IF NOT EXISTS idx_edge_sessions_user ON edge_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_edge_sessions_type ON edge_sessions(session_type);
CREATE INDEX IF NOT EXISTS idx_edge_sessions_date ON edge_sessions(started_at);
CREATE INDEX IF NOT EXISTS idx_edge_sessions_status ON edge_sessions(user_id, status);
CREATE INDEX IF NOT EXISTS idx_edge_events_session ON edge_events(session_id);
CREATE INDEX IF NOT EXISTS idx_edge_events_user ON edge_events(user_id);
CREATE INDEX IF NOT EXISTS idx_session_commitments_user ON session_commitments(user_id);
CREATE INDEX IF NOT EXISTS idx_session_commitments_unfulfilled ON session_commitments(user_id)
  WHERE fulfilled = FALSE AND broken = FALSE;
CREATE INDEX IF NOT EXISTS idx_session_content_log_session ON session_content_log(session_id);

-- ============================================
-- FUNCTIONS
-- ============================================

-- Function to check if user can start a session type
CREATE OR REPLACE FUNCTION can_start_session(
  p_user_id UUID,
  p_session_type VARCHAR(20)
)
RETURNS JSON AS $$
DECLARE
  stats user_session_stats%ROWTYPE;
  last_type_b TIMESTAMPTZ;
  unfulfilled_commitments INT;
  result JSON;
BEGIN
  -- Get user stats
  SELECT * INTO stats FROM user_session_stats WHERE user_id = p_user_id;

  -- If no stats, user can start anchoring or maintenance
  IF NOT FOUND THEN
    IF p_session_type IN ('anchoring', 'maintenance') THEN
      RETURN json_build_object('allowed', true);
    ELSE
      RETURN json_build_object('allowed', false, 'reason', 'Complete more sessions first');
    END IF;
  END IF;

  -- Check for unfulfilled lock commitments
  SELECT COUNT(*) INTO unfulfilled_commitments
  FROM session_commitments
  WHERE user_id = p_user_id
    AND commitment_type = 'lock'
    AND fulfilled = FALSE
    AND broken = FALSE;

  IF unfulfilled_commitments > 0 THEN
    RETURN json_build_object(
      'allowed', false,
      'reason', 'You have unfulfilled lock commitments. Honor what your horny self decided.'
    );
  END IF;

  -- Type-specific checks
  CASE p_session_type
    WHEN 'anchoring' THEN
      RETURN json_build_object('allowed', true);

    WHEN 'maintenance' THEN
      RETURN json_build_object('allowed', true);

    WHEN 'reward' THEN
      -- Check last Type B was at least 7 days ago
      SELECT MAX(ended_at) INTO last_type_b
      FROM edge_sessions
      WHERE user_id = p_user_id
        AND session_type = 'reward'
        AND completion_type = 'full';

      IF last_type_b IS NOT NULL AND last_type_b > NOW() - INTERVAL '7 days' THEN
        RETURN json_build_object(
          'allowed', false,
          'reason', 'Reward sessions require 7+ days since last release'
        );
      END IF;

      -- Check denial days (at least 5)
      IF stats.current_denial_day < 5 THEN
        RETURN json_build_object(
          'allowed', false,
          'reason', format('Need %s more denial days', 5 - stats.current_denial_day)
        );
      END IF;

      RETURN json_build_object('allowed', true);

    WHEN 'goon' THEN
      -- Check if unlocked
      IF NOT stats.goon_mode_unlocked THEN
        -- Auto-unlock at 20+ sessions
        IF stats.total_sessions >= 20 THEN
          UPDATE user_session_stats SET goon_mode_unlocked = true WHERE user_id = p_user_id;
          RETURN json_build_object('allowed', true);
        ELSE
          RETURN json_build_object(
            'allowed', false,
            'reason', format('Complete %s more sessions to unlock Goon Mode', 20 - stats.total_sessions)
          );
        END IF;
      END IF;

      RETURN json_build_object('allowed', true);

    ELSE
      RETURN json_build_object('allowed', false, 'reason', 'Unknown session type');
  END CASE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to update user stats after session completion
CREATE OR REPLACE FUNCTION update_session_stats()
RETURNS TRIGGER AS $$
BEGIN
  -- Only run on session completion
  IF NEW.status = 'completed' AND (OLD.status IS NULL OR OLD.status != 'completed') THEN
    INSERT INTO user_session_stats (
      user_id,
      total_sessions,
      total_edges,
      total_duration_seconds,
      last_session_at,
      last_session_type
    ) VALUES (
      NEW.user_id,
      1,
      NEW.edges_reached,
      NEW.duration_seconds,
      NEW.ended_at,
      NEW.session_type
    )
    ON CONFLICT (user_id) DO UPDATE SET
      total_sessions = user_session_stats.total_sessions + 1,
      total_edges = user_session_stats.total_edges + NEW.edges_reached,
      total_duration_seconds = user_session_stats.total_duration_seconds + COALESCE(NEW.duration_seconds, 0),
      peak_edges_single_session = GREATEST(user_session_stats.peak_edges_single_session, NEW.edges_reached),
      peak_duration_seconds = GREATEST(user_session_stats.peak_duration_seconds, COALESCE(NEW.duration_seconds, 0)),
      last_session_at = NEW.ended_at,
      last_session_type = NEW.session_type,
      denial_completions = user_session_stats.denial_completions + CASE WHEN NEW.completion_type = 'denial' THEN 1 ELSE 0 END,
      ruined_completions = user_session_stats.ruined_completions + CASE WHEN NEW.completion_type = 'ruined' THEN 1 ELSE 0 END,
      hands_free_completions = user_session_stats.hands_free_completions + CASE WHEN NEW.completion_type = 'hands_free' THEN 1 ELSE 0 END,
      full_completions = user_session_stats.full_completions + CASE WHEN NEW.completion_type = 'full' THEN 1 ELSE 0 END,
      -- Reset denial day on full release
      current_denial_day = CASE
        WHEN NEW.completion_type IN ('full', 'ruined') THEN 0
        ELSE user_session_stats.current_denial_day
      END,
      last_release_at = CASE
        WHEN NEW.completion_type = 'full' THEN NEW.ended_at
        ELSE user_session_stats.last_release_at
      END,
      updated_at = NOW();
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for stats update
DROP TRIGGER IF EXISTS trigger_update_session_stats ON edge_sessions;
CREATE TRIGGER trigger_update_session_stats
  AFTER UPDATE ON edge_sessions
  FOR EACH ROW
  EXECUTE FUNCTION update_session_stats();

-- Function to get session evidence for dashboard
CREATE OR REPLACE FUNCTION get_session_evidence(p_user_id UUID)
RETURNS JSON AS $$
DECLARE
  result JSON;
BEGIN
  SELECT json_build_object(
    'totalSessions', COALESCE(total_sessions, 0),
    'totalEdges', COALESCE(total_edges, 0),
    'totalHours', ROUND(COALESCE(total_duration_seconds, 0) / 3600.0, 1),
    'denialCompletions', COALESCE(denial_completions, 0),
    'handsFreeCompletions', COALESCE(hands_free_completions, 0),
    'commitmentsMade', COALESCE(total_commitments_made, 0),
    'commitmentsKept', COALESCE(total_commitments_kept, 0),
    'commitmentKeptRate', CASE
      WHEN total_commitments_made > 0
      THEN ROUND((total_commitments_kept::DECIMAL / total_commitments_made) * 100)
      ELSE 100
    END,
    'peakEdges', COALESCE(peak_edges_single_session, 0),
    'currentDenialDay', COALESCE(current_denial_day, 0),
    'goonModeUnlocked', COALESCE(goon_mode_unlocked, false),
    'lastSessionAt', last_session_at
  ) INTO result
  FROM user_session_stats
  WHERE user_id = p_user_id;

  RETURN COALESCE(result, json_build_object(
    'totalSessions', 0,
    'totalEdges', 0,
    'totalHours', 0,
    'denialCompletions', 0,
    'handsFreeCompletions', 0,
    'commitmentsMade', 0,
    'commitmentsKept', 0,
    'commitmentKeptRate', 100,
    'peakEdges', 0,
    'currentDenialDay', 0,
    'goonModeUnlocked', false,
    'lastSessionAt', null
  ));
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
