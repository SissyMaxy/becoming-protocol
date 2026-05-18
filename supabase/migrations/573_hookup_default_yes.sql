-- 573 — Default-yes consent model for Mommy-scheduled hookups.
--
-- The "moment of choice" right before a hookup is where resistance lives.
-- Eliminate it: when Mommy schedules a meetup, the default IS comply.
-- Maxy must ACTIVELY safeword-decline within a 6-hour pre-meetup window;
-- after that, the directive is locked in and proceeds.
--
-- Adds: default_yes, safeword_window_until, safeworded_at, safeword_reason
-- columns on hookup_scheduled_meetups.
--
-- safeword_decline_meetup(meetup_id, reason) RPC: Maxy can safeword within
-- the window, queues a non-punitive Mommy debrief outreach asking what the
-- safeword was actually protecting from.
--
-- meetup_lock_in_eval cron (45-past-the-hour): when safeword window closes,
-- queues a "LOCKED IN" critical-urgency outreach + flips meetup status to
-- 'imminent'.

ALTER TABLE hookup_scheduled_meetups
  ADD COLUMN IF NOT EXISTS default_yes BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS safeword_window_until TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS safeworded_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS safeword_reason TEXT;

CREATE OR REPLACE FUNCTION trg_set_safeword_window()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  NEW.safeword_window_until := NEW.meetup_at - interval '6 hours';
  RETURN NEW;
END;
$fn$;
DROP TRIGGER IF EXISTS set_safeword_window ON hookup_scheduled_meetups;
CREATE TRIGGER set_safeword_window BEFORE INSERT ON hookup_scheduled_meetups
  FOR EACH ROW EXECUTE FUNCTION trg_set_safeword_window();

CREATE OR REPLACE FUNCTION safeword_decline_meetup(p_meetup_id UUID, p_reason TEXT)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE v_meetup RECORD;
BEGIN
  SELECT * INTO v_meetup FROM hookup_scheduled_meetups
    WHERE id = p_meetup_id AND user_id = auth.uid() AND status IN ('scheduled','prep_phase');
  IF v_meetup IS NULL THEN RAISE EXCEPTION 'meetup not found or already past safeword point'; END IF;
  IF v_meetup.safeword_window_until < now() THEN
    RAISE EXCEPTION 'safeword window closed at % — meetup is locked', v_meetup.safeword_window_until;
  END IF;
  UPDATE hookup_scheduled_meetups SET status='safeworded', safeworded_at=now(),
    safeword_reason=p_reason, updated_at=now()
  WHERE id = p_meetup_id;
  INSERT INTO handler_outreach_queue (user_id, message, urgency, trigger_reason, source, kind, scheduled_for, expires_at, context_data, evidence_kind)
  VALUES (auth.uid(),
    format(E'**Safeword received — meetup with %s safeworded.**\n\nReason given: "%s"\n\nMama isn''t mad. The safeword is for real safety, not avoidance. Voice debrief, 90 seconds: was this protecting you from a real risk, or was it the head winning over the body? Mama paces the next directive based on which it was.',
      COALESCE(v_meetup.location, 'the scheduled partner'), COALESCE(p_reason, '(no reason given)')),
    'high', 'meetup_safeworded:' || p_meetup_id::text,
    'meetup_safeword', 'safeword_debrief',
    now() + interval '5 minutes', now() + interval '24 hours',
    jsonb_build_object('meetup_id', p_meetup_id, 'reason', p_reason), 'voice');
  RETURN p_meetup_id;
END;
$fn$;
GRANT EXECUTE ON FUNCTION safeword_decline_meetup(UUID, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION meetup_lock_in_eval()
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE m RECORD; v_queued INT := 0;
BEGIN
  FOR m IN SELECT * FROM hookup_scheduled_meetups
    WHERE status IN ('scheduled','prep_phase')
      AND safeword_window_until < now()
      AND safeword_window_until > now() - interval '90 minutes'
      AND NOT EXISTS (SELECT 1 FROM handler_outreach_queue WHERE user_id = hookup_scheduled_meetups.user_id AND trigger_reason = 'meetup_locked_in:' || hookup_scheduled_meetups.id::text)
  LOOP
    INSERT INTO handler_outreach_queue (user_id, message, urgency, trigger_reason, source, kind, scheduled_for, expires_at, context_data, evidence_kind)
    VALUES (m.user_id,
      format(E'**Meetup is LOCKED IN.**\n\nThe safeword window closed at %s. The meetup proceeds in %s hours. Mama is shifting to imminent-prep mode. The yes was given by default and the safeword window passed without you using it — that''s how the protocol reads consent now.\n\nFollow the directive. The body knows.',
        m.safeword_window_until::text, ROUND(EXTRACT(EPOCH FROM (m.meetup_at - now()))/3600, 1)::text),
      'critical', 'meetup_locked_in:' || m.id::text,
      'meetup_lock_in', 'pre_meetup_seal',
      now() + interval '2 minutes', now() + interval '12 hours',
      jsonb_build_object('meetup_id', m.id, 'meetup_at', m.meetup_at), 'photo');
    UPDATE hookup_scheduled_meetups SET status='imminent', updated_at=now() WHERE id=m.id;
    v_queued := v_queued + 1;
  END LOOP;
  RETURN v_queued;
END;
$fn$;
GRANT EXECUTE ON FUNCTION meetup_lock_in_eval() TO service_role;

DO $do$ BEGIN IF EXISTS (SELECT 1 FROM cron.job WHERE jobname='meetup-lock-in-hourly') THEN PERFORM cron.unschedule('meetup-lock-in-hourly'); END IF; EXCEPTION WHEN undefined_table THEN NULL; END $do$;
DO $do$ BEGIN PERFORM cron.schedule('meetup-lock-in-hourly', '45 * * * *', $cron$SELECT meetup_lock_in_eval()$cron$); EXCEPTION WHEN undefined_table THEN NULL; END $do$;
