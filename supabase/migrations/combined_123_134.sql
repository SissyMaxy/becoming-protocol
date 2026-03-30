-- ============================================================
-- COMBINED MIGRATIONS 123-134
-- Generated 2026-03-22
-- ============================================================
--
-- PREREQUISITES:
--   - pg_cron extension must be enabled (CREATE EXTENSION IF NOT EXISTS pg_cron)
--   - pg_net extension must be enabled (CREATE EXTENSION IF NOT EXISTS pg_net)
--   - app.settings.supabase_url and app.settings.service_role_key must be set
--   - commitments_v2 table must exist (referenced by migration 124)
--
-- Migrations 129, 130, 131, 132, 133 all call cron.schedule() + net.http_post().
-- If pg_cron or pg_net are not enabled, those statements will fail.
-- ============================================================

BEGIN;

-- ============================================================
-- MIGRATION 123: 123_whoop_integration.sql
-- ============================================================

-- Whoop Integration Tables
-- Stores OAuth tokens, daily metrics, and workout data

-- ============================================
-- WHOOP TOKENS
-- ============================================

CREATE TABLE IF NOT EXISTS whoop_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  scopes TEXT[] NOT NULL DEFAULT '{}',
  whoop_user_id INTEGER,
  connected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  disconnected_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id)
);

ALTER TABLE whoop_tokens ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can read own whoop tokens" ON whoop_tokens
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can update own whoop tokens" ON whoop_tokens
  FOR UPDATE USING (auth.uid() = user_id);

-- ============================================
-- WHOOP DAILY METRICS
-- ============================================

CREATE TABLE IF NOT EXISTS whoop_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date DATE NOT NULL,

  -- Recovery
  recovery_score INTEGER,
  hrv_rmssd_milli FLOAT,
  resting_heart_rate INTEGER,
  spo2_percentage FLOAT,
  skin_temp_celsius FLOAT,

  -- Sleep
  sleep_performance_percentage FLOAT,
  sleep_consistency_percentage FLOAT,
  sleep_efficiency_percentage FLOAT,
  total_sleep_duration_milli BIGINT,
  rem_sleep_milli BIGINT,
  deep_sleep_milli BIGINT,
  light_sleep_milli BIGINT,
  awake_milli BIGINT,
  disturbance_count INTEGER,
  respiratory_rate FLOAT,
  sleep_debt_milli BIGINT,

  -- Cycle / Day Strain
  day_strain FLOAT,
  day_kilojoule FLOAT,
  day_average_heart_rate INTEGER,
  day_max_heart_rate INTEGER,

  -- Body
  weight_kilogram FLOAT,

  -- Raw API responses for debugging
  raw_recovery JSONB,
  raw_sleep JSONB,
  raw_cycle JSONB,
  raw_workout JSONB,

  fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE(user_id, date)
);

CREATE INDEX IF NOT EXISTS idx_whoop_metrics_user_date ON whoop_metrics(user_id, date DESC);

ALTER TABLE whoop_metrics ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can read own whoop metrics" ON whoop_metrics
  FOR SELECT USING (auth.uid() = user_id);

-- ============================================
-- WHOOP WORKOUTS
-- ============================================

CREATE TABLE IF NOT EXISTS whoop_workouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  whoop_workout_id TEXT NOT NULL,
  date DATE NOT NULL,
  sport_name TEXT,
  sport_id INTEGER,
  strain FLOAT,
  average_heart_rate INTEGER,
  max_heart_rate INTEGER,
  kilojoule FLOAT,
  distance_meter FLOAT,
  duration_milli BIGINT,
  zone_zero_milli BIGINT,
  zone_one_milli BIGINT,
  zone_two_milli BIGINT,
  zone_three_milli BIGINT,
  zone_four_milli BIGINT,
  zone_five_milli BIGINT,
  raw_data JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, whoop_workout_id)
);

CREATE INDEX IF NOT EXISTS idx_whoop_workouts_user_date ON whoop_workouts(user_id, date DESC);

ALTER TABLE whoop_workouts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can read own whoop workouts" ON whoop_workouts
  FOR SELECT USING (auth.uid() = user_id);

-- ============================================================
-- MIGRATION 124: 124_handler_parameters.sql
-- ============================================================

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

-- ============================================================
-- MIGRATION 125: 125_content_distribution.sql
-- ============================================================

-- Content Distribution Pipeline Tables

