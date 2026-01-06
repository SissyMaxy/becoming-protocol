-- Migration 007: Reward & Conditioning Tables
-- Sensory anchors, exposures, notifications, reward unlocks, withdrawal logs

-- ============================================
-- SENSORY ANCHORS
-- Physical anchors for state conditioning
-- ============================================
CREATE TABLE IF NOT EXISTS sensory_anchors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  anchor_type TEXT NOT NULL, -- scent, underwear, jewelry, nail_polish, clothing, posture, voice, makeup
  item_name TEXT NOT NULL,
  description TEXT,
  target_state TEXT, -- feminine, submissive, aroused, compliant, trance
  created_at TIMESTAMPTZ DEFAULT NOW(),
  exposure_count INTEGER DEFAULT 0,
  strength_score INTEGER DEFAULT 0, -- 0-100 conditioning strength
  active BOOLEAN DEFAULT TRUE
);

-- ============================================
-- ANCHOR EXPOSURES
-- Individual anchor exposure sessions
-- ============================================
CREATE TABLE IF NOT EXISTS anchor_exposures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  anchor_id UUID REFERENCES sensory_anchors NOT NULL,
  user_id UUID REFERENCES auth.users NOT NULL,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  duration_minutes INTEGER,
  state_before INTEGER, -- 1-10
  state_after INTEGER, -- 1-10
  context TEXT,
  pairing_content TEXT -- what was paired with the anchor
);

-- ============================================
-- NOTIFICATIONS CONFIG
-- User notification preferences
-- ============================================
CREATE TABLE IF NOT EXISTS notifications_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL UNIQUE,
  min_daily INTEGER DEFAULT 4,
  max_daily INTEGER DEFAULT 8,
  active_hours_start TIME DEFAULT '08:00',
  active_hours_end TIME DEFAULT '22:00',
  enabled BOOLEAN DEFAULT TRUE,
  prob_microtask DECIMAL DEFAULT 0.40,
  prob_affirmation DECIMAL DEFAULT 0.25,
  prob_content_unlock DECIMAL DEFAULT 0.20,
  prob_challenge DECIMAL DEFAULT 0.10,
  prob_jackpot DECIMAL DEFAULT 0.05,
  push_enabled BOOLEAN DEFAULT FALSE,
  push_token TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- NOTIFICATIONS SENT
-- Log of sent notifications
-- ============================================
CREATE TABLE IF NOT EXISTS notifications_sent (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  notification_type TEXT NOT NULL, -- microtask, affirmation, content_unlock, challenge, jackpot, commitment_prompt
  content TEXT NOT NULL,
  sent_at TIMESTAMPTZ DEFAULT NOW(),
  opened BOOLEAN DEFAULT FALSE,
  opened_at TIMESTAMPTZ,
  completed BOOLEAN DEFAULT FALSE,
  completed_at TIMESTAMPTZ,
  reward_value INTEGER,
  handler_strategy_id UUID REFERENCES handler_strategies
);

-- ============================================
-- REWARD UNLOCKS
-- Content unlocked as rewards
-- ============================================
CREATE TABLE IF NOT EXISTS reward_unlocks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  content_type TEXT NOT NULL, -- hypno, image, video, audio, text
  content_id TEXT,
  content_url TEXT,
  content_description TEXT,
  unlocked_at TIMESTAMPTZ DEFAULT NOW(),
  unlock_reason TEXT, -- task_completion, streak, jackpot, escalation_reward
  viewed BOOLEAN DEFAULT FALSE,
  viewed_at TIMESTAMPTZ,
  reaction TEXT,
  arousal_level INTEGER,
  replay_count INTEGER DEFAULT 0
);

-- ============================================
-- WITHDRAWAL LOGS
-- When user misses sessions or check-ins
-- ============================================
CREATE TABLE IF NOT EXISTS withdrawal_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  missed_date DATE NOT NULL,
  missed_type TEXT NOT NULL, -- check_in, session, anchor_use, task
  prompted_at TIMESTAMPTZ DEFAULT NOW(),
  feeling TEXT,
  craving_level INTEGER, -- 1-10
  return_trigger TEXT, -- what brought them back
  notes TEXT
);

-- ============================================
-- CONDITIONING PAIRS
-- Stimulus-response pairs being conditioned
-- ============================================
CREATE TABLE IF NOT EXISTS conditioning_pairs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  stimulus TEXT NOT NULL, -- what triggers
  response TEXT NOT NULL, -- what should happen
  pairing_count INTEGER DEFAULT 0,
  success_rate DECIMAL DEFAULT 0,
  automaticity_score INTEGER DEFAULT 0, -- 0-100
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_reinforced TIMESTAMPTZ,
  status TEXT DEFAULT 'conditioning' -- conditioning, established, maintenance
);

