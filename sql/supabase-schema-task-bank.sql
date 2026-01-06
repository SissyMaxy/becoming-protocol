-- Becoming Protocol: Task Bank Schema
-- Directive conditioning system - the system decides, she obeys

-- ============================================
-- TABLE: task_bank (Master task library)
-- ============================================

CREATE TABLE IF NOT EXISTS task_bank (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Classification
  category VARCHAR(30) NOT NULL,
  domain VARCHAR(30) NOT NULL,
  intensity INT NOT NULL CHECK (intensity BETWEEN 1 AND 5),

  -- Content
  instruction TEXT NOT NULL,
  subtext TEXT,

  -- Requirements (JSONB for flexibility)
  requires JSONB DEFAULT '{}',
  exclude_if JSONB DEFAULT '{}',

  -- Completion
  completion_type VARCHAR(20) NOT NULL DEFAULT 'binary',
  duration_minutes INT,
  target_count INT,

  -- Rewards
  points INT NOT NULL DEFAULT 10,
  haptic_pattern VARCHAR(50),
  content_unlock VARCHAR(100),
  affirmation TEXT NOT NULL,

  -- Ratchet integration
  ratchet_triggers JSONB,

  -- AI flags
  can_intensify BOOLEAN DEFAULT true,
  can_clone BOOLEAN DEFAULT true,
  track_resistance BOOLEAN DEFAULT true,
  is_core BOOLEAN DEFAULT false,

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by VARCHAR(20) DEFAULT 'seed',
  parent_task_id UUID REFERENCES task_bank(id),
  active BOOLEAN DEFAULT true
);

-- ============================================
-- TABLE: daily_tasks (Assigned tasks per day)
-- ============================================

CREATE TABLE IF NOT EXISTS daily_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  task_id UUID NOT NULL REFERENCES task_bank(id),

  assigned_date DATE NOT NULL,
  assigned_at TIMESTAMPTZ DEFAULT NOW(),

  -- Status
  status VARCHAR(20) DEFAULT 'pending',
  completed_at TIMESTAMPTZ,
  skipped_at TIMESTAMPTZ,

  -- For count/duration tasks
  progress INT DEFAULT 0,

  -- Context at assignment
  denial_day_at_assign INT,
  streak_at_assign INT,

  -- Selection reason
  selection_reason VARCHAR(50),

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- TABLE: task_completions (Evidence log)
-- ============================================

CREATE TABLE IF NOT EXISTS task_completions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  task_id UUID NOT NULL REFERENCES task_bank(id),
  daily_task_id UUID REFERENCES daily_tasks(id),

  completed_at TIMESTAMPTZ DEFAULT NOW(),

  -- Context at completion
  denial_day INT,
  arousal_state VARCHAR(30),
  streak_day INT,

  -- Feedback
  felt_good BOOLEAN,
  notes TEXT,

  -- Points awarded
  points_earned INT NOT NULL DEFAULT 0,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- TABLE: task_resistance (Tracking avoidance)
-- ============================================

CREATE TABLE IF NOT EXISTS task_resistance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  task_id UUID NOT NULL REFERENCES task_bank(id),

  resistance_type VARCHAR(30) NOT NULL,
  detected_at TIMESTAMPTZ DEFAULT NOW(),

  -- AI response
  ai_response VARCHAR(100),
  response_task_id UUID REFERENCES task_bank(id),

  resolved BOOLEAN DEFAULT false,
  resolved_at TIMESTAMPTZ
);

-- ============================================
-- TABLE: task_evolution (AI learning log)
-- ============================================

