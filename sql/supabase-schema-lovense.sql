-- ============================================
-- LOVENSE HAPTIC REWARD LAYER
-- Becoming Protocol - Physical Reward Channel
-- ============================================

-- User connection info from Standard API callback
-- Stores the utoken needed to send commands
CREATE TABLE IF NOT EXISTS lovense_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  utoken VARCHAR(255) NOT NULL, -- Token for sending commands
  domain VARCHAR(255),          -- Local domain for direct connection
  http_port INT,
  https_port INT,
  ws_port INT,
  wss_port INT,
  platform VARCHAR(20),         -- 'ios' or 'android'
  app_version VARCHAR(50),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Toy configuration and connection state
CREATE TABLE IF NOT EXISTS lovense_devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  toy_id VARCHAR(50) NOT NULL,
  toy_name VARCHAR(50), -- 'gush', 'lush', 'edge', etc.
  nickname VARCHAR(100),
  is_connected BOOLEAN DEFAULT false,
  battery_level INT,
  last_seen_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, toy_id)
);

-- Command log (evidence + debugging)
CREATE TABLE IF NOT EXISTS lovense_commands (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  device_id UUID REFERENCES lovense_devices(id) ON DELETE SET NULL,
  command_type VARCHAR(20) NOT NULL, -- 'function', 'preset', 'pattern', 'stop'
  command_payload JSONB NOT NULL,
  trigger_type VARCHAR(50) NOT NULL, -- 'task_complete', 'notification', 'ai_session', 'arousal_auction', etc.
  trigger_id UUID, -- reference to what triggered it
  intensity INT, -- 0-20 for tracking
  duration_sec INT,
  executed_at TIMESTAMPTZ DEFAULT NOW(),
  success BOOLEAN DEFAULT true,
  error_message TEXT
);

-- Predefined reward patterns mapped to system events
CREATE TABLE IF NOT EXISTS haptic_patterns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(50) UNIQUE NOT NULL,
  description TEXT,
  command_type VARCHAR(20) NOT NULL, -- 'Function', 'Preset', 'Pattern', 'Stop'
  command_payload JSONB NOT NULL,
  duration_sec INT NOT NULL DEFAULT 0,
  intensity_min INT DEFAULT 0, -- 0-20
  intensity_max INT DEFAULT 20, -- 0-20
  use_context TEXT[] DEFAULT '{}', -- ['task_complete', 'good_girl', 'edge_session']
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Session tracking for arousal integration
CREATE TABLE IF NOT EXISTS haptic_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  session_type VARCHAR(30) NOT NULL, -- 'anchoring', 'reward', 'edge', 'maintenance', 'conditioning'
  started_at TIMESTAMPTZ DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  total_commands INT DEFAULT 0,
  peak_intensity INT DEFAULT 0,
  total_edges INT DEFAULT 0,
  ai_controlled BOOLEAN DEFAULT false,
  commitments_made JSONB DEFAULT '[]',
  notes TEXT,
  status VARCHAR(20) DEFAULT 'active' -- 'active', 'completed', 'abandoned'
);

-- User haptic settings and preferences
CREATE TABLE IF NOT EXISTS haptic_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  enabled BOOLEAN DEFAULT true,

  -- Reward intensity
  reward_intensity VARCHAR(20) DEFAULT 'moderate', -- 'subtle', 'moderate', 'intense'

  -- Time restrictions
  allowed_hours_start TIME DEFAULT '06:00',
  allowed_hours_end TIME DEFAULT '23:00',
  quiet_days TEXT[] DEFAULT '{}', -- days to disable entirely

  -- What triggers haptics
  task_completion_rewards BOOLEAN DEFAULT true,
  notification_rewards BOOLEAN DEFAULT true,
  affirmation_rewards BOOLEAN DEFAULT true,
  session_mode BOOLEAN DEFAULT true,

  -- Session preferences
  max_session_intensity INT DEFAULT 16, -- 1-20
  ai_control_level VARCHAR(20) DEFAULT 'partial', -- 'suggestions', 'partial', 'full'

  -- Safety limits
  max_daily_commands INT DEFAULT 100,
  cooldown_between_commands INT DEFAULT 5, -- seconds
  max_session_minutes INT DEFAULT 60,
  min_cooldown_minutes INT DEFAULT 30,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Dependency/conditioning tracking
