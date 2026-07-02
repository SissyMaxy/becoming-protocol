-- 651 — Reconditioning Engine, Phase 1c: safety responder + turn-out interface.
--
-- DESIGN §6 (safety rails) + §6a (turn-out consumer). Two triggers:
--   1. recon_safeword_halt — a safeword latch pauses EVERY running program within
--      one tick, cancels open reconsolidation windows. The non-negotiable exit.
--   2. recon_turnout_consolidate — a turn-out ladder attestation (a real, chosen,
--      already-occurred rung) opens a reconsolidation session that consolidates
--      the FACT as identity. Fail-closed through conditioning_gate; never
--      pressures the next rung, never fabricates a rung.

-- ─── 1. Safeword halt (§6.2) ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION recon_safeword_halt(p_user UUID)
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE v_n INTEGER := 0;
BEGIN
  -- Pause every running program, reflect onto its target, and log ONLY the ones
  -- this halt actually paused (one CTE chain so the count and log are exact).
  WITH paused AS (
    UPDATE reconditioning_programs SET status = 'paused'
     WHERE user_id = p_user AND status = 'running'
     RETURNING id, phase, target_id
  ),
  tgt AS (
    UPDATE reconditioning_targets t SET status = 'paused'
      FROM paused p WHERE t.id = p.target_id AND t.status = 'active'
      RETURNING t.id
  ),
  logged AS (
    INSERT INTO recon_program_transition_log (program_id, from_phase, to_phase, via, note)
    SELECT id, phase, phase, 'safeword', 'paused by safeword latch' FROM paused
    RETURNING 1
  )
  SELECT count(*) INTO v_n FROM paused;

  -- Cancel any open labile window — no re-encoding while halted.
  UPDATE recon_reconsolidation_sessions SET status = 'cancelled'
   WHERE user_id = p_user AND status IN ('opened','reencoded');

  RETURN v_n;
END;
$fn$;
GRANT EXECUTE ON FUNCTION recon_safeword_halt(UUID) TO service_role;

CREATE OR REPLACE FUNCTION trg_recon_safeword_halt()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  PERFORM recon_safeword_halt(NEW.user_id);
  RETURN NEW;
END;
$fn$;
DROP TRIGGER IF EXISTS recon_safeword_halt ON safeword_latches;
CREATE TRIGGER recon_safeword_halt
  AFTER INSERT ON safeword_latches
  FOR EACH ROW EXECUTE FUNCTION trg_recon_safeword_halt();

-- ─── 2. Turn-out consolidator (§6a) ─────────────────────────────────────────
-- On a new attestation (a rung the ladder recorded as already-occurred by her
-- choice), open a reconsolidation session that consolidates the fact as identity.
-- One-directional: the ladder produces; this engine consumes. It NEVER pressures
-- the next rung and NEVER fabricates a rung (facts are forensic).
CREATE OR REPLACE FUNCTION recon_turnout_consolidate(
  p_user UUID, p_attestation UUID, p_attestation_text TEXT, p_occurred_at TIMESTAMPTZ
) RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_gate JSONB;
  v_target reconditioning_targets%ROWTYPE;
  v_n INTEGER := 0;
  v_slugs TEXT[] := ARRAY['the_man_is_the_costume','arousal_is_the_becoming'];
  v_slug TEXT;
BEGIN
  -- Gate first, fail-closed. Safeword-latched / paused / live-meet → nothing.
  v_gate := conditioning_gate(p_user, 'recondition');
  IF (v_gate->>'allow')::boolean IS DISTINCT FROM TRUE THEN
    RETURN 0;
  END IF;

  -- Settle delay: consolidate in reflection, not in the room. If it just
  -- happened, leave it for a later pass (the orchestrator re-checks open facts).
  IF p_occurred_at IS NOT NULL AND p_occurred_at > now() - interval '2 hours' THEN
    RETURN 0;
  END IF;

  FOREACH v_slug IN ARRAY v_slugs LOOP
    SELECT * INTO v_target FROM reconditioning_targets
     WHERE user_id = p_user AND slug = v_slug AND status IN ('active','consolidating');
    IF NOT FOUND THEN CONTINUE; END IF;

    -- Idempotent per (target, source event).
    IF EXISTS (
      SELECT 1 FROM recon_reconsolidation_sessions
       WHERE target_id = v_target.id AND source_event_table = 'hookup_attestations'
         AND source_event_id = p_attestation
    ) THEN CONTINUE; END IF;

    INSERT INTO recon_reconsolidation_sessions
      (user_id, target_id, recall_prompt, mismatch_evidence, reencode_claim,
       source_event_table, source_event_id, labile_until, status)
    VALUES
      (p_user, v_target.id,
       'Say back who you thought you were before this.',
       p_attestation_text,                        -- her own words are the mismatch
       v_target.claim_text,
       'hookup_attestations', p_attestation,
       now() + interval '2 hours', 'opened');
    v_n := v_n + 1;
  END LOOP;

  RETURN v_n;
END;
$fn$;
GRANT EXECUTE ON FUNCTION recon_turnout_consolidate(UUID, UUID, TEXT, TIMESTAMPTZ) TO service_role;

CREATE OR REPLACE FUNCTION trg_recon_turnout_consolidate()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  PERFORM recon_turnout_consolidate(NEW.user_id, NEW.id, NEW.attestation_text, NEW.occurred_at);
  RETURN NEW;
END;
$fn$;
DROP TRIGGER IF EXISTS recon_turnout_consolidate ON hookup_attestations;
CREATE TRIGGER recon_turnout_consolidate
  AFTER INSERT ON hookup_attestations
  FOR EACH ROW EXECUTE FUNCTION trg_recon_turnout_consolidate();
