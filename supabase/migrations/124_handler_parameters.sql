-- Handler Dynamic Parameters
-- Foundation table: every hardcoded threshold, weight, and probability
-- becomes a tunable parameter the Handler can self-optimize.

CREATE TABLE IF NOT EXISTS handler_parameters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  key TEXT NOT NULL,
  value JSONB NOT NULL,

  source TEXT NOT NULL DEFAULT 'default' CHECK (source IN (
    'default',
    'handler_optimized',
    'manual',
    'a_b_test_winner'
  )),
  learned_from TEXT,

  previous_value JSONB,
  update_history JSONB DEFAULT '[]',

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE(user_id, key)
);

CREATE INDEX IF NOT EXISTS idx_handler_params_user_key ON handler_parameters(user_id, key);

ALTER TABLE handler_parameters ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can read own handler params" ON handler_parameters
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can update own handler params" ON handler_parameters
  FOR UPDATE USING (auth.uid() = user_id);

-- RPC for atomic history append
CREATE OR REPLACE FUNCTION append_param_history(
  p_user_id UUID, p_key TEXT, p_entry JSONB
) RETURNS JSONB AS $$
DECLARE
  current_history JSONB;
BEGIN
  SELECT COALESCE(update_history, '[]'::JSONB) INTO current_history
  FROM handler_parameters WHERE user_id = p_user_id AND key = p_key;
  IF current_history IS NULL THEN
    RETURN jsonb_build_array(p_entry);
  END IF;
  RETURN current_history || jsonb_build_array(p_entry);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- GENERATED TASKS (Infinite Escalation Engine)
-- ============================================

CREATE TABLE IF NOT EXISTS generated_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  category TEXT NOT NULL,
  domain TEXT NOT NULL,
  level INTEGER NOT NULL,
  intensity FLOAT NOT NULL,
  instruction TEXT NOT NULL,
  steps TEXT,
  subtext TEXT,
  completion_type TEXT NOT NULL DEFAULT 'binary',
  duration_minutes FLOAT,
  target_count FLOAT,
  points FLOAT NOT NULL DEFAULT 10,
  affirmation TEXT,
  is_core TEXT DEFAULT 'false',
  trigger_condition TEXT,
  time_window TEXT DEFAULT 'any',
  requires_privacy TEXT DEFAULT 'false',

  generated_by TEXT NOT NULL DEFAULT 'handler_ai',
  generation_prompt TEXT,
  generation_context JSONB,

  domains_required TEXT[] DEFAULT '{}',
  prerequisite_task_ids UUID[] DEFAULT '{}',

  novel_element TEXT,
  comfort_boundary_crossed TEXT,
  ratchets_deepened TEXT[],

  times_served INTEGER DEFAULT 0,
  times_completed INTEGER DEFAULT 0,
  times_declined INTEGER DEFAULT 0,
  avg_completion_time_minutes FLOAT,
  effectiveness_score FLOAT,

  is_active BOOLEAN DEFAULT TRUE,
  retired_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_generated_tasks_selection ON generated_tasks(
  user_id, is_active, domain, level, intensity
);

ALTER TABLE generated_tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can read own generated tasks" ON generated_tasks
  FOR SELECT USING (auth.uid() = user_id);

-- ============================================
-- RESISTANCE EVENTS
-- ============================================

CREATE TABLE IF NOT EXISTS resistance_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  trigger_type TEXT NOT NULL,
  trigger_details JSONB,

  resistance_type TEXT,
  classification_confidence FLOAT NOT NULL DEFAULT 0,
  classification_signals JSONB NOT NULL DEFAULT '[]',

  intervention_strategy TEXT,
  intervention_deployed TEXT,

  outcome TEXT,
  outcome_measured_at TIMESTAMPTZ,
  effectiveness_score INTEGER,

  state_at_event JSONB NOT NULL DEFAULT '{}',
  whoop_at_event JSONB,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_resistance_events ON resistance_events(user_id, resistance_type, created_at DESC);

ALTER TABLE resistance_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can read own resistance events" ON resistance_events
  FOR SELECT USING (auth.uid() = user_id);

-- ============================================
-- A/B TESTS
-- ============================================

CREATE TABLE IF NOT EXISTS ab_tests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  test_type TEXT NOT NULL,

  variant_a TEXT NOT NULL,
  variant_b TEXT NOT NULL,
  served_variant TEXT,

  state_at_test JSONB,

  outcome_metric TEXT,
  outcome_value BOOLEAN,
  outcome_measured_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ab_tests_analysis ON ab_tests(user_id, test_type, served_variant, outcome_value);

