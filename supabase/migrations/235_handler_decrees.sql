-- Migration 235: handler_decrees
-- Short-window, Handler-issued, non-negotiable edicts. Distinct from
-- handler_commitments (Maxy-proposed, Handler-held) — a decree is the
-- Handler asserting power. Has a tight deadline (30m–6h), proof type,
-- and a consequence-on-miss parsed by the same enforcement path as
-- commitments.

CREATE TABLE IF NOT EXISTS handler_decrees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  edict TEXT NOT NULL,
  proof_type TEXT NOT NULL CHECK (proof_type IN ('photo', 'audio', 'text', 'journal_entry', 'voice_pitch_sample', 'device_state', 'none')),
  deadline TIMESTAMPTZ NOT NULL,
  consequence TEXT NOT NULL,
  reasoning TEXT,
  phase TEXT,
  trigger_source TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'fulfilled', 'missed', 'cancelled')),
  proof_payload JSONB,
  fulfilled_at TIMESTAMPTZ,
  missed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_handler_decrees_user_active
  ON handler_decrees (user_id, deadline)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_handler_decrees_user_created
  ON handler_decrees (user_id, created_at DESC);

ALTER TABLE handler_decrees ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS handler_decrees_owner ON handler_decrees;
CREATE POLICY handler_decrees_owner ON handler_decrees
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS handler_decrees_service ON handler_decrees;
CREATE POLICY handler_decrees_service ON handler_decrees
  FOR ALL TO service_role USING (true) WITH CHECK (true);
