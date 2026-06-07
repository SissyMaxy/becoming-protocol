-- 524 — Cross-ladder Gina-arc auto-advancement.
--
-- Closes the loop: cuckqueen_direction fulfillments + gina_seed_plantings
-- 'exceeded' outcomes both bump gina_arc_settings.stage_evidence_count,
-- and once that count hits the stage's required_evidence_count threshold
-- (from gina_arc_stages catalog), the stage auto-advances.
--
-- This means the cuckqueen ladder gates itself: it unlocks new phases
-- (which gate on required_arc_stage from mig 523) as its own
-- fulfillments push the arc forward. Self-tuning closed loop.
--
-- Audit trail: every auto-advance writes to mommy_authority_log so
-- the supervisor + admin pulse panel can see the cascade.
--
-- Gracefully degrades: if gina_arc tables or columns are missing, the
-- function returns FALSE and the calling trigger no-ops.

CREATE OR REPLACE FUNCTION gina_arc_bump_evidence(p_user_id UUID, p_source TEXT)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE v_curr_stage INT; v_curr_count INT; v_required INT; v_advanced BOOLEAN := FALSE;
BEGIN
  SELECT current_stage, stage_evidence_count INTO v_curr_stage, v_curr_count
  FROM gina_arc_settings WHERE user_id = p_user_id;
  IF v_curr_stage IS NULL THEN RETURN FALSE; END IF;

  UPDATE gina_arc_settings SET
    stage_evidence_count = stage_evidence_count + 1,
    updated_at = now()
  WHERE user_id = p_user_id;
  v_curr_count := v_curr_count + 1;

  SELECT required_evidence_count INTO v_required FROM gina_arc_stages WHERE stage = v_curr_stage;
  IF v_required IS NOT NULL AND v_curr_count >= v_required AND v_curr_stage < 7 THEN
    UPDATE gina_arc_settings SET
      current_stage = v_curr_stage + 1,
      stage_evidence_count = 0,
      last_advanced_at = now(),
      updated_at = now()
    WHERE user_id = p_user_id;
    v_advanced := TRUE;

    INSERT INTO mommy_authority_log (user_id, source, action, details)
    VALUES (p_user_id, 'gina_arc_auto_advance', 'stage_advance',
      jsonb_build_object('from_stage', v_curr_stage, 'to_stage', v_curr_stage + 1, 'trigger', p_source));
  END IF;
  RETURN v_advanced;
EXCEPTION WHEN undefined_table THEN
  RETURN FALSE;
END;
$fn$;
GRANT EXECUTE ON FUNCTION gina_arc_bump_evidence(UUID, TEXT) TO service_role, authenticated;

CREATE OR REPLACE FUNCTION trg_cuckqueen_bumps_gina_arc()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  IF NEW.status <> 'fulfilled' OR COALESCE(OLD.status,'') = 'fulfilled' THEN RETURN NEW; END IF;
  IF NEW.trigger_source <> 'cuckqueen_direction' THEN RETURN NEW; END IF;
  PERFORM gina_arc_bump_evidence(NEW.user_id, 'cuckqueen_fulfillment');
  RETURN NEW;
END;
$fn$;
DROP TRIGGER IF EXISTS cuckqueen_bumps_gina_arc ON handler_decrees;
CREATE TRIGGER cuckqueen_bumps_gina_arc
  AFTER UPDATE OF status ON handler_decrees
  FOR EACH ROW EXECUTE FUNCTION trg_cuckqueen_bumps_gina_arc();

CREATE OR REPLACE FUNCTION trg_seed_exceeded_bumps_gina_arc()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  IF NEW.hypothesis_outcome <> 'exceeded' OR COALESCE(OLD.hypothesis_outcome,'') = 'exceeded' THEN RETURN NEW; END IF;
  PERFORM gina_arc_bump_evidence(NEW.user_id, 'seed_exceeded');
  RETURN NEW;
END;
$fn$;
DROP TRIGGER IF EXISTS seed_exceeded_bumps_gina_arc ON gina_seed_plantings;
DO $do$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema='public' AND table_name='gina_seed_plantings' AND column_name='hypothesis_outcome')
  THEN
    CREATE TRIGGER seed_exceeded_bumps_gina_arc
      AFTER UPDATE OF hypothesis_outcome ON gina_seed_plantings
      FOR EACH ROW EXECUTE FUNCTION trg_seed_exceeded_bumps_gina_arc();
  END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END $do$;
