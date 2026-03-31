-- 159: External Content Index
-- Tracks external conditioning content (Bambi Sleep, Elswyth, Nimja, etc.)
-- for prescription and effectiveness tracking alongside internal content.

-- =============================================
-- external_content_index — External conditioning content catalog
-- =============================================
CREATE TABLE IF NOT EXISTS external_content_index (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Content identification
  title TEXT NOT NULL,
  creator TEXT,                    -- 'bambi_sleep', 'elswyth', 'nimja', 'custom', etc.
  source_url TEXT,                 -- External URL (YouTube, SoundCloud, direct link, etc.)
  local_path TEXT,                 -- If downloaded/cached locally

  -- Classification
  content_type TEXT NOT NULL CHECK (content_type IN (
    'audio_hypno', 'audio_affirmation', 'video_pmv', 'video_hypno',
    'video_sissy', 'audio_ambient', 'audio_sleep', 'caption_set'
  )),
  category TEXT,                   -- Maps to content_curriculum categories
  intensity INTEGER CHECK (intensity BETWEEN 1 AND 5),
  fantasy_level INTEGER CHECK (fantasy_level BETWEEN 1 AND 5),

  -- Metadata
  duration_minutes INTEGER,
  themes TEXT[],                   -- ['feminization', 'sissification', 'bimbo', 'chastity', 'trance', etc.]
  trigger_phrases TEXT[],

  -- Usage tracking
  times_prescribed INTEGER DEFAULT 0,
  times_consumed INTEGER DEFAULT 0,
  avg_trance_depth FLOAT,
  effectiveness_score FLOAT,

  -- Handler notes
  handler_notes TEXT,

  -- Tier gating (same as content_curriculum)
  tier INTEGER DEFAULT 1 CHECK (tier BETWEEN 1 AND 4),
  best_denial_range INT[],
  best_time TEXT[],

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_external_content ON external_content_index(user_id, content_type, category, tier);
CREATE INDEX IF NOT EXISTS idx_external_content_creator ON external_content_index(user_id, creator);
CREATE INDEX IF NOT EXISTS idx_external_content_themes ON external_content_index USING GIN(themes);
CREATE INDEX IF NOT EXISTS idx_external_content_effectiveness ON external_content_index(user_id, effectiveness_score DESC NULLS LAST);

ALTER TABLE external_content_index ENABLE ROW LEVEL SECURITY;

CREATE POLICY "external_content_index_select" ON external_content_index FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "external_content_index_insert" ON external_content_index FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "external_content_index_update" ON external_content_index FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "external_content_index_delete" ON external_content_index FOR DELETE USING (auth.uid() = user_id);
