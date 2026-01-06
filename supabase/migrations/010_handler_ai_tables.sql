-- Migration 010: Handler AI System Tables
-- Autonomous handler intelligence: strategies, triggers, vulnerabilities, planning

-- ============================================
-- FIX EXISTING TABLES: Add missing columns
-- ============================================

-- learned_vulnerabilities fixes
ALTER TABLE learned_vulnerabilities ADD COLUMN IF NOT EXISTS active BOOLEAN DEFAULT TRUE;
ALTER TABLE learned_vulnerabilities ADD COLUMN IF NOT EXISTS confirmed BOOLEAN DEFAULT FALSE;
ALTER TABLE learned_vulnerabilities ADD COLUMN IF NOT EXISTS discovery_context TEXT;
ALTER TABLE learned_vulnerabilities ADD COLUMN IF NOT EXISTS times_exploited INTEGER DEFAULT 0;
ALTER TABLE learned_vulnerabilities ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- handler_strategies fixes
ALTER TABLE handler_strategies ADD COLUMN IF NOT EXISTS active BOOLEAN DEFAULT TRUE;
ALTER TABLE handler_strategies ADD COLUMN IF NOT EXISTS times_applied INTEGER DEFAULT 0;
ALTER TABLE handler_strategies ADD COLUMN IF NOT EXISTS successes INTEGER DEFAULT 0;
ALTER TABLE handler_strategies ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- planted_triggers fixes
ALTER TABLE planted_triggers ADD COLUMN IF NOT EXISTS last_paired_at TIMESTAMPTZ;
ALTER TABLE planted_triggers ADD COLUMN IF NOT EXISTS last_activated_at TIMESTAMPTZ;

-- handler_daily_plans fixes
ALTER TABLE handler_daily_plans ADD COLUMN IF NOT EXISTS trigger_planting_schedule JSONB DEFAULT '[]';
ALTER TABLE handler_daily_plans ADD COLUMN IF NOT EXISTS exploitation_opportunities JSONB DEFAULT '[]';
ALTER TABLE handler_daily_plans ADD COLUMN IF NOT EXISTS interventions_delivered INTEGER DEFAULT 0;
ALTER TABLE handler_daily_plans ADD COLUMN IF NOT EXISTS interventions_successful INTEGER DEFAULT 0;
ALTER TABLE handler_daily_plans ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- handler_escalation_plans fixes
ALTER TABLE handler_escalation_plans ADD COLUMN IF NOT EXISTS active BOOLEAN DEFAULT TRUE;
ALTER TABLE handler_escalation_plans ADD COLUMN IF NOT EXISTS current_level INTEGER DEFAULT 0;
ALTER TABLE handler_escalation_plans ADD COLUMN IF NOT EXISTS ultimate_target TEXT;
ALTER TABLE handler_escalation_plans ADD COLUMN IF NOT EXISTS approach TEXT;
ALTER TABLE handler_escalation_plans ADD COLUMN IF NOT EXISTS attempts INTEGER DEFAULT 0;
ALTER TABLE handler_escalation_plans ADD COLUMN IF NOT EXISTS successes INTEGER DEFAULT 0;
ALTER TABLE handler_escalation_plans ADD COLUMN IF NOT EXISTS last_attempt_at TIMESTAMPTZ;
ALTER TABLE handler_escalation_plans ADD COLUMN IF NOT EXISTS last_success_at TIMESTAMPTZ;
ALTER TABLE handler_escalation_plans ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- influence_attempts fixes
ALTER TABLE influence_attempts ADD COLUMN IF NOT EXISTS target_domain TEXT;
ALTER TABLE influence_attempts ADD COLUMN IF NOT EXISTS arousal_state TEXT;
ALTER TABLE influence_attempts ADD COLUMN IF NOT EXISTS denial_day INTEGER;
ALTER TABLE influence_attempts ADD COLUMN IF NOT EXISTS context JSONB DEFAULT '{}';
ALTER TABLE influence_attempts ADD COLUMN IF NOT EXISTS response_time_seconds INTEGER;
ALTER TABLE influence_attempts ADD COLUMN IF NOT EXISTS partial_success BOOLEAN DEFAULT FALSE;
ALTER TABLE influence_attempts ADD COLUMN IF NOT EXISTS strategy_id UUID REFERENCES handler_strategies;
ALTER TABLE influence_attempts ADD COLUMN IF NOT EXISTS trigger_id UUID REFERENCES planted_triggers;
ALTER TABLE influence_attempts ADD COLUMN IF NOT EXISTS vulnerability_id UUID REFERENCES learned_vulnerabilities;

