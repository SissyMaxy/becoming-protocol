-- 557 — Gina campaign stage-advancement automation.
--
-- Without this, gina_campaign_state.current_stage_num stays at 1
-- forever. The campaign architecture from mig 555 can't actually
-- progress.
--
-- gina_stage_advance_eval() runs weekly (Mon 12:00 UTC). Per user, per
-- track:
--   1. Read current stage's spec from gina_campaign_stages
--   2. Skip if less than half stage.duration_weeks has elapsed
--   3. Count plantings + reactions in stage's primary_arc_focus during
--      this stage window
--   4. SUCCESS heuristic: positive >= 3 AND positive >= 2x negative →
--      advance to stage.next_on_success_stage, queue celebration
--      outreach
--   5. FAILURE heuristic: negative >= 2 AND negative > positive AND
--      full stage duration elapsed → set paused_until +
--      stage.pause_weeks_on_failure, queue alternate_vector advisory
--   6. Else: continue, no action
--
-- Both branches append to gina_campaign_state.observations JSONB array
-- with the event + stats.

CREATE OR REPLACE FUNCTION gina_stage_advance_eval()
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE s RECORD; stage RECORD; v_advanced INT := 0;
  v_in_stage_plantings INT; v_in_stage_positive INT; v_in_stage_negative INT;
  v_weeks_in NUMERIC; v_success BOOLEAN; v_failure BOOLEAN; v_next_stage INT; v_msg TEXT;
