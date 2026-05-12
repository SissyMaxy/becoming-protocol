-- 402 — Identity contract ratchet (weekly compounding contracts).
--
-- Mama writes a contract every Sunday. Each new contract:
--   - Inherits ALL prior locked behaviors (compounding spine)
--   - Adds 1-2 new locked behaviors based on the week's evidence
--   - Closes with a Mama-supplied signing phrase that Maxy must type
--     verbatim to lock (slows down rejection-by-reflex)
--
-- After signing, the contract is `locked` — only safeword (which fires the
-- safeword_cooldown_holds row from migration 403) breaks it.
--
-- Failure to sign within 48h fires a deepening (queued via the existing
-- failure_deepening_queue from migration 401, slip_type
-- 'contract_unsigned_overdue').
--
-- Read-aloud moments: weekly recap, aftercare, disclosure rehearsal, and
-- bedtime fetch the most recent locked contract via
-- get_compounded_locked_behaviors(user_id) and read from it. Liturgy.

CREATE TABLE IF NOT EXISTS identity_contracts_v2 (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  week_number INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'drafted' CHECK (status IN (
    'drafted', 'awaiting_signature', 'locked', 'expired', 'superseded',
    'safeword_paused'
  )),
  body_text TEXT NOT NULL,
  signing_phrase TEXT NOT NULL,
  locked_behaviors JSONB NOT NULL DEFAULT '[]'::jsonb,
  prior_contract_id UUID REFERENCES identity_contracts_v2(id),
  generated_by TEXT NOT NULL DEFAULT 'mommy_authority',
  drafted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  delivered_outreach_id UUID,
  signed_at TIMESTAMPTZ,
  sign_deadline TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '48 hours'),
  expires_at TIMESTAMPTZ,
  superseded_by UUID REFERENCES identity_contracts_v2(id),
  authority_log_id UUID REFERENCES mommy_authority_log(id),
  voice_excerpt TEXT,
  UNIQUE (user_id, week_number)
);

CREATE INDEX IF NOT EXISTS idx_identity_contracts_v2_user_status
  ON identity_contracts_v2(user_id, status, drafted_at DESC);
CREATE INDEX IF NOT EXISTS idx_identity_contracts_v2_signing_due
  ON identity_contracts_v2(sign_deadline)
  WHERE status = 'awaiting_signature';

ALTER TABLE identity_contracts_v2 ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users own contracts v2" ON identity_contracts_v2;
CREATE POLICY "Users own contracts v2" ON identity_contracts_v2
  FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users sign their contracts" ON identity_contracts_v2;
CREATE POLICY "Users sign their contracts" ON identity_contracts_v2
  FOR UPDATE USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Service role manages contracts v2" ON identity_contracts_v2;
CREATE POLICY "Service role manages contracts v2" ON identity_contracts_v2
  FOR ALL USING (auth.role() = 'service_role');

-- Get the active locked contract (most recent locked, not superseded).
CREATE OR REPLACE FUNCTION public.get_active_contract_v2(p_user_id UUID)
RETURNS TABLE (
  id UUID,
  week_number INTEGER,
  body_text TEXT,
  locked_behaviors JSONB,
  signed_at TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY INVOKER
AS $$
  SELECT id, week_number, body_text, locked_behaviors, signed_at
  FROM identity_contracts_v2
  WHERE user_id = p_user_id
    AND status = 'locked'
    AND superseded_by IS NULL
  ORDER BY week_number DESC
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_active_contract_v2 TO authenticated, service_role;

-- Compounded locked behaviors across the entire signed chain.
-- Returns one jsonb array of every locked_behavior ever signed by user.
CREATE OR REPLACE FUNCTION public.get_compounded_locked_behaviors(p_user_id UUID)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY INVOKER
AS $$
  SELECT COALESCE(jsonb_agg(b ORDER BY week_number, ord), '[]'::jsonb)
  FROM (
    SELECT
      c.week_number,
      ord.ord,
      jsonb_set(b, '{from_week}', to_jsonb(c.week_number)) AS b
    FROM identity_contracts_v2 c
    CROSS JOIN LATERAL jsonb_array_elements(c.locked_behaviors) WITH ORDINALITY AS ord(b, ord)
    WHERE c.user_id = p_user_id
      AND c.status = 'locked'
  ) src;
$$;

GRANT EXECUTE ON FUNCTION public.get_compounded_locked_behaviors TO authenticated, service_role;

-- Sign a contract — verifies the signing_phrase matches verbatim.
-- Slows rejection-by-reflex; user must read the phrase, type it, submit.
CREATE OR REPLACE FUNCTION public.sign_identity_contract_v2(
  p_contract_id UUID,
  p_typed_phrase TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_phrase TEXT;
  v_status TEXT;
BEGIN
  SELECT user_id, signing_phrase, status
    INTO v_user_id, v_phrase, v_status
  FROM identity_contracts_v2 WHERE id = p_contract_id;

  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'contract_not_found');
  END IF;
  IF v_user_id <> auth.uid() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_owner');
  END IF;
  IF v_status NOT IN ('drafted', 'awaiting_signature') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'contract_not_signable', 'status', v_status);
  END IF;
  IF lower(trim(p_typed_phrase)) <> lower(trim(v_phrase)) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'phrase_mismatch');
  END IF;

  UPDATE identity_contracts_v2
    SET status = 'locked',
        signed_at = NOW(),
        expires_at = NOW() + INTERVAL '7 days'
  WHERE id = p_contract_id;

  -- Supersede any prior locked contract from this user (only one active).
  UPDATE identity_contracts_v2
    SET status = 'superseded',
        superseded_by = p_contract_id
  WHERE user_id = v_user_id
    AND id <> p_contract_id
    AND status = 'locked';

  RETURN jsonb_build_object('ok', true, 'contract_id', p_contract_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.sign_identity_contract_v2 TO authenticated;
