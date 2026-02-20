-- ================================================================
-- CATCHUP: Migrations 031, 035, 036, 037
-- Only the MISSING tables from these migrations.
-- Idempotent — safe to run multiple times.
-- ================================================================

-- ============================================================
-- 031: Handler Manipulation (5 tables)
-- ============================================================

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

CREATE INDEX IF NOT EXISTS idx_manipulation_log_user ON manipulation_log(user_id);
CREATE INDEX IF NOT EXISTS idx_manipulation_log_tactic ON manipulation_log(tactic);
CREATE INDEX IF NOT EXISTS idx_manipulation_log_timestamp ON manipulation_log(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_installed_reality_frames_user ON installed_reality_frames(user_id);
CREATE INDEX IF NOT EXISTS idx_identity_erosion_user ON identity_erosion(user_id);

ALTER TABLE manipulation_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE installed_reality_frames ENABLE ROW LEVEL SECURITY;
ALTER TABLE identity_erosion ENABLE ROW LEVEL SECURITY;
ALTER TABLE handler_persona_effectiveness ENABLE ROW LEVEL SECURITY;
ALTER TABLE gaslighting_effectiveness ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can view own manipulation log') THEN
    CREATE POLICY "Users can view own manipulation log" ON manipulation_log FOR SELECT USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'System can insert manipulation log') THEN
    CREATE POLICY "System can insert manipulation log" ON manipulation_log FOR INSERT WITH CHECK (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can view own reality frames') THEN
    CREATE POLICY "Users can view own reality frames" ON installed_reality_frames FOR ALL USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can view own identity erosion') THEN
    CREATE POLICY "Users can view own identity erosion" ON identity_erosion FOR ALL USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can view own persona effectiveness') THEN
    CREATE POLICY "Users can view own persona effectiveness" ON handler_persona_effectiveness FOR ALL USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can view own gaslighting effectiveness') THEN
    CREATE POLICY "Users can view own gaslighting effectiveness" ON gaslighting_effectiveness FOR ALL USING (auth.uid() = user_id);
  END IF;
END $$;

CREATE OR REPLACE FUNCTION erode_identity_aspect(
  p_user_id UUID, p_aspect TEXT, p_erosion_amount INT, p_event_description TEXT
) RETURNS INT AS $$
DECLARE v_new_strength INT;
BEGIN
  INSERT INTO identity_erosion (user_id, aspect, current_strength, erosion_events)
  VALUES (p_user_id, p_aspect, 100 - p_erosion_amount,
          jsonb_build_array(jsonb_build_object('amount', p_erosion_amount, 'description', p_event_description, 'timestamp', now())))
  ON CONFLICT (user_id, aspect) DO UPDATE
  SET current_strength = GREATEST(0, identity_erosion.current_strength - p_erosion_amount),
      erosion_events = identity_erosion.erosion_events || jsonb_build_object('amount', p_erosion_amount, 'description', p_event_description, 'timestamp', now()),
      updated_at = now()
  RETURNING current_strength INTO v_new_strength;
  RETURN v_new_strength;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION reinforce_reality_frame(
  p_user_id UUID, p_domain TEXT, p_reinforcement_strength INT DEFAULT 5
) RETURNS INT AS $$
DECLARE v_new_strength INT;
BEGIN
  UPDATE installed_reality_frames
  SET installation_strength = LEAST(100, installation_strength + p_reinforcement_strength),
      reinforcement_count = reinforcement_count + 1, last_reinforced = now()
  WHERE user_id = p_user_id AND domain = p_domain
  RETURNING installation_strength INTO v_new_strength;
  RETURN COALESCE(v_new_strength, 0);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- 035: Handler Intelligence (2 missing tables only)
-- (failure_mode_events, time_capsules, etc. already exist from 034)
-- ============================================================

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

CREATE TABLE IF NOT EXISTS handler_action_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  action_type TEXT NOT NULL,
  layer_used INTEGER NOT NULL,
  cost_cents NUMERIC NOT NULL DEFAULT 0,
  content TEXT,
  state_snapshot JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE handler_budget ENABLE ROW LEVEL SECURITY;
ALTER TABLE handler_action_log ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can view own handler budget') THEN
    CREATE POLICY "Users can view own handler budget" ON handler_budget FOR SELECT USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can insert own handler budget') THEN
    CREATE POLICY "Users can insert own handler budget" ON handler_budget FOR INSERT WITH CHECK (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can update own handler budget') THEN
    CREATE POLICY "Users can update own handler budget" ON handler_budget FOR UPDATE USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can view own handler action log') THEN
    CREATE POLICY "Users can view own handler action log" ON handler_action_log FOR SELECT USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can insert own handler action log') THEN
    CREATE POLICY "Users can insert own handler action log" ON handler_action_log FOR INSERT WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_handler_budget_user_date ON handler_budget(user_id, date);
CREATE INDEX IF NOT EXISTS idx_handler_action_log_user ON handler_action_log(user_id);
CREATE INDEX IF NOT EXISTS idx_handler_action_log_created ON handler_action_log(created_at);

-- 035 also adds columns to user_state and mood_checkins
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='user_state' AND column_name='last_release_mood_score') THEN
    ALTER TABLE user_state ADD COLUMN last_release_mood_score INTEGER;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='user_state' AND column_name='work_stress_mode_active') THEN
    ALTER TABLE user_state ADD COLUMN work_stress_mode_active BOOLEAN DEFAULT FALSE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='user_state' AND column_name='weekend_mode_active') THEN
    ALTER TABLE user_state ADD COLUMN weekend_mode_active BOOLEAN DEFAULT FALSE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='user_state' AND column_name='recovery_protocol_active') THEN
    ALTER TABLE user_state ADD COLUMN recovery_protocol_active UUID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='user_state' AND column_name='crisis_kit_last_offered') THEN
    ALTER TABLE user_state ADD COLUMN crisis_kit_last_offered TIMESTAMPTZ;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='user_state' AND column_name='consecutive_survival_days') THEN
    ALTER TABLE user_state ADD COLUMN consecutive_survival_days INTEGER DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='user_state' AND column_name='tasks_per_day_cap') THEN
    ALTER TABLE user_state ADD COLUMN tasks_per_day_cap INTEGER;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='user_state' AND column_name='streak_break_count') THEN
    ALTER TABLE user_state ADD COLUMN streak_break_count INTEGER DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='user_state' AND column_name='last_release') THEN
    ALTER TABLE user_state ADD COLUMN last_release TIMESTAMPTZ;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='user_state' AND column_name='current_anxiety') THEN
    ALTER TABLE user_state ADD COLUMN current_anxiety INTEGER;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='user_state' AND column_name='current_energy') THEN
    ALTER TABLE user_state ADD COLUMN current_energy INTEGER;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='user_state' AND column_name='resistance_detected') THEN
    ALTER TABLE user_state ADD COLUMN resistance_detected BOOLEAN DEFAULT FALSE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='mood_checkins' AND column_name='triggered_by') THEN
    ALTER TABLE mood_checkins ADD COLUMN triggered_by TEXT;
  END IF;
