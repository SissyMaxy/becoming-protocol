-- Migration 221: tag user_voice_corpus rows by flavor so the voice picker can
-- select the right subset per context. Also quarantines AI refusal rows that
-- polluted the platform_dm source (e.g. "I'm not comfortable roleplaying this").

ALTER TABLE user_voice_corpus
  ADD COLUMN IF NOT EXISTS corpus_flavor TEXT
    CHECK (corpus_flavor IS NULL OR corpus_flavor IN (
      'mommy_dom_outbound',
      'self_expression',
      'reply_banter',
      'quarantined_refusal'
    ));

CREATE INDEX IF NOT EXISTS idx_user_voice_corpus_flavor
  ON user_voice_corpus (user_id, corpus_flavor, signal_score DESC)
  WHERE corpus_flavor IS NOT NULL;

-- Quarantine AI refusal contamination. These came from when Claude refused to
-- roleplay adult scenarios on the platform; they got captured as outbound.
-- Not Maxy voice. Regex anchors are intentionally specific to avoid false positives.
UPDATE user_voice_corpus
SET corpus_flavor = 'quarantined_refusal'
WHERE source = 'platform_dm'
  AND corpus_flavor IS NULL
  AND (
    text ILIKE '%I''m not comfortable%'
    OR text ILIKE '%I need to step back%'
    OR text ILIKE '%I''m not gonna continue%'
    OR text ILIKE '%I can''t continue with%'
    OR text ILIKE '%If you''re interested in creative writing%'
    OR text ILIKE '%I''d be happy to help with other%'
    OR text ILIKE '%I understand you''d like me to roleplay%'
    OR text ILIKE '%I appreciate your interest, but I''m not%'
    OR text ILIKE '%The dynamic shifted somewhere%'
    OR text ILIKE '%I need to keep things I''m actually comfortable with%'
  );

-- Tag remaining platform_dm rows as mommy_dom_outbound. These are outbound
-- messages to subscribers on platforms where Maxy plays the dominant/mommy role.
UPDATE user_voice_corpus
SET corpus_flavor = 'mommy_dom_outbound'
WHERE source = 'platform_dm'
  AND corpus_flavor IS NULL;

-- Tag handler_dm as self_expression — Maxy writing to her own Handler, usually
-- in sub register. Useful for "Maxy-authentic" voice flavors, NOT for mommy-mode.
UPDATE user_voice_corpus
SET corpus_flavor = 'self_expression'
WHERE source = 'handler_dm'
  AND corpus_flavor IS NULL;
