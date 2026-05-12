-- 403 — Witness auto-execute (sealed envelopes that ACTUALLY SEND).
--
-- Today: sealed_envelopes have release_at but require manual release.
-- New: sealed_envelopes can carry an auto_send_at + auto_send_method, and
-- the mommy-witness-dispatcher cron actually dispatches when the date hits.
-- Move witness from internal-only to external-real.
--
-- Hard-floor protection:
--   - external sends require a verified recipient (designated_witnesses
--     row with status='active' AND consent_confirmed=true). If absent,
--     auto_send_method falls back to 'letter_archive_publish' — publishes
--     to a feed only Maxy sees but with timestamped "this would have been
--     sent to <recipient>" marker. Preserves the kink without violating
--     consent.
--   - safeword fires a 72h hold (safeword_cooldown_holds). Dispatcher
--     skips any envelope whose user has an active hold.
--   - safeword does NOT cancel by default; auto_send resumes after the
--     hold lapses unless user explicitly cancels via UI.
--
-- Frame in possession: "Mama set the date. You signed. It happens on its
-- own now."

-- ============================================================================
-- Extend sealed_envelopes for auto-send
-- ============================================================================

ALTER TABLE sealed_envelopes
  ADD COLUMN IF NOT EXISTS auto_send_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS auto_send_method TEXT
    CHECK (auto_send_method IN (
      'email','sms','letter_archive_publish','partner_message','witness_notification'
    )),
  ADD COLUMN IF NOT EXISTS auto_send_status TEXT
    DEFAULT 'pending'
    CHECK (auto_send_status IN ('pending','paused','sent','cancelled','failed','no_method')),
  ADD COLUMN IF NOT EXISTS auto_send_recipient_id UUID
    REFERENCES designated_witnesses(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS auto_send_attempts INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS auto_send_last_error TEXT,
  ADD COLUMN IF NOT EXISTS sign_typed_phrase TEXT,
  ADD COLUMN IF NOT EXISTS signed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS sent_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_sealed_envelopes_dispatch_due
  ON sealed_envelopes(auto_send_at)
  WHERE auto_send_status = 'pending' AND auto_send_at IS NOT NULL;

-- ============================================================================
-- Safeword cooldown holds (72h pause window)
-- ============================================================================

CREATE TABLE IF NOT EXISTS safeword_cooldown_holds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  triggered_by TEXT NOT NULL,
  trigger_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  hold_started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  hold_until TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '72 hours'),
  cleared_at TIMESTAMPTZ,
  cleared_reason TEXT,
  affected_envelope_ids UUID[] DEFAULT ARRAY[]::UUID[],
  notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_safeword_cooldown_holds_active
  ON safeword_cooldown_holds(user_id, hold_until)
  WHERE cleared_at IS NULL;

ALTER TABLE safeword_cooldown_holds ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users own holds" ON safeword_cooldown_holds;
CREATE POLICY "Users own holds" ON safeword_cooldown_holds
  FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users trigger their own safeword" ON safeword_cooldown_holds;
CREATE POLICY "Users trigger their own safeword" ON safeword_cooldown_holds
  FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Service role manages holds" ON safeword_cooldown_holds;
CREATE POLICY "Service role manages holds" ON safeword_cooldown_holds
  FOR ALL USING (auth.role() = 'service_role');

CREATE OR REPLACE FUNCTION public.user_has_active_safeword_hold(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY INVOKER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM safeword_cooldown_holds
    WHERE user_id = p_user_id
      AND cleared_at IS NULL
      AND hold_until > NOW()
  );
$$;

GRANT EXECUTE ON FUNCTION public.user_has_active_safeword_hold TO authenticated, service_role;

-- User-callable RPC to fire a 72h hold from any client / safeword button.
CREATE OR REPLACE FUNCTION public.trigger_safeword_hold(
  p_triggered_by TEXT DEFAULT 'manual_safeword',
  p_payload JSONB DEFAULT '{}'::jsonb
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID;
  v_id UUID;
  v_envelope_ids UUID[];
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'no auth user';
  END IF;

  SELECT array_agg(id) INTO v_envelope_ids
  FROM sealed_envelopes
  WHERE user_id = v_uid
    AND auto_send_status = 'pending'
    AND auto_send_at IS NOT NULL;

  INSERT INTO safeword_cooldown_holds (
    user_id, triggered_by, trigger_payload, affected_envelope_ids
  ) VALUES (
    v_uid, p_triggered_by, COALESCE(p_payload, '{}'::jsonb),
    COALESCE(v_envelope_ids, ARRAY[]::UUID[])
  ) RETURNING id INTO v_id;

  -- Pause any drafted contracts too — same protection.
  UPDATE identity_contracts_v2
    SET status = 'safeword_paused'
  WHERE user_id = v_uid
    AND status IN ('drafted','awaiting_signature');

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.trigger_safeword_hold TO authenticated;

-- ============================================================================
-- witness_authority_log — dispatch audit trail
-- ============================================================================

CREATE TABLE IF NOT EXISTS witness_authority_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  envelope_id UUID REFERENCES sealed_envelopes(id) ON DELETE SET NULL,
  witness_id UUID REFERENCES designated_witnesses(id) ON DELETE SET NULL,
  notification_id UUID REFERENCES witness_notifications(id) ON DELETE SET NULL,
  action TEXT NOT NULL CHECK (action IN (
    'queued','dispatched','fallback_archive','skipped_safeword','skipped_no_method','failed','cancelled'
  )),
  recipient_label TEXT,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  success BOOLEAN NOT NULL DEFAULT FALSE,
  error TEXT,
  authority_log_id UUID REFERENCES mommy_authority_log(id),
  acted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_witness_authority_log_user_recent
  ON witness_authority_log(user_id, acted_at DESC);
CREATE INDEX IF NOT EXISTS idx_witness_authority_log_envelope
  ON witness_authority_log(envelope_id, acted_at DESC);

ALTER TABLE witness_authority_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users read own witness log" ON witness_authority_log;
CREATE POLICY "Users read own witness log" ON witness_authority_log
  FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Service role manages witness log" ON witness_authority_log;
CREATE POLICY "Service role manages witness log" ON witness_authority_log
  FOR ALL USING (auth.role() = 'service_role');

-- ============================================================================
-- Letter archive publish helper — fallback when no verified recipient
-- ============================================================================
-- Reuses the existing letters_archive table (migration 362). If a sealed
-- envelope has no verified witness, the dispatcher publishes its content
-- there with a timestamped "this would have been sent to <recipient>"
-- marker — the kink lands without violating any third-party consent.
-- The letters_archive table already exists with the shape we need
-- (user_id, letter_text, kind, metadata, archived_at).