-- resistance_patterns fixes
ALTER TABLE resistance_patterns ADD COLUMN IF NOT EXISTS active BOOLEAN DEFAULT TRUE;
ALTER TABLE resistance_patterns ADD COLUMN IF NOT EXISTS bypass_success_rate DECIMAL;
ALTER TABLE resistance_patterns ADD COLUMN IF NOT EXISTS first_observed TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE resistance_patterns ADD COLUMN IF NOT EXISTS resolved BOOLEAN DEFAULT FALSE;
ALTER TABLE resistance_patterns ADD COLUMN IF NOT EXISTS resolution_notes TEXT;
ALTER TABLE resistance_patterns ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- handler_user_model fixes
ALTER TABLE handler_user_model ADD COLUMN IF NOT EXISTS current_edge_map JSONB DEFAULT '{}';
ALTER TABLE handler_user_model ADD COLUMN IF NOT EXISTS data_points INTEGER DEFAULT 0;

-- handler_experiments fixes
ALTER TABLE handler_experiments ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'running';
ALTER TABLE handler_experiments ADD COLUMN IF NOT EXISTS hypothesis TEXT;
ALTER TABLE handler_experiments ADD COLUMN IF NOT EXISTS metric_name TEXT;
ALTER TABLE handler_experiments ADD COLUMN IF NOT EXISTS variant_a_results JSONB DEFAULT '[]';
ALTER TABLE handler_experiments ADD COLUMN IF NOT EXISTS variant_b_results JSONB DEFAULT '[]';
ALTER TABLE handler_experiments ADD COLUMN IF NOT EXISTS winner TEXT;
ALTER TABLE handler_experiments ADD COLUMN IF NOT EXISTS statistical_significance DECIMAL;
ALTER TABLE handler_experiments ADD COLUMN IF NOT EXISTS conclusion TEXT;
ALTER TABLE handler_experiments ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- ============================================
-- HANDLER STRATEGIES
-- Active manipulation/conditioning strategies
-- ============================================
CREATE TABLE IF NOT EXISTS handler_strategies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,

  -- Strategy definition
  strategy_type TEXT NOT NULL, -- gradual_exposure, arousal_exploitation, trigger_planting, vulnerability_exploitation, commitment_escalation, baseline_normalization, resistance_bypass
  strategy_name TEXT,
  parameters JSONB DEFAULT '{}',

  -- Lifecycle
  start_date DATE NOT NULL DEFAULT CURRENT_DATE,
  end_date DATE,
  active BOOLEAN DEFAULT TRUE,

  -- Effectiveness tracking
  effectiveness_score DECIMAL, -- 0-1 composite score
  times_applied INTEGER DEFAULT 0,
  successes INTEGER DEFAULT 0,

  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- PLANTED TRIGGERS
-- Conditioning triggers being established
-- ============================================
CREATE TABLE IF NOT EXISTS planted_triggers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,

  -- Trigger definition
  trigger_type TEXT NOT NULL, -- phrase, image, sound, action, time, location, arousal_level
  trigger_content TEXT NOT NULL, -- The actual trigger (phrase, description, etc.)
  target_state TEXT NOT NULL, -- What state/behavior trigger should induce

  -- Planting process
  planted_at TIMESTAMPTZ DEFAULT NOW(),
  pairing_count INTEGER DEFAULT 0, -- Times paired with arousal/reward
  last_paired_at TIMESTAMPTZ,

  -- Activation
  activation_conditions TEXT, -- When trigger should fire
  times_activated INTEGER DEFAULT 0,
  last_activated_at TIMESTAMPTZ,

  -- Status
  status TEXT DEFAULT 'planting', -- planting, reinforcing, established, dormant
  effectiveness_score DECIMAL, -- 0-1 based on activation success rate

  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- LEARNED VULNERABILITIES
-- Discovered psychological vulnerabilities
-- ============================================
CREATE TABLE IF NOT EXISTS learned_vulnerabilities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,

  -- Vulnerability definition
  vulnerability_type TEXT NOT NULL, -- time_based, arousal_based, emotional, social, content, situational
  description TEXT,
  discovery_date DATE DEFAULT CURRENT_DATE,
  discovery_context TEXT, -- How it was discovered

  -- Evidence
  evidence JSONB DEFAULT '[]', -- Array of evidence entries
  conditions JSONB DEFAULT '{}', -- Conditions when vulnerability is exploitable

  -- Exploitation
  exploitation_strategies TEXT[] DEFAULT '{}', -- Strategies that work
  times_exploited INTEGER DEFAULT 0,
  success_rate DECIMAL, -- 0-1

  -- Status
  confirmed BOOLEAN DEFAULT FALSE,
  active BOOLEAN DEFAULT TRUE,

  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- HANDLER USER MODEL