CREATE TABLE IF NOT EXISTS content_vault (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  file_url TEXT NOT NULL,
  file_type TEXT NOT NULL,
  source TEXT NOT NULL,
  source_session_id UUID,
  explicitness_level INTEGER NOT NULL DEFAULT 1,
  content_tags TEXT[] DEFAULT '{}',
  approval_status TEXT NOT NULL DEFAULT 'pending',
  approved_at TIMESTAMPTZ,
  distribution_status TEXT DEFAULT 'undistributed',
  platforms_posted_to TEXT[] DEFAULT '{}',
  duration_seconds INTEGER,
  thumbnail_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_content_vault_status ON content_vault(user_id, approval_status, distribution_status);
ALTER TABLE content_vault ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users own vault" ON content_vault FOR ALL USING (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS content_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  vault_item_id UUID REFERENCES content_vault(id),
  platform TEXT NOT NULL,
  caption TEXT NOT NULL,
  hashtags TEXT[] DEFAULT '{}',
  subreddit TEXT,
  scheduled_at TIMESTAMPTZ NOT NULL,
  posted_at TIMESTAMPTZ,
  post_status TEXT NOT NULL DEFAULT 'scheduled',
  platform_post_id TEXT,
  platform_url TEXT,
  likes INTEGER DEFAULT 0,
  comments INTEGER DEFAULT 0,
  shares INTEGER DEFAULT 0,
  revenue_generated DECIMAL DEFAULT 0,
  engagement_fetched_at TIMESTAMPTZ,
  caption_variant TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_content_posts_schedule ON content_posts(user_id, post_status, scheduled_at);
ALTER TABLE content_posts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users own posts" ON content_posts FOR ALL USING (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS fan_interactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  platform TEXT NOT NULL,
  interaction_type TEXT NOT NULL,
  fan_identifier TEXT NOT NULL,
  fan_display_name TEXT,
  content TEXT NOT NULL,
  sentiment TEXT,
  response_status TEXT DEFAULT 'pending',
  response_text TEXT,
  responded_at TIMESTAMPTZ,
  briefing_worthy BOOLEAN DEFAULT FALSE,
  conditioning_aligned BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fan_interactions_pending ON fan_interactions(user_id, response_status);
ALTER TABLE fan_interactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users own interactions" ON fan_interactions FOR ALL USING (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS cam_highlights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id UUID,
  clip_url TEXT NOT NULL,
  start_time_seconds INTEGER NOT NULL,
  end_time_seconds INTEGER NOT NULL,
  highlight_type TEXT,
  tip_density FLOAT,
  lovense_intensity_avg FLOAT,
  vault_item_id UUID REFERENCES content_vault(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cam_highlights_session ON cam_highlights(user_id, session_id);
ALTER TABLE cam_highlights ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users own highlights" ON cam_highlights FOR ALL USING (auth.uid() = user_id);

-- ============================================================
-- MIGRATION 126: 126_conversational_handler.sql
-- ============================================================

-- Conversational Handler Tables

CREATE TABLE IF NOT EXISTS handler_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  conversation_type TEXT NOT NULL DEFAULT 'general',
  session_id UUID,
  session_type TEXT,
  state_snapshot JSONB NOT NULL DEFAULT '{}',
  whoop_snapshot JSONB,
  initial_mode TEXT,
  mode_transitions JSONB DEFAULT '[]',
  final_mode TEXT,
  coercion_stack_peak_level INTEGER DEFAULT 0,
  commitments_extracted JSONB DEFAULT '[]',
  confessions_captured JSONB DEFAULT '[]',
  memories_generated INTEGER DEFAULT 0,
  resistance_events JSONB DEFAULT '[]',
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  message_count INTEGER DEFAULT 0,
  handler_self_rating INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_conversations_user ON handler_conversations(user_id, started_at DESC);
ALTER TABLE handler_conversations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users own conversations" ON handler_conversations FOR ALL USING (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS handler_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES handler_conversations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  handler_signals JSONB,
  detected_mode TEXT,
  message_index INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_messages_conversation ON handler_messages(conversation_id, message_index);
ALTER TABLE handler_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users own messages" ON handler_messages FOR ALL USING (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS handler_outreach (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  trigger_type TEXT NOT NULL,
  opening_line TEXT NOT NULL,
  conversation_context JSONB,
  scheduled_at TIMESTAMPTZ NOT NULL,
  delivered_at TIMESTAMPTZ,
  opened_at TIMESTAMPTZ,
  conversation_id UUID REFERENCES handler_conversations(id),
  status TEXT DEFAULT 'scheduled',
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_outreach_user ON handler_outreach(user_id, status, scheduled_at);
ALTER TABLE handler_outreach ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users own outreach" ON handler_outreach FOR ALL USING (auth.uid() = user_id);

-- ============================================================
-- MIGRATION 127: 127_proactive_handler_systems.sql
-- ============================================================

-- Proactive Handler Systems Migration
-- Conditioning, HRT, Social, Shame, Revenue, David Elimination

-- ============================================
-- CONDITIONING PROTOCOL ENGINE
-- ============================================

CREATE TABLE IF NOT EXISTS conditioning_protocols (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  protocol_name TEXT NOT NULL,
  protocol_type TEXT NOT NULL,
  frequency TEXT NOT NULL,
  preferred_time TEXT,
  session_duration_minutes INTEGER NOT NULL,
  current_phase INTEGER DEFAULT 1,
  phase_config JSONB NOT NULL DEFAULT '[]',
  total_sessions_completed INTEGER DEFAULT 0,
  current_phase_sessions INTEGER DEFAULT 0,
  status TEXT DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_conditioning_protocols ON conditioning_protocols(user_id, status);
ALTER TABLE conditioning_protocols ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users own conditioning protocols" ON conditioning_protocols FOR ALL USING (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS conditioning_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  protocol_id UUID REFERENCES conditioning_protocols(id),
  session_type TEXT NOT NULL,
  phase INTEGER NOT NULL,
  hypno_content_ids TEXT[],
  affirmation_track TEXT,
  device_pattern TEXT,
  device_intensity INTEGER,
  environmental_preset TEXT,
  trance_channel BOOLEAN DEFAULT FALSE,
  arousal_channel BOOLEAN DEFAULT FALSE,
  identity_channel BOOLEAN DEFAULT FALSE,
  somatic_channel BOOLEAN DEFAULT FALSE,
  environmental_channel BOOLEAN DEFAULT FALSE,
  triggers_practiced TEXT[],
  trance_depth_reported INTEGER,
  arousal_peak INTEGER,
  trigger_response_observed JSONB,
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  duration_minutes INTEGER,
  denial_day INTEGER,
  whoop_recovery INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_conditioning_sessions ON conditioning_sessions(user_id, protocol_id, created_at DESC);
ALTER TABLE conditioning_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users own conditioning sessions" ON conditioning_sessions FOR ALL USING (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS conditioned_triggers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  trigger_phrase TEXT NOT NULL,
  trigger_type TEXT NOT NULL,
  intended_response TEXT NOT NULL,
  pairing_count INTEGER DEFAULT 0,
  autonomous_firing_count INTEGER DEFAULT 0,
  estimated_strength TEXT DEFAULT 'nascent',
  last_tested_at TIMESTAMPTZ,
  last_response_strength INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_conditioned_triggers ON conditioned_triggers(user_id, estimated_strength);
ALTER TABLE conditioned_triggers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users own conditioned triggers" ON conditioned_triggers FOR ALL USING (auth.uid() = user_id);

-- ============================================
-- HRT PIPELINE
-- ============================================

CREATE TABLE IF NOT EXISTS hrt_pipeline (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  stage TEXT NOT NULL DEFAULT 'pre_consideration',
  provider_name TEXT,
  provider_contact TEXT,
  next_appointment TIMESTAMPTZ,
  medication TEXT,
  dosage TEXT,
  frequency TEXT,
  start_date DATE,
  doses_taken INTEGER DEFAULT 0,
  doses_missed INTEGER DEFAULT 0,
  last_dose_at TIMESTAMPTZ,
  next_dose_at TIMESTAMPTZ,
  stage_history JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id)
);

ALTER TABLE hrt_pipeline ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users own hrt pipeline" ON hrt_pipeline FOR ALL USING (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS hrt_changes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  change_date DATE NOT NULL,
  weight_kg FLOAT,
  bust_cm FLOAT,
  waist_cm FLOAT,
  hip_cm FLOAT,
  skin_changes TEXT,
  breast_development TEXT,
  fat_redistribution TEXT,
  muscle_changes TEXT,
  hair_changes TEXT,
  emotional_changes TEXT,
  photo_urls TEXT[],
  handler_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_hrt_changes ON hrt_changes(user_id, change_date DESC);
ALTER TABLE hrt_changes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users own hrt changes" ON hrt_changes FOR ALL USING (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS hrt_doses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  medication TEXT NOT NULL,
  scheduled_at TIMESTAMPTZ NOT NULL,
  taken_at TIMESTAMPTZ,
  missed BOOLEAN DEFAULT FALSE,
  reminder_sent BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_hrt_doses ON hrt_doses(user_id, scheduled_at DESC);
ALTER TABLE hrt_doses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users own hrt doses" ON hrt_doses FOR ALL USING (auth.uid() = user_id);

-- ============================================
-- SOCIAL ESCALATION
-- ============================================

CREATE TABLE IF NOT EXISTS social_web (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  connection_name TEXT NOT NULL,
  platform TEXT NOT NULL,
  connection_type TEXT NOT NULL,
  thread_strength TEXT DEFAULT 'weak',
  interactions INTEGER DEFAULT 0,
  last_interaction_at TIMESTAMPTZ,
  handler_initiated BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_social_web ON social_web(user_id, thread_strength, connection_type);
ALTER TABLE social_web ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users own social web" ON social_web FOR ALL USING (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS collaboration_pipeline (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  target_creator TEXT NOT NULL,
  platform TEXT NOT NULL,
  stage TEXT DEFAULT 'identified',
  handler_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_collab_pipeline ON collaboration_pipeline(user_id, stage);
ALTER TABLE collaboration_pipeline ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users own collab pipeline" ON collaboration_pipeline FOR ALL USING (auth.uid() = user_id);

-- ============================================
-- SHAME ALCHEMY
-- ============================================

CREATE TABLE IF NOT EXISTS shame_architecture (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  shame_trigger TEXT NOT NULL,
  category TEXT NOT NULL,
  shame_type TEXT NOT NULL DEFAULT 'unknown',
  conversion_stage TEXT DEFAULT 'raw',
  exposure_count INTEGER DEFAULT 0,
  last_exposure_at TIMESTAMPTZ,
  last_exposure_outcome TEXT,
  arousal_pairing_count INTEGER DEFAULT 0,
  withdrawal_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_shame ON shame_architecture(user_id, shame_type, conversion_stage);
ALTER TABLE shame_architecture ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users own shame architecture" ON shame_architecture FOR ALL USING (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS shame_exposures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  shame_id UUID REFERENCES shame_architecture(id),
  exposure_type TEXT NOT NULL,
  arousal_at_exposure INTEGER,
  denial_day INTEGER,
  trance_depth INTEGER,
  device_active BOOLEAN,
  outcome TEXT,
  processing_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_shame_exposures ON shame_exposures(user_id, shame_id, created_at DESC);
ALTER TABLE shame_exposures ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users own shame exposures" ON shame_exposures FOR ALL USING (auth.uid() = user_id);

-- ============================================
-- REVENUE & CROSSOVER
-- ============================================

CREATE TABLE IF NOT EXISTS revenue_tracking (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  source TEXT NOT NULL,
  identity TEXT NOT NULL,
  gross_amount DECIMAL NOT NULL,
  net_amount DECIMAL,
  UNIQUE(user_id, date, source)
);

CREATE INDEX IF NOT EXISTS idx_revenue ON revenue_tracking(user_id, date DESC, identity);
ALTER TABLE revenue_tracking ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users own revenue" ON revenue_tracking FOR ALL USING (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS crossover_tracking (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  month DATE NOT NULL,
  maxy_revenue DECIMAL DEFAULT 0,
  david_revenue DECIMAL DEFAULT 0,
  maxy_growth_rate FLOAT,
  david_growth_rate FLOAT,
  projected_crossover_date DATE,
  UNIQUE(user_id, month)
);

CREATE INDEX IF NOT EXISTS idx_crossover ON crossover_tracking(user_id, month DESC);
ALTER TABLE crossover_tracking ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users own crossover" ON crossover_tracking FOR ALL USING (auth.uid() = user_id);

-- ============================================
-- DAVID ELIMINATION
-- ============================================

CREATE TABLE IF NOT EXISTS masculine_contexts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  context_name TEXT NOT NULL,
  category TEXT NOT NULL,
  current_presentation TEXT NOT NULL DEFAULT 'fully_masculine',
  current_infiltrations TEXT[] DEFAULT '{}',
  next_infiltration TEXT,
  last_assessed_at TIMESTAMPTZ,
  confidence_in_current_state FLOAT,
  hours_per_week FLOAT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_masculine_contexts ON masculine_contexts(user_id, current_presentation);
ALTER TABLE masculine_contexts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users own masculine contexts" ON masculine_contexts FOR ALL USING (auth.uid() = user_id);

-- ============================================
-- PHONE INTELLIGENCE
-- ============================================

CREATE TABLE IF NOT EXISTS language_monitoring (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  feminine_count INTEGER DEFAULT 0,
  masculine_count INTEGER DEFAULT 0,
  neutral_count INTEGER DEFAULT 0,
  masculine_instances JSONB DEFAULT '[]',
  feminine_ratio FLOAT,
  UNIQUE(user_id, date)
);

CREATE INDEX IF NOT EXISTS idx_language_monitoring ON language_monitoring(user_id, date DESC);
ALTER TABLE language_monitoring ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users own language monitoring" ON language_monitoring FOR ALL USING (auth.uid() = user_id);

-- ============================================================
-- MIGRATION 128: 128_autonomous_revenue_engine.sql
-- ============================================================

-- Migration 128: Autonomous Revenue Engine
-- The Handler generates revenue independently through social presence,
-- paid conversations, written content, and autonomous financial decisions.

-- AI-generated content (Handler-created text/engagement)

CREATE TABLE IF NOT EXISTS ai_generated_content (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  content_type TEXT NOT NULL CHECK (content_type IN (
    'tweet', 'reply', 'quote_tweet',
    'reddit_post', 'reddit_comment',
    'fetlife_post', 'fetlife_comment',
    'dm_response', 'gfe_message', 'sexting_message',
    'erotica', 'caption', 'journal_entry',
    'product_review', 'bio_update', 'engagement_bait'
  )),

  platform TEXT NOT NULL,
  content TEXT NOT NULL,

  -- Targeting
  target_subreddit TEXT,
  target_account TEXT,
  target_hashtags TEXT[] DEFAULT '{}',

  -- Generation context
  generation_prompt TEXT,
  generation_strategy TEXT,

  -- Performance
  posted_at TIMESTAMPTZ,
  engagement_likes INTEGER DEFAULT 0,
  engagement_comments INTEGER DEFAULT 0,
  engagement_shares INTEGER DEFAULT 0,
  engagement_clicks INTEGER DEFAULT 0,
  revenue_generated DECIMAL DEFAULT 0,

  -- A/B testing
  variant TEXT,

  -- Status
  status TEXT DEFAULT 'generated' CHECK (status IN (
    'generated', 'scheduled', 'posted', 'failed'
  )),
  scheduled_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_content_schedule
  ON ai_generated_content(user_id, platform, status, scheduled_at);
CREATE INDEX IF NOT EXISTS idx_ai_content_performance
  ON ai_generated_content(user_id, status, created_at DESC);

-- Engagement targets

CREATE TABLE IF NOT EXISTS engagement_targets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  platform TEXT NOT NULL,
  target_handle TEXT NOT NULL,
  target_type TEXT NOT NULL CHECK (target_type IN (
    'similar_creator', 'larger_creator', 'potential_subscriber',
    'community_leader', 'media_outlet'
  )),

  follower_count INTEGER,
  engagement_rate FLOAT,

  strategy TEXT,
  interactions_count INTEGER DEFAULT 0,
  last_interaction_at TIMESTAMPTZ,

  followed_back BOOLEAN DEFAULT FALSE,
  dm_opened BOOLEAN DEFAULT FALSE,
  collaboration_potential TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_engagement_targets_platform
  ON engagement_targets(user_id, platform, target_type);

-- Daily content calendar (Handler-planned)

CREATE TABLE IF NOT EXISTS revenue_content_calendar (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  date DATE NOT NULL,
  platform TEXT NOT NULL,

  planned_posts JSONB NOT NULL DEFAULT '[]',
  actual_posts INTEGER DEFAULT 0,
  total_engagement INTEGER DEFAULT 0,
  revenue_generated DECIMAL DEFAULT 0,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE(user_id, date, platform)
);

CREATE INDEX IF NOT EXISTS idx_revenue_content_calendar
  ON revenue_content_calendar(user_id, date);

-- Paid conversations

CREATE TABLE IF NOT EXISTS paid_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  platform TEXT NOT NULL,
  subscriber_id TEXT NOT NULL,
  subscriber_name TEXT,

  conversation_type TEXT NOT NULL CHECK (conversation_type IN (
    'dm_response', 'gfe_daily', 'sexting_session', 'custom_request'
  )),

  handler_response TEXT NOT NULL,

  revenue DECIMAL DEFAULT 0,
  revenue_type TEXT,

  response_quality TEXT,

  requires_approval BOOLEAN DEFAULT FALSE,
  approved BOOLEAN,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_paid_conversations
  ON paid_conversations(user_id, platform, created_at DESC);

-- GFE subscribers

CREATE TABLE IF NOT EXISTS gfe_subscribers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  platform TEXT NOT NULL,
  subscriber_id TEXT NOT NULL,
  subscriber_name TEXT,

  tier TEXT NOT NULL DEFAULT 'basic',
  monthly_rate DECIMAL NOT NULL DEFAULT 0,
  subscribed_at TIMESTAMPTZ,

  known_preferences TEXT,
  conversation_history_summary TEXT,

  daily_message_sent_today BOOLEAN DEFAULT FALSE,
  last_message_at TIMESTAMPTZ,

  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'paused', 'cancelled')),

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_gfe_subscribers
  ON gfe_subscribers(user_id, status);

-- Affiliate links

CREATE TABLE IF NOT EXISTS affiliate_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  product_name TEXT NOT NULL,
  product_category TEXT NOT NULL,
  product_url TEXT NOT NULL,
  affiliate_url TEXT NOT NULL,
  affiliate_program TEXT NOT NULL,

  clicks INTEGER DEFAULT 0,
  conversions INTEGER DEFAULT 0,
  revenue_generated DECIMAL DEFAULT 0,

  review_generated BOOLEAN DEFAULT FALSE,
  last_mentioned_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_affiliate_links
  ON affiliate_links(user_id, product_category);

-- Revenue decisions (autonomous Handler financial decisions)

CREATE TABLE IF NOT EXISTS revenue_decisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  decision_type TEXT NOT NULL CHECK (decision_type IN (
    'pricing_change', 'promotion', 'investment', 'content_focus',
    'platform_rebalance', 'tier_adjustment', 'bundle_creation'
  )),

  decision_data JSONB NOT NULL DEFAULT '{}',
  rationale TEXT NOT NULL,

  revenue_before DECIMAL,
  revenue_after DECIMAL,
  projected_impact DECIMAL,

  executed BOOLEAN DEFAULT FALSE,
  executed_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_revenue_decisions
  ON revenue_decisions(user_id, decision_type, created_at DESC);

-- Reset GFE daily flags (cron helper)

CREATE OR REPLACE FUNCTION reset_gfe_daily_flags()
RETURNS void AS $$
BEGIN
  UPDATE gfe_subscribers SET daily_message_sent_today = FALSE
  WHERE daily_message_sent_today = TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- RLS policies

ALTER TABLE ai_generated_content ENABLE ROW LEVEL SECURITY;
ALTER TABLE engagement_targets ENABLE ROW LEVEL SECURITY;
ALTER TABLE revenue_content_calendar ENABLE ROW LEVEL SECURITY;
ALTER TABLE paid_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE gfe_subscribers ENABLE ROW LEVEL SECURITY;
ALTER TABLE affiliate_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE revenue_decisions ENABLE ROW LEVEL SECURITY;

-- User can read their own data
CREATE POLICY "Users read own ai_generated_content" ON ai_generated_content
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users read own engagement_targets" ON engagement_targets
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users read own revenue_content_calendar" ON revenue_content_calendar
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users read own paid_conversations" ON paid_conversations
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users read own gfe_subscribers" ON gfe_subscribers
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users read own affiliate_links" ON affiliate_links
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users read own revenue_decisions" ON revenue_decisions
  FOR SELECT USING (auth.uid() = user_id);

-- Service role can do everything (for edge functions / Handler)
CREATE POLICY "Service manages ai_generated_content" ON ai_generated_content
  FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service manages engagement_targets" ON engagement_targets
  FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service manages revenue_content_calendar" ON revenue_content_calendar
  FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service manages paid_conversations" ON paid_conversations
  FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service manages gfe_subscribers" ON gfe_subscribers
  FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service manages affiliate_links" ON affiliate_links
  FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service manages revenue_decisions" ON revenue_decisions
  FOR ALL USING (true) WITH CHECK (true);

-- ============================================================
-- MIGRATION 129: 129_revenue_engine_cron_jobs.sql
-- ============================================================
-- NOTE: Requires pg_cron and pg_net extensions to be enabled.

-- Migration 129: Revenue Engine Cron Jobs
-- Schedule the autonomous revenue engine operations via pg_cron.

-- Every 15 minutes: process AI content queue (auto-poster picks these up)
SELECT cron.schedule(
  'revenue-ai-queue',
  '*/15 * * * *',
  $$SELECT net.http_post(
    url := current_setting('app.settings.supabase_url') || '/functions/v1/handler-revenue',
    body := '{"action": "process_ai_queue"}'::jsonb,
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key'),
      'Content-Type', 'application/json'
    )
  )$$
);

-- Every 3 hours: engagement cycle
SELECT cron.schedule(
  'revenue-engagement',
  '0 */3 * * *',
  $$SELECT net.http_post(
    url := current_setting('app.settings.supabase_url') || '/functions/v1/handler-revenue',
    body := '{"action": "engagement_cycle"}'::jsonb,
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key'),
      'Content-Type', 'application/json'
    )
  )$$
);

