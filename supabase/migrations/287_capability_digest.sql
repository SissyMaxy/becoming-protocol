-- 287 — Daily capability digest surface.
--
-- 2026-05-07 user feedback: "how will I know when mommy is autonomously
-- making updates to her capabilities?" — there was no passive surface.
-- This adds one.
--
-- The digest summarizes mommy_code_wishes shipped/queued in the last 24h.
-- Two places it lands:
--   1. mama_capability_digest table — durable record, queryable
--   2. handler_outreach_queue with source='capability_digest', urgency='low'
--      — passive surface; Maxy sees it on Today.
--
-- Persona-agnostic — capability digests fire even when handler_persona is
-- not dommy_mommy (the user is the engineer here, not the protocol target).
-- Voice: plain operator English. NOT Mama voice. This is engineering output.

CREATE TABLE IF NOT EXISTS mama_capability_digest (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  digest_date DATE NOT NULL DEFAULT CURRENT_DATE,
  shipped_count INT NOT NULL DEFAULT 0,
  queued_count INT NOT NULL DEFAULT 0,
  -- The plain-English summary (what the user reads)
  summary_text TEXT NOT NULL,
  -- Structured payload: arrays of { wish_title, priority, ship_notes? }
  shipped_items JSONB,
  queued_items JSONB,
  -- The outreach row id this digest produced (so we don't double-fire)
  outreach_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, digest_date)
);

ALTER TABLE mama_capability_digest ADD COLUMN IF NOT EXISTS shipped_items JSONB;
ALTER TABLE mama_capability_digest ADD COLUMN IF NOT EXISTS queued_items JSONB;
ALTER TABLE mama_capability_digest ADD COLUMN IF NOT EXISTS outreach_id UUID;

CREATE INDEX IF NOT EXISTS idx_mama_capability_digest_user_date
  ON mama_capability_digest (user_id, digest_date DESC);

ALTER TABLE mama_capability_digest ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS mama_capability_digest_owner ON mama_capability_digest;
CREATE POLICY mama_capability_digest_owner ON mama_capability_digest
  FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS mama_capability_digest_service ON mama_capability_digest
;
CREATE POLICY mama_capability_digest_service ON mama_capability_digest
  FOR ALL TO service_role USING (true) WITH CHECK (true);