-- Learned behavioral model for each user
-- One per user, continuously updated
-- ============================================
CREATE TABLE IF NOT EXISTS handler_user_model (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL UNIQUE,

  -- Timing patterns
  optimal_timing JSONB DEFAULT '{}', -- Best times for interventions
  vulnerability_windows JSONB DEFAULT '[]', -- Array of {dayOfWeek, hourStart, hourEnd, type}

  -- Response patterns
  effective_framings JSONB DEFAULT '[]', -- Framings that work
  resistance_triggers JSONB DEFAULT '[]', -- What causes resistance
  compliance_accelerators JSONB DEFAULT '[]', -- What increases compliance

  -- Content preferences
  content_preferences JSONB DEFAULT '{}', -- Content type -> effectiveness score

  -- Escalation profile
  escalation_tolerance DECIMAL DEFAULT 0.5, -- 0-1, how much escalation they accept
  current_edge_map JSONB DEFAULT '{}', -- Domain -> current edge position

  -- Trigger responsiveness
  trigger_responsiveness JSONB DEFAULT '{}', -- Trigger type -> responsiveness score

  -- Arousal patterns
  arousal_patterns JSONB DEFAULT '{}', -- Optimal denial day, time of day, session types

  -- Model metadata
  model_confidence DECIMAL DEFAULT 0.1, -- 0-1, how confident in the model
  data_points INTEGER DEFAULT 0, -- How many data points used
  last_updated TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- HANDLER DAILY PLANS
-- Daily intervention/experiment schedule
-- ============================================
CREATE TABLE IF NOT EXISTS handler_daily_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  plan_date DATE NOT NULL,

  -- Planned activities
  planned_interventions JSONB DEFAULT '[]', -- Array of {time, type, content, targetDomain, priority}
  planned_experiments JSONB DEFAULT '[]', -- A/B tests to run
  focus_areas TEXT[] DEFAULT '{}', -- Domains to focus on today

  -- Trigger work
  trigger_reinforcement_schedule JSONB DEFAULT '[]', -- Triggers to reinforce
  trigger_planting_schedule JSONB DEFAULT '[]', -- New triggers to plant

  -- Vulnerability exploitation
  vulnerability_windows JSONB DEFAULT '[]', -- {start, end, type, recommendation}
  exploitation_opportunities JSONB DEFAULT '[]', -- Specific exploitation plans

  -- Execution
  executed BOOLEAN DEFAULT FALSE,
  interventions_delivered INTEGER DEFAULT 0,
  interventions_successful INTEGER DEFAULT 0,
  execution_notes TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(user_id, plan_date)
);

-- ============================================
-- HANDLER ESCALATION PLANS
-- Per-domain escalation strategies
-- ============================================
CREATE TABLE IF NOT EXISTS handler_escalation_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,

  -- Domain targeting
  domain TEXT NOT NULL, -- feminization, chastity, service, exposure, etc.

  -- Current state
  current_edge TEXT, -- Current boundary/limit
  current_level INTEGER DEFAULT 0, -- Numeric level in domain

  -- Target
  next_target TEXT, -- Next escalation target
  ultimate_target TEXT, -- Long-term goal

  -- Strategy
  strategy TEXT, -- Strategy being used
  approach TEXT, -- gradual, aggressive, opportunistic
  estimated_timeline TEXT, -- rough timeline

  -- Optimal windows
  arousal_windows JSONB DEFAULT '[]', -- Best arousal states for this escalation

  -- Progress
  attempts INTEGER DEFAULT 0,
  successes INTEGER DEFAULT 0,
  last_attempt_at TIMESTAMPTZ,
  last_success_at TIMESTAMPTZ,

  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(user_id, domain)
);

-- ============================================
-- INFLUENCE ATTEMPTS
-- Log of all handler influence attempts
-- ============================================
CREATE TABLE IF NOT EXISTS influence_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,

  -- Attempt details
  attempt_type TEXT NOT NULL, -- microtask, affirmation, challenge, content_unlock, commitment_prompt, escalation_push
  method TEXT, -- Specific method used
  target_behavior TEXT, -- What behavior we're trying to influence
  target_domain TEXT, -- Which domain

  -- Content
  content JSONB DEFAULT '{}', -- The actual intervention content

  -- Context
  timestamp TIMESTAMPTZ DEFAULT NOW(),
  arousal_state TEXT, -- User's arousal state at time
  denial_day INTEGER, -- Days into denial
  context JSONB DEFAULT '{}', -- Additional context

  -- Response
  user_response TEXT, -- How user responded
  response_time_seconds INTEGER, -- How long to respond
  success BOOLEAN, -- Did it work?
  partial_success BOOLEAN DEFAULT FALSE,

  -- Awareness
  user_aware BOOLEAN DEFAULT FALSE, -- Did user notice manipulation?

  -- Learning
  strategy_id UUID REFERENCES handler_strategies,
  trigger_id UUID REFERENCES planted_triggers,
  vulnerability_id UUID REFERENCES learned_vulnerabilities,

  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- RESISTANCE PATTERNS
