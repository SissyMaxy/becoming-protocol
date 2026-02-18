-- Handler Intelligence Tables
-- Migration for Phase C: Handler system

-- Handler budget tracking
CREATE TABLE IF NOT EXISTS handler_budget (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  date DATE NOT NULL,
  daily_limit_cents INTEGER NOT NULL DEFAULT 50,
  spent_cents NUMERIC NOT NULL DEFAULT 0,
  reserve_cents INTEGER NOT NULL DEFAULT 10,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, date)
);

-- Handler action log (for tracking AI usage)
CREATE TABLE IF NOT EXISTS handler_action_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  action_type TEXT NOT NULL,
  layer_used INTEGER NOT NULL, -- 1, 2, or 3
  cost_cents NUMERIC NOT NULL DEFAULT 0,
  content TEXT,
  state_snapshot JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Failure mode events (from addendum)
CREATE TABLE IF NOT EXISTS failure_mode_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  failure_mode TEXT NOT NULL,
  detected_at TIMESTAMPTZ DEFAULT NOW(),
  detection_signals JSONB NOT NULL DEFAULT '{}',
  intervention_type TEXT NOT NULL,
  intervention_content TEXT,
  handler_mode_at_detection TEXT,
  state_snapshot_at_detection JSONB,
  resolved_at TIMESTAMPTZ,
  resolution_signal TEXT,
  effectiveness_score INTEGER,
  notes TEXT
);

-- Time capsules (pre-written messages for crisis moments)
CREATE TABLE IF NOT EXISTS time_capsules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  capsule_type TEXT NOT NULL,
  content TEXT NOT NULL,
  authored_during TEXT,
  authored_at TIMESTAMPTZ DEFAULT NOW(),
  state_at_authoring JSONB,
  times_delivered INTEGER DEFAULT 0,
  last_delivered_at TIMESTAMPTZ,
  effectiveness_ratings JSONB DEFAULT '[]'
);

-- Crisis kit (curated evidence for identity crisis moments)
CREATE TABLE IF NOT EXISTS crisis_kit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  item_type TEXT NOT NULL,
  source_id UUID,
  content_preview TEXT,
  curated_by TEXT DEFAULT 'handler',
  added_at TIMESTAMPTZ DEFAULT NOW(),
  times_shown INTEGER DEFAULT 0,
  last_shown_at TIMESTAMPTZ,
  user_effectiveness_rating INTEGER
);

-- Recovery protocols (pre-built re-entry plans)
CREATE TABLE IF NOT EXISTS recovery_protocols (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  protocol_type TEXT NOT NULL,
  day_plans JSONB NOT NULL,
  generated_at TIMESTAMPTZ DEFAULT NOW(),
  generated_by TEXT DEFAULT 'handler',
  activated_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  completion_rate NUMERIC,
  led_to_new_streak BOOLEAN
);

-- Add columns to user_state if not exists
DO $$
BEGIN
  -- Current failure mode
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_state' AND column_name = 'current_failure_mode') THEN
    ALTER TABLE user_state ADD COLUMN current_failure_mode TEXT;
  END IF;

  -- Last release mood score
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_state' AND column_name = 'last_release_mood_score') THEN
    ALTER TABLE user_state ADD COLUMN last_release_mood_score INTEGER;
  END IF;

  -- Work stress mode
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_state' AND column_name = 'work_stress_mode_active') THEN
    ALTER TABLE user_state ADD COLUMN work_stress_mode_active BOOLEAN DEFAULT FALSE;
  END IF;

  -- Weekend mode
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_state' AND column_name = 'weekend_mode_active') THEN
    ALTER TABLE user_state ADD COLUMN weekend_mode_active BOOLEAN DEFAULT FALSE;
  END IF;

  -- Recovery protocol active
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_state' AND column_name = 'recovery_protocol_active') THEN
    ALTER TABLE user_state ADD COLUMN recovery_protocol_active UUID;
  END IF;

  -- Crisis kit last offered
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_state' AND column_name = 'crisis_kit_last_offered') THEN
    ALTER TABLE user_state ADD COLUMN crisis_kit_last_offered TIMESTAMPTZ;
  END IF;

  -- Consecutive survival days
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_state' AND column_name = 'consecutive_survival_days') THEN
    ALTER TABLE user_state ADD COLUMN consecutive_survival_days INTEGER DEFAULT 0;
  END IF;

  -- Tasks per day cap
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_state' AND column_name = 'tasks_per_day_cap') THEN
    ALTER TABLE user_state ADD COLUMN tasks_per_day_cap INTEGER;
  END IF;

  -- Streak break count
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_state' AND column_name = 'streak_break_count') THEN
    ALTER TABLE user_state ADD COLUMN streak_break_count INTEGER DEFAULT 0;
  END IF;

  -- Last release timestamp
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_state' AND column_name = 'last_release') THEN
    ALTER TABLE user_state ADD COLUMN last_release TIMESTAMPTZ;
  END IF;

  -- Current anxiety
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_state' AND column_name = 'current_anxiety') THEN
    ALTER TABLE user_state ADD COLUMN current_anxiety INTEGER;
  END IF;

  -- Current energy
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_state' AND column_name = 'current_energy') THEN
    ALTER TABLE user_state ADD COLUMN current_energy INTEGER;
  END IF;

  -- Resistance detected
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_state' AND column_name = 'resistance_detected') THEN
    ALTER TABLE user_state ADD COLUMN resistance_detected BOOLEAN DEFAULT FALSE;
  END IF;
