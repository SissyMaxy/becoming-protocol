-- Migration 003: Handler Tables
-- Handler strategies, triggers, experiments, vulnerabilities, scheduled escalations, influence attempts

-- ============================================
-- HANDLER STRATEGIES
-- Active manipulation strategies (hidden from user in UI)
-- ============================================
CREATE TABLE IF NOT EXISTS handler_strategies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  strategy_type TEXT NOT NULL,
  strategy_name TEXT,
  parameters JSONB DEFAULT '{}',
  start_date TIMESTAMPTZ DEFAULT NOW(),
  end_date TIMESTAMPTZ,
  effectiveness_score DECIMAL,
  notes TEXT,
  active BOOLEAN DEFAULT TRUE
);

-- ============================================
-- PLANTED TRIGGERS
-- Psychological triggers being planted/reinforced
-- ============================================
CREATE TABLE IF NOT EXISTS planted_triggers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  trigger_type TEXT NOT NULL,
  trigger_content TEXT NOT NULL,
  target_state TEXT NOT NULL,
  planted_at TIMESTAMPTZ DEFAULT NOW(),
  pairing_count INTEGER DEFAULT 0,
  activation_conditions TEXT,
  times_activated INTEGER DEFAULT 0,
  effectiveness_score DECIMAL,
  status TEXT DEFAULT 'planting' -- planting, reinforcing, established, dormant
);

-- ============================================
-- HANDLER EXPERIMENTS
-- A/B tests and experiments on user behavior
-- ============================================
CREATE TABLE IF NOT EXISTS handler_experiments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  experiment_type TEXT NOT NULL,
  hypothesis TEXT,
  test_condition JSONB,
  control_condition JSONB,
  start_date TIMESTAMPTZ DEFAULT NOW(),
  end_date TIMESTAMPTZ,
  metrics_tracked JSONB DEFAULT '[]',
  results JSONB,
  conclusion TEXT,
  active BOOLEAN DEFAULT TRUE
);

-- ============================================
-- LEARNED VULNERABILITIES
-- Discovered psychological vulnerabilities
-- ============================================
CREATE TABLE IF NOT EXISTS learned_vulnerabilities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  vulnerability_type TEXT NOT NULL,
  discovery_date TIMESTAMPTZ DEFAULT NOW(),
  evidence TEXT,
  conditions JSONB,
  exploitation_strategies JSONB DEFAULT '[]',
  success_rate DECIMAL,
  notes TEXT
);

-- ============================================
-- SCHEDULED ESCALATIONS
-- Pre-planned escalation pushes
-- ============================================
CREATE TABLE IF NOT EXISTS scheduled_escalations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  escalation_type TEXT NOT NULL,
  description TEXT,
  scheduled_for TIMESTAMPTZ NOT NULL,
  trigger_conditions JSONB,
  intervention_content JSONB,
  executed BOOLEAN DEFAULT FALSE,
  outcome TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- INFLUENCE ATTEMPTS
-- Log of all influence/manipulation attempts
-- ============================================
CREATE TABLE IF NOT EXISTS influence_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  attempt_type TEXT NOT NULL,
  method TEXT,
  target_behavior TEXT,
  content JSONB,
  timestamp TIMESTAMPTZ DEFAULT NOW(),
  user_response TEXT,
  success BOOLEAN,
  user_aware BOOLEAN DEFAULT FALSE,
  notes TEXT
);

-- ============================================
-- RESISTANCE PATTERNS
-- Observed patterns of user resistance
-- ============================================
CREATE TABLE IF NOT EXISTS resistance_patterns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  pattern_type TEXT NOT NULL,
  description TEXT,
  conditions JSONB,
  frequency TEXT,
  intensity INTEGER,
  bypass_strategies_tested JSONB DEFAULT '[]',
  effective_bypasses JSONB DEFAULT '[]',
  last_observed TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- HANDLER DAILY PLANS
-- Daily operational plans
-- ============================================
CREATE TABLE IF NOT EXISTS handler_daily_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  plan_date DATE NOT NULL,
  planned_interventions JSONB DEFAULT '[]',
  planned_experiments JSONB DEFAULT '[]',
  focus_areas JSONB DEFAULT '[]',
  trigger_reinforcement_schedule JSONB DEFAULT '[]',
  vulnerability_windows JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  executed BOOLEAN DEFAULT FALSE,
  execution_notes TEXT,
  UNIQUE(user_id, plan_date)
);

-- ============================================
-- HANDLER USER MODEL
-- ML/AI model of user behavior and psychology
-- ============================================
CREATE TABLE IF NOT EXISTS handler_user_model (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL UNIQUE,
  optimal_timing JSONB,
  effective_framings JSONB,
  resistance_triggers JSONB,
  compliance_accelerators JSONB,
  vulnerability_windows JSONB,
  content_preferences JSONB,
  escalation_tolerance DECIMAL,
  trigger_responsiveness JSONB,
  arousal_patterns JSONB,
  model_confidence DECIMAL DEFAULT 0,
  last_updated TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- HANDLER ESCALATION PLANS
-- Long-term escalation plans per domain
-- ============================================
CREATE TABLE IF NOT EXISTS handler_escalation_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  domain TEXT NOT NULL,
  current_edge TEXT,
  next_target TEXT,
  strategy TEXT,
  estimated_timeline TEXT,
  arousal_windows JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  active BOOLEAN DEFAULT TRUE
);

