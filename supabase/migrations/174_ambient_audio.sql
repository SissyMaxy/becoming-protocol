-- Ambient Conditioning Audio Queue
-- Handler-queued feminine affirmations played via browser SpeechSynthesis during normal app use.
-- complianceCheck() drops entries into this queue hourly (scaled by conditioning_intensity_multiplier).
-- Client-side useAmbientAudio hook polls every 60s, speaks, marks played.

CREATE TABLE IF NOT EXISTS ambient_audio_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  audio_text TEXT NOT NULL,
  audio_url TEXT,
  audio_type TEXT CHECK (audio_type IN ('affirmation', 'mantra', 'command', 'reminder', 'shame')),
  scheduled_for TIMESTAMPTZ DEFAULT NOW(),
  played_at TIMESTAMPTZ,
  played BOOLEAN DEFAULT FALSE,
  intensity INTEGER DEFAULT 5 CHECK (intensity BETWEEN 1 AND 10),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE ambient_audio_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ambient_audio_select" ON ambient_audio_queue
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "ambient_audio_insert" ON ambient_audio_queue
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "ambient_audio_update" ON ambient_audio_queue
  FOR UPDATE USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_ambient_audio_pending ON ambient_audio_queue(user_id, played, scheduled_for)
  WHERE played = FALSE;
