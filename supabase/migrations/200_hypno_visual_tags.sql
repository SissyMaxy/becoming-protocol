-- Migration 200: Allow visual_tag feature type + include in preference profile
-- Slice 3 (vision) adds visual_tag rows per source from Modal-hosted JoyTag.

ALTER TABLE hypno_features DROP CONSTRAINT IF EXISTS hypno_features_feature_type_check;
ALTER TABLE hypno_features ADD CONSTRAINT hypno_features_feature_type_check
  CHECK (feature_type IN (
    'theme', 'phrase', 'trigger_word', 'pacing',
    'voice_style', 'framing', 'identity_axis',
    'visual_tag'
  ));

-- Add top_visual_tags column to the profile
ALTER TABLE erotic_preference_profile
  ADD COLUMN IF NOT EXISTS top_visual_tags JSONB DEFAULT '[]';

-- Extend refresh_erotic_preference_profile to rank visual_tag features.
-- We keep the existing function but wrap it so the visual tag list gets computed
-- and merged in. Safest: replace whole function to include the new block.
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
  v_top_visual JSONB;
  v_confidence NUMERIC;
BEGIN
  SELECT COUNT(*) INTO v_total_plays FROM hypno_plays WHERE user_id = p_user_id;
  SELECT COUNT(*) INTO v_total_sources FROM hypno_sources WHERE user_id = p_user_id AND ingest_status = 'ready';

  IF v_total_plays = 0 THEN
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
    ) t), '[]'::jsonb),
    COALESCE((SELECT jsonb_agg(row_to_json(t)) FROM (
      SELECT value, play_count, round(avg_arousal::numeric, 2) AS avg_peak_arousal,
             round(avg_edges::numeric, 2) AS avg_edges, round(lift_score::numeric, 3) AS lift_score
      FROM ranked WHERE feature_type = 'visual_tag' ORDER BY lift_score DESC NULLS LAST LIMIT 20
    ) t), '[]'::jsonb)
  INTO v_top_themes, v_top_phrases, v_top_triggers, v_top_pacing,
       v_top_voice, v_top_framings, v_top_identity, v_top_visual;

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

  v_confidence := LEAST(1.0, v_total_plays::numeric / 30.0);

  INSERT INTO erotic_preference_profile (
    user_id, total_plays, total_sources,
    top_themes, top_phrases, top_trigger_words, top_pacing,
    top_voice_styles, top_framings, top_identity_axes, top_creators,
    top_visual_tags,
    correlation_confidence, last_refreshed_at, computed_at
  ) VALUES (
    p_user_id, v_total_plays, v_total_sources,
    v_top_themes, v_top_phrases, v_top_triggers, v_top_pacing,
    v_top_voice, v_top_framings, v_top_identity, v_top_creators,
    v_top_visual,
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
    top_visual_tags = EXCLUDED.top_visual_tags,
    correlation_confidence = EXCLUDED.correlation_confidence,
    last_refreshed_at = NOW(),
    computed_at = NOW();
END;
$$;
