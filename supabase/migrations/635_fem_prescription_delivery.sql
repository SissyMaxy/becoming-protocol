-- 635 — feminization_prescriptions delivery columns + canonical domain +
-- expiry sweep (FEM §1).
--
-- Current live shape (mig 259): status CHECK ('pending','completed',
-- 'skipped') — MUST be widened before any writer uses 'expired' or the
-- insert/update silently fails (the repo's most-repeated bug class).
-- completed_at / skipped_at already exist from 259.
--
-- Canonical fem_domain = task_bank vocabulary (16) + 'mantra'. Existing
-- rows are mapped through the alias map BEFORE the CHECK lands.
--
-- Expiry semantics (visible-before-penalized, mechanical):
--   deadline passed WITH surfaced_at    → status='expired'  (half-weight skip signal)
--   deadline passed, never surfaced     → status='expired', expired_silently=true
--                                          (counts for NOTHING — reader excludes)

-- ─── 1. Delivery columns ────────────────────────────────────────────

ALTER TABLE feminization_prescriptions
  ADD COLUMN IF NOT EXISTS surfaced_at   timestamptz,
  ADD COLUMN IF NOT EXISTS completed_at  timestamptz,
  ADD COLUMN IF NOT EXISTS skipped_at    timestamptz,
  ADD COLUMN IF NOT EXISTS skip_reason   text,
  ADD COLUMN IF NOT EXISTS deadline      timestamptz,
  ADD COLUMN IF NOT EXISTS evidence_kind text NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS evidence_path text,
  ADD COLUMN IF NOT EXISTS evidence_meta jsonb,
  ADD COLUMN IF NOT EXISTS requires      jsonb,
  ADD COLUMN IF NOT EXISTS expired_silently boolean NOT NULL DEFAULT false;

ALTER TABLE feminization_prescriptions DROP CONSTRAINT IF EXISTS feminization_prescriptions_evidence_kind_check;
ALTER TABLE feminization_prescriptions ADD CONSTRAINT feminization_prescriptions_evidence_kind_check
  CHECK (evidence_kind IN ('photo','voice','measurement','timer','text','none'));

ALTER TABLE feminization_prescriptions DROP CONSTRAINT IF EXISTS feminization_prescriptions_skip_reason_check;
ALTER TABLE feminization_prescriptions ADD CONSTRAINT feminization_prescriptions_skip_reason_check
  CHECK (skip_reason IS NULL OR skip_reason IN ('no_privacy','no_energy','dont_want_this','missing_item'));

-- ─── 2. Widen status CHECK (read 259's first: pending|completed|skipped) ──

ALTER TABLE feminization_prescriptions DROP CONSTRAINT IF EXISTS feminization_prescriptions_status_check;
ALTER TABLE feminization_prescriptions ADD CONSTRAINT feminization_prescriptions_status_check
  CHECK (status IN ('pending','completed','skipped','expired'));

-- ─── 3. Canonical fem_domain + alias data-migration ─────────────────
-- Alias map (keep in sync with src/lib/conditioning/fem-domains.ts and
-- supabase/functions/_shared/fem-domains.ts):
--   body→exercise, wardrobe→style, photo→identity, ritual→inner_narrative,
--   exposure→social, denial→chastity, confession→inner_narrative,
--   bottom-of-map catch-all → identity.

UPDATE feminization_prescriptions SET domain = CASE domain
  WHEN 'body'       THEN 'exercise'
  WHEN 'wardrobe'   THEN 'style'
  WHEN 'photo'      THEN 'identity'
  WHEN 'ritual'     THEN 'inner_narrative'
  WHEN 'exposure'   THEN 'social'
  WHEN 'denial'     THEN 'chastity'
  WHEN 'confession' THEN 'inner_narrative'
  ELSE 'identity'
END
WHERE domain NOT IN (
  'voice','movement','skincare','style','makeup','social','body_language',
  'inner_narrative','arousal','chastity','conditioning','identity',
  'exercise','scent','nutrition','wigs','mantra'
);

ALTER TABLE feminization_prescriptions DROP CONSTRAINT IF EXISTS feminization_prescriptions_domain_check;
ALTER TABLE feminization_prescriptions ADD CONSTRAINT feminization_prescriptions_domain_check
  CHECK (domain IN (
    'voice','movement','skincare','style','makeup','social','body_language',
    'inner_narrative','arousal','chastity','conditioning','identity',
    'exercise','scent','nutrition','wigs','mantra'
  ));

CREATE INDEX IF NOT EXISTS idx_fem_pres_pending_deadline
  ON feminization_prescriptions (user_id, status, deadline)
  WHERE status = 'pending';

-- ─── 4. Nightly expiry sweep ────────────────────────────────────────

CREATE OR REPLACE FUNCTION fem_prescriptions_expiry_sweep()
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_count INTEGER;
BEGIN
  UPDATE feminization_prescriptions
     SET status = 'expired',
         expired_silently = (surfaced_at IS NULL)
   WHERE status = 'pending'
     AND (
       (deadline IS NOT NULL AND deadline < now())
       OR (deadline IS NULL AND prescribed_date < CURRENT_DATE)
     );
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$fn$;

GRANT EXECUTE ON FUNCTION fem_prescriptions_expiry_sweep() TO service_role;

-- pg_cron wiring (guarded per repo rule — no CREATE EXTENSION IF NOT EXISTS).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    CREATE EXTENSION pg_cron;
  END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$
DECLARE jid BIGINT;
BEGIN
  FOR jid IN SELECT jobid FROM cron.job WHERE jobname = 'fem-prescription-expiry-sweep' LOOP
    PERFORM cron.unschedule(jid);
  END LOOP;
  PERFORM cron.schedule(
    'fem-prescription-expiry-sweep',
    '5 0 * * *',
    'SELECT fem_prescriptions_expiry_sweep()'
  );
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- One immediate sweep so historical never-surfaced pendings stop reading
-- as live backlog (they expire silently; the skip-rate reader excludes them).
SELECT fem_prescriptions_expiry_sweep();
