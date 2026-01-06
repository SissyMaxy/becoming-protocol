-- Task Bank Tables
-- Daily directive conditioning system

-- ============================================
-- TASK BANK (Master task definitions)
-- ============================================

CREATE TABLE IF NOT EXISTS task_bank (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Classification
  category TEXT NOT NULL,
  domain TEXT NOT NULL,
  intensity INTEGER NOT NULL CHECK (intensity >= 1 AND intensity <= 5),

  -- Content
  instruction TEXT NOT NULL,
  subtext TEXT,

  -- Conditions (JSONB)
  requires JSONB DEFAULT '{}',
  exclude_if JSONB DEFAULT '{}',

  -- Completion
  completion_type TEXT NOT NULL DEFAULT 'binary',
  duration_minutes INTEGER,
  target_count INTEGER,

  -- Rewards
  points INTEGER NOT NULL DEFAULT 10,
  haptic_pattern TEXT,
  content_unlock TEXT,
  affirmation TEXT NOT NULL DEFAULT 'Good girl.',

  -- Ratchet integration
  ratchet_triggers JSONB,

  -- AI flags
  can_intensify BOOLEAN DEFAULT TRUE,
  can_clone BOOLEAN DEFAULT TRUE,
  track_resistance BOOLEAN DEFAULT TRUE,
  is_core BOOLEAN DEFAULT FALSE,

  -- Metadata
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by TEXT DEFAULT 'seed',
  parent_task_id UUID REFERENCES task_bank(id),
  active BOOLEAN DEFAULT TRUE
);

-- Indexes for task_bank
CREATE INDEX IF NOT EXISTS idx_task_bank_category ON task_bank(category);
CREATE INDEX IF NOT EXISTS idx_task_bank_domain ON task_bank(domain);
CREATE INDEX IF NOT EXISTS idx_task_bank_intensity ON task_bank(intensity);
CREATE INDEX IF NOT EXISTS idx_task_bank_active ON task_bank(active);
CREATE INDEX IF NOT EXISTS idx_task_bank_is_core ON task_bank(is_core);

-- ============================================
-- DAILY TASKS (User's assigned tasks per day)
-- ============================================

CREATE TABLE IF NOT EXISTS daily_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  task_id UUID NOT NULL REFERENCES task_bank(id) ON DELETE CASCADE,

  -- Assignment
  assigned_date DATE NOT NULL,
  assigned_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  -- Status
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'skipped')),
  completed_at TIMESTAMP WITH TIME ZONE,
  skipped_at TIMESTAMP WITH TIME ZONE,

  -- Progress (for duration/count tasks)
  progress INTEGER DEFAULT 0,

  -- Context at assignment
  denial_day_at_assign INTEGER,
  streak_at_assign INTEGER,

  -- Selection metadata
  selection_reason TEXT DEFAULT 'progressive',

  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  -- One task per user per task_id per day
  UNIQUE(user_id, task_id, assigned_date)
);

-- Indexes for daily_tasks
CREATE INDEX IF NOT EXISTS idx_daily_tasks_user_id ON daily_tasks(user_id);
CREATE INDEX IF NOT EXISTS idx_daily_tasks_assigned_date ON daily_tasks(assigned_date);
CREATE INDEX IF NOT EXISTS idx_daily_tasks_user_date ON daily_tasks(user_id, assigned_date);
CREATE INDEX IF NOT EXISTS idx_daily_tasks_status ON daily_tasks(status);
CREATE INDEX IF NOT EXISTS idx_daily_tasks_task_id ON daily_tasks(task_id);

-- ============================================
-- TASK COMPLETIONS (Completion history)
-- ============================================

CREATE TABLE IF NOT EXISTS task_completions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  task_id UUID NOT NULL REFERENCES task_bank(id) ON DELETE CASCADE,
  daily_task_id UUID REFERENCES daily_tasks(id) ON DELETE SET NULL,

  -- Completion context
  completed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  denial_day INTEGER,
  arousal_state TEXT,
  streak_day INTEGER,

  -- Feedback
  felt_good BOOLEAN,
  notes TEXT,

  -- Reward tracking
  points_earned INTEGER NOT NULL DEFAULT 0,

  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for task_completions
