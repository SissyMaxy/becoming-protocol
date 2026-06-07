-- 547 — Validation-pass fix: mommy_authority_log columns are
-- (action_kind, source_system, action_summary, action_payload) not
-- (source, action, details) — migs 524 (gina_arc_bump_evidence),
-- 527 (trg_milestone_cascade), 533 (trg_anchor_on_milestone) all
-- referenced the wrong columns. Three callsites fixed below.

CREATE OR REPLACE FUNCTION gina_arc_bump_evidence(p_user_id UUID, p_source TEXT)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE v_curr_stage INT; v_curr_count INT; v_required INT; v_advanced BOOLEAN := FALSE;
BEGIN
  SELECT current_stage, stage_evidence_count INTO v_curr_stage, v_curr_count
  FROM gina_arc_settings WHERE user_id = p_user_id;
  IF v_curr_stage IS NULL THEN RETURN FALSE; END IF;

  UPDATE gina_arc_settings SET stage_evidence_count = stage_evidence_count + 1, updated_at = now() WHERE user_id = p_user_id;
  v_curr_count := v_curr_count + 1;

  SELECT required_evidence_count INTO v_required FROM gina_arc_stages WHERE stage = v_curr_stage;
  IF v_required IS NOT NULL AND v_curr_count >= v_required AND v_curr_stage < 7 THEN
    UPDATE gina_arc_settings SET current_stage = v_curr_stage + 1, stage_evidence_count = 0, last_advanced_at = now(), updated_at = now() WHERE user_id = p_user_id;
    v_advanced := TRUE;
    INSERT INTO mommy_authority_log (user_id, action_kind, source_system, action_summary, action_payload)
    VALUES (p_user_id, 'stage_advance', 'gina_arc_auto_advance',
      'gina arc advanced ' || v_curr_stage || ' -> ' || (v_curr_stage + 1),
      jsonb_build_object('from_stage', v_curr_stage, 'to_stage', v_curr_stage + 1, 'trigger', p_source));
  END IF;
  RETURN v_advanced;
EXCEPTION WHEN undefined_table THEN RETURN FALSE;
END;
$fn$;

CREATE OR REPLACE FUNCTION trg_anchor_on_milestone()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  IF NEW.source_system <> 'milestone_cascade' THEN RETURN NEW; END IF;
  INSERT INTO escape_cost_anchors (user_id, anchor_kind, anchor_weight, reference_table, reference_id, description)
  VALUES (NEW.user_id, 'milestone_hit', 10, 'mommy_authority_log', NEW.id,
    NEW.action_kind || ': ' || COALESCE(NEW.action_payload->>'trigger_source', ''));
  RETURN NEW;
END;
$fn$;
DROP TRIGGER IF EXISTS anchor_on_milestone ON mommy_authority_log;
CREATE TRIGGER anchor_on_milestone AFTER INSERT ON mommy_authority_log
  FOR EACH ROW EXECUTE FUNCTION trg_anchor_on_milestone();
