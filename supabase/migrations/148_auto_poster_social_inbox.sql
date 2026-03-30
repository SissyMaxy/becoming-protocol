-- Migration 148: Auto-poster status, social inbox, voice pitch samples
-- P4.1, P4.2, P4.3

-- ============================================
-- P4.1: Auto-Poster Status
-- ============================================

CREATE TABLE IF NOT EXISTS auto_poster_status (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status TEXT DEFAULT 'idle',
  last_post_at TIMESTAMPTZ,
  last_error TEXT,
  platform TEXT,
  posts_today INTEGER DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id)
);

ALTER TABLE auto_poster_status ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own auto_poster_status"
  ON auto_poster_status FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own auto_poster_status"
  ON auto_poster_status FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own auto_poster_status"
  ON auto_poster_status FOR UPDATE
  USING (auth.uid() = user_id);

-- Service role bypass for API endpoint (auto-poster uses service role key)
CREATE POLICY "Service role full access auto_poster_status"
  ON auto_poster_status FOR ALL
  USING (auth.role() = 'service_role');

-- ============================================
-- P4.2: Social Inbox
-- ============================================

CREATE TABLE IF NOT EXISTS social_inbox (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  platform TEXT NOT NULL,
  direction TEXT DEFAULT 'inbound' CHECK (direction IN ('inbound', 'outbound')),
  sender_name TEXT,
  sender_id TEXT,
  content TEXT,
  content_type TEXT DEFAULT 'dm' CHECK (content_type IN ('dm', 'reply', 'mention', 'comment')),
  read BOOLEAN DEFAULT FALSE,
  handler_action TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_social_inbox_user ON social_inbox(user_id, read, created_at DESC);

ALTER TABLE social_inbox ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own social_inbox"
  ON social_inbox FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own social_inbox"
  ON social_inbox FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own social_inbox"
  ON social_inbox FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Service role full access social_inbox"
  ON social_inbox FOR ALL
  USING (auth.role() = 'service_role');

-- ============================================
-- P4.3: Voice Pitch Samples
-- ============================================

CREATE TABLE IF NOT EXISTS voice_pitch_samples (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  pitch_hz FLOAT NOT NULL,
  context TEXT,
  session_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_voice_pitch_user ON voice_pitch_samples(user_id, created_at DESC);

ALTER TABLE voice_pitch_samples ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own voice_pitch_samples"
  ON voice_pitch_samples FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own voice_pitch_samples"
  ON voice_pitch_samples FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own voice_pitch_samples"
  ON voice_pitch_samples FOR UPDATE
  USING (auth.uid() = user_id);
