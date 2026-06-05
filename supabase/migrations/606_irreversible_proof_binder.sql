-- 606 — Real-world proof binder + paper trail.
--
-- Wish (user_directive): a forced purchase / appointment / public fem-name
-- use leaves a real-world trace. Capture the proof (receipt screenshot or
-- forwarded email, plus an optional calendar hold) into one irreversible
-- ledger, surface a single Binder view on Today, and nudge any item whose
-- proof is overdue. The pile of irreversible acts IS the conditioning —
-- you can't un-buy the panties, un-book the wax, un-say the name out loud.
--
-- SENSITIVE — Gina-CC (carbon-copying Gina on a captured proof) is gated on
-- a MASTER switch keyed to GINA'S OWN consent, not Maxy's wish:
--   user_state.gina_witness_consent: 'never' (default) | 'granted' | 'withdrawn'
-- Default off. Withdrawal is immediate AND retroactive — it cancels every
-- still-pending CC. On top of the master switch, each item requires Maxy's
-- per-item opt-in (gina_cc_opt_in). We NEVER fabricate Gina's reaction; the
-- binder is fully useful with Gina at 'never'. This migration only builds
-- the ledger + gate + the queued-CC marker; no CC is auto-delivered here —
-- a CC only leaves the app when BOTH master='granted' AND per-item opt-in,
-- and even then it's a Maxy-authored task, not a fabricated Gina message.

-- ── Master switch: Gina's own consent lives on user_state ────────────────
ALTER TABLE user_state ADD COLUMN IF NOT EXISTS gina_witness_consent TEXT
  NOT NULL DEFAULT 'never'
  CHECK (gina_witness_consent IN ('never', 'granted', 'withdrawn'));

-- ── The ledger ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS irreversible_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- What kind of irreversible act this is.
  event_kind TEXT NOT NULL
    CHECK (event_kind IN ('purchase', 'appointment', 'fem_name_use', 'other')),
  title TEXT NOT NULL,
  detail TEXT,
  amount_cents INT,                              -- purchases; null otherwise

  -- Proof capture. proof_photo_path is a verification-photos object path
  -- (receipt screenshot / forwarded-email screenshot). proof_email_ref is a
  -- free-text reference for a forwarded email (subject / sender) when no
  -- screenshot is taken. calendar_hold_at is the optional calendar hold.
  proof_photo_path TEXT,
  proof_email_ref TEXT,
  calendar_hold_at TIMESTAMPTZ,

  -- Lifecycle. 'pending' = act logged, proof not yet captured. 'captured' =
  -- proof landed. 'cancelled' = retracted before proof.
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'captured', 'cancelled')),
  proof_due_at TIMESTAMPTZ,                       -- overdue-nudge deadline
  captured_at TIMESTAMPTZ,
  last_nudged_at TIMESTAMPTZ,
  nudge_count INT NOT NULL DEFAULT 0,

  -- Gina-CC, gated. opt_in is Maxy's per-item choice; cc_status tracks the
  -- queued CC. A CC only ever reaches 'sent' through a Maxy-authored task.
  gina_cc_opt_in BOOLEAN NOT NULL DEFAULT FALSE,
  cc_status TEXT NOT NULL DEFAULT 'none'
    CHECK (cc_status IN ('none', 'queued', 'sent', 'cancelled')),
  cc_queued_at TIMESTAMPTZ,
  cc_cancelled_reason TEXT,

  source TEXT NOT NULL DEFAULT 'binder',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE irreversible_events ENABLE ROW LEVEL SECURITY;
DO $do$ BEGIN
  CREATE POLICY irrev_self ON irreversible_events FOR ALL TO authenticated
    USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $do$;

CREATE INDEX IF NOT EXISTS irreversible_events_user_idx
  ON irreversible_events(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS irreversible_events_overdue_idx
  ON irreversible_events(status, proof_due_at)
  WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS irreversible_events_cc_idx
  ON irreversible_events(user_id, cc_status)
  WHERE cc_status = 'queued';

-- ── Master CC gate: only queue a CC when BOTH master='granted' AND opt-in ─
-- Runs on insert/update of an irreversible_events row. Enforces the gate so
-- no callsite can queue a CC behind the master switch. Withdrawal of the
-- master switch is handled by the trigger on user_state below.
CREATE OR REPLACE FUNCTION trg_irrev_cc_gate()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE v_consent TEXT;
BEGIN
  IF NEW.gina_cc_opt_in IS DISTINCT FROM TRUE THEN
    -- No opt-in → never queued.
    IF NEW.cc_status = 'queued' THEN NEW.cc_status := 'none'; END IF;
    RETURN NEW;
  END IF;

  SELECT COALESCE(gina_witness_consent, 'never') INTO v_consent
    FROM user_state WHERE user_id = NEW.user_id;

  IF v_consent <> 'granted' THEN
    -- Master switch off → opt-in is harmless intent, but no CC queues.
    IF NEW.cc_status = 'queued' THEN NEW.cc_status := 'none'; END IF;
    RETURN NEW;
  END IF;

  -- Master granted + opt-in + proof captured → queue the CC marker.
  IF NEW.status = 'captured' AND NEW.cc_status = 'none' THEN
    NEW.cc_status := 'queued';
    NEW.cc_queued_at := now();
  END IF;
  RETURN NEW;
END;
$fn$;

DO $do$ BEGIN
  DROP TRIGGER IF EXISTS irrev_cc_gate ON irreversible_events;
  CREATE TRIGGER irrev_cc_gate
    BEFORE INSERT OR UPDATE ON irreversible_events
    FOR EACH ROW EXECUTE FUNCTION trg_irrev_cc_gate();
EXCEPTION WHEN OTHERS THEN NULL; END $do$;

-- ── Retroactive withdrawal: flipping the master switch to 'withdrawn' (or
-- back to 'never') cancels EVERY still-pending CC immediately. This is the
-- hard part of the consent contract — Gina can take it back and it reaches
-- back in time over anything not yet sent.
CREATE OR REPLACE FUNCTION trg_gina_consent_withdraw()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  IF NEW.gina_witness_consent = 'granted' THEN RETURN NEW; END IF;
  IF OLD.gina_witness_consent IS NOT DISTINCT FROM NEW.gina_witness_consent THEN RETURN NEW; END IF;

  UPDATE irreversible_events
     SET cc_status = 'cancelled',
         cc_cancelled_reason = 'gina_consent_' || NEW.gina_witness_consent,
         updated_at = now()
   WHERE user_id = NEW.user_id
     AND cc_status IN ('queued');
  RETURN NEW;
END;
$fn$;

DO $do$ BEGIN
  DROP TRIGGER IF EXISTS gina_consent_withdraw ON user_state;
  CREATE TRIGGER gina_consent_withdraw
    AFTER UPDATE OF gina_witness_consent ON user_state
    FOR EACH ROW EXECUTE FUNCTION trg_gina_consent_withdraw();
EXCEPTION WHEN OTHERS THEN NULL; END $do$;

-- ── keep updated_at fresh ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION trg_irrev_touch()
RETURNS TRIGGER LANGUAGE plpgsql AS $fn$
BEGIN NEW.updated_at := now(); RETURN NEW; END; $fn$;
DO $do$ BEGIN
  DROP TRIGGER IF EXISTS irrev_touch ON irreversible_events;
  CREATE TRIGGER irrev_touch BEFORE UPDATE ON irreversible_events
    FOR EACH ROW EXECUTE FUNCTION trg_irrev_touch();
EXCEPTION WHEN OTHERS THEN NULL; END $do$;

-- ── Atomic nudge marker. The nudge fn calls this so last_nudged_at and
-- nudge_count advance together, and only while the row is still pending
-- (a concurrent capture wins). SECURITY DEFINER + service-role-only callers.
CREATE OR REPLACE FUNCTION mark_irreversible_nudged(p_event_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  UPDATE irreversible_events
     SET last_nudged_at = now(),
         nudge_count = nudge_count + 1,
         updated_at = now()
   WHERE id = p_event_id AND status = 'pending';
END;
$fn$;

-- ── Nightly overdue-nudge cron: 02:40 UTC. The fn self-selects pending
-- rows past proof_due_at and queues one nudge per overdue item (deduped by
-- last_nudged_at so a stuck item is reminded at most daily).
DO $$
DECLARE v_url TEXT; v_key TEXT;
BEGIN
  v_url := current_setting('app.settings.supabase_url', true);
  IF v_url IS NULL OR length(v_url) = 0 THEN v_url := 'https://atevwvexapiykchvqvhm.supabase.co'; END IF;
  v_key := current_setting('app.settings.service_role_key', true);

  PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'irreversible-proof-nudge-nightly';

  PERFORM cron.schedule('irreversible-proof-nudge-nightly', '40 2 * * *', format(
    $sql$ SELECT net.http_post(url := %L, body := '{}'::jsonb,
      headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' || %L)); $sql$,
    v_url || '/functions/v1/irreversible-proof-nudge', COALESCE(v_key, '')));
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE '606: irreversible proof nudge cron registration skipped: %', SQLERRM;
END $$;
