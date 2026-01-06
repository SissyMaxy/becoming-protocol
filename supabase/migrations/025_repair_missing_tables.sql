-- Migration 025: Repair Missing Tables
-- This migration recreates tables that were marked as applied but don't exist
-- Uses CREATE TABLE IF NOT EXISTS to be idempotent

-- ============================================
-- FROM MIGRATION 002: ESCALATION TABLES
-- ============================================

CREATE TABLE IF NOT EXISTS escalation_state (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  domain TEXT NOT NULL,
  current_level INTEGER DEFAULT 0,
  current_description TEXT,
  next_level_description TEXT,
  last_escalation_date TIMESTAMPTZ,
  escalation_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, domain)
);

CREATE TABLE IF NOT EXISTS escalation_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  domain TEXT NOT NULL,
  from_level INTEGER,
  to_level INTEGER,
  description TEXT,
  trigger_method TEXT,
  arousal_level_at_commitment INTEGER,
  resistance_encountered BOOLEAN DEFAULT FALSE,
  resistance_bypassed BOOLEAN,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS boundary_dissolution (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  boundary_description TEXT NOT NULL,
  domain TEXT,
  first_identified TIMESTAMPTZ DEFAULT NOW(),
  dissolution_started TIMESTAMPTZ,
  dissolution_completed TIMESTAMPTZ,
  method TEXT,
  now_baseline BOOLEAN DEFAULT FALSE,
  notes TEXT
);

CREATE TABLE IF NOT EXISTS service_progression (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  stage TEXT NOT NULL,
  entered_at TIMESTAMPTZ DEFAULT NOW(),
  activities JSONB DEFAULT '[]',
  comfort_level INTEGER,
  arousal_association INTEGER,
  notes TEXT
);

CREATE TABLE IF NOT EXISTS service_encounters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  encounter_type TEXT,
  date TIMESTAMPTZ DEFAULT NOW(),
  description TEXT,
  gina_aware BOOLEAN DEFAULT FALSE,
  gina_directed BOOLEAN DEFAULT FALSE,
  activities JSONB DEFAULT '[]',
  psychological_impact TEXT,
  escalation_effect TEXT,
  arousal_level INTEGER
);

CREATE TABLE IF NOT EXISTS content_escalation (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  content_type TEXT NOT NULL,
  theme TEXT NOT NULL,
  intensity_level INTEGER,
  first_exposure TIMESTAMPTZ DEFAULT NOW(),
  exposure_count INTEGER DEFAULT 1,
  current_response TEXT,
  next_intensity_target INTEGER,
  notes TEXT
);

-- ============================================
-- FROM MIGRATION 003: HANDLER TABLES
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
  status TEXT DEFAULT 'planting'
);

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
-- FROM MIGRATION 009: AROUSAL PLANNER TABLES
-- ============================================

CREATE TABLE IF NOT EXISTS daily_arousal_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  plan_date DATE NOT NULL,
  generated_at TIMESTAMPTZ DEFAULT NOW(),
  arousal_state_at_generation TEXT NOT NULL DEFAULT 'baseline',
  denial_day_at_generation INTEGER NOT NULL DEFAULT 0,
  chastity_locked_at_generation BOOLEAN DEFAULT FALSE,
  plan_intensity TEXT NOT NULL DEFAULT 'moderate',
  total_target_edges INTEGER DEFAULT 0,
  total_target_duration_minutes INTEGER DEFAULT 0,
  check_in_times JSONB DEFAULT '[]',
  check_ins_completed INTEGER DEFAULT 0,
  check_ins_total INTEGER DEFAULT 3,
  status TEXT DEFAULT 'active',
  completion_percentage INTEGER DEFAULT 0,
  edges_achieved INTEGER DEFAULT 0,
  state_at_end_of_day TEXT,
  notes TEXT,
  current_arousal_level INTEGER DEFAULT 5 CHECK (current_arousal_level >= 1 AND current_arousal_level <= 10),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, plan_date)
);

CREATE TABLE IF NOT EXISTS planned_edge_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id UUID REFERENCES daily_arousal_plans ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users NOT NULL,
  scheduled_time TIME NOT NULL,
  scheduled_date DATE NOT NULL,
  time_block TEXT NOT NULL,
  session_type TEXT NOT NULL DEFAULT 'edge_training',
  target_edges INTEGER DEFAULT 3,
  target_duration_minutes INTEGER DEFAULT 15,
  intensity_level TEXT DEFAULT 'moderate',
  recommended_patterns JSONB DEFAULT '[]',
  affirmation_focus TEXT,
  special_instructions TEXT,
  status TEXT DEFAULT 'scheduled',
  actual_session_id UUID,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  actual_edges INTEGER,
  actual_duration_minutes INTEGER,
  post_session_state TEXT,
  satisfaction_rating INTEGER CHECK (satisfaction_rating >= 1 AND satisfaction_rating <= 5),
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS arousal_check_ins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id UUID REFERENCES daily_arousal_plans ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users NOT NULL,
  scheduled_time TIME NOT NULL,
  scheduled_date DATE NOT NULL,
  check_in_type TEXT NOT NULL,
  status TEXT DEFAULT 'scheduled',
  completed_at TIMESTAMPTZ,
  arousal_level INTEGER CHECK (arousal_level >= 1 AND arousal_level <= 10),
  aching_intensity INTEGER CHECK (aching_intensity >= 1 AND aching_intensity <= 10),
  physical_signs JSONB DEFAULT '[]',
  state_reported TEXT,
  notes TEXT,
  prompted_at TIMESTAMPTZ,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS chastity_milestones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id UUID REFERENCES daily_arousal_plans ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users NOT NULL,
  milestone_type TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  target_value INTEGER,
  target_state TEXT,
  deadline_time TIME,
  unlock_condition TEXT,
  status TEXT DEFAULT 'pending',
  current_value INTEGER DEFAULT 0,
  achieved_at TIMESTAMPTZ,
  points_value INTEGER DEFAULT 10,
  achievement_unlocked TEXT,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- ENABLE RLS ON ALL TABLES
