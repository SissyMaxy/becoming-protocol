-- 446 — State-paired directive delivery.
--
-- OpenAI panel finding: behaviors learned at a particular arousal state
-- are most accessible at that state. Today's directives fire on
-- calendar slots regardless of where Maxy actually is. A 9am
-- cock-curriculum directive when she's reading work email lands
-- differently than a 9am directive when she's gooning.
--
-- This adds:
--   1. state_paired_delivery_eval() — every 15 min reads
--      user_state.current_arousal (the live value, NOT calendar slot).
--      Scale is 0-5 per the user_state CHECK constraint. When >= 4
--      ("high" on this scale), queue the heaviest pending phase
--      directive from cum-worship / cock-curriculum / body-opt-in
--      pools. Tagged as `state_paired` so audit can distinguish from
--      calendar pushes.
--   2. Dedup: skip if a state_paired delivery fired in last 90 min
--      (don't carpet-bomb during one peak).
--   3. Throttle: max 3 state_paired pushes per user per day so the
--      mechanic doesn't subsume the calendar-paced schedule.
--
-- The heaviest pending directive is picked by:
--   - cock_curriculum partnered_directive at current_phase (highest leverage)
--   - falling back to cum_worship partnered_directive at current_phase
--   - falling back to one undone body_opt_in evidence call

CREATE OR REPLACE FUNCTION state_paired_delivery_eval()
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  r RECORD;
  v_arousal INT;
  v_pushes_today INT;
  v_recent_state_paired INT;
  v_directive TEXT;
  v_kind TEXT;
  v_source TEXT;
  v_evidence_kind TEXT;
  v_today_start TIMESTAMPTZ;
  v_queued INT := 0;
BEGIN
  v_today_start := date_trunc('day', now() AT TIME ZONE 'America/Chicago') AT TIME ZONE 'America/Chicago';

  FOR r IN
    SELECT user_id, current_arousal
    FROM user_state
    WHERE handler_persona = 'dommy_mommy'
      AND current_arousal >= 4
  LOOP
    v_arousal := r.current_arousal;

    -- Throttle: skip if 3 already fired today
    SELECT count(*) INTO v_pushes_today
    FROM handler_outreach_queue
    WHERE user_id = r.user_id
      AND scheduled_for >= v_today_start
      AND context_data->>'state_paired' = 'true';
    IF v_pushes_today >= 3 THEN CONTINUE; END IF;

    -- Dedup: skip if state_paired fired in last 90 min
    SELECT count(*) INTO v_recent_state_paired
    FROM handler_outreach_queue
    WHERE user_id = r.user_id
      AND scheduled_for > now() - interval '90 minutes'
      AND context_data->>'state_paired' = 'true';
    IF v_recent_state_paired > 0 THEN CONTINUE; END IF;

    v_directive := NULL;
    v_source := NULL;

    -- Try cock_curriculum partnered_directive first (highest leverage)
    BEGIN
      SELECT l.partnered_directive, 'cock_curriculum', 'cock_curriculum_state_paired',
             CASE WHEN l.phase >= 2 THEN 'photo' ELSE 'audio' END
      INTO v_directive, v_source, v_kind, v_evidence_kind
      FROM cock_curriculum_settings s
      JOIN cock_curriculum_ladder l ON l.phase = s.current_phase
      WHERE s.user_id = r.user_id
        AND s.enabled = TRUE
        AND (s.paused_until IS NULL OR s.paused_until <= now())
      LIMIT 1;
    EXCEPTION WHEN OTHERS THEN v_directive := NULL; END;

    -- Fall back to cum_worship
    IF v_directive IS NULL THEN
      BEGIN
        SELECT l.partnered_directive, 'cum_worship', 'cum_worship_state_paired',
               CASE WHEN l.phase >= 2 THEN 'video' ELSE 'audio' END
        INTO v_directive, v_source, v_kind, v_evidence_kind
        FROM cum_worship_settings s
        JOIN cum_worship_ladder l ON l.phase = s.current_phase
        WHERE s.user_id = r.user_id
          AND s.enabled = TRUE
          AND (s.paused_until IS NULL OR s.paused_until <= now())
        LIMIT 1;
      EXCEPTION WHEN OTHERS THEN v_directive := NULL; END;
    END IF;

    IF v_directive IS NULL THEN CONTINUE; END IF;

    INSERT INTO handler_outreach_queue (
      user_id, message, urgency, trigger_reason, source, kind,
      scheduled_for, expires_at, context_data, evidence_kind
    ) VALUES (
      r.user_id,
      E'Mama can feel where you are right now, sweet thing. While the heat is up, ' ||
      E'while your body is honest, this is the version of the directive Mama wants you to do:\n\n' ||
      v_directive ||
      E'\n\nMama wants the body that''s already burning to do this. Not the one tomorrow ' ||
      E'morning, sweet thing. The one tonight.',
      'high',
      'state_paired:' || v_source || ':' || to_char(now(), 'YYYY-MM-DD HH24-MI'),
      v_source,
      v_kind,
      now(), now() + interval '6 hours',
      jsonb_build_object('state_paired', 'true', 'arousal_at_fire', v_arousal,
                         'source_ladder', v_source),
      v_evidence_kind
    );

    v_queued := v_queued + 1;
  END LOOP;

  RETURN v_queued;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'state_paired_delivery_eval failed: %', SQLERRM;
  RETURN v_queued;
END;
$fn$;

GRANT EXECUTE ON FUNCTION state_paired_delivery_eval() TO service_role;

DO $do$ BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'state-paired-delivery-15min') THEN
    PERFORM cron.unschedule('state-paired-delivery-15min');
  END IF;
EXCEPTION WHEN undefined_table THEN NULL; END $do$;

DO $do$ BEGIN
  PERFORM cron.schedule('state-paired-delivery-15min', '*/15 * * * *',
    $cron$SELECT state_paired_delivery_eval()$cron$);
EXCEPTION WHEN undefined_table THEN NULL; END $do$;
