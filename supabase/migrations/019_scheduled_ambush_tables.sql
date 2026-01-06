-- Migration 019: Scheduled Ambush Tables
-- Quick micro-tasks that appear throughout the day at strategic moments

-- ============================================
-- MICRO TASK TEMPLATES
-- Library of quick tasks that can be scheduled
-- ============================================
CREATE TABLE IF NOT EXISTS micro_task_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Classification
  type TEXT NOT NULL, -- posture, voice, affirmation, pose, breath, check_in, micro_task, anchor, visualization, movement
  category TEXT NOT NULL, -- Maps to TaskCategory
  domain TEXT NOT NULL, -- Maps to FeminizationDomain

  -- Content
  instruction TEXT NOT NULL,
  duration_seconds INTEGER NOT NULL DEFAULT 30, -- How long the task takes

  -- Proof requirements
  proof_type TEXT NOT NULL DEFAULT 'tap', -- none, tap, photo, audio, selfie
  proof_prompt TEXT, -- What to capture if proof required

  -- Intensity range (1-5)
  min_intensity INTEGER NOT NULL DEFAULT 1,
  max_intensity INTEGER NOT NULL DEFAULT 5,

  -- Requirements
  requires_privacy BOOLEAN DEFAULT FALSE,
  time_windows TEXT[] DEFAULT ARRAY['morning', 'afternoon', 'evening', 'night'],

  -- Frequency control
  max_per_day INTEGER DEFAULT 3,
  min_gap_hours DECIMAL DEFAULT 2,

  -- Flags
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- SCHEDULED AMBUSHES
-- Instances of scheduled micro-tasks for users
-- ============================================
CREATE TABLE IF NOT EXISTS scheduled_ambushes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  plan_date DATE NOT NULL,

  -- Template reference
  template_id UUID REFERENCES micro_task_templates NOT NULL,

  -- Scheduling
  scheduled_time TIME NOT NULL,
  scheduled_at TIMESTAMPTZ DEFAULT NOW(),
  priority INTEGER NOT NULL DEFAULT 2, -- 1=skippable, 2=important, 3=critical

  -- Delivery
  status TEXT NOT NULL DEFAULT 'scheduled', -- scheduled, delivered, completed, missed, snoozed
  delivered_at TIMESTAMPTZ,

  -- Completion
  completed_at TIMESTAMPTZ,
  response_time_seconds INTEGER,

  -- Proof
  proof_submitted BOOLEAN DEFAULT FALSE,
  proof_url TEXT,

  -- Snooze tracking
  snooze_count INTEGER DEFAULT 0,
  snoozed_until TIMESTAMPTZ,

  -- Context at scheduling
  denial_day_at_schedule INTEGER,
  arousal_state_at_schedule TEXT,

  -- AI reasoning
  selection_reason TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW(),

  -- Prevent duplicate scheduling
  UNIQUE(user_id, plan_date, template_id, scheduled_time)
);

