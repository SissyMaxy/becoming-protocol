-- 457 — Chain-assertion test function.
--
-- Validates the full fulfillment chain end-to-end on a dummy decree
-- without leaving state behind. The protocol-health-check edge fn
-- (mig 453 era) catches RECENT activity gaps but doesn't validate
-- that the CHAIN ITSELF still works structurally. A schema change
-- could silently break cock_conditioning_events → curriculum_bonus
-- propagation without surfacing for a week.
--
-- This function runs assertions in a savepoint that gets rolled back.
-- It returns a JSONB report:
--   { ok: true/false, results: [{step, passed, msg}, ...] }
--
-- The health-check edge fn can call this and tag any failing step
-- as severity='error' in mommy_supervisor_log.

CREATE OR REPLACE FUNCTION test_fulfillment_chain()
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_test_user UUID;
  v_decree UUID;
  v_event UUID;
  v_outreach UUID;
  v_results JSONB := '[]'::jsonb;
  v_ok BOOLEAN := TRUE;
  v_cock_event_status TEXT;
  v_bonus_count_before INT;
  v_bonus_count_after INT;
BEGIN
  -- Pick a real user (any with dommy_mommy) to satisfy FK constraints
  SELECT user_id INTO v_test_user FROM user_state
  WHERE handler_persona = 'dommy_mommy' LIMIT 1;
  IF v_test_user IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'no dommy_mommy user');
  END IF;

  -- Savepoint to roll back all test side effects
  SAVEPOINT chain_test;

  BEGIN
    -- Step 1: insert a test decree with proof_type='voice'
    INSERT INTO handler_decrees (user_id, edict, proof_type, deadline, status, consequence, trigger_source, reasoning)
    VALUES (v_test_user, '[chain-test] voice-debrief decree', 'voice', now() + interval '1 day', 'active',
      'slip +1', 'chain_test_voice_proof', 'automated assertion run ' || now()::text)
    RETURNING id INTO v_decree;
    v_results := v_results || jsonb_build_object('step', 'voice_proof_type_accepted', 'passed', true, 'msg', 'decree=' || v_decree);

    -- Step 2: insert a test outreach with evidence_kind='voice'
    INSERT INTO handler_outreach_queue (user_id, message, urgency, trigger_reason, source, kind, scheduled_for, expires_at, context_data, evidence_kind)
    VALUES (v_test_user, '[chain-test] voice outreach', 'normal', 'chain_test:' || now()::text,
      'chain_test_engine', 'chain_test_outreach', now(), now() + interval '1 hour', '{}'::jsonb, 'voice')
    RETURNING id INTO v_outreach;
    v_results := v_results || jsonb_build_object('step', 'voice_evidence_kind_accepted', 'passed', true);

    -- Step 3: insert a cock_conditioning_event linked to decree, then flip decree to fulfilled
    INSERT INTO cock_conditioning_events (user_id, station_id, related_decree_id, related_outreach_id, status)
    SELECT v_test_user, MIN(id), v_decree, v_outreach, 'pending'
    FROM cock_conditioning_stations WHERE active = TRUE
    RETURNING id INTO v_event;

    SELECT count(*) INTO v_bonus_count_before FROM cock_curriculum_events
    WHERE user_id = v_test_user AND partner_label LIKE 'conditioning_bonus%';

    UPDATE handler_decrees SET status = 'fulfilled', fulfilled_at = now(),
      proof_payload = jsonb_build_object('evidence_url', 'test://chain') WHERE id = v_decree;

    -- Verify shadow event flipped
    SELECT status INTO v_cock_event_status FROM cock_conditioning_events WHERE id = v_event;
    IF v_cock_event_status = 'fulfilled' THEN
      v_results := v_results || jsonb_build_object('step', 'mig453_propagation_to_event', 'passed', true);
    ELSE
      v_results := v_results || jsonb_build_object('step', 'mig453_propagation_to_event', 'passed', false,
        'msg', 'event status=' || COALESCE(v_cock_event_status, 'null'));
      v_ok := FALSE;
    END IF;

    -- Verify cross-coupling bonus fired
    SELECT count(*) INTO v_bonus_count_after FROM cock_curriculum_events
    WHERE user_id = v_test_user AND partner_label LIKE 'conditioning_bonus%';
    IF v_bonus_count_after > v_bonus_count_before THEN
      v_results := v_results || jsonb_build_object('step', 'mig452_curriculum_bonus', 'passed', true);
    ELSE
      v_results := v_results || jsonb_build_object('step', 'mig452_curriculum_bonus', 'passed', false,
        'msg', 'bonus count unchanged ' || v_bonus_count_before || '→' || v_bonus_count_after);
      v_ok := FALSE;
    END IF;

    -- Step 4: gina_disclosure propagation
    DECLARE v_g_decree UUID; v_g_event UUID; v_g_status TEXT;
    BEGIN
      INSERT INTO handler_decrees (user_id, edict, proof_type, deadline, status, consequence, trigger_source, reasoning)
      VALUES (v_test_user, '[chain-test] gina disclosure', 'photo', now() + interval '1 day', 'active',
        'slip +2', 'gina_disclosure_pressure', 'chain test')
      RETURNING id INTO v_g_decree;
      INSERT INTO gina_disclosure_events (user_id, rung_at_event, related_decree_id, status)
      VALUES (v_test_user, 0, v_g_decree, 'pending') RETURNING id INTO v_g_event;
      UPDATE handler_decrees SET status = 'fulfilled', fulfilled_at = now() WHERE id = v_g_decree;
      SELECT status INTO v_g_status FROM gina_disclosure_events WHERE id = v_g_event;
      IF v_g_status = 'fulfilled' THEN
        v_results := v_results || jsonb_build_object('step', 'gina_disclosure_propagation', 'passed', true);
      ELSE
        v_results := v_results || jsonb_build_object('step', 'gina_disclosure_propagation', 'passed', false,
          'msg', 'gina disclosure event status=' || COALESCE(v_g_status, 'null'));
        v_ok := FALSE;
      END IF;
    END;

    -- Step 5: gina_seed_plantings propagation (mig 454)
    DECLARE v_s_decree UUID; v_s_planting UUID; v_s_status TEXT;
    BEGIN
      INSERT INTO handler_decrees (user_id, edict, proof_type, deadline, status, consequence, trigger_source, reasoning)
      VALUES (v_test_user, '[chain-test] gina seed', 'voice', now() + interval '1 day', 'active',
        'slip +1', 'gina_seed_planting', 'chain test')
      RETURNING id INTO v_s_decree;
      INSERT INTO gina_seed_plantings (user_id, seed_id, scheduled_at, related_decree_id, status)
      SELECT v_test_user, MIN(id), now(), v_s_decree, 'pending' FROM gina_seed_catalog WHERE active = TRUE
      RETURNING id INTO v_s_planting;
      UPDATE handler_decrees SET status = 'fulfilled', fulfilled_at = now() WHERE id = v_s_decree;
      SELECT status INTO v_s_status FROM gina_seed_plantings WHERE id = v_s_planting;
      IF v_s_status = 'observed' THEN
        v_results := v_results || jsonb_build_object('step', 'gina_seed_propagation', 'passed', true);
      ELSE
        v_results := v_results || jsonb_build_object('step', 'gina_seed_propagation', 'passed', false,
          'msg', 'gina seed planting status=' || COALESCE(v_s_status, 'null'));
        v_ok := FALSE;
      END IF;
    END;

    -- Roll back all test data
    ROLLBACK TO SAVEPOINT chain_test;

  EXCEPTION WHEN OTHERS THEN
    ROLLBACK TO SAVEPOINT chain_test;
    v_results := v_results || jsonb_build_object('step', 'exception', 'passed', false, 'msg', SQLERRM);
    v_ok := FALSE;
  END;

  -- Log results for audit
  INSERT INTO mommy_supervisor_log (component, severity, event_kind, message, context_data)
  VALUES ('chain_test', CASE WHEN v_ok THEN 'info' ELSE 'error' END,
    CASE WHEN v_ok THEN 'all_chains_ok' ELSE 'chain_failure' END,
    'Fulfillment chain assertion run: ' || CASE WHEN v_ok THEN 'OK' ELSE 'FAIL' END,
    jsonb_build_object('ok', v_ok, 'results', v_results, 'tested_user', v_test_user));

  RETURN jsonb_build_object('ok', v_ok, 'results', v_results, 'tested_user', v_test_user);
END;
$fn$;

GRANT EXECUTE ON FUNCTION test_fulfillment_chain() TO service_role;

-- Schedule chain assertion daily 02:00 UTC (between 04:00 health check runs)
DO $do$ BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'fulfillment-chain-assertion-daily') THEN
    PERFORM cron.unschedule('fulfillment-chain-assertion-daily');
  END IF;
EXCEPTION WHEN undefined_table THEN NULL; END $do$;

DO $do$ BEGIN
  PERFORM cron.schedule('fulfillment-chain-assertion-daily', '0 2 * * *',
    $cron$SELECT test_fulfillment_chain()$cron$);
EXCEPTION WHEN undefined_table THEN NULL; END $do$;
