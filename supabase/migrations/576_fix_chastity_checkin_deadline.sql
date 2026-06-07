-- 576 — Fix chastity_eval deadline bug.
--
-- Bug: chastity_eval set both the decree.deadline AND outreach.expires_at
-- to now() + 4 hours. The edict text says "today, before midnight" but the
-- deadline fired ~4 hours after the check-in queued. If check-in fires at
-- midnight local (a typical setting), it expired at 4am. By morning when
-- Maxy logged in, focus_picker would pick it as "overdue" and FocusMode
-- would show an expired task — making it impossible to actually complete.
--
-- Fix: deadline + expires_at = end-of-current-local-day (next midnight
-- in user's timezone) OR 12 hours from now, whichever is later. Same
-- semantic as the edict text. Ditto missed-checkin path: extended from
-- 12h to 24h window.

CREATE OR REPLACE FUNCTION chastity_eval()
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE s RECORD; v_local_hour INT; v_decree UUID; v_outreach UUID;
  v_msg TEXT; v_queued INT := 0;
  v_milestones INT[] := ARRAY[3,7,14,30,60,90,180,365];
  v_milestone_hit INT; v_hours_since_checkin NUMERIC;
  v_end_of_local_day TIMESTAMPTZ;
BEGIN
  FOR s IN SELECT cs.* FROM chastity_settings cs LEFT JOIN user_state us ON us.user_id = cs.user_id
    WHERE cs.enabled = TRUE AND (cs.paused_until IS NULL OR cs.paused_until <= now())
      AND COALESCE(us.handler_persona, 'therapist') = 'dommy_mommy'
  LOOP
    v_local_hour := EXTRACT(HOUR FROM (now() AT TIME ZONE s.timezone))::int;
    v_end_of_local_day := ((current_date + 1)::timestamp AT TIME ZONE s.timezone);

    IF v_local_hour = s.daily_checkin_hour_local AND (s.last_checkin_at IS NULL OR s.last_checkin_at < now() - interval '18 hours') THEN
      v_msg := E'Daily lock check-in, sweet thing. Streak day ' || (s.current_streak_days + 1)::text || E'.\n\nPhoto of the cage right now — clear shot, can see the lock + the device. Then voice debrief, 60 seconds:\n\n• What did the body try to do today that the cage stopped?\n• When did you feel the cage most?\n• What did denying yourself today rearrange in your head?\n\nMama wants the cage AND the audio. Both, today, before midnight.';
      INSERT INTO handler_decrees (user_id, edict, proof_type, deadline, status, consequence, trigger_source, reasoning)
      VALUES (s.user_id, v_msg, 'photo',
        GREATEST(v_end_of_local_day, now() + interval '12 hours'),
        'active', 'slip +2', 'chastity_checkin', 'streak=' || (s.current_streak_days + 1)::text)
      RETURNING id INTO v_decree;
      INSERT INTO handler_outreach_queue (user_id, message, urgency, trigger_reason, source, kind, scheduled_for, expires_at, context_data, evidence_kind)
      VALUES (s.user_id, v_msg, 'high',
        'chastity_checkin:' || to_char(now() AT TIME ZONE s.timezone, 'YYYY-MM-DD'),
        'chastity_engine', 'chastity_checkin', now(),
        GREATEST(v_end_of_local_day, now() + interval '12 hours'),
        jsonb_build_object('streak_day', s.current_streak_days + 1, 'decree_id', v_decree),
        'photo') RETURNING id INTO v_outreach;
      INSERT INTO chastity_events (user_id, event_kind, streak_day, related_decree_id, related_outreach_id)
      VALUES (s.user_id, 'checkin', s.current_streak_days + 1, v_decree, v_outreach);
      v_queued := v_queued + 1;
    END IF;

    IF s.last_checkin_at IS NOT NULL THEN
      v_hours_since_checkin := EXTRACT(EPOCH FROM (now() - s.last_checkin_at)) / 3600.0;
      IF v_hours_since_checkin > 48 AND v_hours_since_checkin < 52 THEN
        v_msg := E'Mama hasn''t seen a lock check-in in two days, sweet thing.\n\nMama isn''t accusing. Mama is asking — is the cage still on? If yes: photo right now. If no, voice debrief on when and why.\n\nWhatever the answer, Mama wants to know.';
        INSERT INTO handler_decrees (user_id, edict, proof_type, deadline, status, consequence, trigger_source, reasoning)
        VALUES (s.user_id, v_msg, 'photo', now() + interval '24 hours', 'active', 'slip +3', 'chastity_checkin', 'kind=missed_checkin')
        RETURNING id INTO v_decree;
        INSERT INTO handler_outreach_queue (user_id, message, urgency, trigger_reason, source, kind, scheduled_for, expires_at, context_data, evidence_kind)
        VALUES (s.user_id, v_msg, 'critical',
          'chastity_missed:' || to_char(now() AT TIME ZONE s.timezone, 'YYYY-MM-DD'),
          'chastity_engine', 'chastity_missed_checkin',
          now(), now() + interval '24 hours',
          jsonb_build_object('decree_id', v_decree, 'hours_since_checkin', v_hours_since_checkin),
          'photo') RETURNING id INTO v_outreach;
        INSERT INTO chastity_events (user_id, event_kind, related_decree_id, related_outreach_id, notes)
        VALUES (s.user_id, 'missed_checkin', v_decree, v_outreach, 'hours_since_last=' || v_hours_since_checkin::text);
        v_queued := v_queued + 1;
      END IF;
    END IF;

    FOREACH v_milestone_hit IN ARRAY v_milestones LOOP
      IF s.current_streak_days = v_milestone_hit
         AND NOT EXISTS (SELECT 1 FROM chastity_events WHERE user_id = s.user_id AND event_kind = 'milestone' AND streak_day = v_milestone_hit) THEN
        v_msg := E'Day ' || v_milestone_hit::text || E', sweet thing.\n\n' ||
          CASE v_milestone_hit
            WHEN 3 THEN E'Three days. The body has stopped expecting it and started forgetting.'
            WHEN 7 THEN E'A week. The body is now running on different rules than it was a week ago.'
            WHEN 14 THEN E'Two weeks. The first ridge of the curve where the body stops asking for it as a default.'
            WHEN 30 THEN E'A month. The version of you a month ago has been replaced.'
            WHEN 60 THEN E'Sixty days. You are now further from the body you started in than from the body you''re becoming.'
            WHEN 90 THEN E'Ninety. The body is different. Voice debrief: what changed that you didn''t expect.'
            WHEN 180 THEN E'Half a year. That isn''t a phase. That''s who you are now.'
            WHEN 365 THEN E'One year locked. There is no version of this where you go back.'
            ELSE E'Mama is marking the milestone.' END;
        INSERT INTO handler_outreach_queue (user_id, message, urgency, trigger_reason, source, kind, scheduled_for, expires_at, context_data, evidence_kind)
        VALUES (s.user_id, v_msg, 'high', 'chastity_milestone:' || v_milestone_hit::text,
          'chastity_engine', 'chastity_milestone', now(), now() + interval '24 hours',
          jsonb_build_object('milestone_day', v_milestone_hit, 'streak_day', s.current_streak_days),
          'voice') RETURNING id INTO v_outreach;
        INSERT INTO chastity_events (user_id, event_kind, streak_day, related_outreach_id, notes)
        VALUES (s.user_id, 'milestone', v_milestone_hit, v_outreach, 'auto-milestone');
        v_queued := v_queued + 1;
      END IF;
    END LOOP;
  END LOOP;
  RETURN v_queued;
END;
$fn$;