-- ============================================
-- AMBUSH COMPLETION HISTORY
-- Track completion patterns over time
-- ============================================
CREATE TABLE IF NOT EXISTS ambush_completions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  ambush_id UUID REFERENCES scheduled_ambushes NOT NULL,
  template_id UUID REFERENCES micro_task_templates NOT NULL,

  -- Timing
  completed_at TIMESTAMPTZ DEFAULT NOW(),
  response_time_seconds INTEGER,

  -- State at completion
  denial_day INTEGER,
  arousal_state TEXT,

  -- Proof
  proof_submitted BOOLEAN DEFAULT FALSE,
  proof_url TEXT,
  proof_verified BOOLEAN DEFAULT FALSE,

  -- Feedback
  felt_good BOOLEAN,
  difficulty_rating INTEGER, -- 1-5

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- AMBUSH USER SETTINGS
-- Per-user configuration for ambushes
-- ============================================
CREATE TABLE IF NOT EXISTS ambush_user_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL UNIQUE,

  -- Frequency
  min_ambushes_per_day INTEGER DEFAULT 3,
  max_ambushes_per_day INTEGER DEFAULT 8,
  min_gap_minutes INTEGER DEFAULT 45,

  -- Time windows (store as JSON for flexibility)
  time_windows JSONB DEFAULT '{
    "morning": {"start": "07:00", "end": "12:00", "enabled": true},
    "afternoon": {"start": "12:00", "end": "17:00", "enabled": true},
    "evening": {"start": "17:00", "end": "21:00", "enabled": true},
    "night": {"start": "21:00", "end": "23:30", "enabled": true}
  }',

  -- Privacy settings
  allow_photo_proof BOOLEAN DEFAULT TRUE,
  allow_audio_proof BOOLEAN DEFAULT TRUE,

  -- Snooze settings
  snooze_limit INTEGER DEFAULT 2,
  snooze_duration_minutes INTEGER DEFAULT 15,

  -- Notification settings
  notification_enabled BOOLEAN DEFAULT TRUE,
  notification_sound BOOLEAN DEFAULT TRUE,
  notification_vibrate BOOLEAN DEFAULT TRUE,

  -- Intensity preference (1-5)
  preferred_intensity INTEGER DEFAULT 3,

  -- Enabled types
  enabled_types TEXT[] DEFAULT ARRAY['posture', 'voice', 'affirmation', 'pose', 'breath', 'check_in', 'micro_task', 'anchor', 'visualization', 'movement'],

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================
ALTER TABLE micro_task_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE scheduled_ambushes ENABLE ROW LEVEL SECURITY;
ALTER TABLE ambush_completions ENABLE ROW LEVEL SECURITY;
ALTER TABLE ambush_user_settings ENABLE ROW LEVEL SECURITY;

-- Templates are readable by all authenticated users (system-wide library)
DROP POLICY IF EXISTS "Templates readable by authenticated users" ON micro_task_templates;
CREATE POLICY "Templates readable by authenticated users" ON micro_task_templates
  FOR SELECT USING (auth.role() = 'authenticated');

-- Only service role can modify templates
DROP POLICY IF EXISTS "Service role manages templates" ON micro_task_templates;
CREATE POLICY "Service role manages templates" ON micro_task_templates
  FOR ALL USING (auth.role() = 'service_role');

-- Users access own scheduled ambushes
DROP POLICY IF EXISTS "Users access own ambushes" ON scheduled_ambushes;
CREATE POLICY "Users access own ambushes" ON scheduled_ambushes
  FOR ALL USING (auth.uid() = user_id);

-- Users access own completions
DROP POLICY IF EXISTS "Users access own completions" ON ambush_completions;
CREATE POLICY "Users access own completions" ON ambush_completions
  FOR ALL USING (auth.uid() = user_id);

-- Users access own settings
DROP POLICY IF EXISTS "Users access own settings" ON ambush_user_settings;
CREATE POLICY "Users access own settings" ON ambush_user_settings
  FOR ALL USING (auth.uid() = user_id);

-- ============================================
-- INDEXES
-- ============================================
CREATE INDEX IF NOT EXISTS idx_micro_task_templates_type ON micro_task_templates(type);
CREATE INDEX IF NOT EXISTS idx_micro_task_templates_active ON micro_task_templates(active) WHERE active = TRUE;
CREATE INDEX IF NOT EXISTS idx_micro_task_templates_category ON micro_task_templates(category);

CREATE INDEX IF NOT EXISTS idx_scheduled_ambushes_user_date ON scheduled_ambushes(user_id, plan_date);
CREATE INDEX IF NOT EXISTS idx_scheduled_ambushes_status ON scheduled_ambushes(user_id, status);
CREATE INDEX IF NOT EXISTS idx_scheduled_ambushes_pending ON scheduled_ambushes(user_id, plan_date, status)
  WHERE status IN ('scheduled', 'snoozed');
CREATE INDEX IF NOT EXISTS idx_scheduled_ambushes_delivery ON scheduled_ambushes(plan_date, scheduled_time, status)
  WHERE status = 'scheduled';

CREATE INDEX IF NOT EXISTS idx_ambush_completions_user ON ambush_completions(user_id);
CREATE INDEX IF NOT EXISTS idx_ambush_completions_recent ON ambush_completions(user_id, completed_at DESC);
CREATE INDEX IF NOT EXISTS idx_ambush_completions_template ON ambush_completions(template_id);

