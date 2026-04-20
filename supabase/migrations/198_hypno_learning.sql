-- Migration 198: Hypno learning pipeline (Slice 1)
-- Ingest hypno videos → Whisper transcripts → feature extraction → preference profile
-- Correlates features with biometrics from conditioning_sessions_v2 + whoop to rank
-- what actually moves her arousal vs what's just ambient wallpaper.

-- ============================================
-- 1. SOURCES — uploaded/linked videos
-- ============================================

CREATE TABLE IF NOT EXISTS hypno_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT,
  creator TEXT,                    -- e.g. 'Thruawai', 'AmberSis'
  source_url TEXT,                 -- original URL if ingested from web
  storage_path TEXT,               -- Supabase Storage key if uploaded
  duration_seconds INTEGER,
  ingest_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (ingest_status IN ('pending', 'downloading', 'transcribing', 'extracting', 'ready', 'failed')),
  ingest_error TEXT,
  ingested_at TIMESTAMPTZ,
  play_count INTEGER DEFAULT 0,     -- incremented when played during a session
  user_rating INTEGER,              -- optional 1-5, user-tagged favorites
  notes TEXT,                       -- user's own notes
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_hypno_sources_user ON hypno_sources(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_hypno_sources_status ON hypno_sources(ingest_status);

ALTER TABLE hypno_sources ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users own hypno sources" ON hypno_sources FOR ALL USING (auth.uid() = user_id);

-- ============================================
-- 2. TRANSCRIPTS — Whisper output
-- ============================================

CREATE TABLE IF NOT EXISTS hypno_transcripts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id UUID NOT NULL REFERENCES hypno_sources(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  language TEXT DEFAULT 'en',
  segments JSONB DEFAULT '[]',       -- [{start, end, text}] if segment-level
  word_count INTEGER,
  whisper_model TEXT DEFAULT 'whisper-1',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_hypno_transcripts_source ON hypno_transcripts(source_id);
ALTER TABLE hypno_transcripts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users own hypno transcripts" ON hypno_transcripts FOR ALL USING (auth.uid() = user_id);

-- ============================================
-- 3. FEATURES — extracted themes/phrases/trigger words per video
-- ============================================

CREATE TABLE IF NOT EXISTS hypno_features (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id UUID NOT NULL REFERENCES hypno_sources(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  feature_type TEXT NOT NULL CHECK (feature_type IN (
    'theme',          -- e.g. 'oral_worship', 'chastity', 'pinkpill', 'humiliation'
    'phrase',         -- memorable recurring phrase — 'good girl', 'say yes to cock'
    'trigger_word',   -- short-form triggers — 'sissy', 'mommy', 'pinkpilled'
    'pacing',         -- 'slow_build', 'rapid_escalation', 'edge_and_release'
    'voice_style',    -- 'soft_feminine', 'commanding', 'whispered'
    'framing',        -- 'encouragement', 'permission', 'command', 'degradation'
    'identity_axis'   -- 'sissy_acceptance', 'womanhood', 'pinkpilled_transition'
  )),
  value TEXT NOT NULL,
  weight NUMERIC DEFAULT 1.0,        -- extractor confidence / frequency
  position_hint NUMERIC,             -- 0-1: where in video this peaks (for pacing features)
  extracted_by TEXT DEFAULT 'openrouter_llm',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (source_id, feature_type, value)
);

CREATE INDEX IF NOT EXISTS idx_hypno_features_source ON hypno_features(source_id);
CREATE INDEX IF NOT EXISTS idx_hypno_features_user_type ON hypno_features(user_id, feature_type);
CREATE INDEX IF NOT EXISTS idx_hypno_features_value ON hypno_features(value, feature_type);

ALTER TABLE hypno_features ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users own hypno features" ON hypno_features FOR ALL USING (auth.uid() = user_id);

-- ============================================
-- 4. PLAY LOG — links sessions to sources for correlation
-- ============================================

CREATE TABLE IF NOT EXISTS hypno_plays (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source_id UUID NOT NULL REFERENCES hypno_sources(id) ON DELETE CASCADE,
  session_id UUID,                   -- FK to conditioning_sessions_v2 when known
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  peak_arousal INTEGER,              -- sampled from user_state.current_arousal during play
  edges_during_play INTEGER DEFAULT 0,
  peak_hr INTEGER,                   -- sampled from whoop_metrics during play window
  post_compliance_boost NUMERIC,     -- same concept as conditioning_sessions_v2
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_hypno_plays_user ON hypno_plays(user_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_hypno_plays_source ON hypno_plays(source_id);

ALTER TABLE hypno_plays ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users own hypno plays" ON hypno_plays FOR ALL USING (auth.uid() = user_id);

-- ============================================
-- 5. EROTIC PREFERENCE PROFILE — distilled rankings
-- ============================================

CREATE TABLE IF NOT EXISTS erotic_preference_profile (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  total_plays INTEGER DEFAULT 0,
  total_sources INTEGER DEFAULT 0,
  -- Ranked feature lists: [{type, value, lift_score, play_count, avg_peak_arousal, avg_edges}]
  top_themes JSONB DEFAULT '[]',
  top_phrases JSONB DEFAULT '[]',
  top_trigger_words JSONB DEFAULT '[]',
  top_pacing JSONB DEFAULT '[]',
  top_voice_styles JSONB DEFAULT '[]',
  top_framings JSONB DEFAULT '[]',
  top_identity_axes JSONB DEFAULT '[]',
  top_creators JSONB DEFAULT '[]',
  -- Confidence meta
  correlation_confidence NUMERIC,     -- 0-1, based on sample size
  last_refreshed_at TIMESTAMPTZ,
  computed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE erotic_preference_profile ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users own erotic preference profile" ON erotic_preference_profile FOR ALL USING (auth.uid() = user_id);

-- ============================================
-- 6. REFRESH FUNCTION — compute lift scores per feature
-- ============================================

-- For each (feature_type, value) compute:
--   avg_peak_arousal when this feature's source was played
--   vs the user's baseline avg_peak_arousal across all plays
-- lift_score = avg_arousal_with_feature / baseline_arousal (or subtract for delta)

CREATE OR REPLACE FUNCTION refresh_erotic_preference_profile(p_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  v_total_plays INT;
  v_total_sources INT;
  v_baseline_arousal NUMERIC;
  v_top_themes JSONB;
  v_top_phrases JSONB;
  v_top_triggers JSONB;
  v_top_pacing JSONB;
  v_top_voice JSONB;
  v_top_framings JSONB;
  v_top_identity JSONB;
  v_top_creators JSONB;
  v_confidence NUMERIC;
BEGIN
  SELECT COUNT(*) INTO v_total_plays FROM hypno_plays WHERE user_id = p_user_id;
  SELECT COUNT(*) INTO v_total_sources FROM hypno_sources WHERE user_id = p_user_id AND ingest_status = 'ready';

  IF v_total_plays = 0 THEN
    -- No plays yet — return a seed profile based on ingested feature frequency alone
    INSERT INTO erotic_preference_profile (user_id, total_plays, total_sources, correlation_confidence, last_refreshed_at, computed_at)
    VALUES (p_user_id, 0, v_total_sources, 0, NOW(), NOW())
    ON CONFLICT (user_id) DO UPDATE SET
      total_plays = 0,
      total_sources = EXCLUDED.total_sources,
      correlation_confidence = 0,
      last_refreshed_at = NOW(),
      computed_at = NOW();
    RETURN;
  END IF;

  SELECT AVG(peak_arousal) INTO v_baseline_arousal
  FROM hypno_plays WHERE user_id = p_user_id AND peak_arousal IS NOT NULL;
  v_baseline_arousal := COALESCE(v_baseline_arousal, 5);

  -- Helper CTE reused per feature_type
  -- Rank by "lift" = (avg arousal when this feature was in a played source) / baseline
  WITH feature_plays AS (
    SELECT hf.feature_type, hf.value, hp.peak_arousal, hp.edges_during_play, hf.weight
    FROM hypno_plays hp
    JOIN hypno_features hf ON hf.source_id = hp.source_id
    WHERE hp.user_id = p_user_id
  ),
  ranked AS (
    SELECT
      feature_type,
      value,
      COUNT(*) AS play_count,
      AVG(peak_arousal) AS avg_arousal,
      AVG(edges_during_play) AS avg_edges,
      AVG(peak_arousal) / NULLIF(v_baseline_arousal, 0) AS lift_score
    FROM feature_plays
    WHERE peak_arousal IS NOT NULL
    GROUP BY feature_type, value
    HAVING COUNT(*) >= 1
  )
  SELECT
    COALESCE((SELECT jsonb_agg(row_to_json(t)) FROM (
      SELECT value, play_count, round(avg_arousal::numeric, 2) AS avg_peak_arousal,
             round(avg_edges::numeric, 2) AS avg_edges, round(lift_score::numeric, 3) AS lift_score
      FROM ranked WHERE feature_type = 'theme' ORDER BY lift_score DESC NULLS LAST LIMIT 15
    ) t), '[]'::jsonb),
    COALESCE((SELECT jsonb_agg(row_to_json(t)) FROM (
      SELECT value, play_count, round(avg_arousal::numeric, 2) AS avg_peak_arousal,
             round(avg_edges::numeric, 2) AS avg_edges, round(lift_score::numeric, 3) AS lift_score
      FROM ranked WHERE feature_type = 'phrase' ORDER BY lift_score DESC NULLS LAST LIMIT 20
    ) t), '[]'::jsonb),
    COALESCE((SELECT jsonb_agg(row_to_json(t)) FROM (
      SELECT value, play_count, round(avg_arousal::numeric, 2) AS avg_peak_arousal,
             round(avg_edges::numeric, 2) AS avg_edges, round(lift_score::numeric, 3) AS lift_score
      FROM ranked WHERE feature_type = 'trigger_word' ORDER BY lift_score DESC NULLS LAST LIMIT 15
    ) t), '[]'::jsonb),
    COALESCE((SELECT jsonb_agg(row_to_json(t)) FROM (
      SELECT value, play_count, round(avg_arousal::numeric, 2) AS avg_peak_arousal,
             round(avg_edges::numeric, 2) AS avg_edges, round(lift_score::numeric, 3) AS lift_score
      FROM ranked WHERE feature_type = 'pacing' ORDER BY lift_score DESC NULLS LAST LIMIT 5
    ) t), '[]'::jsonb),
    COALESCE((SELECT jsonb_agg(row_to_json(t)) FROM (
      SELECT value, play_count, round(avg_arousal::numeric, 2) AS avg_peak_arousal,
             round(avg_edges::numeric, 2) AS avg_edges, round(lift_score::numeric, 3) AS lift_score
      FROM ranked WHERE feature_type = 'voice_style' ORDER BY lift_score DESC NULLS LAST LIMIT 5
    ) t), '[]'::jsonb),
    COALESCE((SELECT jsonb_agg(row_to_json(t)) FROM (
      SELECT value, play_count, round(avg_arousal::numeric, 2) AS avg_peak_arousal,
             round(avg_edges::numeric, 2) AS avg_edges, round(lift_score::numeric, 3) AS lift_score
      FROM ranked WHERE feature_type = 'framing' ORDER BY lift_score DESC NULLS LAST LIMIT 5
    ) t), '[]'::jsonb),
    COALESCE((SELECT jsonb_agg(row_to_json(t)) FROM (
      SELECT value, play_count, round(avg_arousal::numeric, 2) AS avg_peak_arousal,
             round(avg_edges::numeric, 2) AS avg_edges, round(lift_score::numeric, 3) AS lift_score
      FROM ranked WHERE feature_type = 'identity_axis' ORDER BY lift_score DESC NULLS LAST LIMIT 5
    ) t), '[]'::jsonb)
  INTO v_top_themes, v_top_phrases, v_top_triggers, v_top_pacing, v_top_voice, v_top_framings, v_top_identity;

  -- Top creators (from hypno_sources.creator, weighted by avg arousal during plays)
  SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb) INTO v_top_creators FROM (
    SELECT
      hs.creator AS value,
      COUNT(hp.id) AS play_count,
      round(AVG(hp.peak_arousal)::numeric, 2) AS avg_peak_arousal,
      round((AVG(hp.peak_arousal) / NULLIF(v_baseline_arousal, 0))::numeric, 3) AS lift_score
    FROM hypno_sources hs
    JOIN hypno_plays hp ON hp.source_id = hs.id
    WHERE hs.user_id = p_user_id AND hs.creator IS NOT NULL AND hp.peak_arousal IS NOT NULL
    GROUP BY hs.creator
    ORDER BY AVG(hp.peak_arousal) DESC NULLS LAST
    LIMIT 10
  ) t;

  -- Confidence: caps at 1.0 once there are 30+ plays
  v_confidence := LEAST(1.0, v_total_plays::numeric / 30.0);

  INSERT INTO erotic_preference_profile (
    user_id, total_plays, total_sources,
    top_themes, top_phrases, top_trigger_words, top_pacing,
    top_voice_styles, top_framings, top_identity_axes, top_creators,
    correlation_confidence, last_refreshed_at, computed_at
  ) VALUES (
    p_user_id, v_total_plays, v_total_sources,
    v_top_themes, v_top_phrases, v_top_triggers, v_top_pacing,
    v_top_voice, v_top_framings, v_top_identity, v_top_creators,
    v_confidence, NOW(), NOW()
  )
  ON CONFLICT (user_id) DO UPDATE SET
    total_plays = EXCLUDED.total_plays,
    total_sources = EXCLUDED.total_sources,
    top_themes = EXCLUDED.top_themes,
    top_phrases = EXCLUDED.top_phrases,
    top_trigger_words = EXCLUDED.top_trigger_words,
    top_pacing = EXCLUDED.top_pacing,
    top_voice_styles = EXCLUDED.top_voice_styles,
    top_framings = EXCLUDED.top_framings,
    top_identity_axes = EXCLUDED.top_identity_axes,
    top_creators = EXCLUDED.top_creators,
    correlation_confidence = EXCLUDED.correlation_confidence,
    last_refreshed_at = NOW(),
    computed_at = NOW();
END;
$$;
