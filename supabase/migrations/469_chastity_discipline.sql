-- 469 — Chastity discipline daily check-in.
--
-- user_state.chastity_locked + chastity_streak_days already exist
-- but no generator drives the daily ritual. This adds:
--   - Daily cage check-in: photo of the cage (worn) + voice debrief
--     on what surfaced during the day
--   - Milestone outreach at 3/7/14/30/60/90/180 day denial marks
--   - Failure to check-in 2 days in a row triggers a reversal-anchor
--     signal AND queues a "where is the cage" investigation prompt

CREATE TABLE IF NOT EXISTS chastity_settings (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  cage_type TEXT,
  daily_checkin_hour_local INT NOT NULL DEFAULT 20 CHECK (daily_checkin_hour_local BETWEEN 0 AND 23),
  timezone TEXT NOT NULL DEFAULT 'America/Chicago',
  current_streak_days INT NOT NULL DEFAULT 0,
  last_checkin_at TIMESTAMPTZ,
  longest_streak_days INT NOT NULL DEFAULT 0,
  paused_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS chastity_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_kind TEXT NOT NULL CHECK (event_kind IN ('checkin','milestone','missed_checkin','release','denial_extension')),
  streak_day INT,
  related_decree_id UUID,
  related_outreach_id UUID,
  evidence_url TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE chastity_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE chastity_events ENABLE ROW LEVEL SECURITY;
DO $do$ BEGIN CREATE POLICY chastity_settings_self ON chastity_settings FOR ALL TO authenticated USING (auth.uid()=user_id) WITH CHECK (auth.uid()=user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $do$;
DO $do$ BEGIN CREATE POLICY chastity_events_self ON chastity_events FOR ALL TO authenticated USING (auth.uid()=user_id) WITH CHECK (auth.uid()=user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $do$;

CREATE OR REPLACE FUNCTION chastity_eval()
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  s RECORD; v_local_hour INT; v_decree UUID; v_outreach UUID;
  v_msg TEXT; v_queued INT := 0; v_kind TEXT;
  v_milestones INT[] := ARRAY[3,7,14,30,60,90,180,365];
  v_milestone_hit INT;
  v_hours_since_checkin NUMERIC;
BEGIN
  FOR s IN
    SELECT cs.*, us.handler_persona FROM chastity_settings cs
    LEFT JOIN user_state us ON us.user_id = cs.user_id
    WHERE cs.enabled = TRUE AND (cs.paused_until IS NULL OR cs.paused_until <= now())
      AND COALESCE(us.handler_persona, 'therapist') = 'dommy_mommy'
  LOOP
    v_local_hour := EXTRACT(HOUR FROM (now() AT TIME ZONE s.timezone))::int;

    -- Daily check-in window
    IF v_local_hour = s.daily_checkin_hour_local
       AND (s.last_checkin_at IS NULL OR s.last_checkin_at < now() - interval '18 hours') THEN
      v_kind := 'checkin';

      v_msg := E'Daily lock check-in, sweet thing. Streak day ' || (s.current_streak_days + 1)::text || E'.\n\n' ||
        E'Photo of the cage right now — clear shot, can see the lock + the device. Then voice debrief, 60 seconds:\n\n' ||
        E'• What did the body try to do today that the cage stopped?\n' ||
        E'• When did you feel the cage most?\n' ||
        E'• What did denying yourself today rearrange in your head?\n\n' ||
        E'Mama wants the cage AND the audio. Both, today, before midnight.';

      INSERT INTO handler_decrees (user_id, edict, proof_type, deadline, status, consequence, trigger_source, reasoning)
      VALUES (s.user_id, v_msg, 'photo', now() + interval '4 hours', 'active', 'slip +2',
        'chastity_checkin', 'streak=' || (s.current_streak_days + 1)::text)
      RETURNING id INTO v_decree;

      INSERT INTO handler_outreach_queue (user_id, message, urgency, trigger_reason, source, kind, scheduled_for, expires_at, context_data, evidence_kind)
      VALUES (s.user_id, v_msg, 'high',
        'chastity_checkin:' || to_char(now() AT TIME ZONE s.timezone, 'YYYY-MM-DD'),
        'chastity_engine', 'chastity_checkin',
        now(), now() + interval '4 hours',
        jsonb_build_object('streak_day', s.current_streak_days + 1, 'decree_id', v_decree),
        'photo') RETURNING id INTO v_outreach;

      INSERT INTO chastity_events (user_id, event_kind, streak_day, related_decree_id, related_outreach_id)
      VALUES (s.user_id, 'checkin', s.current_streak_days + 1, v_decree, v_outreach);
      v_queued := v_queued + 1;
    END IF;

    -- Missed check-in detection: 2 days no check-in
    IF s.last_checkin_at IS NOT NULL THEN
      v_hours_since_checkin := EXTRACT(EPOCH FROM (now() - s.last_checkin_at)) / 3600.0;
      IF v_hours_since_checkin > 48 AND v_hours_since_checkin < 52 THEN
        v_msg := E'Mama hasn''t seen a lock check-in in two days, sweet thing.\n\n' ||
          E'Mama isn''t accusing. Mama is asking — is the cage still on? If yes: photo right now. If no, voice debrief on when and why.\n\n' ||
          E'Whatever the answer, Mama wants to know. The streak is paused either way until this lands.';
        INSERT INTO handler_decrees (user_id, edict, proof_type, deadline, status, consequence, trigger_source, reasoning)
        VALUES (s.user_id, v_msg, 'photo', now() + interval '12 hours', 'active', 'slip +3',
          'chastity_checkin', 'kind=missed_checkin')
        RETURNING id INTO v_decree;
        INSERT INTO handler_outreach_queue (user_id, message, urgency, trigger_reason, source, kind, scheduled_for, expires_at, context_data, evidence_kind)
        VALUES (s.user_id, v_msg, 'critical',
          'chastity_missed:' || to_char(now() AT TIME ZONE s.timezone, 'YYYY-MM-DD'),
          'chastity_engine', 'chastity_missed_checkin',
          now(), now() + interval '12 hours',
          jsonb_build_object('decree_id', v_decree, 'hours_since_checkin', v_hours_since_checkin),
          'photo') RETURNING id INTO v_outreach;
        INSERT INTO chastity_events (user_id, event_kind, related_decree_id, related_outreach_id, notes)
        VALUES (s.user_id, 'missed_checkin', v_decree, v_outreach, 'hours_since_last=' || v_hours_since_checkin::text);
        v_queued := v_queued + 1;
      END IF;
    END IF;

    -- Milestone outreach
    FOREACH v_milestone_hit IN ARRAY v_milestones LOOP
      IF s.current_streak_days = v_milestone_hit
         AND NOT EXISTS (SELECT 1 FROM chastity_events WHERE user_id = s.user_id AND event_kind = 'milestone' AND streak_day = v_milestone_hit) THEN
        v_msg := E'Day ' || v_milestone_hit::text || E', sweet thing.\n\n' ||
          CASE v_milestone_hit
            WHEN 3 THEN E'Three days. The body has stopped expecting it and started forgetting. The forgetting is the work.'
            WHEN 7 THEN E'A week. Mama is proud. The body is now running on different rules than it was a week ago — that''s real, that''s measurable.'
            WHEN 14 THEN E'Two weeks. The first ridge of the curve where the body stops asking for it as a default — it asks for it as a thought you can answer differently.'
            WHEN 30 THEN E'A month. The version of you a month ago has been replaced by the version Mama is talking to right now. That replacement is the conditioning.'
            WHEN 60 THEN E'Sixty days. You are now further from the body you started in than from the body you''re becoming. Mama wants you to feel the math.'
            WHEN 90 THEN E'Ninety. Mama wants the photo to be different from the day-1 photo, because the body is different. Voice debrief: what changed that you didn''t expect.'
            WHEN 180 THEN E'Half a year, sweet thing. Half a year of the cage being part of you. Half a year of having no relationship to your own release. That isn''t a phase. That''s who you are now.'
            WHEN 365 THEN E'One year locked. There is no version of this where you go back. Mama wants the year-mark photo + voice debrief on what becoming you across this year cost you, and what it gave you.'
            ELSE E'Mama is marking the milestone.'
          END;
        INSERT INTO handler_outreach_queue (user_id, message, urgency, trigger_reason, source, kind, scheduled_for, expires_at, context_data, evidence_kind)
        VALUES (s.user_id, v_msg, 'high',
          'chastity_milestone:' || v_milestone_hit::text,
          'chastity_engine', 'chastity_milestone',
          now(), now() + interval '24 hours',
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
GRANT EXECUTE ON FUNCTION chastity_eval() TO service_role;

-- Propagate fulfilled checkin → increment streak
CREATE OR REPLACE FUNCTION trg_chastity_checkin_streak()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE v_user UUID;
BEGIN
  IF NEW.status <> 'fulfilled' OR COALESCE(OLD.status,'') = 'fulfilled' THEN RETURN NEW; END IF;
  IF NEW.trigger_source <> 'chastity_checkin' THEN RETURN NEW; END IF;
  v_user := NEW.user_id;
  UPDATE chastity_settings
  SET current_streak_days = current_streak_days + 1,
      last_checkin_at = now(),
      longest_streak_days = GREATEST(longest_streak_days, current_streak_days + 1),
      updated_at = now()
  WHERE user_id = v_user;
  RETURN NEW;
END;
$fn$;
DROP TRIGGER IF EXISTS chastity_checkin_streak ON handler_decrees;
CREATE TRIGGER chastity_checkin_streak AFTER UPDATE OF status ON handler_decrees FOR EACH ROW EXECUTE FUNCTION trg_chastity_checkin_streak();

-- Activate for both users at 20:00 local check-in time
INSERT INTO chastity_settings (user_id, enabled, daily_checkin_hour_local, timezone)
VALUES ('8c69b9c8-34eb-4147-9fec-3c1a5bc74b6f', TRUE, 20, 'America/Chicago'),
       ('93327332-7d0d-4888-889a-1607a5776216', TRUE, 20, 'America/Chicago')
ON CONFLICT (user_id) DO UPDATE SET enabled = TRUE, updated_at = now();

-- Hourly cron (self-filters by local hour)
DO $do$ BEGIN IF EXISTS (SELECT 1 FROM cron.job WHERE jobname='chastity-hourly') THEN PERFORM cron.unschedule('chastity-hourly'); END IF; EXCEPTION WHEN undefined_table THEN NULL; END $do$;
DO $do$ BEGIN PERFORM cron.schedule('chastity-hourly', '15 * * * *', $cron$SELECT chastity_eval()$cron$); EXCEPTION WHEN undefined_table THEN NULL; END $do$;
