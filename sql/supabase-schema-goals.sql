-- Goals + Drills Schema
-- Transforms the protocol from task-based to goal-based training

-- ============================================
-- GOALS TABLE
-- What the user is working toward
-- ============================================
CREATE TABLE IF NOT EXISTS goals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,

  -- Goal definition
  name TEXT NOT NULL,
  domain TEXT,  -- voice, movement, skincare, style, social, mindset (nullable for cross-domain)
  description TEXT,

  -- Progress tracking
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'paused', 'graduated', 'abandoned')),
  started_at TIMESTAMPTZ DEFAULT NOW(),
  graduated_at TIMESTAMPTZ,
  paused_at TIMESTAMPTZ,
  abandoned_at TIMESTAMPTZ,
  abandon_reason TEXT,

  -- Consistency tracking (for auto-graduation)
  consecutive_days INTEGER DEFAULT 0,
  total_completions INTEGER DEFAULT 0,
  graduation_threshold INTEGER DEFAULT 30,  -- days until behavior is "automatic"
  longest_streak INTEGER DEFAULT 0,

  -- Ratchet binding
  covenant_id UUID,  -- optional covenant bound to this goal
  has_affirmation BOOLEAN DEFAULT FALSE,

  -- Metadata
  sort_order INTEGER DEFAULT 0,
  is_system_assigned BOOLEAN DEFAULT TRUE,  -- vs user-created
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- DRILLS TABLE
-- Options for completing a goal (pick any one)
-- ============================================
CREATE TABLE IF NOT EXISTS drills (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  goal_id UUID REFERENCES goals ON DELETE CASCADE NOT NULL,

  -- Drill definition
  name TEXT NOT NULL,
  instruction TEXT NOT NULL,
  estimated_minutes INTEGER,
  difficulty INTEGER DEFAULT 1 CHECK (difficulty BETWEEN 1 AND 5),

  -- Category for variety
  category TEXT,  -- e.g., 'posture', 'gait', 'pitch', 'resonance'

  -- Reward
  points INTEGER DEFAULT 10,
  affirmation TEXT,

  -- Ordering and state
  sort_order INTEGER DEFAULT 0,
  active BOOLEAN DEFAULT TRUE,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- DAILY GOAL COMPLETIONS TABLE
-- Tracks which drill was used for each goal each day
-- ============================================
CREATE TABLE IF NOT EXISTS daily_goal_completions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  goal_id UUID REFERENCES goals ON DELETE CASCADE NOT NULL,
  drill_id UUID REFERENCES drills ON DELETE SET NULL,  -- which drill was used

  completed_date DATE NOT NULL,
  completed_at TIMESTAMPTZ DEFAULT NOW(),

  -- Context
  notes TEXT,
  felt_good BOOLEAN,

  -- Unique constraint: one completion per goal per day per user
  UNIQUE(user_id, goal_id, completed_date)
);

-- ============================================
-- GOAL TEMPLATES TABLE
-- Pre-defined goals that can be assigned to users
-- ============================================
CREATE TABLE IF NOT EXISTS goal_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Template definition
  name TEXT NOT NULL,
  domain TEXT,
  description TEXT,
  graduation_threshold INTEGER DEFAULT 30,

  -- For recommendation engine
  priority INTEGER DEFAULT 0,  -- higher = more important
  difficulty INTEGER DEFAULT 1 CHECK (difficulty BETWEEN 1 AND 5),

  -- Metadata
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- DRILL TEMPLATES TABLE
-- Pre-defined drills for goal templates
-- ============================================
CREATE TABLE IF NOT EXISTS drill_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  goal_template_id UUID REFERENCES goal_templates ON DELETE CASCADE NOT NULL,

  name TEXT NOT NULL,
  instruction TEXT NOT NULL,
  estimated_minutes INTEGER,
  difficulty INTEGER DEFAULT 1 CHECK (difficulty BETWEEN 1 AND 5),
  category TEXT,
  points INTEGER DEFAULT 10,
  affirmation TEXT,
  sort_order INTEGER DEFAULT 0,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- INDEXES
-- ============================================
CREATE INDEX IF NOT EXISTS idx_goals_user_id ON goals(user_id);
CREATE INDEX IF NOT EXISTS idx_goals_status ON goals(status);
CREATE INDEX IF NOT EXISTS idx_goals_user_status ON goals(user_id, status);
CREATE INDEX IF NOT EXISTS idx_drills_goal_id ON drills(goal_id);
CREATE INDEX IF NOT EXISTS idx_daily_goal_completions_user_date ON daily_goal_completions(user_id, completed_date);
CREATE INDEX IF NOT EXISTS idx_daily_goal_completions_goal ON daily_goal_completions(goal_id, completed_date);

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================
ALTER TABLE goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE drills ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_goal_completions ENABLE ROW LEVEL SECURITY;

