-- Migration 002: Escalation Tables
-- Escalation state, events, boundary dissolution, service progression, encounters, content escalation

-- ============================================
-- ESCALATION STATE
-- Current position in each escalation domain
-- ============================================
CREATE TABLE IF NOT EXISTS escalation_state (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  domain TEXT NOT NULL, -- identity, presentation, sissification, chastity, denial, hypno, sexual_service, gina_dynamic
  current_level INTEGER DEFAULT 0,
  current_description TEXT,
  next_level_description TEXT,
  last_escalation_date TIMESTAMPTZ,
  escalation_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, domain)
);

-- ============================================
-- ESCALATION EVENTS
-- Individual escalation pushes and their outcomes
-- ============================================
CREATE TABLE IF NOT EXISTS escalation_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  domain TEXT NOT NULL,
  from_level INTEGER,
  to_level INTEGER,
  description TEXT,
  trigger_method TEXT, -- arousal_commitment, handler_push, gina_directed, organic
  arousal_level_at_commitment INTEGER,
  resistance_encountered BOOLEAN DEFAULT FALSE,
  resistance_bypassed BOOLEAN,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- BOUNDARY DISSOLUTION
-- Tracking boundaries as they dissolve
-- ============================================
CREATE TABLE IF NOT EXISTS boundary_dissolution (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  boundary_description TEXT NOT NULL, -- what the boundary WAS
  domain TEXT,
  first_identified TIMESTAMPTZ DEFAULT NOW(),
  dissolution_started TIMESTAMPTZ,
  dissolution_completed TIMESTAMPTZ,
  method TEXT, -- gradual_exposure, arousal_bypass, hypno_conditioning, gina_command
  now_baseline BOOLEAN DEFAULT FALSE, -- this is now normal
  notes TEXT
);

-- ============================================
-- SERVICE PROGRESSION
-- Sexual service escalation tracking
-- ============================================
CREATE TABLE IF NOT EXISTS service_progression (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  stage TEXT NOT NULL, -- fantasy, content_consumption, online_interaction, first_encounter, regular_service, organized_availability, gina_directed
  entered_at TIMESTAMPTZ DEFAULT NOW(),
  activities JSONB DEFAULT '[]', -- specific activities at this stage
  comfort_level INTEGER, -- 1-10, tracking normalization
  arousal_association INTEGER, -- 1-10, how arousing is this now
  notes TEXT
);

-- ============================================
-- SERVICE ENCOUNTERS
-- Individual service encounters (when applicable)
-- ============================================
CREATE TABLE IF NOT EXISTS service_encounters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  encounter_type TEXT, -- online, anonymous, regular, directed
  date TIMESTAMPTZ DEFAULT NOW(),
  description TEXT,
  gina_aware BOOLEAN DEFAULT FALSE,
  gina_directed BOOLEAN DEFAULT FALSE,
  activities JSONB DEFAULT '[]',
  psychological_impact TEXT,
  escalation_effect TEXT, -- what new baseline did this create
  arousal_level INTEGER
);

-- ============================================
-- CONTENT ESCALATION
-- Tracking content consumption escalation
-- ============================================
CREATE TABLE IF NOT EXISTS content_escalation (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  content_type TEXT NOT NULL, -- hypno, porn, erotica, imagery
  theme TEXT NOT NULL, -- feminization, sissification, service, humiliation, etc.
  intensity_level INTEGER, -- 1-10
  first_exposure TIMESTAMPTZ DEFAULT NOW(),
  exposure_count INTEGER DEFAULT 1,
  current_response TEXT, -- arousing, normalized, seeking_more_intense
  next_intensity_target INTEGER,
  notes TEXT
);

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================
ALTER TABLE escalation_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE escalation_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE boundary_dissolution ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_progression ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_encounters ENABLE ROW LEVEL SECURITY;
ALTER TABLE content_escalation ENABLE ROW LEVEL SECURITY;

-- RLS Policies
DROP POLICY IF EXISTS "Users can access own escalation_state" ON escalation_state;
CREATE POLICY "Users can access own escalation_state" ON escalation_state FOR ALL USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can access own escalation_events" ON escalation_events;
CREATE POLICY "Users can access own escalation_events" ON escalation_events FOR ALL USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can access own boundary_dissolution" ON boundary_dissolution;
CREATE POLICY "Users can access own boundary_dissolution" ON boundary_dissolution FOR ALL USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can access own service_progression" ON service_progression;
CREATE POLICY "Users can access own service_progression" ON service_progression FOR ALL USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can access own service_encounters" ON service_encounters;
CREATE POLICY "Users can access own service_encounters" ON service_encounters FOR ALL USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can access own content_escalation" ON content_escalation;
CREATE POLICY "Users can access own content_escalation" ON content_escalation FOR ALL USING (auth.uid() = user_id);

-- ============================================
-- INDEXES
-- ============================================
CREATE INDEX IF NOT EXISTS idx_escalation_state_user_id ON escalation_state(user_id);
CREATE INDEX IF NOT EXISTS idx_escalation_state_domain ON escalation_state(user_id, domain);
CREATE INDEX IF NOT EXISTS idx_escalation_events_user_id ON escalation_events(user_id);
CREATE INDEX IF NOT EXISTS idx_escalation_events_domain ON escalation_events(user_id, domain);
CREATE INDEX IF NOT EXISTS idx_escalation_events_created ON escalation_events(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_boundary_dissolution_user_id ON boundary_dissolution(user_id);
CREATE INDEX IF NOT EXISTS idx_service_progression_user_id ON service_progression(user_id);
CREATE INDEX IF NOT EXISTS idx_service_encounters_user_id ON service_encounters(user_id);
CREATE INDEX IF NOT EXISTS idx_service_encounters_date ON service_encounters(user_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_content_escalation_user_id ON content_escalation(user_id);
CREATE INDEX IF NOT EXISTS idx_content_escalation_type ON content_escalation(user_id, content_type);
