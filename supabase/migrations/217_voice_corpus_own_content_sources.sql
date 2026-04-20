-- Migration 217: Allow own-platform content as voice corpus sources.
--
-- voice-learn.ts (2026-04-20 rewrite) captures Maxy's own writing from
-- Twitter, Reddit, and FetLife — not just DMs. The check constraint from
-- migration 196 rejected the new source values. This extends the allow-list.

ALTER TABLE user_voice_corpus DROP CONSTRAINT IF EXISTS user_voice_corpus_source_check;

ALTER TABLE user_voice_corpus
  ADD CONSTRAINT user_voice_corpus_source_check
  CHECK (source IN (
    'handler_dm',
    'platform_dm',
    'ai_edit_correction',
    'manual_sample',
    'journal',
    'own_twitter_post',
    'own_twitter_reply',
    'own_reddit_post',
    'own_reddit_comment',
    'own_fetlife_post'
  ));

NOTIFY pgrst, 'reload schema';