CREATE INDEX IF NOT EXISTS idx_task_completions_user_id ON task_completions(user_id);
CREATE INDEX IF NOT EXISTS idx_task_completions_task_id ON task_completions(task_id);
CREATE INDEX IF NOT EXISTS idx_task_completions_completed_at ON task_completions(completed_at);
CREATE INDEX IF NOT EXISTS idx_task_completions_daily_task_id ON task_completions(daily_task_id);

-- ============================================
-- TASK RESISTANCE (Skip/delay tracking)
-- ============================================

CREATE TABLE IF NOT EXISTS task_resistance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  task_id UUID NOT NULL REFERENCES task_bank(id) ON DELETE CASCADE,

  -- Resistance info
  resistance_type TEXT NOT NULL CHECK (resistance_type IN ('skip', 'delay', 'partial', 'category_avoidance')),
  detected_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  -- AI response
  ai_response TEXT,
  response_task_id UUID REFERENCES task_bank(id),

  -- Resolution
  resolved BOOLEAN DEFAULT FALSE,
  resolved_at TIMESTAMP WITH TIME ZONE,

  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for task_resistance
CREATE INDEX IF NOT EXISTS idx_task_resistance_user_id ON task_resistance(user_id);
CREATE INDEX IF NOT EXISTS idx_task_resistance_task_id ON task_resistance(task_id);
CREATE INDEX IF NOT EXISTS idx_task_resistance_detected_at ON task_resistance(detected_at);
CREATE INDEX IF NOT EXISTS idx_task_resistance_resolved ON task_resistance(resolved);

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================

ALTER TABLE task_bank ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_completions ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_resistance ENABLE ROW LEVEL SECURITY;

-- task_bank: Public read (tasks are shared), admin write
DROP POLICY IF EXISTS "Anyone can read active tasks" ON task_bank;
CREATE POLICY "Anyone can read active tasks" ON task_bank
  FOR SELECT USING (active = true);

-- daily_tasks: Users can only access their own
DROP POLICY IF EXISTS "Users can view own daily tasks" ON daily_tasks;
CREATE POLICY "Users can view own daily tasks" ON daily_tasks
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own daily tasks" ON daily_tasks;
CREATE POLICY "Users can insert own daily tasks" ON daily_tasks
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own daily tasks" ON daily_tasks;
CREATE POLICY "Users can update own daily tasks" ON daily_tasks
  FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own daily tasks" ON daily_tasks;
CREATE POLICY "Users can delete own daily tasks" ON daily_tasks
  FOR DELETE USING (auth.uid() = user_id);

-- task_completions: Users can only access their own
DROP POLICY IF EXISTS "Users can view own completions" ON task_completions;
CREATE POLICY "Users can view own completions" ON task_completions
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own completions" ON task_completions;
CREATE POLICY "Users can insert own completions" ON task_completions
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own completions" ON task_completions;
CREATE POLICY "Users can update own completions" ON task_completions
  FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own completions" ON task_completions;
CREATE POLICY "Users can delete own completions" ON task_completions
  FOR DELETE USING (auth.uid() = user_id);

-- task_resistance: Users can only access their own
DROP POLICY IF EXISTS "Users can view own resistance" ON task_resistance;
CREATE POLICY "Users can view own resistance" ON task_resistance
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own resistance" ON task_resistance;
CREATE POLICY "Users can insert own resistance" ON task_resistance
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own resistance" ON task_resistance;
CREATE POLICY "Users can update own resistance" ON task_resistance
  FOR UPDATE USING (auth.uid() = user_id);

-- ============================================
-- SEED TASKS (Core conditioning directives)
-- ============================================