-- Goals: Users can only access their own goals
CREATE POLICY "Users can view own goals" ON goals
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own goals" ON goals
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own goals" ON goals
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own goals" ON goals
  FOR DELETE USING (auth.uid() = user_id);

-- Drills: Users can access drills for their own goals
CREATE POLICY "Users can view drills for own goals" ON drills
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM goals WHERE goals.id = drills.goal_id AND goals.user_id = auth.uid())
  );

CREATE POLICY "Users can insert drills for own goals" ON drills
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM goals WHERE goals.id = drills.goal_id AND goals.user_id = auth.uid())
  );

CREATE POLICY "Users can update drills for own goals" ON drills
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM goals WHERE goals.id = drills.goal_id AND goals.user_id = auth.uid())
  );

CREATE POLICY "Users can delete drills for own goals" ON drills
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM goals WHERE goals.id = drills.goal_id AND goals.user_id = auth.uid())
  );

-- Daily completions: Users can only access their own completions
CREATE POLICY "Users can view own completions" ON daily_goal_completions
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own completions" ON daily_goal_completions
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own completions" ON daily_goal_completions
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own completions" ON daily_goal_completions
  FOR DELETE USING (auth.uid() = user_id);

-- Templates: Read-only for all authenticated users
CREATE POLICY "Authenticated users can view goal templates" ON goal_templates
  FOR SELECT TO authenticated USING (active = TRUE);

CREATE POLICY "Authenticated users can view drill templates" ON drill_templates
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM goal_templates WHERE goal_templates.id = drill_templates.goal_template_id AND goal_templates.active = TRUE)
  );

-- ============================================
-- FUNCTIONS
-- ============================================

-- Function to complete a goal with a drill
CREATE OR REPLACE FUNCTION complete_goal(
  p_goal_id UUID,
  p_drill_id UUID,
  p_notes TEXT DEFAULT NULL,
  p_felt_good BOOLEAN DEFAULT NULL
) RETURNS daily_goal_completions AS $$
DECLARE
  v_user_id UUID;
  v_today DATE;
  v_completion daily_goal_completions;
  v_consecutive INTEGER;
BEGIN
  v_user_id := auth.uid();
  v_today := CURRENT_DATE;

  -- Insert completion (will fail on duplicate due to unique constraint)
  INSERT INTO daily_goal_completions (user_id, goal_id, drill_id, completed_date, notes, felt_good)
  VALUES (v_user_id, p_goal_id, p_drill_id, v_today, p_notes, p_felt_good)
  RETURNING * INTO v_completion;

  -- Update goal statistics
  UPDATE goals
  SET
    total_completions = total_completions + 1,
    consecutive_days = consecutive_days + 1,
    longest_streak = GREATEST(longest_streak, consecutive_days + 1),
    updated_at = NOW()
  WHERE id = p_goal_id AND user_id = v_user_id;

  RETURN v_completion;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to check and reset streaks for missed days
CREATE OR REPLACE FUNCTION check_goal_streaks(p_user_id UUID) RETURNS void AS $$
DECLARE
  v_goal RECORD;
  v_yesterday DATE;
  v_has_completion BOOLEAN;
BEGIN
  v_yesterday := CURRENT_DATE - INTERVAL '1 day';

  -- Check each active goal
  FOR v_goal IN
    SELECT id, consecutive_days
    FROM goals
    WHERE user_id = p_user_id AND status = 'active'
  LOOP
    -- Check if goal was completed yesterday
    SELECT EXISTS(
      SELECT 1 FROM daily_goal_completions
      WHERE goal_id = v_goal.id
      AND completed_date = v_yesterday
    ) INTO v_has_completion;

    -- If not completed yesterday and has a streak, reset it
    IF NOT v_has_completion AND v_goal.consecutive_days > 0 THEN
      UPDATE goals
      SET consecutive_days = 0, updated_at = NOW()
      WHERE id = v_goal.id;
    END IF;
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to check for graduation
CREATE OR REPLACE FUNCTION check_goal_graduation(p_goal_id UUID) RETURNS BOOLEAN AS $$
DECLARE
  v_goal goals;