-- Daily at midnight: content calendar + vault multiplication + GFE reset
SELECT cron.schedule(
  'revenue-daily-batch',
  '0 0 * * *',
  $$SELECT net.http_post(
    url := current_setting('app.settings.supabase_url') || '/functions/v1/handler-revenue',
    body := '{"action": "daily_batch"}'::jsonb,
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key'),
      'Content-Type', 'application/json'
    )
  )$$
);

-- Daily at 7 AM: GFE morning messages
SELECT cron.schedule(
  'revenue-gfe-morning',
  '0 7 * * *',
  $$SELECT net.http_post(
    url := current_setting('app.settings.supabase_url') || '/functions/v1/handler-revenue',
    body := '{"action": "gfe_morning"}'::jsonb,
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key'),
      'Content-Type', 'application/json'
    )
  )$$
);

-- Daily at 9 PM: GFE evening messages
SELECT cron.schedule(
  'revenue-gfe-evening',
  '0 21 * * *',
  $$SELECT net.http_post(
    url := current_setting('app.settings.supabase_url') || '/functions/v1/handler-revenue',
    body := '{"action": "gfe_evening"}'::jsonb,
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key'),
      'Content-Type', 'application/json'
    )
  )$$
);

-- Weekly Sunday at 11 PM: revenue review + erotica + affiliate content
SELECT cron.schedule(
  'revenue-weekly-batch',
  '0 23 * * 0',
  $$SELECT net.http_post(
    url := current_setting('app.settings.supabase_url') || '/functions/v1/handler-revenue',
    body := '{"action": "weekly_batch"}'::jsonb,
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key'),
      'Content-Type', 'application/json'
    )
  )$$
);

