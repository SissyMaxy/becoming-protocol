-- Migration 196: User voice corpus
-- Captures Maxy's actual writing so the Handler can match her cadence
-- instead of relying on the static persona in system-prompts.ts.

CREATE TABLE IF NOT EXISTS user_voice_corpus (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN (
    'handler_dm',
    'platform_dm',
    'ai_edit_correction',
    'manual_sample',
    'journal'
  )),
  source_context JSONB DEFAULT '{}'::jsonb,
  length INTEGER NOT NULL,
  signal_score INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_voice_corpus_user_created
  ON user_voice_corpus (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_user_voice_corpus_user_signal
  ON user_voice_corpus (user_id, signal_score DESC, created_at DESC);

ALTER TABLE user_voice_corpus ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users own voice corpus" ON user_voice_corpus
  FOR ALL USING (auth.uid() = user_id);
