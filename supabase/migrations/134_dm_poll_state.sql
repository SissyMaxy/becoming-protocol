-- Migration 134: DM Poll State
-- Deduplication table for DM reading. Tracks the last seen message
-- per platform/subscriber to avoid re-processing.

CREATE TABLE IF NOT EXISTS dm_poll_state (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  platform TEXT NOT NULL,
  subscriber_id TEXT NOT NULL,
  subscriber_name TEXT,
  last_message_text TEXT,
  last_message_at TIMESTAMPTZ,
  last_polled_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, platform, subscriber_id)
);

ALTER TABLE dm_poll_state ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users own dm poll state" ON dm_poll_state FOR ALL USING (auth.uid() = user_id);

-- Add incoming message tracking to paid_conversations
ALTER TABLE paid_conversations ADD COLUMN IF NOT EXISTS incoming_message TEXT;
ALTER TABLE paid_conversations ADD COLUMN IF NOT EXISTS message_direction TEXT DEFAULT 'outbound';
ALTER TABLE paid_conversations ADD COLUMN IF NOT EXISTS sent_at TIMESTAMPTZ;
