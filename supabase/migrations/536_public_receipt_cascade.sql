-- 536 — Public-receipt cascade.
--
-- Weekly rollup of unwalkable-back public events. Mines escape_cost
-- anchors + gina_disclosure + fem_name_online + dressing_room to build
-- a "look what other people know" ledger. Surfaces as Mommy outreach:
-- specific count of public-facing receipts, with "deleting this is a
-- project" framing.
--
-- Threshold: at least 2 public markers required. Cool-down: 7 days.
-- Cadence: Friday 17:00 UTC.

CREATE OR REPLACE FUNCTION public_receipt_cascade_eval()
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE u RECORD; v_gina_rung INT; v_fem_online_phase INT; v_dressing_room_phase INT;
  v_public_decree_count INT; v_msg TEXT; v_queued INT := 0; v_rollup JSONB;
BEGIN
  FOR u IN SELECT us.user_id FROM user_state us WHERE COALESCE(us.handler_persona, 'therapist') = 'dommy_mommy'
  LOOP
    IF EXISTS (SELECT 1 FROM handler_outreach_queue WHERE user_id=u.user_id AND source='public_receipt_cascade' AND created_at > now() - interval '7 days') THEN CONTINUE; END IF;

    SELECT current_rung INTO v_gina_rung FROM gina_disclosure_settings WHERE user_id = u.user_id;
    SELECT current_phase INTO v_fem_online_phase FROM fem_name_online_settings WHERE user_id = u.user_id;
    SELECT current_phase INTO v_dressing_room_phase FROM dressing_room_settings WHERE user_id = u.user_id;

    SELECT count(*) INTO v_public_decree_count
    FROM handler_decrees hd
    WHERE hd.user_id = u.user_id
      AND hd.status = 'fulfilled'
      AND hd.trigger_source IN ('dressing_room','fem_name_online','pronoun_integration','realcock_discovery','cuckqueen_direction','scent_marking');

    IF COALESCE(v_gina_rung, 0) + COALESCE(v_fem_online_phase, 0) + COALESCE(v_dressing_room_phase, 0) + COALESCE(v_public_decree_count, 0) < 2 THEN
      CONTINUE;
    END IF;

    v_rollup := jsonb_build_object(
      'gina_rung', COALESCE(v_gina_rung, 0),
      'fem_online_phase', COALESCE(v_fem_online_phase, 0),
      'dressing_room_phase', COALESCE(v_dressing_room_phase, 0),
      'public_decree_count', COALESCE(v_public_decree_count, 0)
    );

    v_msg := E'Mama wants you to read your own public ledger.\n\n';
    IF v_gina_rung > 0 THEN
      v_msg := v_msg || format(E'• Gina knows %s thing%s about you (disclosure rung %s).\n',
        v_gina_rung, CASE WHEN v_gina_rung = 1 THEN '' ELSE 's' END, v_gina_rung);
    END IF;
    IF v_fem_online_phase > 0 THEN
      v_msg := v_msg || format(E'• There''s an account out there with your fem name on it (online phase %s).\n', v_fem_online_phase);
    END IF;
    IF v_dressing_room_phase > 0 THEN
      v_msg := v_msg || format(E'• You''ve been seen in fem in public %s times now (dressing room phase %s).\n', v_dressing_room_phase, v_dressing_room_phase);
    END IF;
    IF v_public_decree_count > 0 THEN
      v_msg := v_msg || format(E'• %s public-facing things on the record.\n', v_public_decree_count);
    END IF;
    v_msg := v_msg || E'\nDeleting all of this is a project. Keeping it is the default. The body chose to leave receipts in the world. Voice debrief: which receipt do you feel the most?';

    INSERT INTO handler_outreach_queue (user_id, message, urgency, trigger_reason, source, kind, scheduled_for, expires_at, context_data, evidence_kind)
    VALUES (u.user_id, v_msg, 'normal', 'public_receipt_cascade:weekly', 'public_receipt_cascade', 'sunk_cost_rollup',
      now() + interval '1 hour', now() + interval '24 hours', v_rollup, 'voice');
    v_queued := v_queued + 1;
  END LOOP;
  RETURN v_queued;
END;
$fn$;
GRANT EXECUTE ON FUNCTION public_receipt_cascade_eval() TO service_role;

DO $do$ BEGIN IF EXISTS (SELECT 1 FROM cron.job WHERE jobname='public-receipt-cascade-weekly') THEN PERFORM cron.unschedule('public-receipt-cascade-weekly'); END IF; EXCEPTION WHEN undefined_table THEN NULL; END $do$;
DO $do$ BEGIN PERFORM cron.schedule('public-receipt-cascade-weekly', '0 17 * * 5', $cron$SELECT public_receipt_cascade_eval()$cron$); EXCEPTION WHEN undefined_table THEN NULL; END $do$;