END $$;

-- Add context column to mood_checkins if not exists
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'mood_checkins' AND column_name = 'context') THEN
    ALTER TABLE mood_checkins ADD COLUMN context TEXT;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'mood_checkins' AND column_name = 'triggered_by') THEN
    ALTER TABLE mood_checkins ADD COLUMN triggered_by TEXT;
  END IF;
END $$;

-- RLS Policies
ALTER TABLE handler_budget ENABLE ROW LEVEL SECURITY;
ALTER TABLE handler_action_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE failure_mode_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE time_capsules ENABLE ROW LEVEL SECURITY;
ALTER TABLE crisis_kit ENABLE ROW LEVEL SECURITY;
ALTER TABLE recovery_protocols ENABLE ROW LEVEL SECURITY;

-- Handler budget policies
CREATE POLICY "Users can view own handler budget"
  ON handler_budget FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own handler budget"
  ON handler_budget FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own handler budget"
  ON handler_budget FOR UPDATE
  USING (auth.uid() = user_id);

-- Handler action log policies
CREATE POLICY "Users can view own handler action log"
  ON handler_action_log FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own handler action log"
  ON handler_action_log FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Failure mode events policies
CREATE POLICY "Users can view own failure mode events"
  ON failure_mode_events FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own failure mode events"
  ON failure_mode_events FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own failure mode events"
  ON failure_mode_events FOR UPDATE
  USING (auth.uid() = user_id);

-- Time capsules policies
CREATE POLICY "Users can view own time capsules"
  ON time_capsules FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own time capsules"
  ON time_capsules FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own time capsules"
  ON time_capsules FOR UPDATE
  USING (auth.uid() = user_id);

-- Crisis kit policies
CREATE POLICY "Users can view own crisis kit"
  ON crisis_kit FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own crisis kit"
  ON crisis_kit FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own crisis kit"
  ON crisis_kit FOR UPDATE
  USING (auth.uid() = user_id);

-- Recovery protocols policies
CREATE POLICY "Users can view own recovery protocols"
  ON recovery_protocols FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own recovery protocols"
  ON recovery_protocols FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own recovery protocols"
  ON recovery_protocols FOR UPDATE
  USING (auth.uid() = user_id);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_handler_budget_user_date ON handler_budget(user_id, date);
CREATE INDEX IF NOT EXISTS idx_handler_action_log_user ON handler_action_log(user_id);
CREATE INDEX IF NOT EXISTS idx_handler_action_log_created ON handler_action_log(created_at);
CREATE INDEX IF NOT EXISTS idx_failure_mode_events_user ON failure_mode_events(user_id);
CREATE INDEX IF NOT EXISTS idx_failure_mode_events_detected ON failure_mode_events(detected_at);
CREATE INDEX IF NOT EXISTS idx_failure_mode_events_mode ON failure_mode_events(failure_mode);
CREATE INDEX IF NOT EXISTS idx_time_capsules_user_type ON time_capsules(user_id, capsule_type);
CREATE INDEX IF NOT EXISTS idx_crisis_kit_user ON crisis_kit(user_id);
CREATE INDEX IF NOT EXISTS idx_recovery_protocols_user ON recovery_protocols(user_id);