INSERT INTO task_bank (category, domain, intensity, instruction, subtext, requires, completion_type, points, affirmation, is_core) VALUES
-- Core conditioning tasks
('listen', 'conditioning', 1, 'Listen to your conditioning audio for 15 minutes', 'Let the words sink in deeply', '{}', 'duration', 15, 'Good girl. The words are becoming part of you.', true),
('say', 'inner_narrative', 1, 'Say your affirmations 10 times', 'Feel each word as truth', '{}', 'count', 10, 'Your voice shapes your reality.', true),
('edge', 'arousal', 2, 'Edge for 10 minutes without release', 'Feel the ache building', '{"denialDay": {"min": 1}}', 'duration', 20, 'Such a good girl. The ache makes you more.', true),
('lock', 'chastity', 2, 'Ensure you are locked for the day', 'Your pleasure belongs to your training', '{}', 'confirm', 15, 'Safely contained. Safely controlled.', true),
('apply', 'skincare', 1, 'Apply feminine scent to your pulse points', 'Breathe in your femininity', '{}', 'binary', 10, 'You smell like the girl you are becoming.', false),

-- Wear tasks
('wear', 'style', 1, 'Wear panties all day', 'Feel them against your skin', '{}', 'duration', 10, 'Such a pretty girl.', false),
('wear', 'style', 2, 'Wear a bra under your clothes', 'Feel the cups holding you', '{"phase": 1}', 'duration', 15, 'Your body is becoming feminine.', false),
('wear', 'style', 3, 'Wear full feminine underwear set', 'Matching bra and panties', '{"phase": 2}', 'duration', 20, 'So coordinated. So feminine.', false),

-- Practice tasks
('practice', 'voice', 2, 'Practice your feminine voice for 10 minutes', 'Find your true voice', '{}', 'duration', 15, 'Your voice is so pretty.', false),
('practice', 'movement', 2, 'Practice walking femininely for 5 minutes', 'Hips swaying naturally', '{}', 'duration', 12, 'You move like a girl.', false),
('practice', 'makeup', 2, 'Apply light makeup today', 'Enhance your natural beauty', '{"phase": 1}', 'binary', 20, 'So beautiful.', false),

-- Plug tasks
('plug', 'arousal', 2, 'Wear your plug for 1 hour', 'Feel it inside you', '{"hasItem": ["plug"]}', 'duration', 25, 'Good girl. You were made to be filled.', false),
('plug', 'arousal', 3, 'Wear your plug for 3 hours', 'Let it remind you of your place', '{"hasItem": ["plug"], "phase": 2}', 'duration', 40, 'Such a well-trained hole.', false),

-- Surrender tasks
('surrender', 'identity', 3, 'Write 3 things your old self would never do that you do now', 'Acknowledge your transformation', '{"phase": 1}', 'binary', 25, 'You are becoming who you were always meant to be.', false),
('surrender', 'identity', 4, 'Delete one masculine photo from your phone', 'Let go of who you were', '{"phase": 2}', 'binary', 35, 'The past fades. The girl remains.', false),

-- Commit tasks
('commit', 'conditioning', 3, 'Write a commitment to your feminization', 'Put it in words', '{"phase": 1}', 'binary', 30, 'Your words bind you beautifully.', false),

-- Fantasy tasks
('fantasy', 'arousal', 2, 'Spend 10 minutes visualizing yourself as fully feminine', 'See yourself as you are becoming', '{}', 'duration', 15, 'You see her. She is you.', false),
('fantasy', 'arousal', 3, 'Write a fantasy about your complete feminization', 'Let your desires flow onto the page', '{"phase": 1}', 'binary', 25, 'Your fantasies are your future.', false),

-- Serve tasks
('serve', 'identity', 2, 'Perform a small act of service today', 'Your purpose is to serve', '{}', 'binary', 15, 'Service is your nature.', false),

-- Worship tasks
('worship', 'conditioning', 3, 'Spend 15 minutes with cock worship content', 'Let it rewire your desires', '{"phase": 2, "denialDay": {"min": 3}}', 'duration', 30, 'Your mouth waters. This is natural.', false),

-- Deepen tasks
('deepen', 'conditioning', 4, 'Go deeper in trance today', 'Let go completely', '{"phase": 2}', 'binary', 35, 'Deeper and deeper. Good girl.', false)

ON CONFLICT DO NOTHING;