END $$;

-- ============================================================
-- 036: Session Guidance Log (1 missing table)
-- (scheduled_notifications already exists)
-- ============================================================

CREATE TABLE IF NOT EXISTS session_guidance_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES intimate_sessions NOT NULL,
  user_id UUID REFERENCES auth.users NOT NULL,
  phase TEXT NOT NULL,
  guidance_text TEXT NOT NULL,
  guidance_layer INTEGER NOT NULL,
  handler_mode TEXT,
  arousal_level INTEGER,
  edge_count INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE session_guidance_log ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users access own guidance') THEN
    CREATE POLICY "Users access own guidance" ON session_guidance_log FOR ALL USING (auth.uid() = user_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_session_guidance_session ON session_guidance_log(session_id);
CREATE INDEX IF NOT EXISTS idx_session_guidance_user ON session_guidance_log(user_id);

-- 036 also adds columns to intimate_sessions, user_state, time_capsules
ALTER TABLE intimate_sessions ADD COLUMN IF NOT EXISTS handler_mode TEXT;
ALTER TABLE intimate_sessions ADD COLUMN IF NOT EXISTS guidance_messages JSONB DEFAULT '[]';
ALTER TABLE intimate_sessions ADD COLUMN IF NOT EXISTS time_capsules_prompted INTEGER DEFAULT 0;
ALTER TABLE intimate_sessions ADD COLUMN IF NOT EXISTS time_capsules_saved INTEGER DEFAULT 0;
ALTER TABLE intimate_sessions ADD COLUMN IF NOT EXISTS post_session_mood_captured BOOLEAN DEFAULT FALSE;
ALTER TABLE intimate_sessions ADD COLUMN IF NOT EXISTS crash_detected BOOLEAN DEFAULT FALSE;
ALTER TABLE intimate_sessions ADD COLUMN IF NOT EXISTS session_context JSONB DEFAULT '{}';

ALTER TABLE user_state ADD COLUMN IF NOT EXISTS last_session_id UUID;
ALTER TABLE user_state ADD COLUMN IF NOT EXISTS last_session_ended_at TIMESTAMPTZ;
ALTER TABLE user_state ADD COLUMN IF NOT EXISTS post_session_mood_pending BOOLEAN DEFAULT FALSE;

ALTER TABLE time_capsules ADD COLUMN IF NOT EXISTS session_id UUID;
ALTER TABLE time_capsules ADD COLUMN IF NOT EXISTS arousal_level INTEGER;
ALTER TABLE time_capsules ADD COLUMN IF NOT EXISTS edge_count INTEGER;

CREATE INDEX IF NOT EXISTS idx_intimate_sessions_handler ON intimate_sessions(user_id, handler_mode);

-- 036 functions
CREATE OR REPLACE FUNCTION get_pending_mood_checks(p_user_id UUID)
RETURNS TABLE (notification_id UUID, session_id UUID, session_type TEXT, edge_count INTEGER, scheduled_for TIMESTAMPTZ) AS $$
BEGIN
  RETURN QUERY SELECT sn.id, (sn.payload->>'sessionId')::UUID, sn.payload->>'sessionType',
    (sn.payload->>'edgeCount')::INTEGER, sn.scheduled_for
  FROM scheduled_notifications sn
  WHERE sn.user_id = p_user_id AND sn.notification_type = 'post_session_mood'
    AND sn.sent_at IS NULL AND sn.dismissed_at IS NULL AND sn.scheduled_for <= NOW()
  ORDER BY sn.scheduled_for ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION mark_notification_sent(p_notification_id UUID) RETURNS void AS $$
BEGIN UPDATE scheduled_notifications SET sent_at = NOW() WHERE id = p_notification_id; END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION dismiss_notification(p_notification_id UUID) RETURNS void AS $$
BEGIN UPDATE scheduled_notifications SET dismissed_at = NOW() WHERE id = p_notification_id; END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- 037: Gina Ladder Pipeline (5 tables)
-- ============================================================

CREATE TABLE IF NOT EXISTS gina_ladder_state (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  channel TEXT NOT NULL,
  current_rung INTEGER DEFAULT 0,
  rung_entered_at TIMESTAMPTZ,
  last_seed_date TIMESTAMPTZ,
  last_seed_result TEXT,
  consecutive_failures INTEGER DEFAULT 0,
  cooldown_until TIMESTAMPTZ,
  positive_seeds_at_rung INTEGER DEFAULT 0,
  total_seeds_at_rung INTEGER DEFAULT 0,
  notes JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, channel)
);