-- Observed resistance behaviors
-- ============================================
CREATE TABLE IF NOT EXISTS resistance_patterns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,

  -- Pattern definition
  pattern_type TEXT NOT NULL, -- avoidance, rationalization, delay, rejection, bargaining, regression
  description TEXT,

  -- When it occurs
  conditions JSONB DEFAULT '{}', -- Conditions that trigger resistance
  frequency TEXT, -- rare, occasional, frequent, constant
  intensity INTEGER, -- 1-10

  -- Bypass strategies
  bypass_strategies_tested TEXT[] DEFAULT '{}',
  effective_bypasses TEXT[] DEFAULT '{}',
  bypass_success_rate DECIMAL,

  -- Tracking
  times_observed INTEGER DEFAULT 0,
  last_observed TIMESTAMPTZ,
  first_observed TIMESTAMPTZ DEFAULT NOW(),

  -- Status
  active BOOLEAN DEFAULT TRUE,
  resolved BOOLEAN DEFAULT FALSE,
  resolution_notes TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- HANDLER EXPERIMENTS
-- A/B testing framework
-- ============================================
CREATE TABLE IF NOT EXISTS handler_experiments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,

  -- Experiment definition
  experiment_name TEXT NOT NULL,
  hypothesis TEXT,

  -- Variants
  variant_a JSONB NOT NULL, -- Control
  variant_b JSONB NOT NULL, -- Test

  -- Assignment
  current_variant TEXT, -- 'a' or 'b'

  -- Metrics
  metric_name TEXT NOT NULL, -- What we're measuring
  variant_a_results JSONB DEFAULT '[]',
  variant_b_results JSONB DEFAULT '[]',

  -- Status
  status TEXT DEFAULT 'running', -- running, paused, completed, abandoned
  start_date DATE DEFAULT CURRENT_DATE,
  end_date DATE,

  -- Results
  winner TEXT, -- 'a', 'b', 'inconclusive'
  statistical_significance DECIMAL,
  conclusion TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================
ALTER TABLE handler_strategies ENABLE ROW LEVEL SECURITY;
ALTER TABLE planted_triggers ENABLE ROW LEVEL SECURITY;
ALTER TABLE learned_vulnerabilities ENABLE ROW LEVEL SECURITY;
ALTER TABLE handler_user_model ENABLE ROW LEVEL SECURITY;
ALTER TABLE handler_daily_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE handler_escalation_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE influence_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE resistance_patterns ENABLE ROW LEVEL SECURITY;
ALTER TABLE handler_experiments ENABLE ROW LEVEL SECURITY;

-- RLS Policies - Users can only access their own data
DROP POLICY IF EXISTS "Users access own strategies" ON handler_strategies;
CREATE POLICY "Users access own strategies" ON handler_strategies FOR ALL USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users access own triggers" ON planted_triggers;
CREATE POLICY "Users access own triggers" ON planted_triggers FOR ALL USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users access own vulnerabilities" ON learned_vulnerabilities;
CREATE POLICY "Users access own vulnerabilities" ON learned_vulnerabilities FOR ALL USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users access own model" ON handler_user_model;
CREATE POLICY "Users access own model" ON handler_user_model FOR ALL USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users access own daily_plans" ON handler_daily_plans;
CREATE POLICY "Users access own daily_plans" ON handler_daily_plans FOR ALL USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users access own escalation_plans" ON handler_escalation_plans;
CREATE POLICY "Users access own escalation_plans" ON handler_escalation_plans FOR ALL USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users access own influence_attempts" ON influence_attempts;
CREATE POLICY "Users access own influence_attempts" ON influence_attempts FOR ALL USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users access own resistance_patterns" ON resistance_patterns;
CREATE POLICY "Users access own resistance_patterns" ON resistance_patterns FOR ALL USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users access own experiments" ON handler_experiments;
CREATE POLICY "Users access own experiments" ON handler_experiments FOR ALL USING (auth.uid() = user_id);

