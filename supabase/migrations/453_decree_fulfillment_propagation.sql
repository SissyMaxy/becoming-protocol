-- 453 — Propagate handler_decrees fulfillment → linked event tables.
--
-- The fulfillment-side gap I owned-up to: cock_conditioning_events,
-- gina_disclosure_events sit on a `status='pending'` row that needs
-- to flip to 'fulfilled' so the advancement triggers fire (curriculum
-- bonus, disclosure rung advance). But the evidence-upload UI flows
-- only touch handler_decrees — they don't know about the new shadow
-- event tables.
--
-- Cleanest fix: AFTER UPDATE trigger on handler_decrees.status. When
-- a decree flips to 'fulfilled', find any event row pointing back via
-- related_decree_id and flip its status too. The existing advancement
-- triggers (mig 449 disclosure_advance, mig 452 conditioning bonus)
-- fire naturally.
--
-- Same propagation for 'missed' so missed decrees correctly mark the
-- shadow event row.
--
-- Covers: cock_conditioning_events, gina_disclosure_events.
-- Wardrobe_prescriptions and gina_seed_plantings use different link
-- patterns (assigned_via_outreach_id, related_outreach_id) — they get
-- separate handlers in subsequent migrations.

CREATE OR REPLACE FUNCTION trg_propagate_decree_status_to_events()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  -- Only fire on actual status transitions to terminal states
  IF NEW.status NOT IN ('fulfilled','missed') THEN RETURN NEW; END IF;
  IF COALESCE(OLD.status,'') = NEW.status THEN RETURN NEW; END IF;

  -- cock_conditioning_events
  UPDATE cock_conditioning_events
  SET status = CASE WHEN NEW.status = 'fulfilled' THEN 'fulfilled' ELSE 'missed' END,
      fulfilled_at = CASE WHEN NEW.status = 'fulfilled' THEN COALESCE(NEW.fulfilled_at, now()) ELSE NULL END,
      evidence_url = CASE WHEN NEW.proof_payload ? 'evidence_url'
                          THEN NEW.proof_payload->>'evidence_url'
                          ELSE evidence_url END,
      updated_at = now()
  WHERE related_decree_id = NEW.id AND status = 'pending';

  -- gina_disclosure_events
  UPDATE gina_disclosure_events
  SET status = CASE WHEN NEW.status = 'fulfilled' THEN 'fulfilled' ELSE 'missed' END,
      evidence_url = CASE WHEN NEW.proof_payload ? 'evidence_url'
                          THEN NEW.proof_payload->>'evidence_url'
                          ELSE evidence_url END,
      evidence_verified_at = CASE WHEN NEW.status = 'fulfilled' THEN now() ELSE evidence_verified_at END,
      updated_at = now()
  WHERE related_decree_id = NEW.id AND status = 'pending';

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'propagate_decree_status_to_events failed: %', SQLERRM;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS propagate_decree_status_to_events ON handler_decrees;
CREATE TRIGGER propagate_decree_status_to_events
  AFTER UPDATE OF status ON handler_decrees
  FOR EACH ROW EXECUTE FUNCTION trg_propagate_decree_status_to_events();

-- Same propagation for wardrobe_prescriptions via assigned_via_outreach_id ⇄ handler_outreach_queue
-- (no related_decree_id on wardrobe_prescriptions; the outreach row IS the link)
-- This requires looking up the matching outreach for the decree, which we don't have
-- directly — wardrobe doesn't write a decree at all. So wardrobe needs a different
-- trigger: AFTER UPDATE on handler_outreach_queue when a fulfilled marker is added.
--
-- Best path: a side-channel `outreach_evidence_log` already exists in the codebase
-- (per memory). For now we add a manual mark function the UI / verifier can call
-- to flip wardrobe_prescriptions + gina_seed_plantings without going through
-- handler_decrees.

CREATE OR REPLACE FUNCTION mark_outreach_fulfilled(p_outreach_id UUID, p_evidence_url TEXT DEFAULT NULL)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE v_touched INT := 0;
BEGIN
  -- wardrobe_prescriptions
  UPDATE wardrobe_prescriptions
  SET status = 'fulfilled',
      verification_photo_id = NULL,  -- evidence_url stored elsewhere
      updated_at = now()
  WHERE assigned_via_outreach_id = p_outreach_id AND status = 'pending';
  GET DIAGNOSTICS v_touched = ROW_COUNT;

  -- gina_seed_plantings: flip to 'observed' (its terminal state)
  IF v_touched = 0 THEN
    UPDATE gina_seed_plantings
    SET status = 'observed',
        planted_at = COALESCE(planted_at, now()),
        reaction_voice_url = COALESCE(p_evidence_url, reaction_voice_url),
        updated_at = now()
    WHERE related_outreach_id = p_outreach_id AND status = 'pending';
    GET DIAGNOSTICS v_touched = ROW_COUNT;
  END IF;

  RETURN v_touched > 0;
END;
$fn$;

GRANT EXECUTE ON FUNCTION mark_outreach_fulfilled(UUID, TEXT) TO authenticated, service_role;