CREATE TABLE IF NOT EXISTS task_evolution (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  action VARCHAR(30) NOT NULL,
  source_task_id UUID REFERENCES task_bank(id),
  result_task_id UUID REFERENCES task_bank(id),

  trigger_reason TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- TABLE: guy_mode_tracking
-- ============================================

CREATE TABLE IF NOT EXISTS guy_mode_tracking (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Event data
  event_type VARCHAR(50) NOT NULL,
  duration_minutes INT,
  logged_at TIMESTAMPTZ DEFAULT NOW(),

  -- Context
  notes TEXT,
  triggered_penalty BOOLEAN DEFAULT false,
  penalty_applied VARCHAR(100),

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- TABLE: automatic_escalations
-- ============================================

CREATE TABLE IF NOT EXISTS automatic_escalations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Definition
  day_trigger INT NOT NULL,
  escalation_type VARCHAR(50) NOT NULL,
  description TEXT NOT NULL,

  -- Control
  can_delay BOOLEAN DEFAULT false,
  delay_cost JSONB,
  warning_days_before INT DEFAULT 7,

  -- Status per user (tracked separately)
  active BOOLEAN DEFAULT true,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- TABLE: user_escalation_status
-- ============================================

CREATE TABLE IF NOT EXISTS user_escalation_status (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  escalation_id UUID NOT NULL REFERENCES automatic_escalations(id),

  -- Status
  triggered BOOLEAN DEFAULT false,
  triggered_at TIMESTAMPTZ,
  delayed BOOLEAN DEFAULT false,
  delayed_until DATE,
  delay_cost_paid JSONB,

  created_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(user_id, escalation_id)
);

-- ============================================
-- TABLE: ceremonies
-- ============================================

CREATE TABLE IF NOT EXISTS ceremonies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Definition
  name VARCHAR(100) NOT NULL,
  description TEXT NOT NULL,
  trigger_condition JSONB NOT NULL,

  -- Ritual steps
  ritual_steps JSONB NOT NULL,

  -- Irreversibility
  irreversible_marker TEXT,

  -- Order
  sequence_order INT NOT NULL,

  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- TABLE: user_ceremonies
-- ============================================

CREATE TABLE IF NOT EXISTS user_ceremonies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  ceremony_id UUID NOT NULL REFERENCES ceremonies(id),

  -- Status
  available BOOLEAN DEFAULT false,
  completed BOOLEAN DEFAULT false,
  completed_at TIMESTAMPTZ,

  -- Evidence
  completion_evidence JSONB,

  created_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(user_id, ceremony_id)
);

-- ============================================
-- TABLE: arousal_gated_commitments
-- ============================================

CREATE TABLE IF NOT EXISTS arousal_gated_commitments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Definition
  commitment_type VARCHAR(100) NOT NULL,
  description TEXT NOT NULL,

  -- Requirements
  requires_arousal_state JSONB NOT NULL,
  requires_denial_day INT NOT NULL,
  requires_phase INT DEFAULT 1,

  -- Binding level
  binding_level VARCHAR(20) NOT NULL,

  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- TABLE: user_commitments
-- ============================================

CREATE TABLE IF NOT EXISTS user_commitments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  commitment_id UUID REFERENCES arousal_gated_commitments(id),

  -- What was committed
  commitment_text TEXT NOT NULL,
  binding_level VARCHAR(20) NOT NULL,

  -- Context when made
  made_at TIMESTAMPTZ DEFAULT NOW(),
  arousal_state VARCHAR(30),
  denial_day INT,

  -- Status
  status VARCHAR(20) DEFAULT 'active',
  broken_at TIMESTAMPTZ,
  fulfilled_at TIMESTAMPTZ,

  -- Evidence
  evidence JSONB,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- TABLE: masculine_capability_tracking
-- ============================================

CREATE TABLE IF NOT EXISTS masculine_capability_tracking (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  capability_name VARCHAR(100) NOT NULL,
  last_used TIMESTAMPTZ,
  days_unused INT DEFAULT 0,
  comfort_level INT DEFAULT 100,
  atrophy_acknowledged BOOLEAN DEFAULT false,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(user_id, capability_name)
);

-- ============================================
-- TABLE: regression_impossibility_factors
-- ============================================

CREATE TABLE IF NOT EXISTS regression_impossibility_factors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  factor_category VARCHAR(50) NOT NULL,
  factor_name VARCHAR(100) NOT NULL,
  factor_value JSONB,
  strength INT DEFAULT 0,
  permanent BOOLEAN DEFAULT false,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- INDEXES
-- ============================================

CREATE INDEX IF NOT EXISTS idx_task_bank_category ON task_bank(category);
CREATE INDEX IF NOT EXISTS idx_task_bank_intensity ON task_bank(intensity);
CREATE INDEX IF NOT EXISTS idx_task_bank_domain ON task_bank(domain);
CREATE INDEX IF NOT EXISTS idx_task_bank_active ON task_bank(active);

CREATE INDEX IF NOT EXISTS idx_daily_tasks_user_date ON daily_tasks(user_id, assigned_date);
CREATE INDEX IF NOT EXISTS idx_daily_tasks_status ON daily_tasks(status);
CREATE INDEX IF NOT EXISTS idx_daily_tasks_task ON daily_tasks(task_id);

CREATE INDEX IF NOT EXISTS idx_task_completions_user ON task_completions(user_id);
CREATE INDEX IF NOT EXISTS idx_task_completions_task ON task_completions(task_id);
CREATE INDEX IF NOT EXISTS idx_task_completions_date ON task_completions(completed_at);

CREATE INDEX IF NOT EXISTS idx_task_resistance_user ON task_resistance(user_id);
CREATE INDEX IF NOT EXISTS idx_task_resistance_task ON task_resistance(task_id);

CREATE INDEX IF NOT EXISTS idx_guy_mode_user ON guy_mode_tracking(user_id);
CREATE INDEX IF NOT EXISTS idx_guy_mode_date ON guy_mode_tracking(logged_at);

CREATE INDEX IF NOT EXISTS idx_user_commitments_user ON user_commitments(user_id);
CREATE INDEX IF NOT EXISTS idx_user_commitments_status ON user_commitments(status);

CREATE INDEX IF NOT EXISTS idx_masculine_cap_user ON masculine_capability_tracking(user_id);

CREATE INDEX IF NOT EXISTS idx_regression_factors_user ON regression_impossibility_factors(user_id);

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================

ALTER TABLE task_bank ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_completions ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_resistance ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_evolution ENABLE ROW LEVEL SECURITY;
ALTER TABLE guy_mode_tracking ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_escalation_status ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_ceremonies ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_commitments ENABLE ROW LEVEL SECURITY;
ALTER TABLE masculine_capability_tracking ENABLE ROW LEVEL SECURITY;
ALTER TABLE regression_impossibility_factors ENABLE ROW LEVEL SECURITY;

-- Task bank is readable by all authenticated users
DROP POLICY IF EXISTS "Task bank readable by authenticated" ON task_bank;
CREATE POLICY "Task bank readable by authenticated" ON task_bank
  FOR SELECT USING (auth.role() = 'authenticated');

-- User-specific tables
DROP POLICY IF EXISTS "Users own daily_tasks" ON daily_tasks;
CREATE POLICY "Users own daily_tasks" ON daily_tasks
  FOR ALL USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users own task_completions" ON task_completions;
CREATE POLICY "Users own task_completions" ON task_completions
  FOR ALL USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users own task_resistance" ON task_resistance;
CREATE POLICY "Users own task_resistance" ON task_resistance
  FOR ALL USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users own guy_mode_tracking" ON guy_mode_tracking;
CREATE POLICY "Users own guy_mode_tracking" ON guy_mode_tracking
  FOR ALL USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users own user_escalation_status" ON user_escalation_status;
CREATE POLICY "Users own user_escalation_status" ON user_escalation_status
  FOR ALL USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users own user_ceremonies" ON user_ceremonies;
CREATE POLICY "Users own user_ceremonies" ON user_ceremonies
  FOR ALL USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users own user_commitments" ON user_commitments;
CREATE POLICY "Users own user_commitments" ON user_commitments
  FOR ALL USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users own masculine_capability_tracking" ON masculine_capability_tracking;
CREATE POLICY "Users own masculine_capability_tracking" ON masculine_capability_tracking
  FOR ALL USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users own regression_impossibility_factors" ON regression_impossibility_factors;
CREATE POLICY "Users own regression_impossibility_factors" ON regression_impossibility_factors
  FOR ALL USING (auth.uid() = user_id);

-- ============================================
-- COMMENTS
-- ============================================

COMMENT ON TABLE task_bank IS 'Master library of feminization tasks';
COMMENT ON TABLE daily_tasks IS 'Tasks assigned to users per day';
COMMENT ON TABLE task_completions IS 'Permanent evidence log of completed tasks';
COMMENT ON TABLE task_resistance IS 'Tracking of task avoidance patterns';
COMMENT ON TABLE task_evolution IS 'AI task generation and modification log';
COMMENT ON TABLE guy_mode_tracking IS 'Tracking masculine presentation events';
COMMENT ON TABLE automatic_escalations IS 'Time-locked automatic escalations';
COMMENT ON TABLE user_escalation_status IS 'Per-user escalation trigger status';
COMMENT ON TABLE ceremonies IS 'Point of no return ceremony definitions';
COMMENT ON TABLE user_ceremonies IS 'Per-user ceremony completion status';
COMMENT ON TABLE arousal_gated_commitments IS 'Commitments that require arousal state';
COMMENT ON TABLE user_commitments IS 'Per-user commitment records';
COMMENT ON TABLE masculine_capability_tracking IS 'Tracking atrophy of masculine capabilities';
COMMENT ON TABLE regression_impossibility_factors IS 'Factors making regression impossible';
