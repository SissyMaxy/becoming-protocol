-- Dopamine Delivery System
-- Notification events log + per-user dopamine state for reward timing brain.

-- ============================================
-- 1. Notification events log
-- ============================================

CREATE TABLE IF NOT EXISTS notification_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,

  -- Notification content
  notification_type TEXT NOT NULL,
  reward_tier TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,

  -- Reward payload
  haptic_pattern TEXT,
  points_awarded INTEGER DEFAULT 0,
  content_unlocked TEXT,

  -- Context at delivery
  denial_day INTEGER,
  time_of_day TEXT,
  gina_home BOOLEAN DEFAULT FALSE,
  feminization_target TEXT,

  -- Timing
  scheduled_for TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ DEFAULT NOW(),
  opened_at TIMESTAMPTZ,

  -- Effectiveness
  task_completed_after BOOLEAN,
  session_duration_after INTEGER,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE notification_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users own notifications" ON notification_events
  FOR ALL USING (auth.uid() = user_id);

CREATE INDEX idx_notif_events_user_time ON notification_events(user_id, delivered_at DESC);
CREATE INDEX idx_notif_events_type ON notification_events(user_id, notification_type);

-- ============================================
-- 2. Dopamine state (one row per user)
-- ============================================

CREATE TABLE IF NOT EXISTS dopamine_state (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL UNIQUE,

  -- Daily budget
  notifications_today INTEGER DEFAULT 0,
  notifications_target INTEGER DEFAULT 6,
  last_notification_at TIMESTAMPTZ,

  -- Reward distribution tracking
  rewards_today JSONB DEFAULT '{"none": 0, "low": 0, "medium": 0, "high": 0, "jackpot": 0}'::jsonb,

  -- Engagement learning
  best_response_hours JSONB DEFAULT '[]'::jsonb,
  worst_response_hours JSONB DEFAULT '[]'::jsonb,
  avg_open_rate DECIMAL DEFAULT 0.5,
  avg_task_after_rate DECIMAL DEFAULT 0.3,

  -- Negative signal buffer
  suppressed_signals JSONB DEFAULT '[]'::jsonb,
  last_suppressed_at TIMESTAMPTZ,

  -- Delayed reward queue
  pending_rewards JSONB DEFAULT '[]'::jsonb,

  -- Surprise/milestone
  next_milestone_threshold INTEGER DEFAULT 7,
  surprise_reward_probability DECIMAL DEFAULT 0.15,

  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE dopamine_state ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users own dopamine state" ON dopamine_state
  FOR ALL USING (auth.uid() = user_id);
