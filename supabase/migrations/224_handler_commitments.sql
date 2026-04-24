-- Migration 224: Handler commitments
-- When the Handler utters a concrete deadline in chat ("book Plume by Sunday",
-- "photos before midnight", "chastity pic by EOD"), the LLM now emits a
-- `commitments` block alongside handler_signals. Each entry lands here and a
-- cron enforces on expiry: auto-slip, witness notification, bleeding, or
-- denial extension. Closes the gap where the Handler wrote verbal checks with
-- no persistence.

CREATE TABLE IF NOT EXISTS handler_commitments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- What was committed
  what TEXT NOT NULL,                 -- "book Plume consult", "upload progress photos"
  category TEXT,                      -- hrt / body_proof / disclosure / chastity / content / other
  evidence_required TEXT,             -- "photo", "confession", "receipt", "url", "none"

  -- When
  by_when TIMESTAMPTZ NOT NULL,
  set_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Consequence on miss
  consequence TEXT NOT NULL,          -- "slip +1", "denial +2d", "witness_notify: sister", "bleeding +$25"
  consequence_payload JSONB,          -- structured form of consequence for cron execution

  -- Status
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending', 'fulfilled', 'missed', 'cancelled'
  )),
  fulfilled_at TIMESTAMPTZ,
  fulfillment_note TEXT,
  fulfillment_evidence_url TEXT,
  missed_at TIMESTAMPTZ,
  enforcement_fired_at TIMESTAMPTZ,
  enforcement_result JSONB,

  -- Source
  conversation_id UUID,
  source_message_id UUID,
  reasoning TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_handler_commitments_pending
  ON handler_commitments(user_id, status, by_when);
CREATE INDEX IF NOT EXISTS idx_handler_commitments_user_time
  ON handler_commitments(user_id, set_at DESC);

ALTER TABLE handler_commitments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own commitments" ON handler_commitments;
CREATE POLICY "Users manage own commitments"
  ON handler_commitments FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