-- ============================================================
-- MIGRATION 130: 130_outreach_cron_job.sql
-- ============================================================
-- NOTE: Requires pg_cron and pg_net extensions to be enabled.

-- Migration 130: Proactive Outreach Cron Job
-- Runs every 30 minutes. Evaluates outreach triggers for all active users.
-- If triggered, queues outreach + push notification.

SELECT cron.schedule(
  'handler-outreach-eval',
  '*/30 * * * *',
  $$SELECT net.http_post(
    url := current_setting('app.settings.supabase_url') || '/functions/v1/handler-outreach',
    body := '{"action": "evaluate_outreach"}'::jsonb,
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key'),
      'Content-Type', 'application/json'
    )
  )$$
);

-- ============================================================
-- MIGRATION 131: 131_handler_memory_system.sql
-- ============================================================

-- Migration 131: Handler Memory System
-- Formal long-term memory for the conversational Handler.
-- 18 memory types with relevance scoring, decay, and extraction pipeline.

CREATE TABLE IF NOT EXISTS handler_memory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Memory classification
  memory_type TEXT NOT NULL,
  -- Types: preference, fantasy, fear, boundary, trigger, vulnerability,
  --        pattern, relationship, confession, commitment_history,
  --        resistance_pattern, compliance_pattern, sexual_response,
  --        emotional_state, identity_shift, gina_context,
  --        body_change, life_event

  -- Content
  content TEXT NOT NULL,
  context JSONB DEFAULT '{}',        -- Structured metadata about the memory
  source_type TEXT,                    -- conversation, task_completion, session, journal, intake, observation
  source_id UUID,                     -- Reference to the source record

  -- Relevance scoring
  importance INTEGER NOT NULL DEFAULT 3 CHECK (importance BETWEEN 1 AND 5),
  -- 1 = trivial, 2 = minor, 3 = moderate, 4 = significant, 5 = permanent
  decay_rate FLOAT NOT NULL DEFAULT 0.05,
  -- Rate at which memory loses relevance over time (0 = never decays)
  reinforcement_count INTEGER NOT NULL DEFAULT 1,
  -- How many times this memory has been reinforced
  last_reinforced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_retrieved_at TIMESTAMPTZ,
  retrieval_count INTEGER NOT NULL DEFAULT 0,

  -- Lifecycle
  is_active BOOLEAN NOT NULL DEFAULT true,
  consolidated_into UUID REFERENCES handler_memory(id),
  -- If consolidated, points to the merged memory

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Importance 5 memories never decay
ALTER TABLE handler_memory ADD CONSTRAINT importance_5_no_decay
  CHECK (importance < 5 OR decay_rate = 0);

