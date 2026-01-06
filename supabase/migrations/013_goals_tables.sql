-- Goals System Tables
-- Goal-based training with drills and daily completions

-- ============================================
-- GOAL TEMPLATES (System-defined goal types)
-- ============================================

CREATE TABLE IF NOT EXISTS goal_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  domain TEXT, -- voice, movement, skincare, style, social, mindset
  description TEXT,
  graduation_threshold INTEGER NOT NULL DEFAULT 21, -- Days to graduate
  priority INTEGER DEFAULT 0,
  difficulty INTEGER NOT NULL DEFAULT 1 CHECK (difficulty >= 1 AND difficulty <= 5),
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_goal_templates_domain ON goal_templates(domain);
CREATE INDEX IF NOT EXISTS idx_goal_templates_active ON goal_templates(active);
CREATE INDEX IF NOT EXISTS idx_goal_templates_priority ON goal_templates(priority);

-- ============================================
-- DRILL TEMPLATES (System-defined drills for goal templates)
-- ============================================

CREATE TABLE IF NOT EXISTS drill_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  goal_template_id UUID NOT NULL REFERENCES goal_templates(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  instruction TEXT NOT NULL,
  estimated_minutes INTEGER,
  difficulty INTEGER NOT NULL DEFAULT 1 CHECK (difficulty >= 1 AND difficulty <= 5),
  category TEXT,
  points INTEGER NOT NULL DEFAULT 10,
  affirmation TEXT,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_drill_templates_goal_template ON drill_templates(goal_template_id);
CREATE INDEX IF NOT EXISTS idx_drill_templates_difficulty ON drill_templates(difficulty);

-- ============================================
-- GOALS (User's active goals)
-- ============================================

CREATE TABLE IF NOT EXISTS goals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  domain TEXT, -- voice, movement, skincare, style, social, mindset
  description TEXT,

  -- Status tracking
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'graduated', 'abandoned')),
  started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  graduated_at TIMESTAMP WITH TIME ZONE,
  paused_at TIMESTAMP WITH TIME ZONE,
  abandoned_at TIMESTAMP WITH TIME ZONE,
  abandon_reason TEXT,

  -- Progress tracking
  consecutive_days INTEGER DEFAULT 0,
  total_completions INTEGER DEFAULT 0,
  graduation_threshold INTEGER NOT NULL DEFAULT 21,
  longest_streak INTEGER DEFAULT 0,

  -- Links
  covenant_id UUID, -- Link to a commitment
  template_id UUID REFERENCES goal_templates(id),

  -- Flags
  has_affirmation BOOLEAN DEFAULT FALSE,
  is_system_assigned BOOLEAN DEFAULT FALSE,

  -- Ordering
  sort_order INTEGER DEFAULT 0,

  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_goals_user_id ON goals(user_id);
CREATE INDEX IF NOT EXISTS idx_goals_status ON goals(status);
CREATE INDEX IF NOT EXISTS idx_goals_domain ON goals(domain);
CREATE INDEX IF NOT EXISTS idx_goals_user_status ON goals(user_id, status);

-- ============================================
-- DRILLS (Exercises within a goal)
-- ============================================

CREATE TABLE IF NOT EXISTS drills (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  goal_id UUID NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  instruction TEXT NOT NULL,
  estimated_minutes INTEGER,
  difficulty INTEGER NOT NULL DEFAULT 1 CHECK (difficulty >= 1 AND difficulty <= 5),
  category TEXT,
  points INTEGER NOT NULL DEFAULT 10,
  affirmation TEXT,
  sort_order INTEGER DEFAULT 0,
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_drills_goal_id ON drills(goal_id);
CREATE INDEX IF NOT EXISTS idx_drills_active ON drills(active);

-- ============================================
-- DAILY GOAL COMPLETIONS (Completion records)
-- ============================================

CREATE TABLE IF NOT EXISTS daily_goal_completions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  goal_id UUID NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
  drill_id UUID REFERENCES drills(id) ON DELETE SET NULL,

  -- Completion info
  completed_date DATE NOT NULL,
  completed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  -- Feedback
  notes TEXT,
  felt_good BOOLEAN,

  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  -- One completion per goal per day
  UNIQUE(user_id, goal_id, completed_date)
);

CREATE INDEX IF NOT EXISTS idx_daily_goal_completions_user_id ON daily_goal_completions(user_id);
CREATE INDEX IF NOT EXISTS idx_daily_goal_completions_goal_id ON daily_goal_completions(goal_id);
CREATE INDEX IF NOT EXISTS idx_daily_goal_completions_date ON daily_goal_completions(completed_date);
CREATE INDEX IF NOT EXISTS idx_daily_goal_completions_user_date ON daily_goal_completions(user_id, completed_date);

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================

ALTER TABLE goal_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE drill_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE drills ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_goal_completions ENABLE ROW LEVEL SECURITY;

-- Templates: Public read
DROP POLICY IF EXISTS "Anyone can read goal templates" ON goal_templates;
CREATE POLICY "Anyone can read goal templates" ON goal_templates
  FOR SELECT USING (active = true);

DROP POLICY IF EXISTS "Anyone can read drill templates" ON drill_templates;
CREATE POLICY "Anyone can read drill templates" ON drill_templates
  FOR SELECT USING (true);

