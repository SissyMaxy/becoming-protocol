-- 530 — Pause-respect helper + patches for first 3 ladder evals.
--
-- BUG: mig 494's BEFORE INSERT pause-respect trigger silently cancels
-- decrees when user is paused. The eval functions in migs 511-519/523
-- insert the decree first, then queue the outreach — but they don't
-- check the post-insert status. Result: decree=cancelled, outreach
-- queued anyway → phantom outreaches pointing to dead decrees, the
-- user sees the message in Today but can't fulfill it.
--
-- Fix: shared ladder_user_paused() helper + early CONTINUE check in
-- every eval function loop body. Mig 530 ships helper + 3 evals
-- (deepthroat, dressing_room, scent_marking). Mig 531 ships the
-- remaining 8.
--
-- The original bug surfaced this morning when 18 phantom outreaches
-- queued for both users during a pause window. Those were cleaned up
-- manually via DBA action; this migration prevents the bug recurring.

CREATE OR REPLACE FUNCTION ladder_user_paused(p_user_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(pause_new_decrees_until > now(), FALSE)
  FROM user_state WHERE user_id = p_user_id;
$$;
GRANT EXECUTE ON FUNCTION ladder_user_paused(UUID) TO service_role, authenticated;

CREATE OR REPLACE FUNCTION deepthroat_eval()
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE s RECORD; l RECORD; v_pending INT; v_days NUMERIC; v_decree UUID; v_outreach UUID; v_queued INT := 0;
BEGIN
  FOR s IN SELECT ds.* FROM deepthroat_settings ds LEFT JOIN user_state us ON us.user_id = ds.user_id
    WHERE ds.enabled AND (ds.paused_until IS NULL OR ds.paused_until <= now())
      AND COALESCE(us.handler_persona, 'therapist') = 'dommy_mommy'
  LOOP
    IF ladder_user_paused(s.user_id) THEN CONTINUE; END IF;
    SELECT count(*) INTO v_pending FROM deepthroat_events WHERE user_id = s.user_id AND status='pending' AND created_at > now() - interval '14 days';
    IF v_pending > 0 THEN CONTINUE; END IF;
    SELECT * INTO l FROM deepthroat_ladder WHERE phase = s.current_phase;
    IF l IS NULL THEN CONTINUE; END IF;
    IF s.last_assigned_at IS NOT NULL THEN
      v_days := EXTRACT(EPOCH FROM (now() - s.last_assigned_at)) / 86400.0;
      IF v_days < l.gap_min_days THEN CONTINUE; END IF;
    END IF;
    INSERT INTO handler_decrees (user_id, edict, proof_type, deadline, status, consequence, trigger_source, reasoning)
    VALUES (s.user_id, l.edict, l.proof_kind, now() + interval '7 days', 'active', 'slip +' || (l.phase + 2)::text, 'deepthroat', 'phase=' || l.phase)
    RETURNING id INTO v_decree;
    INSERT INTO handler_outreach_queue (user_id, message, urgency, trigger_reason, source, kind, scheduled_for, expires_at, context_data, evidence_kind)
    VALUES (s.user_id, l.edict, CASE WHEN l.phase >= 3 THEN 'high' ELSE 'normal' END,
      'deepthroat:' || l.phase_name, 'deepthroat_engine', 'deepthroat_directive', now(), now() + interval '7 days',
      jsonb_build_object('phase', l.phase, 'decree_id', v_decree), l.proof_kind)
    RETURNING id INTO v_outreach;
    INSERT INTO deepthroat_events (user_id, phase_at_event, related_decree_id, related_outreach_id, status)
    VALUES (s.user_id, l.phase, v_decree, v_outreach, 'pending');
    UPDATE deepthroat_settings SET last_assigned_at = now(), updated_at = now() WHERE user_id = s.user_id;
    v_queued := v_queued + 1;
  END LOOP;
  RETURN v_queued;
END;
$fn$;

CREATE OR REPLACE FUNCTION dressing_room_eval()
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE s RECORD; l RECORD; v_pending INT; v_days NUMERIC; v_decree UUID; v_outreach UUID; v_queued INT := 0;
BEGIN
  FOR s IN SELECT drs.* FROM dressing_room_settings drs LEFT JOIN user_state us ON us.user_id = drs.user_id
    WHERE drs.enabled AND (drs.paused_until IS NULL OR drs.paused_until <= now())
      AND COALESCE(us.handler_persona, 'therapist') = 'dommy_mommy'
  LOOP
    IF ladder_user_paused(s.user_id) THEN CONTINUE; END IF;
    SELECT count(*) INTO v_pending FROM dressing_room_events WHERE user_id = s.user_id AND status='pending' AND created_at > now() - interval '21 days';
    IF v_pending > 0 THEN CONTINUE; END IF;
    SELECT * INTO l FROM dressing_room_ladder WHERE phase = s.current_phase;
    IF l IS NULL THEN CONTINUE; END IF;
    IF s.last_assigned_at IS NOT NULL THEN
      v_days := EXTRACT(EPOCH FROM (now() - s.last_assigned_at)) / 86400.0;
      IF v_days < l.gap_min_days THEN CONTINUE; END IF;
    END IF;
    INSERT INTO handler_decrees (user_id, edict, proof_type, deadline, status, consequence, trigger_source, reasoning)
    VALUES (s.user_id, l.edict, 'photo', now() + interval '14 days', 'active', 'slip +' || (l.phase + 2)::text, 'dressing_room', 'phase=' || l.phase)
    RETURNING id INTO v_decree;
    INSERT INTO handler_outreach_queue (user_id, message, urgency, trigger_reason, source, kind, scheduled_for, expires_at, context_data, evidence_kind)
    VALUES (s.user_id, l.edict, CASE WHEN l.phase >= 3 THEN 'high' ELSE 'normal' END,
      'dressing_room:' || l.phase_name, 'dressing_room_engine', 'dressing_room_directive', now(), now() + interval '14 days',
      jsonb_build_object('phase', l.phase, 'decree_id', v_decree), 'photo')
    RETURNING id INTO v_outreach;
    INSERT INTO dressing_room_events (user_id, phase_at_event, related_decree_id, related_outreach_id, status)
    VALUES (s.user_id, l.phase, v_decree, v_outreach, 'pending');
    UPDATE dressing_room_settings SET last_assigned_at = now(), updated_at = now() WHERE user_id = s.user_id;
    v_queued := v_queued + 1;
  END LOOP;
  RETURN v_queued;
END;
$fn$;

CREATE OR REPLACE FUNCTION scent_marking_eval()
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE s RECORD; l RECORD; v_pending INT; v_days NUMERIC; v_decree UUID; v_outreach UUID; v_queued INT := 0;
BEGIN
  FOR s IN SELECT sms.* FROM scent_marking_settings sms LEFT JOIN user_state us ON us.user_id = sms.user_id
    WHERE sms.enabled AND (sms.paused_until IS NULL OR sms.paused_until <= now())
      AND COALESCE(us.handler_persona, 'therapist') = 'dommy_mommy'
  LOOP
    IF ladder_user_paused(s.user_id) THEN CONTINUE; END IF;
    SELECT count(*) INTO v_pending FROM scent_marking_events WHERE user_id = s.user_id AND status='pending' AND created_at > now() - interval '14 days';
    IF v_pending > 0 THEN CONTINUE; END IF;
    SELECT * INTO l FROM scent_marking_ladder WHERE phase = s.current_phase;
    IF l IS NULL THEN CONTINUE; END IF;
    IF s.last_assigned_at IS NOT NULL THEN
      v_days := EXTRACT(EPOCH FROM (now() - s.last_assigned_at)) / 86400.0;
      IF v_days < l.gap_min_days THEN CONTINUE; END IF;
    END IF;
    INSERT INTO handler_decrees (user_id, edict, proof_type, deadline, status, consequence, trigger_source, reasoning)
    VALUES (s.user_id, l.edict, l.proof_kind, now() + interval '5 days', 'active', 'slip +' || (l.phase + 1)::text, 'scent_marking', 'phase=' || l.phase)
    RETURNING id INTO v_decree;
    INSERT INTO handler_outreach_queue (user_id, message, urgency, trigger_reason, source, kind, scheduled_for, expires_at, context_data, evidence_kind)
    VALUES (s.user_id, l.edict, 'normal',
      'scent_marking:' || l.phase_name, 'scent_marking_engine', 'scent_marking_directive', now(), now() + interval '5 days',
      jsonb_build_object('phase', l.phase, 'decree_id', v_decree), l.proof_kind)
    RETURNING id INTO v_outreach;
    INSERT INTO scent_marking_events (user_id, phase_at_event, related_decree_id, related_outreach_id, status)
    VALUES (s.user_id, l.phase, v_decree, v_outreach, 'pending');
    UPDATE scent_marking_settings SET last_assigned_at = now(), updated_at = now() WHERE user_id = s.user_id;
    v_queued := v_queued + 1;
  END LOOP;
  RETURN v_queued;
END;
$fn$;
