-- Migration 219: handler_attention queue
-- Referenced by scripts/auto-poster/handler-attention.ts (writes) and
-- scripts/auto-poster/attention.ts (reads). Not previously migrated, so every
-- queueAttention() call silently no-op'd (try/catch swallowed the table-missing
-- error). Creating now so stale-conversation revival and the PII-guard
-- outbound-suppressed flow can actually surface items to Maxy.

CREATE TABLE IF NOT EXISTS handler_attention (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
  kind TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'medium' CHECK (severity IN ('low', 'medium', 'high')),
  platform TEXT,
  summary TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  reviewed_at TIMESTAMPTZ,
  reviewed_action TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_handler_attention_user_unreviewed
  ON handler_attention (user_id, created_at DESC)
  WHERE reviewed_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_handler_attention_contact_kind
  ON handler_attention (contact_id, kind, reviewed_at)
  WHERE contact_id IS NOT NULL;

ALTER TABLE handler_attention ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users own attention queue" ON handler_attention
  FOR ALL USING (auth.uid() = user_id);