CREATE INDEX IF NOT EXISTS idx_ambush_user_settings_user ON ambush_user_settings(user_id);

-- ============================================
-- TRIGGERS
-- ============================================

-- Auto-update timestamps on settings
DROP TRIGGER IF EXISTS update_ambush_user_settings_updated_at ON ambush_user_settings;
CREATE TRIGGER update_ambush_user_settings_updated_at
  BEFORE UPDATE ON ambush_user_settings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- SEED DATA: Initial micro-task templates
-- ============================================

-- Posture tasks
INSERT INTO micro_task_templates (type, category, domain, instruction, duration_seconds, proof_type, requires_privacy, time_windows, max_per_day)
VALUES
  ('posture', 'practice', 'body_language', 'Check your posture. Shoulders back, chin up, chest out. Hold for 10 seconds.', 15, 'tap', false, ARRAY['morning', 'afternoon', 'evening'], 4),
  ('posture', 'practice', 'body_language', 'Cross your legs at the ankle. Feel the feminine position.', 20, 'tap', false, ARRAY['morning', 'afternoon', 'evening'], 3),
  ('posture', 'practice', 'body_language', 'Sit with your knees together. This is how she sits.', 15, 'tap', false, ARRAY['morning', 'afternoon', 'evening'], 3)
ON CONFLICT DO NOTHING;

-- Voice tasks
INSERT INTO micro_task_templates (type, category, domain, instruction, duration_seconds, proof_type, proof_prompt, requires_privacy, time_windows, max_per_day)
VALUES
  ('voice', 'practice', 'voice', 'Say "Hello, my name is [chosen name]" in your feminine voice.', 30, 'audio', 'Record yourself saying the phrase', true, ARRAY['morning', 'afternoon', 'evening'], 3),
  ('voice', 'practice', 'voice', 'Hum for 20 seconds at your target pitch. Feel the resonance.', 25, 'tap', null, true, ARRAY['morning', 'afternoon', 'evening'], 3),
  ('voice', 'practice', 'voice', 'Practice a feminine giggle. Let it feel natural.', 20, 'tap', null, true, ARRAY['evening', 'night'], 2)
ON CONFLICT DO NOTHING;

-- Affirmation tasks
INSERT INTO micro_task_templates (type, category, domain, instruction, duration_seconds, proof_type, requires_privacy, time_windows, max_per_day)
VALUES
  ('affirmation', 'say', 'inner_narrative', 'Say out loud: "I am becoming who I was always meant to be."', 15, 'tap', true, ARRAY['morning', 'afternoon', 'evening'], 3),
  ('affirmation', 'say', 'inner_narrative', 'Look in a mirror and say: "Good girl."', 10, 'tap', true, ARRAY['morning', 'evening'], 2),
  ('affirmation', 'say', 'identity', 'Whisper your chosen name three times.', 15, 'tap', true, ARRAY['morning', 'afternoon', 'evening', 'night'], 4),
  ('affirmation', 'say', 'inner_narrative', 'Say: "I accept who I am becoming."', 10, 'tap', true, ARRAY['morning', 'evening'], 2)
ON CONFLICT DO NOTHING;

-- Pose tasks
INSERT INTO micro_task_templates (type, category, domain, instruction, duration_seconds, proof_type, proof_prompt, requires_privacy, time_windows, max_per_day, min_intensity)
VALUES
  ('pose', 'practice', 'body_language', 'Stand with your weight on one leg, hand on hip. Hold for 15 seconds.', 20, 'photo', 'Capture your pose', true, ARRAY['morning', 'afternoon', 'evening'], 2, 2),
  ('pose', 'practice', 'body_language', 'Sit down slowly and gracefully, knees together. Take a photo seated.', 25, 'photo', 'Photo of your seated pose', true, ARRAY['afternoon', 'evening'], 2, 2),
  ('pose', 'practice', 'body_language', 'Practice your best hair flip motion. Feel the movement.', 15, 'tap', null, true, ARRAY['morning', 'afternoon', 'evening'], 2, 1)
