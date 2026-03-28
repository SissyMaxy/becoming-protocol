-- Migration 145: Handler Impact Tracking
-- Tracks correlations between Handler interventions and Maxy's behavioral responses
-- so the Handler learns which approaches work best over time.

-- ============================================
-- TABLE: handler_interventions
-- Every discrete Handler action recorded with full context
-- ============================================

CREATE TABLE IF NOT EXISTS handler_interventions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- What the Handler did
  intervention_type TEXT NOT NULL CHECK (intervention_type IN (
    'task_assignment',
    'resistance_push',
    'comfort',
    'escalation',
    'de_escalation',
    'trigger_deployment',
    'commitment_extraction',
    'confrontation',
    'praise',
    'denial_extension',
    'content_prescription',
    'session_initiation',
    'boundary_test',
    'reframe',
    'silence'
  )),

  -- Context
  handler_mode TEXT,
  conversation_id UUID,
  message_index INTEGER,
  intervention_detail TEXT,

  -- State at time of intervention
  denial_day INTEGER,
  arousal_level INTEGER,
  streak_days INTEGER,
  exec_function TEXT,
  resistance_detected BOOLEAN DEFAULT FALSE,
  vulnerability_window BOOLEAN DEFAULT FALSE,

  -- Whoop biometrics at intervention time (if available)
  whoop_strain NUMERIC,
  whoop_avg_hr INTEGER,
  whoop_recovery_score INTEGER,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================
-- TABLE: intervention_outcomes
-- Behavioral changes observed after an intervention
-- ============================================

CREATE TABLE IF NOT EXISTS intervention_outcomes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  intervention_id UUID NOT NULL REFERENCES handler_interventions(id) ON DELETE CASCADE,

  -- What changed
  outcome_type TEXT NOT NULL CHECK (outcome_type IN (
    'compliance_shift',
    'arousal_shift',
    'resistance_change',
    'pattern_break',
    'confession',
    'commitment_honored',
    'commitment_broken',
    'mood_shift',
    'streak_maintained',
    'streak_broken',
    'session_completed',
    'session_refused',
    'depth_achieved',
    'trigger_response',
    'behavioral_change',
    'no_change'
  )),

  -- Measurement
  direction TEXT CHECK (direction IN ('positive', 'negative', 'neutral')),
  magnitude FLOAT,

  -- Detail
  description TEXT,
  evidence TEXT,

  -- Timing
  latency_minutes INTEGER,

  measured_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================
-- TABLE: handler_effectiveness
-- Aggregated stats per intervention_type + handler_mode
-- ============================================

CREATE TABLE IF NOT EXISTS handler_effectiveness (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  intervention_type TEXT NOT NULL,
  handler_mode TEXT,

  -- Aggregated stats
  total_uses INTEGER DEFAULT 0,
  positive_outcomes INTEGER DEFAULT 0,
  negative_outcomes INTEGER DEFAULT 0,
  neutral_outcomes INTEGER DEFAULT 0,
  avg_magnitude FLOAT,
  avg_latency_minutes FLOAT,

  -- Context effectiveness (when this intervention works best)
  best_denial_range INT[],
  best_arousal_range INT[],
  best_with_resistance BOOLEAN,
  best_in_vulnerability BOOLEAN,

  last_computed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, intervention_type, handler_mode)
);

-- ============================================
-- INDEXES
-- ============================================

CREATE INDEX IF NOT EXISTS idx_handler_interventions_user_type_created
  ON handler_interventions (user_id, intervention_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_handler_interventions_user_conversation
  ON handler_interventions (user_id, conversation_id);

CREATE INDEX IF NOT EXISTS idx_intervention_outcomes_intervention
  ON intervention_outcomes (intervention_id);

CREATE INDEX IF NOT EXISTS idx_intervention_outcomes_user_type_measured
  ON intervention_outcomes (user_id, outcome_type, measured_at DESC);

CREATE INDEX IF NOT EXISTS idx_handler_effectiveness_user
  ON handler_effectiveness (user_id);

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================

ALTER TABLE handler_interventions ENABLE ROW LEVEL SECURITY;
ALTER TABLE intervention_outcomes ENABLE ROW LEVEL SECURITY;
ALTER TABLE handler_effectiveness ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own handler_interventions"
  ON handler_interventions FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can manage their own intervention_outcomes"
  ON intervention_outcomes FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can manage their own handler_effectiveness"
  ON handler_effectiveness FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