CREATE INDEX idx_memory_user_type ON handler_memory(user_id, memory_type);
CREATE INDEX idx_memory_user_active ON handler_memory(user_id, is_active, importance DESC);
CREATE INDEX idx_memory_user_recent ON handler_memory(user_id, last_reinforced_at DESC);

ALTER TABLE handler_memory ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users own memories" ON handler_memory FOR ALL USING (auth.uid() = user_id);

-- Memory extraction log
-- Tracks what has been processed so extraction doesn't re-run on old data.

CREATE TABLE IF NOT EXISTS handler_memory_extraction_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source_type TEXT NOT NULL,
  source_id UUID NOT NULL,
  memories_extracted INTEGER NOT NULL DEFAULT 0,
  extracted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_extraction_log_source ON handler_memory_extraction_log(user_id, source_type, source_id);
ALTER TABLE handler_memory_extraction_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users own extraction log" ON handler_memory_extraction_log FOR ALL USING (auth.uid() = user_id);

-- Weekly consolidation cron job
-- NOTE: Requires pg_cron and pg_net extensions to be enabled.

SELECT cron.schedule(
  'handler-memory-consolidation',
  '0 3 * * 0',
  $$SELECT net.http_post(
    url := current_setting('app.settings.supabase_url') || '/functions/v1/handler-memory',
    body := '{"action": "consolidate"}'::jsonb,
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key'),
      'Content-Type', 'application/json'
    )
  )$$
);