BEGIN
  SELECT * INTO v_goal FROM goals WHERE id = p_goal_id;

  IF v_goal.consecutive_days >= v_goal.graduation_threshold THEN
    UPDATE goals
    SET status = 'graduated', graduated_at = NOW(), updated_at = NOW()
    WHERE id = p_goal_id;
    RETURN TRUE;
  END IF;

  RETURN FALSE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to create a goal from template
CREATE OR REPLACE FUNCTION create_goal_from_template(
  p_template_id UUID,
  p_user_id UUID DEFAULT auth.uid()
) RETURNS goals AS $$
DECLARE
  v_template goal_templates;
  v_goal goals;
  v_drill_template drill_templates;
BEGIN
  -- Get the template
  SELECT * INTO v_template FROM goal_templates WHERE id = p_template_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Goal template not found';
  END IF;

  -- Create the goal
  INSERT INTO goals (user_id, name, domain, description, graduation_threshold, is_system_assigned)
  VALUES (p_user_id, v_template.name, v_template.domain, v_template.description, v_template.graduation_threshold, TRUE)
  RETURNING * INTO v_goal;

  -- Copy drill templates to actual drills
  FOR v_drill_template IN
    SELECT * FROM drill_templates WHERE goal_template_id = p_template_id ORDER BY sort_order
  LOOP
    INSERT INTO drills (goal_id, name, instruction, estimated_minutes, difficulty, category, points, affirmation, sort_order)
    VALUES (v_goal.id, v_drill_template.name, v_drill_template.instruction, v_drill_template.estimated_minutes,
            v_drill_template.difficulty, v_drill_template.category, v_drill_template.points,
            v_drill_template.affirmation, v_drill_template.sort_order);
  END LOOP;

  RETURN v_goal;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to abandon a goal (with gauntlet data)
CREATE OR REPLACE FUNCTION abandon_goal(
  p_goal_id UUID,
  p_reason TEXT
) RETURNS goals AS $$
DECLARE
  v_goal goals;
BEGIN
  UPDATE goals
  SET
    status = 'abandoned',
    abandoned_at = NOW(),
    abandon_reason = p_reason,
    updated_at = NOW()
  WHERE id = p_goal_id AND user_id = auth.uid()
  RETURNING * INTO v_goal;

  RETURN v_goal;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get active goals with today's completion status
