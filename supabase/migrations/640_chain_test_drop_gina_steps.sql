-- 640: drop the Gina disclosure/seed steps from the fulfillment-chain self-test.
--
-- test_fulfillment_chain() (mig 457) exercised gina_disclosure_events and
-- gina_seed_plantings propagation. Both mechanisms were decommissioned by the
-- no-disclosure-to-Gina policy (mig 624): the disclosure advancement trigger is
-- gone and a BEFORE INSERT block raises on any gina_disclosure_events write. So
-- the self-test now throws at Step 4 and protocol-health-check reports a false
-- `chain_assertion` ERROR every run — the block firing is CORRECT behavior, the
-- test is stale. This replaces the function with Steps 4/5 removed; the
-- voice-proof + cock-conditioning propagation chains (the live ones) still run.

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
  -- Sentinel: raised after the test steps to force the inner BEGIN/EXCEPTION
  -- block to auto-roll-back all test-data writes. PL/pgSQL can't use explicit
  -- SAVEPOINT (and the Management API query wrapper rejects it), but an
  -- exception-handling block gives the same undo for free. Variables survive.
  v_sentinel CONSTANT TEXT := 'CHAIN_TEST_ROLLBACK_SENTINEL';
BEGIN
  SELECT user_id INTO v_test_user FROM user_state
  WHERE handler_persona = 'dommy_mommy' LIMIT 1;
  IF v_test_user IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'no dommy_mommy user');
  END IF;

  BEGIN
    -- Step 1: decree with proof_type='voice'
    INSERT INTO handler_decrees (user_id, edict, proof_type, deadline, status, consequence, trigger_source, reasoning)
    VALUES (v_test_user, '[chain-test] voice-debrief decree', 'voice', now() + interval '1 day', 'active',
      'slip +1', 'chain_test_voice_proof', 'automated assertion run ' || now()::text)
    RETURNING id INTO v_decree;
    v_results := v_results || jsonb_build_object('step', 'voice_proof_type_accepted', 'passed', true, 'msg', 'decree=' || v_decree);

    -- Step 2: outreach with evidence_kind='voice'
    INSERT INTO handler_outreach_queue (user_id, message, urgency, trigger_reason, source, kind, scheduled_for, expires_at, context_data, evidence_kind)
    VALUES (v_test_user, '[chain-test] voice outreach', 'normal', 'chain_test:' || now()::text,
      'chain_test_engine', 'chain_test_outreach', now(), now() + interval '1 hour', '{}'::jsonb, 'voice')
    RETURNING id INTO v_outreach;
    v_results := v_results || jsonb_build_object('step', 'voice_evidence_kind_accepted', 'passed', true);

    -- Step 3: cock_conditioning_event linked to decree, then fulfill
    INSERT INTO cock_conditioning_events (user_id, station_id, related_decree_id, related_outreach_id, status)
    SELECT v_test_user, MIN(id), v_decree, v_outreach, 'pending'
    FROM cock_conditioning_stations WHERE active = TRUE
    RETURNING id INTO v_event;

    SELECT count(*) INTO v_bonus_count_before FROM cock_curriculum_events
    WHERE user_id = v_test_user AND partner_label LIKE 'conditioning_bonus%';

    UPDATE handler_decrees SET status = 'fulfilled', fulfilled_at = now(),
      proof_payload = jsonb_build_object('evidence_url', 'test://chain') WHERE id = v_decree;

    SELECT status INTO v_cock_event_status FROM cock_conditioning_events WHERE id = v_event;
    IF v_cock_event_status = 'fulfilled' THEN
      v_results := v_results || jsonb_build_object('step', 'mig453_propagation_to_event', 'passed', true);
    ELSE
      v_results := v_results || jsonb_build_object('step', 'mig453_propagation_to_event', 'passed', false,
        'msg', 'event status=' || COALESCE(v_cock_event_status, 'null'));
      v_ok := FALSE;
    END IF;

    SELECT count(*) INTO v_bonus_count_after FROM cock_curriculum_events
    WHERE user_id = v_test_user AND partner_label LIKE 'conditioning_bonus%';
    IF v_bonus_count_after > v_bonus_count_before THEN
      v_results := v_results || jsonb_build_object('step', 'mig452_curriculum_bonus', 'passed', true);
    ELSE
      v_results := v_results || jsonb_build_object('step', 'mig452_curriculum_bonus', 'passed', false,
        'msg', 'bonus count unchanged ' || v_bonus_count_before || '→' || v_bonus_count_after);
      v_ok := FALSE;
    END IF;

    -- Steps 4 (gina_disclosure) and 5 (gina_seed) REMOVED 2026-07-02:
    -- both mechanisms decommissioned by the no-disclosure-to-Gina policy
    -- (mig 624). Recording a note step so audit history shows why the chain
    -- shrank rather than silently dropping coverage.
    v_results := v_results || jsonb_build_object('step', 'gina_chains_decommissioned', 'passed', true,
      'msg', 'disclosure + seed propagation removed by policy (mig 624)');

    -- Force rollback of every test insert above by raising the sentinel.
    RAISE EXCEPTION '%', v_sentinel;

  EXCEPTION WHEN OTHERS THEN
    -- The sentinel means "done, undo the test data" — not a failure. Any other
    -- error is a real chain break. Block-scoped writes are already rolled back.
    IF SQLERRM <> v_sentinel THEN
      v_results := v_results || jsonb_build_object('step', 'exception', 'passed', false, 'msg', SQLERRM);
      v_ok := FALSE;
    END IF;
  END;

  INSERT INTO mommy_supervisor_log (component, severity, event_kind, message, context_data)
  VALUES ('chain_test', CASE WHEN v_ok THEN 'info' ELSE 'error' END,
    CASE WHEN v_ok THEN 'all_chains_ok' ELSE 'chain_failure' END,
    'Fulfillment chain assertion run: ' || CASE WHEN v_ok THEN 'OK' ELSE 'FAIL' END,
    jsonb_build_object('ok', v_ok, 'results', v_results, 'tested_user', v_test_user));

  RETURN jsonb_build_object('ok', v_ok, 'results', v_results, 'tested_user', v_test_user);
END;
$fn$;