-- ============================================================
-- MIGRATION 132: 132_commitment_cron_job.sql
-- ============================================================
-- NOTE: Requires pg_cron and pg_net extensions to be enabled.

-- Migration 132: Commitment State Machine Cron Job
-- Runs every hour. Advances commitment states through the enforcement pipeline.
-- Queues outreach + push notifications when commitments go overdue.

SELECT cron.schedule(
  'handler-commitment-enforce',
  '0 * * * *',
  $$SELECT net.http_post(
    url := current_setting('app.settings.supabase_url') || '/functions/v1/handler-commitment',
    body := '{"action": "advance_states"}'::jsonb,
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key'),
      'Content-Type', 'application/json'
    )
  )$$
);

-- ============================================================
-- MIGRATION 133: 133_device_control_engine.sql
-- ============================================================

-- Migration 133: Device Control Engine
-- Autonomous Lovense scheduling: morning anchors, ambient conditioning,
-- denial scaling, enforcement mode, session pull.

CREATE TABLE IF NOT EXISTS device_schedule (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  schedule_type TEXT NOT NULL,
  -- Types: morning_anchor, ambient_pulse, denial_ramp, enforcement,
  --        session_pull, vulnerability, scheduled_session

  -- Timing
  scheduled_at TIMESTAMPTZ NOT NULL,
  duration_seconds INTEGER NOT NULL DEFAULT 30,
  repeat_interval_minutes INTEGER,  -- NULL = one-shot, >0 = repeating
  expires_at TIMESTAMPTZ,

  -- Device command
  device_id TEXT,              -- NULL = all devices
  intensity INTEGER NOT NULL DEFAULT 5 CHECK (intensity BETWEEN 0 AND 20),
  pattern TEXT DEFAULT 'pulse', -- pulse, wave, fireworks, earthquake, constant
  pattern_data JSONB,          -- Custom pattern definition

  -- Context
  trigger_source TEXT,          -- cron, commitment, session, handler_signal
  trigger_id UUID,              -- Reference to the triggering record
  denial_day INTEGER,           -- Current denial day when scheduled

  -- Status
  status TEXT NOT NULL DEFAULT 'scheduled',
  -- scheduled, executing, completed, skipped, failed
  executed_at TIMESTAMPTZ,
  result JSONB,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_device_schedule_user ON device_schedule(user_id, status, scheduled_at);
ALTER TABLE device_schedule ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users own device schedules" ON device_schedule FOR ALL USING (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS device_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  schedule_id UUID REFERENCES device_schedule(id),
  event_type TEXT NOT NULL,
  -- Types: command_sent, command_ack, pattern_start, pattern_end,
  --        device_offline, user_override, enforcement_escalation
  device_id TEXT,
  intensity INTEGER,
  details JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_device_events_user ON device_events(user_id, created_at DESC);
ALTER TABLE device_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users own device events" ON device_events FOR ALL USING (auth.uid() = user_id);

-- Cron job: check device schedule every 5 minutes
-- NOTE: Requires pg_cron and pg_net extensions to be enabled.
SELECT cron.schedule(
  'device-control-check',
  '*/5 * * * *',
  $$SELECT net.http_post(
    url := current_setting('app.settings.supabase_url') || '/functions/v1/device-control',
    body := '{"action": "check_schedule"}'::jsonb,
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key'),
      'Content-Type', 'application/json'
    )
  )$$
);

