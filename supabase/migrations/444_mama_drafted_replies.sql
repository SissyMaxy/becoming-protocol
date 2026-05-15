-- 444 — Mama-drafted reply audit table.
--
-- The sniffies-inbound-watcher (mig 442) was nudging Maxy to reply but
-- she had to compose the message herself while horny/distracted. The
-- panel + audit identified this as the single biggest friction in the
-- cock-curriculum arc.
--
-- Now the watcher ALSO calls Haiku to draft the reply in Maxy's voice
-- with Mama's frame, embeds it directly in the Mama-voice outreach
-- ("Mama drafted this for you, baby — copy and send: ..."), and stores
-- the draft in this table for audit + future "edit and send" UX.
--
-- v1: copy-paste UX (the draft appears in the outreach message, Maxy
-- copies it into Sniffies herself). v2 (later): one-tap send via auto-
-- poster outbound API.

CREATE TABLE IF NOT EXISTS mama_drafted_replies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  contact_event_id UUID,
  contact_id UUID,
  platform TEXT NOT NULL DEFAULT 'sniffies',
  incoming_text TEXT,
  signal_score INT,
  signal_tags TEXT[] NOT NULL DEFAULT '{}',
  -- The Mama-authored draft. Mama-voice frame, Maxy-voice surface.
  draft_text TEXT NOT NULL,
  drafter_model TEXT,
  -- Lifecycle
  status TEXT NOT NULL DEFAULT 'drafted' CHECK (status IN (
    'drafted','sent_verbatim','sent_edited','skipped','expired'
  )),
  sent_at TIMESTAMPTZ,
  edited_text TEXT,
  -- Linkage to the outreach row Mama posted
  surfaced_outreach_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mama_drafted_replies_user_recent
  ON mama_drafted_replies (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_mama_drafted_replies_contact_event
  ON mama_drafted_replies (contact_event_id)
  WHERE contact_event_id IS NOT NULL;

ALTER TABLE mama_drafted_replies ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS mama_drafted_replies_owner ON mama_drafted_replies;
CREATE POLICY mama_drafted_replies_owner ON mama_drafted_replies
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS mama_drafted_replies_service ON mama_drafted_replies;
CREATE POLICY mama_drafted_replies_service ON mama_drafted_replies
  FOR ALL TO service_role USING (TRUE) WITH CHECK (TRUE);