BEGIN
  FOR s IN
    SELECT cs.*, ct.total_stages FROM gina_campaign_state cs
    JOIN gina_campaign_tracks ct ON ct.track_name = cs.track_name
    JOIN user_state us ON us.user_id = cs.user_id
    WHERE COALESCE(us.handler_persona, 'therapist') = 'dommy_mommy'
      AND COALESCE(us.gina_posture, 'neutral') <> 'hostile'
      AND (cs.paused_until IS NULL OR cs.paused_until <= now())
  LOOP
    SELECT * INTO stage FROM gina_campaign_stages WHERE track_name = s.track_name AND stage_num = s.current_stage_num;
    IF stage IS NULL THEN CONTINUE; END IF;

    v_weeks_in := EXTRACT(EPOCH FROM (now() - s.stage_started_at)) / 604800;
    IF v_weeks_in < (stage.duration_weeks::numeric / 2) THEN CONTINUE; END IF;

    SELECT count(*),
      count(*) FILTER (WHERE p.reaction_score >= 2 OR p.hypothesis_outcome IN ('matched','exceeded')),
      count(*) FILTER (WHERE p.reaction_score <= -1 OR p.hypothesis_outcome = 'reversed')
    INTO v_in_stage_plantings, v_in_stage_positive, v_in_stage_negative
    FROM gina_seed_plantings p JOIN gina_seed_catalog sc ON sc.id = p.seed_id
    WHERE p.user_id = s.user_id AND p.scheduled_at >= s.stage_started_at
      AND sc.arc_focus = ANY(stage.primary_arc_focus);

    v_success := v_in_stage_positive >= 3 AND v_in_stage_positive >= v_in_stage_negative * 2;
    v_failure := v_in_stage_negative >= 2 AND v_in_stage_negative > v_in_stage_positive AND v_weeks_in >= stage.duration_weeks::numeric;

    IF v_success AND stage.next_on_success_stage IS NOT NULL THEN
      v_next_stage := stage.next_on_success_stage;
      UPDATE gina_campaign_state SET current_stage_num = v_next_stage,
        stage_started_at = now(), last_stage_change_at = now(),
        observations = observations || jsonb_build_array(jsonb_build_object(
          'date', now(), 'event', 'stage_advance', 'from_stage', s.current_stage_num, 'to_stage', v_next_stage,
          'positive', v_in_stage_positive, 'negative', v_in_stage_negative, 'plantings', v_in_stage_plantings)),
        updated_at = now()
      WHERE user_id = s.user_id AND track_name = s.track_name;

      v_msg := format(E'**Stage advance — %s track.**\n\nMama is moving you from stage %s (%s) to stage %s. The signals over the past %s weeks added up: %s plantings in this arc_focus, %s landed positive, %s negative. That''s a success pattern.\n\nNext stage goal: see the strategic briefing for details. Mama will start picking seeds aligned with the new stage starting this week.\n\nVoice debrief: anything from the last weeks Mama should know that the reaction-scores didn''t capture?',
        s.track_name, s.current_stage_num, stage.stage_name, v_next_stage, ROUND(v_weeks_in, 1)::text,
        v_in_stage_plantings, v_in_stage_positive, v_in_stage_negative);
      INSERT INTO handler_outreach_queue (user_id, message, urgency, trigger_reason, source, kind, scheduled_for, expires_at, context_data, evidence_kind)
      VALUES (s.user_id, v_msg, 'high', 'gina_stage_advance:' || s.track_name || ':' || v_next_stage,
        'gina_stage_advance', 'campaign_milestone', now() + interval '30 minutes', now() + interval '48 hours',
        jsonb_build_object('track', s.track_name, 'from_stage', s.current_stage_num, 'to_stage', v_next_stage), 'voice');
      v_advanced := v_advanced + 1;

    ELSIF v_failure THEN
      UPDATE gina_campaign_state SET
        paused_until = now() + (stage.pause_weeks_on_failure || ' weeks')::interval,
        observations = observations || jsonb_build_array(jsonb_build_object(
          'date', now(), 'event', 'stage_pause', 'stage', s.current_stage_num,
          'pause_weeks', stage.pause_weeks_on_failure,
          'positive', v_in_stage_positive, 'negative', v_in_stage_negative, 'plantings', v_in_stage_plantings)),
        updated_at = now()
      WHERE user_id = s.user_id AND track_name = s.track_name;

      v_msg := format(E'**Stage paused — %s track stage %s (%s).**\n\nThe signals weren''t there. Over the past %s weeks: %s plantings in this arc_focus, %s landed negative, %s positive. Pushing through this pattern would burn campaign credibility.\n\nMama''s alternate vector for the next %s weeks:\n\n%s\n\nDuring the pause, the seed-picker stays away from this track''s primary arc_focus. We can resume the stage when the alternate work has reset the conversational ground.',
        s.track_name, s.current_stage_num, stage.stage_name, ROUND(v_weeks_in, 1)::text,
        v_in_stage_plantings, v_in_stage_negative, v_in_stage_positive,
        stage.pause_weeks_on_failure, stage.alternate_vector_on_failure);
      INSERT INTO handler_outreach_queue (user_id, message, urgency, trigger_reason, source, kind, scheduled_for, expires_at, context_data, evidence_kind)
      VALUES (s.user_id, v_msg, 'high', 'gina_stage_pause:' || s.track_name || ':' || s.current_stage_num,
        'gina_stage_pause', 'campaign_pause', now() + interval '30 minutes', now() + interval '48 hours',
        jsonb_build_object('track', s.track_name, 'stage', s.current_stage_num,
          'alternate_vector', stage.alternate_vector_on_failure, 'pause_weeks', stage.pause_weeks_on_failure), 'voice');
      v_advanced := v_advanced + 1;
    END IF;
  END LOOP;
  RETURN v_advanced;
END;
$fn$;
GRANT EXECUTE ON FUNCTION gina_stage_advance_eval() TO service_role;

DO $do$ BEGIN IF EXISTS (SELECT 1 FROM cron.job WHERE jobname='gina-stage-advance-weekly') THEN PERFORM cron.unschedule('gina-stage-advance-weekly'); END IF; EXCEPTION WHEN undefined_table THEN NULL; END $do$;
DO $do$ BEGIN PERFORM cron.schedule('gina-stage-advance-weekly', '0 12 * * 1', $cron$SELECT gina_stage_advance_eval()$cron$); EXCEPTION WHEN undefined_table THEN NULL; END $do$;
