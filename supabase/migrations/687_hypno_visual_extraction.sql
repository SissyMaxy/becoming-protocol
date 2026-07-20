-- 687_hypno_visual_extraction.sql
--
-- Visual craft extraction for ingested hypno sources.
--
-- WHY: mig 198 built the audio side (transcript → themes/phrases/triggers/pacing),
-- but the craft that makes these files work is largely VISUAL and TEMPORAL: how
-- long a line of text holds on screen, how fast cuts come, when text density
-- spikes, how all of that escalates across the runtime. The Modal worker samples
-- frames and runs JoyTag already, but it aggregates tags across the whole file
-- and discards timestamps — so "what happens at 4:32" is unanswerable, and the
-- pacing template a generator would need can't be derived.
--
-- Two changes:
--   1. hypno_features.feature_type CHECK gains the visual/temporal types. The
--      worker was already written to emit feature_type='visual_tag', which the
--      original CHECK rejects — those inserts fail. Fixing that here.
--   2. hypno_visual_timeline: fine-grained timestamped events (one row per
--      on-screen text appearance, cut, caption sample). hypno_features stays
--      the aggregate/summary layer; the timeline is the raw evidence under it.

-- ============================================
-- 1. Extend feature_type
-- ============================================
ALTER TABLE hypno_features DROP CONSTRAINT IF EXISTS hypno_features_feature_type_check;

ALTER TABLE hypno_features ADD CONSTRAINT hypno_features_feature_type_check
  CHECK (feature_type IN (
    -- audio/script features (mig 198)
    'theme',
    'phrase',
    'trigger_word',
    'pacing',
    'voice_style',
    'framing',
    'identity_axis',
    -- visual/temporal features (this migration)
    'visual_tag',        -- JoyTag label prevalent across frames
    'visual_caption',    -- natural-language description of a sampled moment
    'composition',       -- framing/shot characteristics
    'cut_rhythm',        -- editing cadence: cuts/min, binned by position
    'text_cadence',      -- on-screen text: hold duration, words/beat, density
    'onscreen_phrase'    -- a distinct string that appeared on screen
  ));

-- ============================================
-- 2. Fine-grained timeline
-- ============================================
CREATE TABLE IF NOT EXISTS hypno_visual_timeline (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id UUID NOT NULL REFERENCES hypno_sources(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  kind TEXT NOT NULL CHECK (kind IN ('text', 'cut', 'caption', 'tag')),

  -- Absolute seconds into the file, plus the same normalized 0-1 so files of
  -- different runtimes are directly comparable (this is what makes a template
  -- portable: "peak at 0.62" transfers, "peak at 8:14" does not).
  t_start_s NUMERIC NOT NULL,
  t_end_s NUMERIC,
  position_norm NUMERIC,              -- t_start_s / duration_s
  duration_s NUMERIC GENERATED ALWAYS AS (t_end_s - t_start_s) STORED,

  value TEXT,                         -- the OCR string / caption text / tag
  confidence NUMERIC,
  meta JSONB DEFAULT '{}'::jsonb,     -- bbox, font size est., layer index, etc.

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_hvt_source_kind ON hypno_visual_timeline(source_id, kind, t_start_s);
CREATE INDEX IF NOT EXISTS idx_hvt_user ON hypno_visual_timeline(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_hvt_position ON hypno_visual_timeline(source_id, position_norm);

ALTER TABLE hypno_visual_timeline ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users own hypno visual timeline" ON hypno_visual_timeline;
CREATE POLICY "Users own hypno visual timeline" ON hypno_visual_timeline
  FOR ALL USING (auth.uid() = user_id);

-- ============================================
-- 3. Craft profile — the template a generator reads
-- ============================================
-- Rolls the timeline up into the numbers generation actually needs. Deciles
-- (0-9) so curves are comparable across files regardless of runtime.
CREATE OR REPLACE FUNCTION hypno_craft_profile(p_source_id UUID)
RETURNS TABLE (
  decile INT,
  cuts INT,
  text_events INT,
  avg_text_hold_s NUMERIC,
  words_on_screen INT
)
LANGUAGE sql
STABLE
SECURITY INVOKER
AS $$
  SELECT
    LEAST(9, FLOOR(COALESCE(position_norm, 0) * 10))::INT AS decile,
    COUNT(*) FILTER (WHERE kind = 'cut')::INT AS cuts,
    COUNT(*) FILTER (WHERE kind = 'text')::INT AS text_events,
    ROUND(AVG(duration_s) FILTER (WHERE kind = 'text'), 2) AS avg_text_hold_s,
    COALESCE(SUM(
      CASE WHEN kind = 'text'
        THEN ARRAY_LENGTH(STRING_TO_ARRAY(TRIM(value), ' '), 1)
        ELSE 0 END
    ), 0)::INT AS words_on_screen
  FROM hypno_visual_timeline
  WHERE source_id = p_source_id
  GROUP BY 1
  ORDER BY 1;
$$;

COMMENT ON TABLE hypno_visual_timeline IS
  'Timestamped visual events extracted from an ingested hypno source: on-screen text with hold durations, cut points, frame captions, tags. Feeds hypno_craft_profile() which produces the pacing template generation reads.';
