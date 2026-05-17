-- 541 — Wardrobe-purge eval/cron/catalog wiring.
--
-- The wardrobe_purge_ladder + settings + events tables already exist
-- from a prior session (7 phases written, edicts in place, user enrolled
-- at phase 0), but there was no eval function, no cron, no catalog
-- entry — meaning the ladder couldn't actually fire. This migration
-- adds the missing wiring.
--
-- Gate: dressing_room_phase >= 3 (she needs fem replacements before
-- donating masc). Soft-gates inside the eval function rather than
-- a schema column.
--
-- Cadence: Saturday 14:00 UTC. Fulfillments anchor at weight 8 in
-- escape_cost_anchors as 'permanent_body_mod' kind.

CREATE OR REPLACE FUNCTION wardrobe_purge_eval()
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE s RECORD; l RECORD; v_pending INT; v_days NUMERIC; v_decree UUID; v_outreach UUID; v_queued INT := 0; v_dr_phase INT;
BEGIN
  FOR s IN SELECT wps.* FROM wardrobe_purge_settings wps LEFT JOIN user_state us ON us.user_id = wps.user_id
    WHERE wps.enabled AND (wps.paused_until IS NULL OR wps.paused_until <= now())
      AND COALESCE(us.handler_persona, 'therapist') = 'dommy_mommy'
  LOOP
    IF ladder_user_paused(s.user_id) THEN CONTINUE; END IF;
    SELECT count(*) INTO v_pending FROM wardrobe_purge_events WHERE user_id = s.user_id AND status='pending' AND created_at > now() - interval '21 days';
    IF v_pending > 0 THEN CONTINUE; END IF;
    SELECT * INTO l FROM wardrobe_purge_ladder WHERE phase = s.current_phase;
    IF l IS NULL THEN CONTINUE; END IF;
    IF s.last_assigned_at IS NOT NULL THEN
      v_days := EXTRACT(EPOCH FROM (now() - s.last_assigned_at)) / 86400.0;
      IF v_days < l.gap_min_days THEN CONTINUE; END IF;
    END IF;

    BEGIN
      SELECT current_phase INTO v_dr_phase FROM dressing_room_settings WHERE user_id = s.user_id;
    EXCEPTION WHEN OTHERS THEN v_dr_phase := 99; END;
    IF COALESCE(v_dr_phase, 0) < 3 THEN CONTINUE; END IF;

    INSERT INTO handler_decrees (user_id, edict, proof_type, deadline, status, consequence, trigger_source, reasoning)
    VALUES (s.user_id, l.edict, 'photo', now() + interval '14 days', 'active', 'slip +' || (l.phase + 3)::text, 'wardrobe_purge', 'phase=' || l.phase)
    RETURNING id INTO v_decree;
    INSERT INTO handler_outreach_queue (user_id, message, urgency, trigger_reason, source, kind, scheduled_for, expires_at, context_data, evidence_kind)
    VALUES (s.user_id, l.edict, 'high',
      'wardrobe_purge:' || l.category, 'wardrobe_purge_engine', 'wardrobe_purge_directive', now(), now() + interval '14 days',
      jsonb_build_object('phase', l.phase, 'decree_id', v_decree, 'category', l.category, 'target_count', l.target_count), 'photo')
    RETURNING id INTO v_outreach;
    INSERT INTO wardrobe_purge_events (user_id, phase_at_event, category, related_decree_id, related_outreach_id, status)
    VALUES (s.user_id, l.phase, l.category, v_decree, v_outreach, 'pending');
    UPDATE wardrobe_purge_settings SET last_assigned_at = now(), updated_at = now() WHERE user_id = s.user_id;
    v_queued := v_queued + 1;
  END LOOP;
  RETURN v_queued;
END;
$fn$;
GRANT EXECUTE ON FUNCTION wardrobe_purge_eval() TO service_role;

CREATE OR REPLACE FUNCTION trg_propagate_decree_to_wardrobe_purge()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE v_max_phase INT; v_user UUID; v_phase INT; v_phase_val INT;
BEGIN
  IF NEW.status NOT IN ('fulfilled','missed') OR COALESCE(OLD.status,'') = NEW.status THEN RETURN NEW; END IF;
  IF NEW.trigger_source <> 'wardrobe_purge' THEN RETURN NEW; END IF;
  UPDATE wardrobe_purge_events SET status = NEW.status, updated_at = now() WHERE related_decree_id = NEW.id AND status='pending';
  IF NEW.status='fulfilled' THEN
    v_user := NEW.user_id;
    SELECT current_phase INTO v_phase FROM wardrobe_purge_settings WHERE user_id = v_user;
    SELECT max(phase) INTO v_max_phase FROM wardrobe_purge_ladder;
    UPDATE wardrobe_purge_settings SET current_phase = LEAST(v_phase + 1, COALESCE(v_max_phase, 6)), updated_at = now() WHERE user_id = v_user;
    v_phase_val := NULLIF(substring(NEW.reasoning FROM 'phase=(\d+)'), '')::int;
    INSERT INTO escape_cost_anchors (user_id, anchor_kind, anchor_weight, reference_table, reference_id, description)
    VALUES (v_user, 'permanent_body_mod', 8, 'handler_decrees', NEW.id, 'wardrobe_purge phase ' || v_phase_val || ' donated');
  END IF;
  RETURN NEW;
END;
$fn$;
DROP TRIGGER IF EXISTS propagate_decree_to_wardrobe_purge ON handler_decrees;
CREATE TRIGGER propagate_decree_to_wardrobe_purge AFTER UPDATE OF status ON handler_decrees FOR EACH ROW EXECUTE FUNCTION trg_propagate_decree_to_wardrobe_purge();

DO $do$ BEGIN IF EXISTS (SELECT 1 FROM cron.job WHERE jobname='wardrobe-purge-monthly') THEN PERFORM cron.unschedule('wardrobe-purge-monthly'); END IF; EXCEPTION WHEN undefined_table THEN NULL; END $do$;
DO $do$ BEGIN PERFORM cron.schedule('wardrobe-purge-monthly', '0 14 * * 6', $cron$SELECT wardrobe_purge_eval()$cron$); EXCEPTION WHEN undefined_table THEN NULL; END $do$;

INSERT INTO ladder_catalog (trigger_source, display_name, category, settings_table, events_table, ladder_table, total_phases, cron_label, blurb)
VALUES ('wardrobe_purge', 'Wardrobe purge', 'fem_body', 'wardrobe_purge_settings', 'wardrobe_purge_events', 'wardrobe_purge_ladder', 7, 'Sat 14:00', 'Masc clothing → Goodwill, phase by phase')
ON CONFLICT (trigger_source) DO UPDATE SET display_name=EXCLUDED.display_name, total_phases=EXCLUDED.total_phases, cron_label=EXCLUDED.cron_label, blurb=EXCLUDED.blurb;
