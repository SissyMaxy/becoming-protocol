-- Migration 223: femme_signal scoring + maxy_reaction for manual review loop.
--
-- femme_signal (0-10) tags each voice corpus row by how strongly it represents
-- feminization voice — high-signal rows get preferred by the mommy-dom picker.
-- maxy_reaction + maxy_reacted_at let Maxy thumbs up/down generated outputs
-- via the mommy-review CLI, feeding correlation analysis later.

ALTER TABLE user_voice_corpus
  ADD COLUMN IF NOT EXISTS femme_signal INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_user_voice_corpus_femme
  ON user_voice_corpus (user_id, corpus_flavor, femme_signal DESC, signal_score DESC);

ALTER TABLE ai_generated_content
  ADD COLUMN IF NOT EXISTS maxy_reaction TEXT
    CHECK (maxy_reaction IS NULL OR maxy_reaction IN ('up', 'down', 'skip')),
  ADD COLUMN IF NOT EXISTS maxy_reacted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS maxy_reaction_note TEXT;

CREATE INDEX IF NOT EXISTS idx_ai_gc_maxy_reaction_unreviewed
  ON ai_generated_content (user_id, created_at DESC)
  WHERE maxy_reaction IS NULL AND status = 'posted';