-- ============================================

ALTER TABLE escalation_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE escalation_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE boundary_dissolution ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_progression ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_encounters ENABLE ROW LEVEL SECURITY;
ALTER TABLE content_escalation ENABLE ROW LEVEL SECURITY;
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
ALTER TABLE daily_arousal_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE planned_edge_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE arousal_check_ins ENABLE ROW LEVEL SECURITY;
ALTER TABLE chastity_milestones ENABLE ROW LEVEL SECURITY;

-- ============================================
-- RLS POLICIES (FOR ALL operations)
-- ============================================

DROP POLICY IF EXISTS "Users access own escalation_state" ON escalation_state;
CREATE POLICY "Users access own escalation_state" ON escalation_state FOR ALL USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users access own escalation_events" ON escalation_events;
CREATE POLICY "Users access own escalation_events" ON escalation_events FOR ALL USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users access own boundary_dissolution" ON boundary_dissolution;
CREATE POLICY "Users access own boundary_dissolution" ON boundary_dissolution FOR ALL USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users access own service_progression" ON service_progression;
CREATE POLICY "Users access own service_progression" ON service_progression FOR ALL USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users access own service_encounters" ON service_encounters;
CREATE POLICY "Users access own service_encounters" ON service_encounters FOR ALL USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users access own content_escalation" ON content_escalation;
CREATE POLICY "Users access own content_escalation" ON content_escalation FOR ALL USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users access own handler_strategies" ON handler_strategies;
CREATE POLICY "Users access own handler_strategies" ON handler_strategies FOR ALL USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users access own planted_triggers" ON planted_triggers;
CREATE POLICY "Users access own planted_triggers" ON planted_triggers FOR ALL USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users access own handler_experiments" ON handler_experiments;
CREATE POLICY "Users access own handler_experiments" ON handler_experiments FOR ALL USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users access own learned_vulnerabilities" ON learned_vulnerabilities;
CREATE POLICY "Users access own learned_vulnerabilities" ON learned_vulnerabilities FOR ALL USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users access own scheduled_escalations" ON scheduled_escalations;
CREATE POLICY "Users access own scheduled_escalations" ON scheduled_escalations FOR ALL USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users access own influence_attempts" ON influence_attempts;
CREATE POLICY "Users access own influence_attempts" ON influence_attempts FOR ALL USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users access own resistance_patterns" ON resistance_patterns;
CREATE POLICY "Users access own resistance_patterns" ON resistance_patterns FOR ALL USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users access own handler_daily_plans" ON handler_daily_plans;
CREATE POLICY "Users access own handler_daily_plans" ON handler_daily_plans FOR ALL USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users access own handler_user_model" ON handler_user_model;
CREATE POLICY "Users access own handler_user_model" ON handler_user_model FOR ALL USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users access own handler_escalation_plans" ON handler_escalation_plans;
CREATE POLICY "Users access own handler_escalation_plans" ON handler_escalation_plans FOR ALL USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users access own arousal_commitment_extractions" ON arousal_commitment_extractions;
CREATE POLICY "Users access own arousal_commitment_extractions" ON arousal_commitment_extractions FOR ALL USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users access own escalation_experiments" ON escalation_experiments;
CREATE POLICY "Users access own escalation_experiments" ON escalation_experiments FOR ALL USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users access own daily_arousal_plans" ON daily_arousal_plans;
CREATE POLICY "Users access own daily_arousal_plans" ON daily_arousal_plans FOR ALL USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users access own planned_edge_sessions" ON planned_edge_sessions;
CREATE POLICY "Users access own planned_edge_sessions" ON planned_edge_sessions FOR ALL USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users access own arousal_check_ins" ON arousal_check_ins;
CREATE POLICY "Users access own arousal_check_ins" ON arousal_check_ins FOR ALL USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users access own chastity_milestones" ON chastity_milestones;
CREATE POLICY "Users access own chastity_milestones" ON chastity_milestones FOR ALL USING (auth.uid() = user_id);

-- ============================================
-- INDEXES
-- ============================================

CREATE INDEX IF NOT EXISTS idx_escalation_state_user_id ON escalation_state(user_id);
CREATE INDEX IF NOT EXISTS idx_service_progression_user_id ON service_progression(user_id);
CREATE INDEX IF NOT EXISTS idx_handler_daily_plans_user_date ON handler_daily_plans(user_id, plan_date);
CREATE INDEX IF NOT EXISTS idx_handler_user_model_user_id ON handler_user_model(user_id);
CREATE INDEX IF NOT EXISTS idx_daily_plans_user_date ON daily_arousal_plans(user_id, plan_date);
CREATE INDEX IF NOT EXISTS idx_influence_attempts_user_id ON influence_attempts(user_id);
CREATE INDEX IF NOT EXISTS idx_learned_vulnerabilities_user_id ON learned_vulnerabilities(user_id);

-- ============================================
-- GRANT PERMISSIONS
-- ============================================

GRANT USAGE ON SCHEMA public TO authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO authenticated;