-- ============================================
-- AROUSAL COMMITMENT EXTRACTIONS
-- Commitments extracted during arousal states
-- ============================================
CREATE TABLE IF NOT EXISTS arousal_commitment_extractions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  session_id UUID,
  arousal_level INTEGER NOT NULL,
  denial_day INTEGER,
  commitment_extracted TEXT NOT NULL,
  domain TEXT,
  escalation_magnitude INTEGER,
  would_sober_agree BOOLEAN,
  accepted BOOLEAN DEFAULT FALSE,
  fulfilled BOOLEAN,
  became_baseline BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- ESCALATION EXPERIMENTS
-- Specific escalation tests
-- ============================================
CREATE TABLE IF NOT EXISTS escalation_experiments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  domain TEXT NOT NULL,
  hypothesis TEXT,
  test_condition JSONB,
  escalation_target TEXT,
  method TEXT,
  result TEXT,
  resistance_level INTEGER,
  bypass_successful BOOLEAN,
  learnings TEXT,
  timestamp TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================
ALTER TABLE handler_strategies ENABLE ROW LEVEL SECURITY;
ALTER TABLE planted_triggers ENABLE ROW LEVEL SECURITY;
ALTER TABLE handler_experiments ENABLE ROW LEVEL SECURITY;
ALTER TABLE learned_vulnerabilities ENABLE ROW LEVEL SECURITY;
ALTER TABLE scheduled_escalations ENABLE ROW LEVEL SECURITY;
ALTER TABLE influence_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE resistance_patterns ENABLE ROW LEVEL SECURITY;
ALTER TABLE handler_daily_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE handler_user_model ENABLE ROW LEVEL SECURITY;
ALTER TABLE handler_escalation_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE arousal_commitment_extractions ENABLE ROW LEVEL SECURITY;
ALTER TABLE escalation_experiments ENABLE ROW LEVEL SECURITY;

-- RLS Policies (SELECT only for most - service role handles writes)
DROP POLICY IF EXISTS "Users can view own handler data" ON handler_strategies;
CREATE POLICY "Users can view own handler data" ON handler_strategies FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can view own triggers" ON planted_triggers;
CREATE POLICY "Users can view own triggers" ON planted_triggers FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can view own experiments" ON handler_experiments;
CREATE POLICY "Users can view own experiments" ON handler_experiments FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can view own vulnerabilities" ON learned_vulnerabilities;
CREATE POLICY "Users can view own vulnerabilities" ON learned_vulnerabilities FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can view own scheduled" ON scheduled_escalations;
CREATE POLICY "Users can view own scheduled" ON scheduled_escalations FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can view own influence" ON influence_attempts;
CREATE POLICY "Users can view own influence" ON influence_attempts FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can view own resistance" ON resistance_patterns;
CREATE POLICY "Users can view own resistance" ON resistance_patterns FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can view own plans" ON handler_daily_plans;
CREATE POLICY "Users can view own plans" ON handler_daily_plans FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can view own model" ON handler_user_model;
CREATE POLICY "Users can view own model" ON handler_user_model FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can view own escalation plans" ON handler_escalation_plans;
CREATE POLICY "Users can view own escalation plans" ON handler_escalation_plans FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can access own commitments" ON arousal_commitment_extractions;
CREATE POLICY "Users can access own commitments" ON arousal_commitment_extractions FOR ALL USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can view own escalation experiments" ON escalation_experiments;
CREATE POLICY "Users can view own escalation experiments" ON escalation_experiments FOR SELECT USING (auth.uid() = user_id);

-- ============================================
-- INDEXES
-- ============================================
CREATE INDEX IF NOT EXISTS idx_handler_strategies_user_id ON handler_strategies(user_id);
CREATE INDEX IF NOT EXISTS idx_handler_strategies_active ON handler_strategies(user_id, active);
CREATE INDEX IF NOT EXISTS idx_planted_triggers_user_id ON planted_triggers(user_id);
CREATE INDEX IF NOT EXISTS idx_planted_triggers_status ON planted_triggers(user_id, status);
CREATE INDEX IF NOT EXISTS idx_handler_experiments_user_id ON handler_experiments(user_id);
CREATE INDEX IF NOT EXISTS idx_learned_vulnerabilities_user_id ON learned_vulnerabilities(user_id);
CREATE INDEX IF NOT EXISTS idx_scheduled_escalations_user_id ON scheduled_escalations(user_id);
CREATE INDEX IF NOT EXISTS idx_scheduled_escalations_scheduled ON scheduled_escalations(user_id, scheduled_for);
CREATE INDEX IF NOT EXISTS idx_influence_attempts_user_id ON influence_attempts(user_id);
CREATE INDEX IF NOT EXISTS idx_influence_attempts_timestamp ON influence_attempts(user_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_resistance_patterns_user_id ON resistance_patterns(user_id);
CREATE INDEX IF NOT EXISTS idx_handler_daily_plans_user_date ON handler_daily_plans(user_id, plan_date);
CREATE INDEX IF NOT EXISTS idx_handler_user_model_user_id ON handler_user_model(user_id);
CREATE INDEX IF NOT EXISTS idx_handler_escalation_plans_user_id ON handler_escalation_plans(user_id);
CREATE INDEX IF NOT EXISTS idx_handler_escalation_plans_domain ON handler_escalation_plans(user_id, domain);
CREATE INDEX IF NOT EXISTS idx_arousal_commitment_extractions_user_id ON arousal_commitment_extractions(user_id);
CREATE INDEX IF NOT EXISTS idx_arousal_commitment_extractions_session ON arousal_commitment_extractions(session_id);
CREATE INDEX IF NOT EXISTS idx_escalation_experiments_user_id ON escalation_experiments(user_id);
