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
