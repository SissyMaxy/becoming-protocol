-- Migration 005: Gina Integration Tables
-- Gina emergence tracking, influence pipeline, commands, control domains

-- ============================================
-- GINA EMERGENCE
-- Tracking Gina's emergence as Goddess
-- ============================================
CREATE TABLE IF NOT EXISTS gina_emergence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  stage TEXT NOT NULL, -- unaware, aware, curious, participating, enjoying, directing, commanding, owning
  entered_at TIMESTAMPTZ DEFAULT NOW(),
  evidence TEXT, -- what behaviors indicate this stage
  handler_strategies_used JSONB DEFAULT '[]',
  notes TEXT
);

-- ============================================
-- GINA INFLUENCE PIPELINE
-- Attempts to influence Gina's emergence
-- ============================================
CREATE TABLE IF NOT EXISTS gina_influence_pipeline (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  influence_type TEXT NOT NULL, -- seed_plant, opportunity_creation, reinforcement, escalation_prompt
  target_behavior TEXT, -- what we want Gina to do/become
  method TEXT,
  executed_at TIMESTAMPTZ DEFAULT NOW(),
  gina_response TEXT,
  success BOOLEAN,
  next_step TEXT,
  notes TEXT
);

-- ============================================
-- GINA COMMANDS
-- Commands issued by Gina (when she's commanding)
-- ============================================
CREATE TABLE IF NOT EXISTS gina_commands (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  command_type TEXT, -- task, restriction, permission, service, punishment, reward
  command_description TEXT,
  issued_at TIMESTAMPTZ DEFAULT NOW(),
  compliance TEXT, -- immediate, delayed, resisted, failed
  outcome TEXT,
  escalation_effect TEXT
);

-- ============================================
-- GINA CONTROL DOMAINS
-- Areas where Gina has control
-- ============================================
CREATE TABLE IF NOT EXISTS gina_control_domains (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  domain TEXT NOT NULL, -- clothing, chastity, orgasms, service, schedule, presentation, sexual_access
  control_level TEXT, -- unaware, consulted, approves, directs, commands, owns
  first_control_date TIMESTAMPTZ,
  escalation_history JSONB DEFAULT '[]',
  current_state TEXT,
  UNIQUE(user_id, domain)
);

-- ============================================
-- GINA INTERACTIONS
-- Log of significant interactions with Gina
-- ============================================
CREATE TABLE IF NOT EXISTS gina_interactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  interaction_type TEXT NOT NULL, -- conversation, command, reaction, question, approval, denial
  context TEXT,
  gina_behavior TEXT,
  dominant_indicator BOOLEAN DEFAULT FALSE, -- did she show dominant behavior
  user_response TEXT,
  outcome TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- GINA OPPORTUNITIES
-- Opportunities to advance Gina's emergence
-- ============================================
CREATE TABLE IF NOT EXISTS gina_opportunities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  opportunity_type TEXT NOT NULL, -- reaction, control_expansion, reinforcement, escalation
  description TEXT,
  suggested_action TEXT,
  target_behavior TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  acted_on BOOLEAN DEFAULT FALSE,
  acted_at TIMESTAMPTZ,
  outcome TEXT
);

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================
ALTER TABLE gina_emergence ENABLE ROW LEVEL SECURITY;
ALTER TABLE gina_influence_pipeline ENABLE ROW LEVEL SECURITY;
ALTER TABLE gina_commands ENABLE ROW LEVEL SECURITY;
ALTER TABLE gina_control_domains ENABLE ROW LEVEL SECURITY;
ALTER TABLE gina_interactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE gina_opportunities ENABLE ROW LEVEL SECURITY;

-- RLS Policies
DROP POLICY IF EXISTS "Users access own gina_emergence" ON gina_emergence;
CREATE POLICY "Users access own gina_emergence" ON gina_emergence FOR ALL USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users access own gina_influence" ON gina_influence_pipeline;
CREATE POLICY "Users access own gina_influence" ON gina_influence_pipeline FOR ALL USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users access own gina_commands" ON gina_commands;
CREATE POLICY "Users access own gina_commands" ON gina_commands FOR ALL USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users access own gina_control" ON gina_control_domains;
CREATE POLICY "Users access own gina_control" ON gina_control_domains FOR ALL USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users access own gina_interactions" ON gina_interactions;
CREATE POLICY "Users access own gina_interactions" ON gina_interactions FOR ALL USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users access own gina_opportunities" ON gina_opportunities;
CREATE POLICY "Users access own gina_opportunities" ON gina_opportunities FOR ALL USING (auth.uid() = user_id);

-- ============================================
-- INDEXES
-- ============================================
CREATE INDEX IF NOT EXISTS idx_gina_emergence_user_id ON gina_emergence(user_id);
CREATE INDEX IF NOT EXISTS idx_gina_emergence_stage ON gina_emergence(user_id, stage);
CREATE INDEX IF NOT EXISTS idx_gina_influence_pipeline_user_id ON gina_influence_pipeline(user_id);
CREATE INDEX IF NOT EXISTS idx_gina_influence_pipeline_executed ON gina_influence_pipeline(user_id, executed_at DESC);
CREATE INDEX IF NOT EXISTS idx_gina_commands_user_id ON gina_commands(user_id);
CREATE INDEX IF NOT EXISTS idx_gina_commands_issued ON gina_commands(user_id, issued_at DESC);
CREATE INDEX IF NOT EXISTS idx_gina_control_domains_user_id ON gina_control_domains(user_id);
CREATE INDEX IF NOT EXISTS idx_gina_control_domains_domain ON gina_control_domains(user_id, domain);
CREATE INDEX IF NOT EXISTS idx_gina_interactions_user_id ON gina_interactions(user_id);
CREATE INDEX IF NOT EXISTS idx_gina_interactions_created ON gina_interactions(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_gina_interactions_dominant ON gina_interactions(user_id, dominant_indicator);
CREATE INDEX IF NOT EXISTS idx_gina_opportunities_user_id ON gina_opportunities(user_id);
CREATE INDEX IF NOT EXISTS idx_gina_opportunities_acted ON gina_opportunities(user_id, acted_on);