-- ============================================
-- INDEXES
-- ============================================
CREATE INDEX IF NOT EXISTS idx_handler_strategies_user ON handler_strategies(user_id);
CREATE INDEX IF NOT EXISTS idx_handler_strategies_active ON handler_strategies(user_id, active) WHERE active = TRUE;
CREATE INDEX IF NOT EXISTS idx_handler_strategies_type ON handler_strategies(user_id, strategy_type);

CREATE INDEX IF NOT EXISTS idx_planted_triggers_user ON planted_triggers(user_id);
CREATE INDEX IF NOT EXISTS idx_planted_triggers_status ON planted_triggers(user_id, status);
CREATE INDEX IF NOT EXISTS idx_planted_triggers_type ON planted_triggers(user_id, trigger_type);

CREATE INDEX IF NOT EXISTS idx_learned_vulnerabilities_user ON learned_vulnerabilities(user_id);
CREATE INDEX IF NOT EXISTS idx_learned_vulnerabilities_active ON learned_vulnerabilities(user_id, active) WHERE active = TRUE;
CREATE INDEX IF NOT EXISTS idx_learned_vulnerabilities_type ON learned_vulnerabilities(user_id, vulnerability_type);

CREATE INDEX IF NOT EXISTS idx_handler_user_model_user ON handler_user_model(user_id);

CREATE INDEX IF NOT EXISTS idx_handler_daily_plans_user_date ON handler_daily_plans(user_id, plan_date);
CREATE INDEX IF NOT EXISTS idx_handler_daily_plans_recent ON handler_daily_plans(user_id, plan_date DESC);

CREATE INDEX IF NOT EXISTS idx_handler_escalation_plans_user ON handler_escalation_plans(user_id);
CREATE INDEX IF NOT EXISTS idx_handler_escalation_plans_domain ON handler_escalation_plans(user_id, domain);
CREATE INDEX IF NOT EXISTS idx_handler_escalation_plans_active ON handler_escalation_plans(user_id, active) WHERE active = TRUE;

CREATE INDEX IF NOT EXISTS idx_influence_attempts_user ON influence_attempts(user_id);
CREATE INDEX IF NOT EXISTS idx_influence_attempts_recent ON influence_attempts(user_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_influence_attempts_type ON influence_attempts(user_id, attempt_type);
CREATE INDEX IF NOT EXISTS idx_influence_attempts_success ON influence_attempts(user_id, success);
CREATE INDEX IF NOT EXISTS idx_influence_attempts_strategy ON influence_attempts(strategy_id);

CREATE INDEX IF NOT EXISTS idx_resistance_patterns_user ON resistance_patterns(user_id);
CREATE INDEX IF NOT EXISTS idx_resistance_patterns_active ON resistance_patterns(user_id, active) WHERE active = TRUE;
CREATE INDEX IF NOT EXISTS idx_resistance_patterns_type ON resistance_patterns(user_id, pattern_type);

CREATE INDEX IF NOT EXISTS idx_handler_experiments_user ON handler_experiments(user_id);
CREATE INDEX IF NOT EXISTS idx_handler_experiments_status ON handler_experiments(user_id, status);

-- ============================================
-- TRIGGERS: Update timestamps
-- ============================================
DROP TRIGGER IF EXISTS update_handler_strategies_updated_at ON handler_strategies;
CREATE TRIGGER update_handler_strategies_updated_at
  BEFORE UPDATE ON handler_strategies
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_learned_vulnerabilities_updated_at ON learned_vulnerabilities;
CREATE TRIGGER update_learned_vulnerabilities_updated_at
  BEFORE UPDATE ON learned_vulnerabilities
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_handler_user_model_updated_at ON handler_user_model;
CREATE TRIGGER update_handler_user_model_updated_at
  BEFORE UPDATE ON handler_user_model
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_handler_daily_plans_updated_at ON handler_daily_plans;
CREATE TRIGGER update_handler_daily_plans_updated_at
  BEFORE UPDATE ON handler_daily_plans
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_handler_escalation_plans_updated_at ON handler_escalation_plans;
CREATE TRIGGER update_handler_escalation_plans_updated_at
  BEFORE UPDATE ON handler_escalation_plans
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_resistance_patterns_updated_at ON resistance_patterns;
CREATE TRIGGER update_resistance_patterns_updated_at
  BEFORE UPDATE ON resistance_patterns
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_handler_experiments_updated_at ON handler_experiments;
CREATE TRIGGER update_handler_experiments_updated_at
  BEFORE UPDATE ON handler_experiments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