CREATE TABLE IF NOT EXISTS haptic_conditioning (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  signal_type VARCHAR(50) NOT NULL, -- 'haptic_withdrawal', 'pattern_preference', 'intensity_escalation'
  signal_data JSONB,
  recorded_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- RLS POLICIES
-- ============================================

ALTER TABLE lovense_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE lovense_devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE lovense_commands ENABLE ROW LEVEL SECURITY;

-- Connections: users can only see their own (service role can update via callback)
CREATE POLICY "Users can view own connection" ON lovense_connections
  FOR SELECT USING (auth.uid() = user_id);
ALTER TABLE haptic_patterns ENABLE ROW LEVEL SECURITY;
ALTER TABLE haptic_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE haptic_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE haptic_conditioning ENABLE ROW LEVEL SECURITY;

-- Devices: users can only see/manage their own
CREATE POLICY "Users can view own devices" ON lovense_devices
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own devices" ON lovense_devices
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own devices" ON lovense_devices
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own devices" ON lovense_devices
  FOR DELETE USING (auth.uid() = user_id);

-- Commands: users can only see their own history
CREATE POLICY "Users can view own commands" ON lovense_commands
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own commands" ON lovense_commands
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Patterns: all authenticated users can read
CREATE POLICY "Authenticated users can view patterns" ON haptic_patterns
  FOR SELECT USING (auth.role() = 'authenticated');

-- Sessions: users can only manage their own
CREATE POLICY "Users can view own sessions" ON haptic_sessions
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own sessions" ON haptic_sessions
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own sessions" ON haptic_sessions
  FOR UPDATE USING (auth.uid() = user_id);

-- Settings: users can only manage their own
CREATE POLICY "Users can view own settings" ON haptic_settings
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own settings" ON haptic_settings
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own settings" ON haptic_settings
  FOR UPDATE USING (auth.uid() = user_id);

-- Conditioning: users can only see their own
CREATE POLICY "Users can view own conditioning" ON haptic_conditioning
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own conditioning" ON haptic_conditioning
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- ============================================
-- INDEXES
-- ============================================

CREATE INDEX IF NOT EXISTS idx_lovense_devices_user ON lovense_devices(user_id);
CREATE INDEX IF NOT EXISTS idx_lovense_devices_connected ON lovense_devices(user_id, is_connected);
CREATE INDEX IF NOT EXISTS idx_lovense_commands_user ON lovense_commands(user_id);
CREATE INDEX IF NOT EXISTS idx_lovense_commands_trigger ON lovense_commands(trigger_type);
CREATE INDEX IF NOT EXISTS idx_lovense_commands_executed ON lovense_commands(executed_at);
CREATE INDEX IF NOT EXISTS idx_haptic_sessions_user ON haptic_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_haptic_sessions_status ON haptic_sessions(user_id, status);
CREATE INDEX IF NOT EXISTS idx_haptic_patterns_name ON haptic_patterns(name);
CREATE INDEX IF NOT EXISTS idx_haptic_patterns_context ON haptic_patterns USING GIN(use_context);

-- ============================================
-- SEED DATA: DEFAULT PATTERNS
-- ============================================

INSERT INTO haptic_patterns (name, description, command_type, command_payload, duration_sec, intensity_min, intensity_max, use_context) VALUES

-- Micro-rewards (task completion, affirmations)
('task_complete', 'Brief acknowledgment pulse', 'Function',
 '{"action": "Vibrate:8", "timeSec": 2}', 2, 8, 8,
 ARRAY['task_complete']),

('good_girl', 'Warm affirmation wave', 'Preset',
 '{"name": "pulse", "timeSec": 3}', 3, 0, 12,
 ARRAY['affirmation', 'notification']),

('streak_milestone', 'Celebration burst', 'Function',
 '{"action": "Vibrate:15", "timeSec": 5, "loopRunningSec": 2, "loopPauseSec": 1}', 5, 10, 15,
 ARRAY['milestone']),

('level_up', 'Level up celebration', 'Preset',
 '{"name": "fireworks", "timeSec": 6}', 6, 12, 18,
 ARRAY['level_up', 'achievement']),

('achievement_unlock', 'Achievement earned', 'Function',
 '{"action": "Vibrate:14", "timeSec": 4, "loopRunningSec": 1, "loopPauseSec": 0.5}', 4, 10, 14,
 ARRAY['achievement']),

-- Notification rewards (variable ratio reinforcement)
('notification_low', 'Subtle awareness ping', 'Function',
 '{"action": "Vibrate:4", "timeSec": 1}', 1, 4, 4,
 ARRAY['notification']),

('notification_medium', 'Pleasant reminder', 'Function',
 '{"action": "Vibrate:10", "timeSec": 3}', 3, 8, 12,
 ARRAY['notification']),

('notification_jackpot', 'Rare high reward', 'Preset',
 '{"name": "fireworks", "timeSec": 8}', 8, 12, 18,
 ARRAY['notification', 'jackpot']),

-- Edge session patterns
('edge_build', 'Gradual intensity climb', 'Pattern',
 '{"pattern": "V:1;F:v;S:1000#V:1;F:v5;S:2000#V:1;F:v10;S:3000#V:1;F:v15;S:4000"}', 10, 5, 15,
 ARRAY['edge_session']),

('edge_hold', 'Sustained plateau', 'Function',
 '{"action": "Vibrate:12", "timeSec": 30}', 30, 10, 14,
 ARRAY['edge_session']),

('edge_denial', 'Sudden stop for denial', 'Function',
 '{"action": "Stop"}', 0, 0, 0,
 ARRAY['edge_session', 'denial']),

('edge_tease', 'Unpredictable pulses', 'Pattern',
 '{"pattern": "V:1;F:v8;S:500#V:1;F:v0;S:2000#V:1;F:v12;S:800#V:1;F:v0;S:1500"}', 15, 0, 12,
 ARRAY['edge_session', 'tease']),

('edge_reward', 'Post-edge reward pulse', 'Function',
 '{"action": "Vibrate:16", "timeSec": 3}', 3, 14, 18,
 ARRAY['edge_session', 'reward']),

-- Conditioning anchors
('femininity_anchor', 'Pattern tied to identity state', 'Preset',
 '{"name": "wave", "timeSec": 5}', 5, 6, 10,
 ARRAY['conditioning', 'identity']),

('morning_activation', 'Protocol start signal', 'Function',
 '{"action": "Vibrate:6", "timeSec": 3}', 3, 6, 6,
 ARRAY['protocol', 'morning']),

('evening_closure', 'Day completion reward', 'Preset',
 '{"name": "pulse", "timeSec": 4}', 4, 8, 10,
 ARRAY['protocol', 'evening']),

('anchor_reinforcement', 'Sensory anchor activation', 'Function',
 '{"action": "Vibrate:8", "timeSec": 2}', 2, 6, 10,
 ARRAY['conditioning', 'anchor']),

-- Denial teasing
('denial_tease', 'Brief reminder during denial', 'Function',
 '{"action": "Vibrate:5", "timeSec": 1}', 1, 4, 6,
 ARRAY['denial', 'tease']),

('denial_ache', 'Slightly longer tease', 'Function',
 '{"action": "Vibrate:8", "timeSec": 2, "loopRunningSec": 1, "loopPauseSec": 1}', 4, 6, 10,
 ARRAY['denial', 'tease']),

-- Voice/posture conditioning
('voice_target_hit', 'Reward for hitting voice pitch', 'Function',
 '{"action": "Vibrate:10", "timeSec": 1}', 1, 8, 12,
 ARRAY['voice', 'conditioning']),

('posture_reward', 'Reward for posture check', 'Function',
 '{"action": "Vibrate:8", "timeSec": 1}', 1, 6, 10,
 ARRAY['posture', 'conditioning']),

-- Constants (for background awareness)
('constant_subtle', 'Very low constant for awareness', 'Function',
 '{"action": "Vibrate:3", "timeSec": 0}', 0, 3, 3,
 ARRAY['background', 'awareness']),

('constant_low', 'Low constant', 'Function',
 '{"action": "Vibrate:5", "timeSec": 0}', 0, 5, 5,
 ARRAY['background']),

('constant_medium', 'Medium constant', 'Function',
 '{"action": "Vibrate:10", "timeSec": 0}', 0, 10, 10,
 ARRAY['background', 'session'])

ON CONFLICT (name) DO UPDATE SET
  description = EXCLUDED.description,
  command_type = EXCLUDED.command_type,
  command_payload = EXCLUDED.command_payload,
  duration_sec = EXCLUDED.duration_sec,
  intensity_min = EXCLUDED.intensity_min,
  intensity_max = EXCLUDED.intensity_max,
  use_context = EXCLUDED.use_context;

-- ============================================
-- FUNCTIONS
-- ============================================

-- Function to get user's haptic stats for evidence display
CREATE OR REPLACE FUNCTION get_haptic_stats(p_user_id UUID)
RETURNS JSON AS $$
DECLARE
  result JSON;
BEGIN
  SELECT json_build_object(
    'total_commands', COUNT(*),
    'total_sessions', (SELECT COUNT(*) FROM haptic_sessions WHERE user_id = p_user_id AND status = 'completed'),
    'total_edges', (SELECT COALESCE(SUM(total_edges), 0) FROM haptic_sessions WHERE user_id = p_user_id),
    'total_minutes_controlled', (
      SELECT COALESCE(SUM(EXTRACT(EPOCH FROM (COALESCE(ended_at, NOW()) - started_at)) / 60), 0)
      FROM haptic_sessions WHERE user_id = p_user_id
    ),
    'first_command', (SELECT MIN(executed_at) FROM lovense_commands WHERE user_id = p_user_id AND success = true),
    'recent_intensity_avg', (
      SELECT COALESCE(AVG(intensity), 0)
      FROM lovense_commands
      WHERE user_id = p_user_id
        AND success = true
        AND intensity IS NOT NULL
        AND executed_at > NOW() - INTERVAL '7 days'
    ),
    'peak_intensity_ever', (SELECT COALESCE(MAX(peak_intensity), 0) FROM haptic_sessions WHERE user_id = p_user_id),
    'commands_today', (
      SELECT COUNT(*) FROM lovense_commands
      WHERE user_id = p_user_id
        AND success = true
        AND executed_at::date = CURRENT_DATE
    )
  ) INTO result
  FROM lovense_commands
  WHERE user_id = p_user_id AND success = true;

  RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to check if haptics are allowed right now
CREATE OR REPLACE FUNCTION can_use_haptics(p_user_id UUID)
RETURNS JSON AS $$
DECLARE
  settings haptic_settings%ROWTYPE;
  current_time_val TIME;
  current_day TEXT;
  commands_today INT;
  last_command_at TIMESTAMPTZ;
  result JSON;
BEGIN
  -- Get user settings
  SELECT * INTO settings FROM haptic_settings WHERE user_id = p_user_id;

  -- If no settings, allow with defaults
  IF NOT FOUND THEN
    RETURN json_build_object('allowed', true, 'reason', null);
  END IF;

  -- Check if enabled
  IF NOT settings.enabled THEN
    RETURN json_build_object('allowed', false, 'reason', 'Haptics disabled in settings');
  END IF;

  -- Check time restrictions
  current_time_val := CURRENT_TIME;
  IF current_time_val < settings.allowed_hours_start OR current_time_val > settings.allowed_hours_end THEN
    RETURN json_build_object('allowed', false, 'reason', 'Outside allowed hours');
  END IF;

  -- Check quiet days
  current_day := LOWER(TO_CHAR(CURRENT_DATE, 'Day'));
  current_day := TRIM(current_day);
  IF current_day = ANY(settings.quiet_days) THEN
    RETURN json_build_object('allowed', false, 'reason', 'Quiet day');
  END IF;

  -- Check daily limit
  SELECT COUNT(*) INTO commands_today
  FROM lovense_commands
  WHERE user_id = p_user_id AND executed_at::date = CURRENT_DATE AND success = true;

  IF commands_today >= settings.max_daily_commands THEN
    RETURN json_build_object('allowed', false, 'reason', 'Daily limit reached');
  END IF;

  -- Check cooldown
  SELECT MAX(executed_at) INTO last_command_at
  FROM lovense_commands WHERE user_id = p_user_id AND success = true;

  IF last_command_at IS NOT NULL AND
     EXTRACT(EPOCH FROM (NOW() - last_command_at)) < settings.cooldown_between_commands THEN
    RETURN json_build_object('allowed', false, 'reason', 'Cooldown active');
  END IF;

  RETURN json_build_object('allowed', true, 'reason', null);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
