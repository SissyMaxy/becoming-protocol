-- Migration 199: Generated session pipeline (Slice 2)
-- Links generated audio back into hypno_sources so the same play-tracking +
-- preference-learning loop covers both ingested and generated content.
-- Every generated session becomes a first-class source the Handler can play.

-- Ensure hypno_sources can mark its origin as 'generated'
ALTER TABLE hypno_sources ADD COLUMN IF NOT EXISTS origin TEXT DEFAULT 'ingested'
  CHECK (origin IN ('ingested', 'generated'));

CREATE TABLE IF NOT EXISTS generated_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source_id UUID REFERENCES hypno_sources(id) ON DELETE CASCADE,   -- the hypno_sources row this produced
  script_text TEXT NOT NULL,
  script_model TEXT,                 -- openrouter model used
  voice_id TEXT,                     -- elevenlabs voice_id used
  voice_style TEXT,                  -- label: 'soft_feminine', 'commanding', etc.
  duration_seconds INTEGER,
  target_themes JSONB DEFAULT '[]',
  target_phrases JSONB DEFAULT '[]',
  target_identity_axes JSONB DEFAULT '[]',
  escalation_level INTEGER,          -- Handler current escalation at gen-time
  denial_day INTEGER,                -- snapshot
  arousal_snapshot INTEGER,
  profile_confidence_at_gen NUMERIC, -- from erotic_preference_profile
  generation_cost_cents INTEGER,
  storage_path TEXT,                 -- Supabase Storage key for the MP3
  audio_url TEXT,                    -- signed URL, expires; regenerate via endpoint
  prescribed_by TEXT DEFAULT 'user'
    CHECK (prescribed_by IN ('user', 'handler')),
  handler_message_id UUID,           -- if Handler prescribed this, link it
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_generated_sessions_user ON generated_sessions(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_generated_sessions_source ON generated_sessions(source_id);

ALTER TABLE generated_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users own generated sessions" ON generated_sessions FOR ALL USING (auth.uid() = user_id);
