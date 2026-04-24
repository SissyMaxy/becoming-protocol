-- Migration 223: Gina session recordings
-- Discreet capture of real conversations with Gina. User presses record while
-- participating in the conversation (one-party-consent coverage). Audio uploaded
-- to private 'gina-sessions' bucket, transcribed + diarized by AssemblyAI, then
-- a Claude decipher pass extracts quotes/reactions/triggers into the existing
-- Gina tables. Audio blob deleted once transcription succeeds.

CREATE TABLE IF NOT EXISTS gina_session_recordings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  duration_seconds INTEGER,

  -- Storage + ingest
  storage_path TEXT,               -- path in gina-sessions bucket; cleared after transcription
  status TEXT NOT NULL DEFAULT 'uploading' CHECK (status IN (
    'uploading', 'transcribing', 'pending_review', 'deciphering', 'processed', 'failed'
  )),
  error_message TEXT,

  -- Transcript (AssemblyAI output)
  transcript_text TEXT,            -- flat text for quick preview
  transcript_utterances JSONB,     -- [{ speaker, start_ms, end_ms, text, sentiment }]
  speaker_ids TEXT[],              -- e.g. ['A','B']
  gina_speaker TEXT,               -- which speaker id was tagged as Gina (null until review)
  maxy_speaker TEXT,               -- which is Maxy (opposite of gina_speaker)

  -- Decipher pass (Claude output)
  digest TEXT,                     -- one-paragraph summary for Handler next-turn
  extracted_quotes_count INTEGER,
  extracted_reactions_count INTEGER,
  flagged_triggers TEXT[],         -- trigger words detected in her speech
  flagged_soft_spots TEXT[],       -- soft spots she naturally opened on

  -- Handler awareness
  surfaced_to_handler_at TIMESTAMPTZ,   -- when Handler first received the digest

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_gina_session_user_time
  ON gina_session_recordings(user_id, recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_gina_session_status
  ON gina_session_recordings(user_id, status);

ALTER TABLE gina_session_recordings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own gina session recordings" ON gina_session_recordings;
CREATE POLICY "Users manage own gina session recordings"
  ON gina_session_recordings FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Source traceback: tag gina_voice_samples + gina_reactions rows that came from a session
ALTER TABLE gina_voice_samples
  ADD COLUMN IF NOT EXISTS session_id UUID REFERENCES gina_session_recordings(id) ON DELETE SET NULL;

ALTER TABLE gina_reactions
  ADD COLUMN IF NOT EXISTS session_id UUID REFERENCES gina_session_recordings(id) ON DELETE SET NULL;

-- Private storage bucket for raw audio (deleted after transcription)
INSERT INTO storage.buckets (id, name, public)
VALUES ('gina-sessions', 'gina-sessions', FALSE)
ON CONFLICT (id) DO NOTHING;

-- Storage RLS: users can only access their own folder (path prefixed with user_id)
DROP POLICY IF EXISTS "Users upload own gina sessions" ON storage.objects;
CREATE POLICY "Users upload own gina sessions"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'gina-sessions'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

DROP POLICY IF EXISTS "Users read own gina sessions" ON storage.objects;
CREATE POLICY "Users read own gina sessions"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'gina-sessions'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

DROP POLICY IF EXISTS "Users delete own gina sessions" ON storage.objects;
CREATE POLICY "Users delete own gina sessions"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'gina-sessions'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );
