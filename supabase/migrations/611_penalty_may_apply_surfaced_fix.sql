-- 611 — Penalty Preview Rail guard: require genuine surfacing, not delivery.
--
-- REGRESSION FIX (review finding, high). penalty_may_apply() (mig 601) read
-- COALESCE(surfaced_at, delivered_at) from the companion outreach. But an
-- outreach can be DELIVERED (pushed) yet never SURFACED (the girl never
-- opened the app), and the surface-guarantor then marks it
-- expired_unsurfaced. Falling back to delivered_at let a penalty fire against
-- a cost she never actually saw — the exact visible-before-penalized
-- violation the rail exists to prevent.
--
-- Fix: the genuine "she saw it" signal is surfaced_at, never delivered_at;
-- and an expired_unsurfaced companion outreach can NEVER satisfy the gate.
-- Legacy backfilled previews (mig 610, no companion outreach) keep using
-- their own surfaced_at = created_at, so they're unaffected.

CREATE OR REPLACE FUNCTION penalty_may_apply(p_source_table TEXT, p_source_id UUID)
RETURNS BOOLEAN LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_prev penalty_previews%ROWTYPE;
  v_surfaced TIMESTAMPTZ;
  v_expired BOOLEAN;
BEGIN
  SELECT * INTO v_prev FROM penalty_previews WHERE source_table = p_source_table AND source_id = p_source_id;
  IF NOT FOUND THEN RETURN FALSE; END IF;          -- no cost shown = no penalty
  IF v_prev.cancelled_at IS NOT NULL THEN RETURN FALSE; END IF;

  IF v_prev.preview_outreach_id IS NOT NULL THEN
    -- Authoritative: the companion outreach's genuine surfacing. delivered_at
    -- is NOT a substitute for surfaced_at, and expired_unsurfaced is a veto.
    SELECT surfaced_at, expired_unsurfaced
      INTO v_surfaced, v_expired
      FROM handler_outreach_queue WHERE id = v_prev.preview_outreach_id;
    IF COALESCE(v_expired, FALSE) THEN RETURN FALSE; END IF;
  ELSE
    -- No companion outreach (e.g. legacy backfill) → the preview's own mirror.
    v_surfaced := v_prev.surfaced_at;
  END IF;

  IF v_surfaced IS NULL THEN RETURN FALSE; END IF;  -- never genuinely surfaced
  IF now() < v_surfaced + (v_prev.grace_minutes || ' minutes')::interval THEN RETURN FALSE; END IF;
  RETURN TRUE;
END;
$fn$;
GRANT EXECUTE ON FUNCTION penalty_may_apply(TEXT, UUID) TO authenticated, service_role;

-- Mirror trigger likewise: only mirror GENUINE surfacing, not delivery.
CREATE OR REPLACE FUNCTION trg_penalty_preview_mirror_surface()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  IF NEW.kind = 'penalty_preview' AND NEW.surfaced_at IS NOT NULL THEN
    UPDATE penalty_previews
       SET surfaced_at = NEW.surfaced_at
     WHERE preview_outreach_id = NEW.id AND surfaced_at IS NULL;
  END IF;
  RETURN NEW;
END;
$fn$;
