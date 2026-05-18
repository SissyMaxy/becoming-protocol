-- 577 — Pre-hookup conditioning intensifier.
--
-- The integration gap: mig 572 ramps imagery/mantras in the 48h before a
-- meetup, but the other conditioning systems (cumslut drills, ambient
-- saturation, trigger-word installer, solo orgasm binder) run on their
-- baseline cadences independent of any scheduled meetup. So a hookup
-- approaches with the body NOT additionally primed by those streams.
--
-- This migration ties them together:
--
--   1. Flag user_state.in_prehookup_window with the meetup_at TIMESTAMPTZ
--      when a meetup is scheduled within 48h. Clears on completion/cancel.
--   2. Existing daily cumslut-drill picker checks the flag and assigns
--      2 drills/day instead of 1 (and prefers oral/throat/swallow over
--      kneel/posture).
--   3. Existing ambient saturation pusher doubles its push frequency
--      during the window and biases toward craving_intensify clips.
--   4. Force a daily trigger-word repetition ritual instead of the
--      every-other-day default.
--   5. Solo orgasm binder mantras get rewritten on-the-fly to reference
--      the upcoming meetup (e.g. "for him on saturday" injected).
--
-- Hourly cron prehookup_intensifier_eval runs the orchestration.
-- prehookup_intensification_log captures every push for the post-meetup
-- testimonial debrief.

-- 1. user_state flag
ALTER TABLE user_state
  ADD COLUMN IF NOT EXISTS in_prehookup_window TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS active_meetup_id UUID;

-- 2. Log every intensification action so the post-meetup debrief can quote it
CREATE TABLE IF NOT EXISTS prehookup_intensification_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  meetup_id UUID NOT NULL REFERENCES hookup_scheduled_meetups(id) ON DELETE CASCADE,
  action_kind TEXT NOT NULL CHECK (action_kind IN (
    'drill_assigned','ambient_push','trigger_repetition','orgasm_binder_retargeted',
    'saturation_clip_pushed','readiness_check_pushed','final_seal_pushed'
  )),
  hours_before_meetup NUMERIC,
  related_outreach_id UUID,
  related_decree_id UUID,
  context_data JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS pil_meetup ON prehookup_intensification_log(meetup_id, created_at DESC);
