-- 400 — mommy_authority_log: transparency trail for everything Mama ships without asking.
--
-- Per the full-gaslight + silent-ship authorization (2026-05-07), Mama ships
-- code, fires actions, queues outreach, and writes contracts without
-- per-feature operator approval. The user does NOT need notification before
-- the fact, but they DO need a single readable trail after the fact.
-- This table is that trail.
--
-- Every system that ships an authority action (deepening, contract, witness
-- dispatch, biometric-grounded outreach) writes one row here with:
--   - action_kind: machine-readable category
--   - action_summary: one-line plain-English ("Locked next-week wardrobe")
--   - voice_excerpt: the Mommy line if there was one (so the trail reads
--     in-fantasy when Maxy reviews it, not as a clinical audit log)
--   - action_payload: jsonb pointing back to the artifact (outreach_id,
--     contract_id, envelope_id, etc.)
--
-- Read pattern: /admin pulse panel + Today "Mama's been busy" peek + weekly
-- recap "what Mama did this week" section.

CREATE TABLE IF NOT EXISTS mommy_authority_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action_kind TEXT NOT NULL,
  source_system TEXT NOT NULL,
  action_summary TEXT NOT NULL,
  voice_excerpt TEXT,
  action_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  shipped_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  acknowledged_at TIMESTAMPTZ,
  reverted_at TIMESTAMPTZ,
  reverted_reason TEXT
);

CREATE INDEX IF NOT EXISTS idx_mommy_authority_log_user_recent
  ON mommy_authority_log(user_id, shipped_at DESC);
CREATE INDEX IF NOT EXISTS idx_mommy_authority_log_kind
  ON mommy_authority_log(user_id, action_kind, shipped_at DESC);

ALTER TABLE mommy_authority_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own authority log" ON mommy_authority_log;
CREATE POLICY "Users read own authority log" ON mommy_authority_log
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Service role writes authority log" ON mommy_authority_log;
CREATE POLICY "Service role writes authority log" ON mommy_authority_log
  FOR ALL USING (auth.role() = 'service_role');

-- Helper RPC for edge fns / triggers — clean single-call insert.
CREATE OR REPLACE FUNCTION public.log_mommy_authority(
  p_user_id UUID,
  p_action_kind TEXT,
  p_source_system TEXT,
  p_action_summary TEXT,
  p_voice_excerpt TEXT DEFAULT NULL,
  p_action_payload JSONB DEFAULT '{}'::jsonb
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  v_id UUID;
BEGIN
  INSERT INTO mommy_authority_log (
    user_id, action_kind, source_system, action_summary,
    voice_excerpt, action_payload
  ) VALUES (
    p_user_id, p_action_kind, p_source_system, p_action_summary,
    p_voice_excerpt, COALESCE(p_action_payload, '{}'::jsonb)
  )
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.log_mommy_authority TO service_role;