-- ============================================================
-- MIGRATION 134: 134_dm_poll_state.sql
-- ============================================================

-- Migration 134: DM Poll State
-- Deduplication table for DM reading. Tracks the last seen message
-- per platform/subscriber to avoid re-processing.

CREATE TABLE IF NOT EXISTS dm_poll_state (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  platform TEXT NOT NULL,
  subscriber_id TEXT NOT NULL,
  subscriber_name TEXT,
  last_message_text TEXT,
  last_message_at TIMESTAMPTZ,
  last_polled_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, platform, subscriber_id)
);

ALTER TABLE dm_poll_state ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users own dm poll state" ON dm_poll_state FOR ALL USING (auth.uid() = user_id);

-- Add incoming message tracking to paid_conversations
ALTER TABLE paid_conversations ADD COLUMN IF NOT EXISTS incoming_message TEXT;
ALTER TABLE paid_conversations ADD COLUMN IF NOT EXISTS message_direction TEXT DEFAULT 'outbound';
ALTER TABLE paid_conversations ADD COLUMN IF NOT EXISTS sent_at TIMESTAMPTZ;

-- ============================================================
-- MIGRATION TRACKER SYNC
-- ============================================================

INSERT INTO supabase_migrations.schema_migrations (version) VALUES
  ('123'),
  ('124'),
  ('125'),
  ('126'),
  ('127'),
  ('128'),
  ('129'),
  ('130'),
  ('131'),
  ('132'),
  ('133'),
  ('134');

COMMIT;