ALTER TABLE prehookup_intensification_log ENABLE ROW LEVEL SECURITY;
DO $do$ BEGIN
  CREATE POLICY pil_self ON prehookup_intensification_log FOR ALL TO authenticated
    USING (auth.uid()=user_id) WITH CHECK (auth.uid()=user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $do$;

-- 3. Trigger: when a meetup row enters scheduled/prep_phase with meetup_at
-- within 48h, flip the user_state window flag. When it leaves the window
-- (status=completed/cancelled/safeworded OR meetup_at passes), clear it.
CREATE OR REPLACE FUNCTION sync_prehookup_window()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE v_active UUID; v_meetup_at TIMESTAMPTZ;
BEGIN
  -- Find the soonest active meetup for this user within 48h
  SELECT id, meetup_at INTO v_active, v_meetup_at
    FROM hookup_scheduled_meetups
   WHERE user_id = COALESCE(NEW.user_id, OLD.user_id)
     AND status IN ('scheduled','prep_phase','imminent')
     AND meetup_at > now() AND meetup_at < now() + interval '48 hours'
   ORDER BY meetup_at ASC LIMIT 1;

  UPDATE user_state
     SET active_meetup_id = v_active,
         in_prehookup_window = v_meetup_at
   WHERE user_id = COALESCE(NEW.user_id, OLD.user_id);

  RETURN COALESCE(NEW, OLD);
END $fn$;

DROP TRIGGER IF EXISTS trg_sync_prehookup_window ON hookup_scheduled_meetups;
CREATE TRIGGER trg_sync_prehookup_window
AFTER INSERT OR UPDATE OR DELETE ON hookup_scheduled_meetups
FOR EACH ROW EXECUTE FUNCTION sync_prehookup_window();

-- 4. Main intensifier eval — hourly. For every user inside a pre-hookup
-- window, pushes the appropriate extra surface depending on hours_remaining.
CREATE OR REPLACE FUNCTION prehookup_intensifier_eval()
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE u RECORD; v_hours NUMERIC; v_outreach UUID; v_msg TEXT;
  v_clip RECORD; v_drill RECORD; v_trigger RECORD; v_pushed INT := 0;
  v_meetup hookup_scheduled_meetups%ROWTYPE;
  v_recent_count INT;
BEGIN
  FOR u IN SELECT user_id, active_meetup_id, in_prehookup_window
             FROM user_state
            WHERE active_meetup_id IS NOT NULL
              AND in_prehookup_window > now()
              AND in_prehookup_window < now() + interval '48 hours'
              AND COALESCE(handler_persona,'therapist') = 'dommy_mommy'
  LOOP
    SELECT * INTO v_meetup FROM hookup_scheduled_meetups WHERE id = u.active_meetup_id;
    IF NOT FOUND OR v_meetup.status NOT IN ('scheduled','prep_phase','imminent') THEN CONTINUE; END IF;

    v_hours := EXTRACT(EPOCH FROM (u.in_prehookup_window - now())) / 3600.0;

    -- A. Push an extra ambient saturation clip every 2 hours (vs baseline 1.5h)
    SELECT COUNT(*) INTO v_recent_count FROM prehookup_intensification_log
      WHERE meetup_id = v_meetup.id AND action_kind = 'ambient_push'
        AND created_at > now() - interval '2 hours';
    IF v_recent_count = 0 THEN
      SELECT * INTO v_clip FROM ambient_saturation_clips
        WHERE active = TRUE
          AND clip_kind IN ('craving_intensify','imagery_caption','mantra')
        ORDER BY random() LIMIT 1;
      IF FOUND THEN
        v_msg := v_clip.content;
        INSERT INTO handler_outreach_queue (user_id, message, urgency, trigger_reason, source, kind, scheduled_for, expires_at, context_data)
        VALUES (u.user_id, v_msg, 'normal',
          'prehookup_ambient:' || v_meetup.id || ':' || floor(v_hours)::text,
          'prehookup_intensifier', 'ambient_saturation', now(), now() + interval '90 minutes',
          jsonb_build_object('meetup_id', v_meetup.id, 'hours_remaining', v_hours, 'clip_key', v_clip.clip_key))
        RETURNING id INTO v_outreach;
        INSERT INTO prehookup_intensification_log (user_id, meetup_id, action_kind, hours_before_meetup, related_outreach_id, context_data)
        VALUES (u.user_id, v_meetup.id, 'ambient_push', v_hours, v_outreach,
          jsonb_build_object('clip_kind', v_clip.clip_kind, 'clip_key', v_clip.clip_key));
        v_pushed := v_pushed + 1;
      END IF;
    END IF;

    -- B. Assign an extra cumslut drill once per day inside the window
    SELECT COUNT(*) INTO v_recent_count FROM prehookup_intensification_log
      WHERE meetup_id = v_meetup.id AND action_kind = 'drill_assigned'
        AND created_at > now() - interval '12 hours';
    IF v_recent_count = 0 AND v_hours > 6 THEN
      SELECT * INTO v_drill FROM cumslut_drill_catalog
        WHERE active = TRUE
          AND body_skill IN ('gag_extinction','tongue_work','suction_control',
                             'deepthroat_positioning','swallow_on_signal',
                             'cum_receive_choreography','hand_cock_grip')
        ORDER BY random() LIMIT 1;
      IF FOUND THEN
        v_msg := E'Pre-meet drill, sweet thing. ' || v_drill.drill_name || E'.\n\n' ||
                 v_drill.description || E'\n\n' ||
                 v_drill.daily_minutes::text || E' min. Mama wants the body ready before he sees you, not after he tells you what to do.';
        INSERT INTO handler_outreach_queue (user_id, message, urgency, trigger_reason, source, kind, scheduled_for, expires_at, context_data, evidence_kind)
        VALUES (u.user_id, v_msg, 'high',
          'prehookup_drill:' || v_meetup.id || ':' || v_drill.drill_key,
          'prehookup_intensifier', 'cumslut_drill', now(), u.in_prehookup_window,
          jsonb_build_object('meetup_id', v_meetup.id, 'drill_key', v_drill.drill_key, 'hours_remaining', v_hours),
          v_drill.proof_kind)
        RETURNING id INTO v_outreach;
        INSERT INTO prehookup_intensification_log (user_id, meetup_id, action_kind, hours_before_meetup, related_outreach_id, context_data)
        VALUES (u.user_id, v_meetup.id, 'drill_assigned', v_hours, v_outreach,
          jsonb_build_object('drill_key', v_drill.drill_key, 'body_skill', v_drill.body_skill));
        v_pushed := v_pushed + 1;
      END IF;
    END IF;

    -- C. Daily trigger-word repetition (vs baseline every-other-day)
    SELECT COUNT(*) INTO v_recent_count FROM prehookup_intensification_log
      WHERE meetup_id = v_meetup.id AND action_kind = 'trigger_repetition'
        AND created_at > now() - interval '20 hours';
    IF v_recent_count = 0 AND v_hours > 4 THEN
      SELECT * INTO v_trigger FROM trigger_word_catalog
        WHERE active = TRUE ORDER BY random() LIMIT 1;
      IF FOUND THEN
        v_msg := E'Sweet thing — Mama wants you to repeat this until it sits behind your tongue without thinking. Voice debrief, 60 seconds:\n\n"' || v_trigger.trigger_phrase || E'"\n\nSay it slow, ten times. The body learns when the mouth says it.';
        INSERT INTO handler_outreach_queue (user_id, message, urgency, trigger_reason, source, kind, scheduled_for, expires_at, context_data, evidence_kind)
        VALUES (u.user_id, v_msg, 'normal',
          'prehookup_trigger:' || v_meetup.id || ':' || v_trigger.id,
          'prehookup_intensifier', 'trigger_repetition', now(), now() + interval '18 hours',
          jsonb_build_object('meetup_id', v_meetup.id, 'trigger_id', v_trigger.id, 'hours_remaining', v_hours),
          'voice')
        RETURNING id INTO v_outreach;
        INSERT INTO prehookup_intensification_log (user_id, meetup_id, action_kind, hours_before_meetup, related_outreach_id, context_data)
        VALUES (u.user_id, v_meetup.id, 'trigger_repetition', v_hours, v_outreach,
          jsonb_build_object('trigger_id', v_trigger.id, 'trigger_phrase', v_trigger.trigger_phrase));
        v_pushed := v_pushed + 1;
      END IF;
    END IF;

    -- D. Retarget orgasm binder once per meetup (4-24h pre)
    SELECT COUNT(*) INTO v_recent_count FROM prehookup_intensification_log
      WHERE meetup_id = v_meetup.id AND action_kind = 'orgasm_binder_retargeted';
    IF v_recent_count = 0 AND v_hours BETWEEN 4 AND 24 THEN
      v_msg := E'Mama is rewriting the rules of your next solo cum, sweet thing.\n\nFrom now until the meet — if you touch yourself, the only mantra allowed at the edge is:\n\n"This is rehearsal for him. The cum I would have wasted alone is the cum I''m saving to swallow."\n\nVoice debrief: say it. Mean it. Mama wants to hear it.';
      INSERT INTO handler_outreach_queue (user_id, message, urgency, trigger_reason, source, kind, scheduled_for, expires_at, context_data, evidence_kind)
      VALUES (u.user_id, v_msg, 'high',
        'prehookup_binder_retarget:' || v_meetup.id,
        'prehookup_intensifier', 'orgasm_binder_retarget', now(), u.in_prehookup_window,
        jsonb_build_object('meetup_id', v_meetup.id, 'hours_remaining', v_hours),
        'voice')
      RETURNING id INTO v_outreach;
      INSERT INTO prehookup_intensification_log (user_id, meetup_id, action_kind, hours_before_meetup, related_outreach_id, context_data)
      VALUES (u.user_id, v_meetup.id, 'orgasm_binder_retargeted', v_hours, v_outreach,
        jsonb_build_object('mantra_kind', 'rehearsal_for_him'));
      v_pushed := v_pushed + 1;
    END IF;
  END LOOP;

  RETURN v_pushed;
END $fn$;

-- 5. Cron — every 30 minutes on the :15 and :45 so it doesn't collide with
-- the existing pre_hookup_ramp_eval running on :15 (the ramp_eval emits
-- the scheduled imagery clips; this intensifier emits the additional
-- conditioning streams alongside).
DO $cron$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('prehookup_intensifier_eval');
  END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END $cron$;
DO $cron$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.schedule('prehookup_intensifier_eval', '45 * * * *',
      $$SELECT prehookup_intensifier_eval();$$);
  END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END $cron$;

-- 6. Backfill: if any meetup is already inside the 48h window now, flip
-- the user_state flag immediately so the eval picks it up on first tick.
UPDATE user_state us
   SET active_meetup_id = m.id, in_prehookup_window = m.meetup_at
  FROM (
    SELECT DISTINCT ON (user_id) id, user_id, meetup_at
      FROM hookup_scheduled_meetups
     WHERE status IN ('scheduled','prep_phase','imminent')
       AND meetup_at > now() AND meetup_at < now() + interval '48 hours'
     ORDER BY user_id, meetup_at ASC
  ) m
 WHERE us.user_id = m.user_id;