ON CONFLICT DO NOTHING;

-- Breath tasks
INSERT INTO micro_task_templates (type, category, domain, instruction, duration_seconds, proof_type, requires_privacy, time_windows, max_per_day)
VALUES
  ('breath', 'practice', 'inner_narrative', 'Take 3 slow, deep breaths. With each exhale, release masculine tension.', 30, 'tap', false, ARRAY['morning', 'afternoon', 'evening', 'night'], 4),
  ('breath', 'practice', 'inner_narrative', 'Breathe in femininity for 4 counts. Hold for 4. Release resistance for 4.', 25, 'tap', false, ARRAY['morning', 'afternoon', 'evening'], 3)
ON CONFLICT DO NOTHING;

-- Check-in tasks
INSERT INTO micro_task_templates (type, category, domain, instruction, duration_seconds, proof_type, requires_privacy, time_windows, max_per_day)
VALUES
  ('check_in', 'surrender', 'inner_narrative', 'How feminine do you feel right now? Rate 1-10 in your mind.', 10, 'tap', false, ARRAY['morning', 'afternoon', 'evening', 'night'], 4),
  ('check_in', 'surrender', 'conditioning', 'Notice what you''re wearing. Does it reflect who you''re becoming?', 15, 'tap', false, ARRAY['morning', 'afternoon', 'evening'], 3)
ON CONFLICT DO NOTHING;

-- Micro-task tasks
INSERT INTO micro_task_templates (type, category, domain, instruction, duration_seconds, proof_type, requires_privacy, time_windows, max_per_day, min_intensity)
VALUES
  ('micro_task', 'apply', 'skincare', 'Apply lip balm or lipstick. Feel it on your lips.', 30, 'tap', false, ARRAY['morning', 'afternoon', 'evening'], 3, 1),
  ('micro_task', 'apply', 'skincare', 'Apply hand lotion with slow, feminine movements.', 45, 'tap', false, ARRAY['morning', 'afternoon', 'evening'], 2, 1),
  ('micro_task', 'wear', 'style', 'Adjust your clothing to feel more put-together. Smooth fabric against your skin.', 20, 'tap', false, ARRAY['morning', 'afternoon', 'evening'], 2, 1)
ON CONFLICT DO NOTHING;

-- Anchor tasks
INSERT INTO micro_task_templates (type, category, domain, instruction, duration_seconds, proof_type, requires_privacy, time_windows, max_per_day, min_intensity)
VALUES
  ('anchor', 'practice', 'conditioning', 'Touch your collarbone gently. This is your femininity anchor.', 15, 'tap', false, ARRAY['morning', 'afternoon', 'evening', 'night'], 5, 1),
  ('anchor', 'practice', 'conditioning', 'Trace your lips with your finger. Associate this with surrender.', 15, 'tap', true, ARRAY['evening', 'night'], 3, 2)
ON CONFLICT DO NOTHING;

-- Visualization tasks
INSERT INTO micro_task_templates (type, category, domain, instruction, duration_seconds, proof_type, requires_privacy, time_windows, max_per_day)
VALUES
  ('visualization', 'fantasy', 'inner_narrative', 'Close your eyes. See yourself fully transformed. 30 seconds.', 35, 'tap', false, ARRAY['morning', 'afternoon', 'evening', 'night'], 3),
  ('visualization', 'fantasy', 'identity', 'Imagine looking in a mirror and seeing HER looking back.', 30, 'tap', false, ARRAY['morning', 'evening', 'night'], 2),
  ('visualization', 'fantasy', 'inner_narrative', 'Picture yourself walking confidently in heels. Feel the sway.', 25, 'tap', false, ARRAY['afternoon', 'evening'], 2)
ON CONFLICT DO NOTHING;

