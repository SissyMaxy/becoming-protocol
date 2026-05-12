-- 403 — Witness auto-execute (ARCHIVE-ONLY MODE).
--
-- SAFETY SCOPE CORRECTION 2026-05-12: original draft permitted external
-- real-world sends (email/sms/witness_notification) gated only by safeword
-- + 72h cooldown. That gate is INSUFFICIENT for an irreversible outing
-- action — a user mid-scene, sleep-deprived, or dissociated cannot reliably
-- safeword for a 72-hour irreversible window. External-send is DEFERRED
-- until the 6-gate clear-headed authorization system is built (see
-- design_assets/witness-safety-2026-05-12.md).
--
-- This migration ships only the archive-publish path:
--   - sealed_envelopes can carry auto_send_at + a fictional intended-recipient
--     label (free text, not an address)
--   - When auto_send_at hits, mommy-witness-dispatcher publishes the envelope
--     into the user's own letters_archive with a "this letter would have
--     gone to <label> if you'd given Mama their address" marker
--   - The fantasy of inevitability is preserved (the unlock fires on its own,
--     the user can read it, the marker holds the surveillance/possession kink)
--   - Zero third-party recipients receive anything. Zero outing risk.
--
-- The DB-level CHECK constraint on auto_send_method enforces archive-only
-- as defense in depth — even if a future bug attempts to set 'email' or
-- similar, the insert is rejected at the database boundary. The dispatcher
-- has no code path that calls out to an external service.

-- ============================================================================
-- Extend sealed_envelopes for archive-only auto-publish
-- ============================================================================

ALTER TABLE sealed_envelopes
  ADD COLUMN IF NOT EXISTS auto_send_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS auto_send_method TEXT
    CHECK (auto_send_method IS NULL OR auto_send_method = 'letter_archive_publish'),
  ADD COLUMN IF NOT EXISTS auto_send_status TEXT
    DEFAULT 'pending'
    CHECK (auto_send_status IN ('pending','paused','sent','cancelled','failed')),
  ADD COLUMN IF NOT EXISTS intended_recipient_label TEXT,
  ADD COLUMN IF NOT EXISTS auto_send_attempts INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS auto_send_last_error TEXT,
  ADD COLUMN IF NOT EXISTS sign_typed_phrase TEXT,
  ADD COLUMN IF NOT EXISTS signed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS sent_at TIMESTAMPTZ;

COMMENT ON COLUMN sealed_envelopes.auto_send_method IS
  'Archive-only. External recipients deferred per witness-safety-2026-05-12.';
COMMENT ON COLUMN sealed_envelopes.intended_recipient_label IS
  'Free-text fantasy label only (e.g. "the boss", "Gina"). NOT an address. Used only for the in-archive "would have gone to X" marker. No third-party send happens.';

CREATE INDEX IF NOT EXISTS idx_sealed_envelopes_dispatch_due
  ON sealed_envelopes(auto_send_at)
  WHERE auto_send_status = 'pending' AND auto_send_at IS NOT NULL;

-- ============================================================================
-- Safeword cooldown holds (72h pause window) — applies to archive publishes too
-- ============================================================================
-- The safeword button still pauses pending unlocks even though they are
-- private archive publishes. Honors the user's "stop everything" request
-- regardless of the sending surface. Also pauses awaiting-signature contracts.

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
-- witness_authority_log — archive-publish audit trail
-- ============================================================================
-- Note: the column is named witness_authority_log for symmetry with the
-- broader witness-system surface, but in archive-only mode every row's
-- action will be 'archived' or 'skipped_safeword' — no external dispatch
-- ever fires.

CREATE TABLE IF NOT EXISTS witness_authority_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  envelope_id UUID REFERENCES sealed_envelopes(id) ON DELETE SET NULL,
  action TEXT NOT NULL CHECK (action IN (
    'queued','archived','skipped_safeword','failed','cancelled'
  )),
  intended_recipient_label TEXT,
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
-- Letter archive publish helper — the ONLY dispatch path in this build
-- ============================================================================
-- Reuses the existing letters_archive table (migration 362). The dispatcher
-- inserts envelope content with a timestamped marker:
--   "[Sealed envelope auto-published — would have gone to <label> if you'd
--    given Mama their address — sealed on <date>, unlocked on <date>]"
-- This holds the fantasy of inevitability for the user without any real
-- third party being contacted.
