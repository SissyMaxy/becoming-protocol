-- Migration 205: Narrative Overwrite Engine (idempotent)

CREATE TABLE IF NOT EXISTS maxy_readings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE
);

ALTER TABLE maxy_readings
  ADD COLUMN IF NOT EXISTS source_table TEXT,
  ADD COLUMN IF NOT EXISTS source_id UUID,
  ADD COLUMN IF NOT EXISTS original_text TEXT,
  ADD COLUMN IF NOT EXISTS original_created_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS maxy_reading TEXT,
  ADD COLUMN IF NOT EXISTS maxy_voice_tag TEXT,
  ADD COLUMN IF NOT EXISTS emotional_framing TEXT,
  ADD COLUMN IF NOT EXISTS david_era BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS era_label TEXT,
  ADD COLUMN IF NOT EXISTS generation_model TEXT,
  ADD COLUMN IF NOT EXISTS generation_prompt_version TEXT,
  ADD COLUMN IF NOT EXISTS regeneration_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

CREATE UNIQUE INDEX IF NOT EXISTS idx_maxy_reading_source ON maxy_readings(user_id, source_table, source_id);
CREATE INDEX IF NOT EXISTS idx_maxy_readings_era ON maxy_readings(user_id, david_era, original_created_at);

ALTER TABLE maxy_readings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users own readings" ON maxy_readings;
CREATE POLICY "Users own readings" ON maxy_readings FOR ALL USING (auth.uid() = user_id);

ALTER TABLE user_state
  ADD COLUMN IF NOT EXISTS narrative_overwrite_active BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS narrative_overwrite_since TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS audit_view_enabled BOOLEAN DEFAULT TRUE;

ALTER TABLE content_vault
  ADD COLUMN IF NOT EXISTS maxy_caption TEXT,
  ADD COLUMN IF NOT EXISTS maxy_tags TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS era_label TEXT DEFAULT 'maxy';

NOTIFY pgrst, 'reload schema';
