-- ============================================
-- Infinite Escalation System
-- AI-generated levels 6+ with no ceiling,
-- domain dependencies, dynamic difficulty
-- ============================================

-- Dynamic levels: Handler-generated level definitions beyond CSV ceiling
CREATE TABLE IF NOT EXISTS dynamic_levels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) NOT NULL,
  domain text NOT NULL,
  level integer NOT NULL CHECK (level >= 6),
  title text NOT NULL,
  description text NOT NULL,
  entry_requirements jsonb NOT NULL DEFAULT '{}',
  task_templates jsonb NOT NULL DEFAULT '[]',
  intensity_floor numeric NOT NULL,
  intensity_ceiling numeric,
  estimated_duration_days integer,
  dependency_domains jsonb DEFAULT '[]',
  escalation_triggers jsonb DEFAULT '[]',
  generated_by text DEFAULT 'handler' CHECK (generated_by IN ('handler', 'manual', 'system')),
  generated_at timestamptz DEFAULT now(),
  active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, domain, level)
);

-- Domain escalation state: per-user per-domain progression tracking
CREATE TABLE IF NOT EXISTS domain_escalation_state (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) NOT NULL,
  domain text NOT NULL,
  current_level integer NOT NULL DEFAULT 1,
  tasks_completed_at_current integer DEFAULT 0,
  tasks_completed_total integer DEFAULT 0,
  current_intensity_avg numeric DEFAULT 0,
  peak_intensity_reached numeric DEFAULT 0,
  level_entered_at timestamptz DEFAULT now(),
  time_at_current_level interval,
  advancement_blocked_by jsonb DEFAULT '[]',
  advancement_ready boolean DEFAULT false,
  last_assessment_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id, domain)
);

-- Escalation events: level advancement history
CREATE TABLE IF NOT EXISTS escalation_advancement_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) NOT NULL,
  domain text NOT NULL,
  from_level integer NOT NULL,
  to_level integer NOT NULL,
  trigger_reason text NOT NULL,
  tasks_completed_at_previous integer,
  intensity_at_advancement numeric,
  arousal_at_advancement integer,
  denial_day_at_advancement integer,
  handler_initiated boolean DEFAULT false,
  dependency_state jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);

-- Domain dependencies: cross-domain level requirements
CREATE TABLE IF NOT EXISTS domain_dependencies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) NOT NULL,
  domain text NOT NULL,
  required_level integer NOT NULL,
  depends_on_domain text NOT NULL,
  depends_on_level integer NOT NULL,
  rationale text,
  handler_generated boolean DEFAULT true,
  active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, domain, required_level, depends_on_domain)
);

-- ============================================
-- RLS
-- ============================================

ALTER TABLE dynamic_levels ENABLE ROW LEVEL SECURITY;
ALTER TABLE domain_escalation_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE escalation_advancement_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE domain_dependencies ENABLE ROW LEVEL SECURITY;

-- dynamic_levels
CREATE POLICY "Users can view own dynamic levels"
  ON dynamic_levels FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own dynamic levels"
  ON dynamic_levels FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own dynamic levels"
  ON dynamic_levels FOR UPDATE
  USING (auth.uid() = user_id);

-- domain_escalation_state
CREATE POLICY "Users can view own escalation state"
  ON domain_escalation_state FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own escalation state"
  ON domain_escalation_state FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own escalation state"
  ON domain_escalation_state FOR UPDATE
  USING (auth.uid() = user_id);

-- escalation_advancement_events
CREATE POLICY "Users can view own escalation events"
  ON escalation_advancement_events FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own escalation events"
  ON escalation_advancement_events FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- domain_dependencies
CREATE POLICY "Users can view own domain dependencies"
  ON domain_dependencies FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own domain dependencies"
  ON domain_dependencies FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own domain dependencies"
  ON domain_dependencies FOR UPDATE
  USING (auth.uid() = user_id);

-- ============================================
-- INDEXES
-- ============================================

CREATE INDEX idx_dynamic_levels_user_domain_level
  ON dynamic_levels(user_id, domain, level);

CREATE INDEX idx_dynamic_levels_user_active
  ON dynamic_levels(user_id, active);

CREATE INDEX idx_domain_escalation_state_user_domain
  ON domain_escalation_state(user_id, domain);

CREATE INDEX idx_domain_escalation_state_user_ready
  ON domain_escalation_state(user_id, advancement_ready);

CREATE INDEX idx_escalation_advancement_events_user_created
  ON escalation_advancement_events(user_id, created_at);

CREATE INDEX idx_domain_dependencies_user_domain_level
  ON domain_dependencies(user_id, domain, required_level);

-- ============================================
-- VIEWS
-- ============================================

-- Per-user per-domain escalation overview
CREATE OR REPLACE VIEW escalation_overview AS
SELECT
  des.user_id,
  des.domain,
  des.current_level,
  des.tasks_completed_at_current,
  des.tasks_completed_total,
  des.peak_intensity_reached,
  des.advancement_ready,
  EXTRACT(EPOCH FROM age(now(), des.level_entered_at)) / 86400 AS days_at_current_level,
  EXISTS (
    SELECT 1 FROM dynamic_levels dl
    WHERE dl.user_id = des.user_id
      AND dl.domain = des.domain
      AND dl.level > des.current_level
      AND dl.active = true
  ) AS has_dynamic_levels,
  EXISTS (
    SELECT 1 FROM dynamic_levels dl
    WHERE dl.user_id = des.user_id
      AND dl.domain = des.domain
      AND dl.level = des.current_level + 1
      AND dl.active = true
  ) AS next_level_exists
FROM domain_escalation_state des;

-- Cross-domain aggregate status per user
CREATE OR REPLACE VIEW cross_domain_status AS
SELECT
  user_id,
  ROUND(AVG(current_level)::numeric, 1) AS overall_average_level,
  MIN(current_level) AS lowest_level,
  MAX(current_level) AS highest_level,
  COUNT(*) FILTER (WHERE advancement_ready = true) AS domains_at_max,
  COUNT(*) AS total_domains
FROM domain_escalation_state
GROUP BY user_id;