-- Goals: Users can only access their own
DROP POLICY IF EXISTS "Users can view own goals" ON goals;
CREATE POLICY "Users can view own goals" ON goals
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own goals" ON goals;
CREATE POLICY "Users can insert own goals" ON goals
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own goals" ON goals;
CREATE POLICY "Users can update own goals" ON goals
  FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own goals" ON goals;
CREATE POLICY "Users can delete own goals" ON goals
  FOR DELETE USING (auth.uid() = user_id);

-- Drills: Access through goal ownership
DROP POLICY IF EXISTS "Users can view drills for own goals" ON drills;
CREATE POLICY "Users can view drills for own goals" ON drills
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM goals WHERE goals.id = drills.goal_id AND goals.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "Users can insert drills for own goals" ON drills;
CREATE POLICY "Users can insert drills for own goals" ON drills
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM goals WHERE goals.id = drills.goal_id AND goals.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "Users can update drills for own goals" ON drills;
CREATE POLICY "Users can update drills for own goals" ON drills
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM goals WHERE goals.id = drills.goal_id AND goals.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "Users can delete drills for own goals" ON drills;
CREATE POLICY "Users can delete drills for own goals" ON drills
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM goals WHERE goals.id = drills.goal_id AND goals.user_id = auth.uid())
  );

-- Daily completions: Users can only access their own
DROP POLICY IF EXISTS "Users can view own completions" ON daily_goal_completions;
CREATE POLICY "Users can view own completions" ON daily_goal_completions
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own completions" ON daily_goal_completions;
CREATE POLICY "Users can insert own completions" ON daily_goal_completions
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own completions" ON daily_goal_completions;
CREATE POLICY "Users can update own completions" ON daily_goal_completions
  FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own completions" ON daily_goal_completions;
CREATE POLICY "Users can delete own completions" ON daily_goal_completions
  FOR DELETE USING (auth.uid() = user_id);

-- ============================================
-- SEED GOAL TEMPLATES
-- ============================================

INSERT INTO goal_templates (name, domain, description, graduation_threshold, priority, difficulty) VALUES
-- Voice training
('Voice Feminization Practice', 'voice', 'Daily practice to develop a more feminine voice', 30, 10, 2),
('Affirmation Speaking', 'voice', 'Speak your affirmations aloud daily', 21, 8, 1),

-- Movement training
('Feminine Movement', 'movement', 'Practice feminine posture and movement', 21, 9, 2),
('Walking Practice', 'movement', 'Walk femininely for at least 5 minutes', 14, 7, 1),

-- Skincare
('Skincare Routine', 'skincare', 'Complete your skincare routine morning and night', 21, 10, 1),
('Body Care', 'skincare', 'Full body moisturizing and care', 14, 6, 1),

-- Style
('Daily Feminine Wear', 'style', 'Wear something feminine every day', 30, 9, 2),
('Makeup Practice', 'style', 'Practice makeup application', 21, 5, 3),

-- Social
('Feminine Name Use', 'social', 'Use your feminine name in your internal dialogue', 14, 8, 1),
('Pronoun Practice', 'social', 'Think of yourself with feminine pronouns', 21, 9, 2),

-- Mindset
('Morning Affirmations', 'mindset', 'Start each day with feminine affirmations', 21, 10, 1),
('Evening Reflection', 'mindset', 'Reflect on your feminine journey each evening', 14, 7, 1),
('Identity Journaling', 'mindset', 'Write about your feminine self daily', 21, 6, 2)

ON CONFLICT DO NOTHING;

-- Seed drill templates for Voice Feminization
INSERT INTO drill_templates (goal_template_id, name, instruction, estimated_minutes, difficulty, points, affirmation, sort_order)
SELECT
  gt.id,
  d.name,
  d.instruction,
  d.estimated_minutes,
  d.difficulty,
  d.points,
  d.affirmation,
  d.sort_order
FROM goal_templates gt
CROSS JOIN (VALUES
  ('Pitch Practice', 'Practice speaking at a higher pitch for 5 minutes', 5, 2, 15, 'Your voice is becoming so feminine.', 1),
  ('Resonance Work', 'Focus on chest vs head resonance exercises', 10, 3, 20, 'Feel the vibration shift upward.', 2),
  ('Phrase Repetition', 'Repeat feminine phrases and sentences', 5, 1, 10, 'Each word sounds more like you.', 3)
) AS d(name, instruction, estimated_minutes, difficulty, points, affirmation, sort_order)
WHERE gt.name = 'Voice Feminization Practice'
ON CONFLICT DO NOTHING;

-- Seed drill templates for Morning Affirmations
INSERT INTO drill_templates (goal_template_id, name, instruction, estimated_minutes, difficulty, points, affirmation, sort_order)
SELECT
  gt.id,
  d.name,
  d.instruction,
  d.estimated_minutes,
  d.difficulty,
  d.points,
  d.affirmation,
  d.sort_order
FROM goal_templates gt
CROSS JOIN (VALUES
  ('Mirror Affirmations', 'Say your affirmations while looking in the mirror', 3, 1, 10, 'See the girl looking back at you.', 1),
  ('Written Affirmations', 'Write your affirmations 10 times', 5, 1, 12, 'Your words shape your reality.', 2),
  ('Recorded Affirmations', 'Listen to recorded affirmations', 5, 1, 10, 'Let the words sink in.', 3)
) AS d(name, instruction, estimated_minutes, difficulty, points, affirmation, sort_order)
WHERE gt.name = 'Morning Affirmations'
ON CONFLICT DO NOTHING;