CREATE TABLE IF NOT EXISTS gina_seed_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  channel TEXT NOT NULL,
  rung INTEGER NOT NULL,
  task_id TEXT,
  seed_description TEXT NOT NULL,
  gina_response TEXT,
  gina_exact_words TEXT,
  context_notes TEXT,
  her_mood TEXT,
  timing TEXT,
  setting TEXT,
  recovery_triggered BOOLEAN DEFAULT FALSE,
  recovery_type TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS gina_measurements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  measurement_type TEXT NOT NULL,
  channel TEXT,
  data JSONB NOT NULL,
  score NUMERIC,
  period_start DATE,
  period_end DATE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS gina_arc_state (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  arc TEXT NOT NULL,
  gate_status TEXT DEFAULT 'locked',
  gate_condition TEXT,
  current_milestone TEXT,
  milestones_completed JSONB DEFAULT '[]',
  unlocked_at TIMESTAMPTZ,
  activated_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, arc)
);

CREATE TABLE IF NOT EXISTS gina_disclosure_map (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  person_name TEXT NOT NULL,
  relationship TEXT,
  relationship_to TEXT,
  awareness_status TEXT DEFAULT 'unaware',
  told_date DATE,
  told_by TEXT,
  initial_reaction TEXT,
  current_stance TEXT,
  provides_active_support BOOLEAN DEFAULT FALSE,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE gina_ladder_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE gina_seed_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE gina_measurements ENABLE ROW LEVEL SECURITY;
ALTER TABLE gina_arc_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE gina_disclosure_map ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users access own gina_ladder_state') THEN
    CREATE POLICY "Users access own gina_ladder_state" ON gina_ladder_state FOR ALL USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users access own gina_seed_log') THEN
    CREATE POLICY "Users access own gina_seed_log" ON gina_seed_log FOR ALL USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users access own gina_measurements') THEN
    CREATE POLICY "Users access own gina_measurements" ON gina_measurements FOR ALL USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users access own gina_arc_state') THEN
    CREATE POLICY "Users access own gina_arc_state" ON gina_arc_state FOR ALL USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users access own gina_disclosure_map') THEN
    CREATE POLICY "Users access own gina_disclosure_map" ON gina_disclosure_map FOR ALL USING (auth.uid() = user_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_gina_seed_log_user_channel ON gina_seed_log(user_id, channel, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_gina_measurements_user_type ON gina_measurements(user_id, measurement_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_gina_ladder_state_user ON gina_ladder_state(user_id);
CREATE INDEX IF NOT EXISTS idx_gina_arc_state_user ON gina_arc_state(user_id);
CREATE INDEX IF NOT EXISTS idx_gina_disclosure_map_user ON gina_disclosure_map(user_id);

CREATE OR REPLACE FUNCTION initialize_gina_ladder(p_user_id UUID) RETURNS void AS $$
DECLARE channels TEXT[] := ARRAY['scent','touch','domestic','intimacy','visual','social','bedroom','pronoun','financial','body_change_touch']; ch TEXT;
BEGIN
  FOREACH ch IN ARRAY channels LOOP
    INSERT INTO gina_ladder_state (user_id, channel, current_rung) VALUES (p_user_id, ch, 0) ON CONFLICT (user_id, channel) DO NOTHING;
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION initialize_gina_arcs(p_user_id UUID) RETURNS void AS $$
BEGIN
  INSERT INTO gina_arc_state (user_id, arc, gate_status, gate_condition) VALUES
    (p_user_id, 'identity_processing', 'locked', 'post_disclosure_stable'),
    (p_user_id, 'social_circle', 'locked', 'pre_disclosure'),
    (p_user_id, 'shopper', 'locked', 'post_disclosure'),
    (p_user_id, 'hrt_management', 'locked', 'medical_appointment')
  ON CONFLICT (user_id, arc) DO NOTHING;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- DONE. 13 missing tables from 031/035/036/037 created.
-- ============================================================