-- ============================================
-- AFFIRMATION HISTORY
-- Affirmations delivered and their impact
-- ============================================
CREATE TABLE IF NOT EXISTS affirmation_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  affirmation_text TEXT NOT NULL,
  delivered_at TIMESTAMPTZ DEFAULT NOW(),
  delivery_method TEXT, -- notification, session, check_in
  acknowledged BOOLEAN DEFAULT FALSE,
  repeated_aloud BOOLEAN,
  emotional_response TEXT,
  notes TEXT
);

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================
ALTER TABLE sensory_anchors ENABLE ROW LEVEL SECURITY;
ALTER TABLE anchor_exposures ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications_sent ENABLE ROW LEVEL SECURITY;
ALTER TABLE reward_unlocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE withdrawal_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE conditioning_pairs ENABLE ROW LEVEL SECURITY;
ALTER TABLE affirmation_history ENABLE ROW LEVEL SECURITY;

-- RLS Policies
DROP POLICY IF EXISTS "Users access own anchors" ON sensory_anchors;
CREATE POLICY "Users access own anchors" ON sensory_anchors FOR ALL USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users access own exposures" ON anchor_exposures;
CREATE POLICY "Users access own exposures" ON anchor_exposures FOR ALL USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users access own notif_config" ON notifications_config;
CREATE POLICY "Users access own notif_config" ON notifications_config FOR ALL USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users access own notif_sent" ON notifications_sent;
CREATE POLICY "Users access own notif_sent" ON notifications_sent FOR ALL USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users access own unlocks" ON reward_unlocks;
CREATE POLICY "Users access own unlocks" ON reward_unlocks FOR ALL USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users access own withdrawal" ON withdrawal_logs;
CREATE POLICY "Users access own withdrawal" ON withdrawal_logs FOR ALL USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users access own conditioning" ON conditioning_pairs;
CREATE POLICY "Users access own conditioning" ON conditioning_pairs FOR ALL USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users access own affirmations" ON affirmation_history;
CREATE POLICY "Users access own affirmations" ON affirmation_history FOR ALL USING (auth.uid() = user_id);

-- ============================================
-- INDEXES
-- ============================================
CREATE INDEX IF NOT EXISTS idx_sensory_anchors_user_id ON sensory_anchors(user_id);
CREATE INDEX IF NOT EXISTS idx_sensory_anchors_type ON sensory_anchors(user_id, anchor_type);
CREATE INDEX IF NOT EXISTS idx_sensory_anchors_active ON sensory_anchors(user_id, active);
CREATE INDEX IF NOT EXISTS idx_anchor_exposures_user_id ON anchor_exposures(user_id);
CREATE INDEX IF NOT EXISTS idx_anchor_exposures_anchor ON anchor_exposures(anchor_id);
CREATE INDEX IF NOT EXISTS idx_anchor_exposures_started ON anchor_exposures(user_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_config_user_id ON notifications_config(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_sent_user_id ON notifications_sent(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_sent_sent ON notifications_sent(user_id, sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_sent_type ON notifications_sent(user_id, notification_type);
CREATE INDEX IF NOT EXISTS idx_reward_unlocks_user_id ON reward_unlocks(user_id);
CREATE INDEX IF NOT EXISTS idx_reward_unlocks_unlocked ON reward_unlocks(user_id, unlocked_at DESC);
CREATE INDEX IF NOT EXISTS idx_withdrawal_logs_user_id ON withdrawal_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_withdrawal_logs_date ON withdrawal_logs(user_id, missed_date DESC);
CREATE INDEX IF NOT EXISTS idx_conditioning_pairs_user_id ON conditioning_pairs(user_id);
CREATE INDEX IF NOT EXISTS idx_conditioning_pairs_status ON conditioning_pairs(user_id, status);
CREATE INDEX IF NOT EXISTS idx_affirmation_history_user_id ON affirmation_history(user_id);
CREATE INDEX IF NOT EXISTS idx_affirmation_history_delivered ON affirmation_history(user_id, delivered_at DESC);

-- ============================================
-- TRIGGER: Update notifications_config updated_at
-- ============================================
DROP TRIGGER IF EXISTS update_notifications_config_updated_at ON notifications_config;
CREATE TRIGGER update_notifications_config_updated_at
  BEFORE UPDATE ON notifications_config
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
