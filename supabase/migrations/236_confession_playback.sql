-- Migration 236: confession_queue playback tracking
-- Confessions get quoted back at her in Handler chat, missed-commitment
-- outreach, and missed-decree outreach. Track how many times each
-- confession has been "played" so the Handler can prefer fresh ones,
-- and link the confession to its memory_implant promotion target.

ALTER TABLE confession_queue
  ADD COLUMN IF NOT EXISTS playback_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_played_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS promoted_to_implant_id UUID REFERENCES memory_implants(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_confession_queue_user_answered
  ON confession_queue (user_id, confessed_at DESC)
  WHERE confessed_at IS NOT NULL;