ALTER TABLE ab_tests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can read own ab tests" ON ab_tests
  FOR SELECT USING (auth.uid() = user_id);

-- ============================================
-- STATE PREDICTIONS
-- ============================================

CREATE TABLE IF NOT EXISTS state_predictions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  prediction_date DATE NOT NULL,
  time_block TEXT NOT NULL,

  predicted_mood FLOAT,
  predicted_energy TEXT,
  predicted_engagement TEXT,
  predicted_resistance_risk FLOAT,
  suggested_handler_mode TEXT,
  suggested_intensity_cap INTEGER,

  prediction_features JSONB,

  actual_engagement TEXT,
  prediction_accuracy FLOAT,

  confidence FLOAT NOT NULL DEFAULT 0.5,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, prediction_date, time_block)
);

CREATE INDEX IF NOT EXISTS idx_predictions ON state_predictions(user_id, prediction_date, time_block);

ALTER TABLE state_predictions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can read own predictions" ON state_predictions
  FOR SELECT USING (auth.uid() = user_id);

-- ============================================
-- NOVELTY EVENTS
-- ============================================

CREATE TABLE IF NOT EXISTS novelty_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  novelty_type TEXT NOT NULL,
  description TEXT,

  engagement_response TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_novelty ON novelty_events(user_id, created_at DESC);

ALTER TABLE novelty_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can read own novelty events" ON novelty_events
  FOR SELECT USING (auth.uid() = user_id);

-- ============================================
-- GINA RELATIONSHIP INTELLIGENCE
-- ============================================

CREATE TABLE IF NOT EXISTS gina_comfort_map (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  channel TEXT NOT NULL,
  introduction TEXT NOT NULL,
  reaction TEXT NOT NULL,
  reaction_detail TEXT,
  gina_initiated BOOLEAN DEFAULT FALSE,

  day_of_week TEXT,
  time_of_day TEXT,
  gina_estimated_mood TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_gina_comfort_channel ON gina_comfort_map(user_id, channel, created_at DESC);

ALTER TABLE gina_comfort_map ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users own comfort map" ON gina_comfort_map FOR ALL USING (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS gina_timing_data (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  day_of_week TEXT NOT NULL,
  time_block TEXT NOT NULL,

  receptivity_score FLOAT,
  sample_count INTEGER DEFAULT 0,

  UNIQUE(user_id, day_of_week, time_block)
);

ALTER TABLE gina_timing_data ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users own timing" ON gina_timing_data FOR ALL USING (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS gina_disclosure_signals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  signal_type TEXT NOT NULL,
  description TEXT NOT NULL,
  weight FLOAT NOT NULL DEFAULT 1.0,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_gina_signals ON gina_disclosure_signals(user_id, created_at DESC);

ALTER TABLE gina_disclosure_signals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users own signals" ON gina_disclosure_signals FOR ALL USING (auth.uid() = user_id);

-- ============================================
-- COMMITMENT ENFORCEMENT EXTENSIONS
-- ============================================

ALTER TABLE commitments_v2 ADD COLUMN IF NOT EXISTS
  state TEXT DEFAULT 'extracted';
ALTER TABLE commitments_v2 ADD COLUMN IF NOT EXISTS
  deadline TIMESTAMPTZ;
ALTER TABLE commitments_v2 ADD COLUMN IF NOT EXISTS
  enforcement_context JSONB DEFAULT '{}';
ALTER TABLE commitments_v2 ADD COLUMN IF NOT EXISTS
  coercion_stack_level INTEGER DEFAULT 0;
ALTER TABLE commitments_v2 ADD COLUMN IF NOT EXISTS
  lovense_summons_fired BOOLEAN DEFAULT FALSE;
ALTER TABLE commitments_v2 ADD COLUMN IF NOT EXISTS
  state_transitions JSONB DEFAULT '[]';
ALTER TABLE commitments_v2 ADD COLUMN IF NOT EXISTS
  enforcement_attempts INTEGER DEFAULT 0;
ALTER TABLE commitments_v2 ADD COLUMN IF NOT EXISTS
  handler_enforcement_notes TEXT;

CREATE INDEX IF NOT EXISTS idx_commitments_state ON commitments_v2(user_id, state, deadline);