CREATE OR REPLACE FUNCTION get_todays_goals(p_user_id UUID DEFAULT auth.uid())
RETURNS TABLE (
  goal_id UUID,
  goal_name TEXT,
  goal_domain TEXT,
  goal_description TEXT,
  consecutive_days INTEGER,
  graduation_threshold INTEGER,
  graduation_progress NUMERIC,
  completed_today BOOLEAN,
  drill_used_id UUID,
  drill_used_name TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    g.id as goal_id,
    g.name as goal_name,
    g.domain as goal_domain,
    g.description as goal_description,
    g.consecutive_days,
    g.graduation_threshold,
    ROUND((g.consecutive_days::NUMERIC / g.graduation_threshold::NUMERIC) * 100, 1) as graduation_progress,
    (dgc.id IS NOT NULL) as completed_today,
    dgc.drill_id as drill_used_id,
    d.name as drill_used_name
  FROM goals g
  LEFT JOIN daily_goal_completions dgc
    ON g.id = dgc.goal_id
    AND dgc.completed_date = CURRENT_DATE
    AND dgc.user_id = p_user_id
  LEFT JOIN drills d ON dgc.drill_id = d.id
  WHERE g.user_id = p_user_id
    AND g.status = 'active'
  ORDER BY g.sort_order, g.created_at;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- SEED DATA: Default Goal Templates
-- ============================================

-- Insert default goal templates
INSERT INTO goal_templates (name, domain, description, graduation_threshold, priority, difficulty) VALUES
  ('Embody Feminine Presence', 'movement', 'Practice feminine body language until it becomes automatic', 30, 10, 2),
  ('Cultivate Feminine Voice', 'voice', 'Develop natural feminine speech patterns', 60, 9, 3),
  ('Establish Skincare Ritual', 'skincare', 'Build consistent skincare habit', 21, 8, 1),
  ('Embrace Feminine Style', 'style', 'Develop personal feminine aesthetic', 30, 7, 2),
  ('Build Social Confidence', 'social', 'Practice feminine social presence', 45, 6, 3),
  ('Cultivate Feminine Mindset', 'mindset', 'Develop feminine thought patterns and self-perception', 30, 5, 2)
ON CONFLICT DO NOTHING;

-- Insert drill templates for "Embody Feminine Presence"
INSERT INTO drill_templates (goal_template_id, name, instruction, estimated_minutes, difficulty, category, points, affirmation, sort_order)
SELECT goal_templates.id, t.drill_name, t.instruction, t.minutes, t.diff, t.cat, t.pts, t.aff, t.ord
FROM goal_templates, (VALUES
  ('Posture check-ins', 'Set 3 alarms throughout the day. When they go off, check and correct your posture: shoulders back, chin level, core engaged. Hold for 30 seconds.', 1, 1, 'posture', 10, 'My body naturally adopts feminine grace.', 1),
  ('Feminine sitting practice', 'During meals, practice sitting femininely: knees together or crossed, hands in lap between bites, small graceful movements.', 5, 1, 'posture', 10, 'I sit with effortless feminine elegance.', 2),
  ('Walk practice', 'Walk to your mailbox or around the block focusing on feminine gait: smaller steps, hips leading, arms close to body with soft gestures.', 5, 2, 'gait', 15, 'Each step expresses my feminine nature.', 3),
  ('Hand gestures practice', 'For 5 minutes, practice speaking while using feminine hand gestures: soft wrist movements, fingers together, gestures closer to body.', 5, 2, 'gestures', 10, 'My hands dance with feminine expression.', 4)
) AS t(drill_name, instruction, minutes, diff, cat, pts, aff, ord)
WHERE goal_templates.name = 'Embody Feminine Presence';

-- Insert drill templates for "Cultivate Feminine Voice"
INSERT INTO drill_templates (goal_template_id, name, instruction, estimated_minutes, difficulty, category, points, affirmation, sort_order)
SELECT goal_templates.id, t.drill_name, t.instruction, t.minutes, t.diff, t.cat, t.pts, t.aff, t.ord
FROM goal_templates, (VALUES
  ('Pitch practice', 'Spend 5 minutes practicing pitch elevation. Start at your natural pitch and gradually raise it while humming, then speak simple phrases at the higher pitch.', 5, 2, 'pitch', 15, 'My voice resonates with feminine energy.', 1),
  ('Resonance work', 'Practice head resonance for 5 minutes: hum at a comfortable pitch, focus on feeling vibration in your face/head rather than chest. Try moving the vibration higher.', 5, 3, 'resonance', 15, 'My voice flows from a place of feminine power.', 2),
  ('Record and listen', 'Record yourself speaking for 1-2 minutes about your day. Listen back and note one thing you like and one thing to improve.', 3, 1, 'feedback', 10, 'I grow more comfortable with my feminine voice each day.', 3),
  ('Feminine phrases', 'Practice 10 common phrases with feminine intonation: rising endings for questions, melodic variation, softer consonants. Repeat each 3 times.', 5, 2, 'intonation', 10, 'My speech patterns are naturally feminine.', 4)
) AS t(drill_name, instruction, minutes, diff, cat, pts, aff, ord)
WHERE goal_templates.name = 'Cultivate Feminine Voice';

-- Insert drill templates for "Establish Skincare Ritual"
INSERT INTO drill_templates (goal_template_id, name, instruction, estimated_minutes, difficulty, category, points, affirmation, sort_order)
SELECT goal_templates.id, t.drill_name, t.instruction, t.minutes, t.diff, t.cat, t.pts, t.aff, t.ord
FROM goal_templates, (VALUES
  ('Morning routine', 'Complete your morning skincare: cleanse, tone (optional), moisturize, SPF. Take your time and make it a mindful ritual.', 10, 1, 'routine', 10, 'I nurture my skin with loving care.', 1),
  ('Evening routine', 'Complete your evening skincare: remove makeup if worn, double cleanse, treatment serums (optional), moisturize. Let this be your wind-down ritual.', 10, 1, 'routine', 10, 'I end each day caring for myself.', 2),
  ('Facial massage', 'While applying moisturizer, spend 5 minutes doing gentle facial massage: upward strokes, lymphatic drainage, jaw tension release.', 5, 1, 'treatment', 10, 'I honor my face with gentle attention.', 3),
  ('Mask treatment', 'Apply a face mask (sheet mask, clay mask, or overnight mask) and relax for the recommended time. Use this as self-care meditation.', 15, 1, 'treatment', 15, 'I deserve this time for myself.', 4)
) AS t(drill_name, instruction, minutes, diff, cat, pts, aff, ord)
WHERE goal_templates.name = 'Establish Skincare Ritual';

-- Insert drill templates for "Embrace Feminine Style"
INSERT INTO drill_templates (goal_template_id, name, instruction, estimated_minutes, difficulty, category, points, affirmation, sort_order)
SELECT goal_templates.id, t.drill_name, t.instruction, t.minutes, t.diff, t.cat, t.pts, t.aff, t.ord
FROM goal_templates, (VALUES
  ('Outfit planning', 'Plan tomorrow''s outfit with intention. Consider how it makes you feel, what it expresses about you. Lay it out or photograph it.', 5, 1, 'wardrobe', 10, 'I dress to express my authentic self.', 1),
  ('Accessory focus', 'Wear one feminine accessory today with intention: jewelry, scarf, hair accessory, or bag. Notice how it affects your mood and movements.', 1, 1, 'accessories', 10, 'Small touches of femininity brighten my day.', 2),
  ('Mirror affirmation', 'Stand before a mirror in an outfit you like. Find three things you appreciate about how you look. Speak them aloud.', 3, 2, 'confidence', 15, 'I see beauty when I look at myself.', 3),
  ('Style inspiration', 'Spend 10 minutes saving style inspiration (Pinterest, Instagram, magazines). Notice patterns in what attracts you.', 10, 1, 'exploration', 10, 'I am discovering my personal style.', 4)
) AS t(drill_name, instruction, minutes, diff, cat, pts, aff, ord)
WHERE goal_templates.name = 'Embrace Feminine Style';

-- Insert drill templates for "Build Social Confidence"
INSERT INTO drill_templates (goal_template_id, name, instruction, estimated_minutes, difficulty, category, points, affirmation, sort_order)
SELECT goal_templates.id, t.drill_name, t.instruction, t.minutes, t.diff, t.cat, t.pts, t.aff, t.ord
FROM goal_templates, (VALUES
  ('Friendly greeting', 'Greet at least one stranger or acquaintance warmly today: smile, make eye contact, say hello or comment on their day. Small interactions build confidence.', 1, 2, 'interaction', 15, 'I connect warmly with others.', 1),
  ('Compliment practice', 'Give one genuine compliment to someone today. It can be about anything you notice and appreciate. Notice their reaction and your feelings.', 1, 2, 'interaction', 15, 'Spreading kindness comes naturally to me.', 2),
  ('Name practice', 'When meeting or interacting with someone, use their name at least once. If you don''t know it, ask. Names create connection.', 1, 2, 'conversation', 10, 'I make others feel seen and valued.', 3),
  ('Social visualization', 'Spend 5 minutes visualizing yourself in a social situation as your authentic self: confident, at ease, enjoying connection. Feel it in your body.', 5, 1, 'mindset', 10, 'I belong in any space I choose to enter.', 4)
) AS t(drill_name, instruction, minutes, diff, cat, pts, aff, ord)
WHERE goal_templates.name = 'Build Social Confidence';

-- Insert drill templates for "Cultivate Feminine Mindset"
INSERT INTO drill_templates (goal_template_id, name, instruction, estimated_minutes, difficulty, category, points, affirmation, sort_order)
SELECT goal_templates.id, t.drill_name, t.instruction, t.minutes, t.diff, t.cat, t.pts, t.aff, t.ord
FROM goal_templates, (VALUES
  ('Morning affirmations', 'Start your day with 5 feminine affirmations. Speak them aloud while looking in the mirror. Feel their truth in your body.', 3, 1, 'affirmation', 10, 'I begin each day affirming who I am.', 1),
  ('Gratitude for feminine moments', 'Write or speak 3 moments from today where you felt feminine or happy in your identity. What made them special?', 5, 1, 'journaling', 10, 'I notice and celebrate my feminine moments.', 2),
  ('Inner dialogue check', 'Notice your self-talk today. When you catch negative thoughts about your femininity, gently redirect them. You are becoming.', 1, 2, 'awareness', 15, 'I speak kindly to myself about my journey.', 3),
  ('Future self visualization', 'Spend 5 minutes visualizing yourself 1 year from now, fully expressing your feminine self. What does she look like? How does she feel? What advice does she give you?', 5, 1, 'visualization', 15, 'My future self is becoming reality each day.', 4)
) AS t(drill_name, instruction, minutes, diff, cat, pts, aff, ord)
WHERE goal_templates.name = 'Cultivate Feminine Mindset';

-- ============================================
-- TRIGGERS
-- ============================================

-- Update updated_at timestamp
CREATE OR REPLACE FUNCTION update_goals_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER goals_updated_at
  BEFORE UPDATE ON goals
  FOR EACH ROW
  EXECUTE FUNCTION update_goals_updated_at();