-- Movement tasks
INSERT INTO micro_task_templates (type, category, domain, instruction, duration_seconds, proof_type, requires_privacy, time_windows, max_per_day, min_intensity)
VALUES
  ('movement', 'practice', 'body_language', 'Walk across the room with small, deliberate steps. Hips first.', 30, 'none', true, ARRAY['morning', 'afternoon', 'evening'], 3, 1),
  ('movement', 'practice', 'body_language', 'Pick something up from the floor gracefully. Bend at the knees.', 20, 'none', true, ARRAY['afternoon', 'evening'], 2, 1),
  ('movement', 'practice', 'body_language', 'Gesture while speaking your next sentence. Make it feminine.', 20, 'none', false, ARRAY['morning', 'afternoon', 'evening'], 3, 1)
ON CONFLICT DO NOTHING;

-- ============================================
-- FUNCTION: Schedule daily ambushes
-- Called by cron or daily plan generation
-- ============================================
CREATE OR REPLACE FUNCTION schedule_daily_ambushes(
  p_user_id UUID,
  p_date DATE DEFAULT CURRENT_DATE
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_settings ambush_user_settings%ROWTYPE;
  v_templates micro_task_templates[];
  v_template micro_task_templates%ROWTYPE;
  v_count INTEGER := 0;
  v_target_count INTEGER;
  v_scheduled_times TIME[];
  v_new_time TIME;
  v_window_start TIME;
  v_window_end TIME;
  v_window TEXT;
  v_windows TEXT[];
BEGIN
  -- Get or create user settings
  SELECT * INTO v_settings FROM ambush_user_settings WHERE user_id = p_user_id;

  IF v_settings IS NULL THEN
    INSERT INTO ambush_user_settings (user_id) VALUES (p_user_id)
    RETURNING * INTO v_settings;
  END IF;

  -- Determine target count based on settings (randomize within range)
  v_target_count := v_settings.min_ambushes_per_day +
    floor(random() * (v_settings.max_ambushes_per_day - v_settings.min_ambushes_per_day + 1))::INTEGER;

  -- Get enabled time windows
  SELECT array_agg(key)
  INTO v_windows
  FROM jsonb_each(v_settings.time_windows) tw
  WHERE (tw.value->>'enabled')::boolean = true;

  -- Get active templates for enabled types
  SELECT array_agg(t.*)
  INTO v_templates
  FROM micro_task_templates t
  WHERE t.active = true
    AND t.type = ANY(v_settings.enabled_types)
    AND t.min_intensity <= v_settings.preferred_intensity
    AND t.max_intensity >= v_settings.preferred_intensity;

  IF v_templates IS NULL OR array_length(v_templates, 1) IS NULL THEN
    RETURN 0;
  END IF;

  -- Schedule ambushes
  v_scheduled_times := ARRAY[]::TIME[];

  WHILE v_count < v_target_count AND v_count < 20 LOOP -- Safety limit
    -- Pick a random template
    v_template := v_templates[1 + floor(random() * array_length(v_templates, 1))::INTEGER];

    -- Pick a random enabled window that the template allows
    SELECT w INTO v_window
    FROM unnest(v_windows) w
    WHERE w = ANY(v_template.time_windows)
    ORDER BY random()
    LIMIT 1;

    IF v_window IS NULL THEN
      CONTINUE;
    END IF;

    -- Get window times
    v_window_start := (v_settings.time_windows->v_window->>'start')::TIME;
    v_window_end := (v_settings.time_windows->v_window->>'end')::TIME;

    -- Generate random time in window
    v_new_time := v_window_start +
      (extract(epoch from (v_window_end - v_window_start)) * random() * interval '1 second');

    -- Check minimum gap
    IF EXISTS (
      SELECT 1 FROM unnest(v_scheduled_times) t
      WHERE abs(extract(epoch from (t - v_new_time))) < (v_settings.min_gap_minutes * 60)
    ) THEN
      CONTINUE; -- Too close to existing, try again
    END IF;

    -- Insert the ambush
    INSERT INTO scheduled_ambushes (
      user_id, plan_date, template_id, scheduled_time, priority
    ) VALUES (
      p_user_id, p_date, v_template.id, v_new_time,
      CASE
        WHEN random() < 0.2 THEN 3 -- 20% critical
        WHEN random() < 0.5 THEN 2 -- 50% important
        ELSE 1 -- 30% skippable
      END
    )
    ON CONFLICT DO NOTHING;

    IF FOUND THEN
      v_scheduled_times := array_append(v_scheduled_times, v_new_time);
      v_count := v_count + 1;
    END IF;
  END LOOP;

  RETURN v_count;
END;
$$;

-- ============================================
-- FUNCTION: Get pending ambushes for delivery
-- ============================================
CREATE OR REPLACE FUNCTION get_pending_ambushes(
  p_user_id UUID,
  p_current_time TIMESTAMPTZ DEFAULT NOW()
)
RETURNS SETOF scheduled_ambushes
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT sa.*
  FROM scheduled_ambushes sa
  WHERE sa.user_id = p_user_id
    AND sa.plan_date = (p_current_time AT TIME ZONE 'UTC')::DATE
    AND sa.status IN ('scheduled', 'snoozed')
    AND (
      -- Scheduled and time has passed
      (sa.status = 'scheduled' AND sa.scheduled_time <= (p_current_time AT TIME ZONE 'UTC')::TIME)
      OR
      -- Snoozed and snooze time has passed
      (sa.status = 'snoozed' AND sa.snoozed_until <= p_current_time)
    )
  ORDER BY sa.scheduled_time;
END;
$$;

-- ============================================
-- FUNCTION: Complete an ambush
-- ============================================
CREATE OR REPLACE FUNCTION complete_ambush(
  p_ambush_id UUID,
  p_proof_url TEXT DEFAULT NULL,
  p_felt_good BOOLEAN DEFAULT NULL,
  p_difficulty INTEGER DEFAULT NULL
)
RETURNS scheduled_ambushes
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_ambush scheduled_ambushes%ROWTYPE;
  v_response_time INTEGER;
BEGIN
  SELECT * INTO v_ambush FROM scheduled_ambushes WHERE id = p_ambush_id;

  IF v_ambush IS NULL THEN
    RAISE EXCEPTION 'Ambush not found';
  END IF;

  -- Calculate response time
  IF v_ambush.delivered_at IS NOT NULL THEN
    v_response_time := extract(epoch from (NOW() - v_ambush.delivered_at))::INTEGER;
  END IF;

  -- Update the ambush
  UPDATE scheduled_ambushes
  SET
    status = 'completed',
    completed_at = NOW(),
    response_time_seconds = v_response_time,
    proof_submitted = (p_proof_url IS NOT NULL),
    proof_url = p_proof_url
  WHERE id = p_ambush_id
  RETURNING * INTO v_ambush;

  -- Log completion
  INSERT INTO ambush_completions (
    user_id, ambush_id, template_id,
    response_time_seconds, proof_submitted, proof_url,
    felt_good, difficulty_rating
  ) VALUES (
    v_ambush.user_id, p_ambush_id, v_ambush.template_id,
    v_response_time, (p_proof_url IS NOT NULL), p_proof_url,
    p_felt_good, p_difficulty
  );

  RETURN v_ambush;
END;
$$;

-- ============================================
-- FUNCTION: Snooze an ambush
-- ============================================
CREATE OR REPLACE FUNCTION snooze_ambush(
  p_ambush_id UUID
)
RETURNS scheduled_ambushes
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_ambush scheduled_ambushes%ROWTYPE;
  v_settings ambush_user_settings%ROWTYPE;
BEGIN
  SELECT * INTO v_ambush FROM scheduled_ambushes WHERE id = p_ambush_id;

  IF v_ambush IS NULL THEN
    RAISE EXCEPTION 'Ambush not found';
  END IF;

  SELECT * INTO v_settings FROM ambush_user_settings WHERE user_id = v_ambush.user_id;

  -- Check snooze limit
  IF v_ambush.snooze_count >= COALESCE(v_settings.snooze_limit, 2) THEN
    RAISE EXCEPTION 'Snooze limit reached';
  END IF;

  -- Update the ambush
  UPDATE scheduled_ambushes
  SET
    status = 'snoozed',
    snooze_count = snooze_count + 1,
    snoozed_until = NOW() + (COALESCE(v_settings.snooze_duration_minutes, 15) * interval '1 minute')
  WHERE id = p_ambush_id
  RETURNING * INTO v_ambush;

  RETURN v_ambush;
END;
$$;
