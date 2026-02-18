-- Migration 037: Gina Ladder Pipeline Tables
-- Phase F: The structural backbone for 242 Gina tasks
-- Creates ladder/seed/measurement/arc/disclosure tables

-- ============================================
-- GINA LADDER STATE
-- One row per channel per user (10 channels)
-- ============================================

CREATE TABLE IF NOT EXISTS gina_ladder_state (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  channel TEXT NOT NULL,
  -- channels: scent, touch, domestic, intimacy, visual,
  --           social, bedroom, pronoun, financial, body_change_touch
  current_rung INTEGER DEFAULT 0,   -- 0=not started, 1-5=ladder position
  rung_entered_at TIMESTAMPTZ,
  last_seed_date TIMESTAMPTZ,
  last_seed_result TEXT,            -- positive, neutral, negative, callout
  consecutive_failures INTEGER DEFAULT 0,
  cooldown_until TIMESTAMPTZ,
  positive_seeds_at_rung INTEGER DEFAULT 0,
  total_seeds_at_rung INTEGER DEFAULT 0,
  notes JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, channel)
);

ALTER TABLE gina_ladder_state ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users access own gina_ladder_state"
  ON gina_ladder_state FOR ALL USING (auth.uid() = user_id);

-- ============================================
-- GINA SEED LOG
-- Every seed attempt across all channels
-- ============================================

CREATE TABLE IF NOT EXISTS gina_seed_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  channel TEXT NOT NULL,
  rung INTEGER NOT NULL,
  task_id TEXT,
  seed_description TEXT NOT NULL,
  gina_response TEXT,
  -- positive, neutral, negative, callout, no_reaction
  gina_exact_words TEXT,
  context_notes TEXT,
  her_mood TEXT,
  timing TEXT,
  setting TEXT,
  recovery_triggered BOOLEAN DEFAULT FALSE,
  recovery_type TEXT,
  -- single_failure, double_failure, callout, rupture
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE gina_seed_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users access own gina_seed_log"
  ON gina_seed_log FOR ALL USING (auth.uid() = user_id);

CREATE INDEX idx_gina_seed_log_user_channel
  ON gina_seed_log(user_id, channel, created_at DESC);

-- ============================================
-- GINA MEASUREMENTS
-- Periodic assessments (8 measurement types)
-- ============================================

CREATE TABLE IF NOT EXISTS gina_measurements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  measurement_type TEXT NOT NULL,
  -- bedroom_weekly, pronoun_weekly, financial_monthly,
  -- touch_biweekly, shopper_monthly, social_map,
  -- occasion_debrief, master_composite
  channel TEXT,
  data JSONB NOT NULL,
  score NUMERIC,                   -- normalized score for composite
  period_start DATE,
  period_end DATE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE gina_measurements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users access own gina_measurements"
  ON gina_measurements FOR ALL USING (auth.uid() = user_id);

CREATE INDEX idx_gina_measurements_user_type
  ON gina_measurements(user_id, measurement_type, created_at DESC);

-- ============================================
-- GINA ARC STATE
-- Timeline arc tracking (4 arcs)
-- ============================================

CREATE TABLE IF NOT EXISTS gina_arc_state (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  arc TEXT NOT NULL,
  -- identity_processing, social_circle, shopper, hrt_management
  gate_status TEXT DEFAULT 'locked',
  -- locked, unlocked, active, completed
  gate_condition TEXT,
  current_milestone TEXT,
  milestones_completed JSONB DEFAULT '[]',
  unlocked_at TIMESTAMPTZ,
  activated_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, arc)
);

ALTER TABLE gina_arc_state ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users access own gina_arc_state"
  ON gina_arc_state FOR ALL USING (auth.uid() = user_id);

-- ============================================
-- GINA DISCLOSURE MAP
-- Social disclosure tracking
-- ============================================

CREATE TABLE IF NOT EXISTS gina_disclosure_map (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  person_name TEXT NOT NULL,
  relationship TEXT,
  -- friend, family, colleague, community
  relationship_to TEXT,
  -- gina, user, both
  awareness_status TEXT DEFAULT 'unaware',
  -- unaware, told, supportive, neutral, hostile
  told_date DATE,
  told_by TEXT,
  -- gina, user, other
  initial_reaction TEXT,
  current_stance TEXT,
  provides_active_support BOOLEAN DEFAULT FALSE,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE gina_disclosure_map ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users access own gina_disclosure_map"
  ON gina_disclosure_map FOR ALL USING (auth.uid() = user_id);

-- ============================================
-- INDEXES
-- ============================================

CREATE INDEX idx_gina_ladder_state_user
  ON gina_ladder_state(user_id);
CREATE INDEX idx_gina_arc_state_user
  ON gina_arc_state(user_id);
CREATE INDEX idx_gina_disclosure_map_user
  ON gina_disclosure_map(user_id);

-- ============================================
-- INITIALIZATION FUNCTION
-- Creates default rows for a new user
-- ============================================

CREATE OR REPLACE FUNCTION initialize_gina_ladder(p_user_id UUID)
RETURNS void AS $$
DECLARE
  channels TEXT[] := ARRAY[
    'scent', 'touch', 'domestic', 'intimacy', 'visual',
    'social', 'bedroom', 'pronoun', 'financial', 'body_change_touch'
  ];
  ch TEXT;
BEGIN
  FOREACH ch IN ARRAY channels LOOP
    INSERT INTO gina_ladder_state (user_id, channel, current_rung)
    VALUES (p_user_id, ch, 0)
    ON CONFLICT (user_id, channel) DO NOTHING;
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION initialize_gina_arcs(p_user_id UUID)
RETURNS void AS $$
BEGIN
  INSERT INTO gina_arc_state (user_id, arc, gate_status, gate_condition)
  VALUES
    (p_user_id, 'identity_processing', 'locked', 'post_disclosure_stable'),
    (p_user_id, 'social_circle', 'locked', 'pre_disclosure'),
    (p_user_id, 'shopper', 'locked', 'post_disclosure'),
    (p_user_id, 'hrt_management', 'locked', 'medical_appointment')
  ON CONFLICT (user_id, arc) DO NOTHING;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
