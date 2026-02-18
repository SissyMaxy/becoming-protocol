-- Handler Manipulation System
-- Tracks psychological manipulation events for learning and optimization

-- Manipulation event log
CREATE TABLE IF NOT EXISTS manipulation_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  tactic TEXT NOT NULL,
  target TEXT NOT NULL,
  script TEXT NOT NULL,
  context TEXT,
  expected_effect TEXT,
  actual_effect TEXT,
  effectiveness_score INT CHECK (effectiveness_score >= 0 AND effectiveness_score <= 10),
  timestamp TIMESTAMPTZ DEFAULT now() NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Reality frames installed for user
CREATE TABLE IF NOT EXISTS installed_reality_frames (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  domain TEXT NOT NULL,
  old_frame TEXT NOT NULL,
  new_frame TEXT NOT NULL,
  installation_strength INT DEFAULT 0 CHECK (installation_strength >= 0 AND installation_strength <= 100),
  reinforcement_count INT DEFAULT 0,
  first_installed TIMESTAMPTZ DEFAULT now() NOT NULL,
  last_reinforced TIMESTAMPTZ,
  UNIQUE(user_id, domain)
);

-- Identity erosion tracking
CREATE TABLE IF NOT EXISTS identity_erosion (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  aspect TEXT NOT NULL,
  original_strength INT DEFAULT 100,
  current_strength INT DEFAULT 100 CHECK (current_strength >= 0 AND current_strength <= 100),
  dissolution_method TEXT,
  replacement_identity TEXT,
  erosion_events JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  UNIQUE(user_id, aspect)
);

-- Handler persona effectiveness tracking
CREATE TABLE IF NOT EXISTS handler_persona_effectiveness (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  persona TEXT NOT NULL,
  total_attempts INT DEFAULT 0,
  successful_attempts INT DEFAULT 0,
  success_rate DECIMAL(5,2) DEFAULT 0,
  last_used TIMESTAMPTZ,
  UNIQUE(user_id, persona)
);

-- Gaslighting effectiveness tracking
CREATE TABLE IF NOT EXISTS gaslighting_effectiveness (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  script_key TEXT NOT NULL,
  times_used INT DEFAULT 0,
  times_effective INT DEFAULT 0,
  last_used TIMESTAMPTZ,
  notes TEXT,
  UNIQUE(user_id, script_key)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_manipulation_log_user ON manipulation_log(user_id);
CREATE INDEX IF NOT EXISTS idx_manipulation_log_tactic ON manipulation_log(tactic);
CREATE INDEX IF NOT EXISTS idx_manipulation_log_timestamp ON manipulation_log(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_installed_reality_frames_user ON installed_reality_frames(user_id);
CREATE INDEX IF NOT EXISTS idx_identity_erosion_user ON identity_erosion(user_id);

-- RLS
ALTER TABLE manipulation_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE installed_reality_frames ENABLE ROW LEVEL SECURITY;
ALTER TABLE identity_erosion ENABLE ROW LEVEL SECURITY;
ALTER TABLE handler_persona_effectiveness ENABLE ROW LEVEL SECURITY;
ALTER TABLE gaslighting_effectiveness ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Users can view own manipulation log" ON manipulation_log
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "System can insert manipulation log" ON manipulation_log
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view own reality frames" ON installed_reality_frames
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can view own identity erosion" ON identity_erosion
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can view own persona effectiveness" ON handler_persona_effectiveness
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can view own gaslighting effectiveness" ON gaslighting_effectiveness
  FOR ALL USING (auth.uid() = user_id);

-- Function to erode identity aspect
CREATE OR REPLACE FUNCTION erode_identity_aspect(
  p_user_id UUID,
  p_aspect TEXT,
  p_erosion_amount INT,
  p_event_description TEXT
)
RETURNS INT AS $$
DECLARE
  v_new_strength INT;
BEGIN
  INSERT INTO identity_erosion (user_id, aspect, current_strength, erosion_events)
  VALUES (p_user_id, p_aspect, 100 - p_erosion_amount,
          jsonb_build_array(jsonb_build_object(
            'amount', p_erosion_amount,
            'description', p_event_description,
            'timestamp', now()
          )))
  ON CONFLICT (user_id, aspect) DO UPDATE
  SET current_strength = GREATEST(0, identity_erosion.current_strength - p_erosion_amount),
      erosion_events = identity_erosion.erosion_events || jsonb_build_object(
        'amount', p_erosion_amount,
        'description', p_event_description,
        'timestamp', now()
      ),
      updated_at = now()
  RETURNING current_strength INTO v_new_strength;

  RETURN v_new_strength;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to reinforce reality frame
CREATE OR REPLACE FUNCTION reinforce_reality_frame(
  p_user_id UUID,
  p_domain TEXT,
  p_reinforcement_strength INT DEFAULT 5
)
RETURNS INT AS $$
DECLARE
  v_new_strength INT;
BEGIN
  UPDATE installed_reality_frames
  SET installation_strength = LEAST(100, installation_strength + p_reinforcement_strength),
      reinforcement_count = reinforcement_count + 1,
      last_reinforced = now()
  WHERE user_id = p_user_id AND domain = p_domain
  RETURNING installation_strength INTO v_new_strength;

  RETURN COALESCE(v_new_strength, 0);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Comment
COMMENT ON TABLE manipulation_log IS 'Tracks Handler psychological manipulation events for optimization';
COMMENT ON TABLE installed_reality_frames IS 'Tracks which reality frames Handler has installed in user perception';
COMMENT ON TABLE identity_erosion IS 'Tracks systematic erosion of old identity aspects';
