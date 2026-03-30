-- ============================================
-- 147: Encounter Pipeline (P3.3)
-- Prospects, encounters, content, turning-out progression
-- ============================================

-- Prospects — people Maxy might meet
CREATE TABLE IF NOT EXISTS prospects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  platform TEXT,
  platform_id TEXT,
  status TEXT DEFAULT 'discovered' CHECK (status IN (
    'discovered', 'chatting', 'scheduled', 'met', 'recurring', 'archived'
  )),
  notes TEXT,
  attractiveness INTEGER CHECK (attractiveness BETWEEN 1 AND 10),
  safety_score INTEGER CHECK (safety_score BETWEEN 1 AND 10),
  kink_compatibility INTEGER CHECK (kink_compatibility BETWEEN 1 AND 10),
  last_contact_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_prospects_user_status ON prospects(user_id, status);
CREATE INDEX IF NOT EXISTS idx_prospects_user_platform ON prospects(user_id, platform);

ALTER TABLE prospects ENABLE ROW LEVEL SECURITY;

CREATE POLICY prospects_select ON prospects FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY prospects_insert ON prospects FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY prospects_update ON prospects FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY prospects_delete ON prospects FOR DELETE USING (auth.uid() = user_id);

-- Encounters — planned or completed meetings
CREATE TABLE IF NOT EXISTS encounters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  prospect_id UUID REFERENCES prospects(id),
  status TEXT DEFAULT 'planning' CHECK (status IN (
    'planning', 'confirmed', 'preparing', 'active', 'completed', 'cancelled', 'no_show'
  )),
  scheduled_at TIMESTAMPTZ,
  location TEXT,
  encounter_type TEXT,

  -- Preparation checklist
  outfit_planned BOOLEAN DEFAULT FALSE,
  voice_practiced BOOLEAN DEFAULT FALSE,
  makeup_done BOOLEAN DEFAULT FALSE,
  scent_applied BOOLEAN DEFAULT FALSE,
  cage_status TEXT,

  -- Resistance tracking
  resistance_level INTEGER DEFAULT 0 CHECK (resistance_level BETWEEN 0 AND 10),
  resistance_notes TEXT,
  handler_override_used BOOLEAN DEFAULT FALSE,

  -- Outcome
  duration_minutes INTEGER,
  outcome_rating INTEGER CHECK (outcome_rating BETWEEN 1 AND 10),
  outcome_notes TEXT,
  intimacy_level TEXT CHECK (intimacy_level IN ('none', 'light', 'moderate', 'full')),

  -- Identity impact
  felt_like_maxy BOOLEAN,
  identity_reinforcement_score INTEGER CHECK (identity_reinforcement_score BETWEEN 1 AND 10),

  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_encounters_user_status ON encounters(user_id, status);
CREATE INDEX IF NOT EXISTS idx_encounters_prospect ON encounters(prospect_id);
CREATE INDEX IF NOT EXISTS idx_encounters_scheduled ON encounters(user_id, scheduled_at);

ALTER TABLE encounters ENABLE ROW LEVEL SECURITY;

CREATE POLICY encounters_select ON encounters FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY encounters_insert ON encounters FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY encounters_update ON encounters FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY encounters_delete ON encounters FOR DELETE USING (auth.uid() = user_id);

-- Encounter content — photos/evidence from encounters
CREATE TABLE IF NOT EXISTS encounter_content (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  encounter_id UUID NOT NULL REFERENCES encounters(id) ON DELETE CASCADE,
  content_type TEXT CHECK (content_type IN ('photo', 'video', 'audio', 'text')),
  storage_url TEXT,
  description TEXT,
  vault_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_encounter_content_encounter ON encounter_content(encounter_id);
CREATE INDEX IF NOT EXISTS idx_encounter_content_user ON encounter_content(user_id);

ALTER TABLE encounter_content ENABLE ROW LEVEL SECURITY;

CREATE POLICY encounter_content_select ON encounter_content FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY encounter_content_insert ON encounter_content FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY encounter_content_update ON encounter_content FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY encounter_content_delete ON encounter_content FOR DELETE USING (auth.uid() = user_id);

-- Turning-out progression — overall progression toward real-world encounters
CREATE TABLE IF NOT EXISTS turning_out_progression (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  stage TEXT DEFAULT 'pre_encounter' CHECK (stage IN (
    'pre_encounter',
    'browsing',
    'chatting',
    'planning',
    'first_encounter',
    'dating',
    'intimate',
    'recurring',
    'relationship'
  )),
  stage_entered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  total_prospects INTEGER DEFAULT 0,
  total_encounters INTEGER DEFAULT 0,
  total_intimate INTEGER DEFAULT 0,
  confidence_score INTEGER DEFAULT 0 CHECK (confidence_score BETWEEN 0 AND 100),
  handler_notes TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id)
);

CREATE INDEX IF NOT EXISTS idx_turning_out_user ON turning_out_progression(user_id);

ALTER TABLE turning_out_progression ENABLE ROW LEVEL SECURITY;

CREATE POLICY turning_out_progression_select ON turning_out_progression FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY turning_out_progression_insert ON turning_out_progression FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY turning_out_progression_update ON turning_out_progression FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY turning_out_progression_delete ON turning_out_progression FOR DELETE USING (auth.uid() = user_id);
