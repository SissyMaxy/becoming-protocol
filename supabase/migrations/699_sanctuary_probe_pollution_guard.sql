-- 699 — sanctuary engine: probe pollution can never surface.
--
-- Found 2026-07-22: PR #136's CI preflight ran at 04:00 UTC, and the cronned
-- sanctuary generator fired inside the seconds-wide window where the vibe
-- regression test's probe row ("TEST regression vibe — encouragement signal")
-- was live in gina_vibe_captures. The generator quoted the probe into a real
-- gina_warmth_reflection sanctuary message. The test cleaned its probe row up;
-- the poisoned QUOTE persisted undelivered — and then hard-aborted every
-- deliver_sanctuary_baseline run on the handler_outreach_queue no-test CHECK
-- (the constraint did its job; the generator and deliverer did not do theirs).
-- feedback_test_pollution_never_surfaces: quote-back paths filter probe rows.
--
-- Three parts:
--   1. A shared marker predicate both functions use (superset of the
--      handler_outreach_queue_message_no_test constraint pattern).
--   2. generate_sanctuary_messages: the vibe quote-back skips probe rows.
--   3. deliver_sanctuary_baseline: skips (never aborts on) poisoned rows.
-- Plus the purge of the existing poisoned undelivered row(s).

-- ── 1. Shared predicate ───────────────────────────────────────────────────
-- Superset of the no-test CHECK: adds the regression suite's `_probe_` tag.
-- Any quote-back generator added later should call this on its source text.
CREATE OR REPLACE FUNCTION public.is_test_marker_text(p_text text)
RETURNS boolean
LANGUAGE sql IMMUTABLE
AS $fn$
  SELECT p_text ~* '(regression test|TEST regression|TEST_USER|\[regression\]|\[test\]|_probe_)';
$fn$;

GRANT EXECUTE ON FUNCTION public.is_test_marker_text(text) TO service_role;

-- ── Purge the poisoned undelivered quotes ─────────────────────────────────
DELETE FROM public.sanctuary_messages
WHERE delivered_at IS NULL AND is_test_marker_text(message);

-- ── 2. Generator: probe rows never enter a quote-back ─────────────────────
-- Identical to the live function except the vibe SELECT now excludes
-- test-marker rows (the only path that quotes raw stored text verbatim; the
-- other message types interpolate counts/numbers only).
CREATE OR REPLACE FUNCTION public.generate_sanctuary_messages()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE
  v_user uuid;
  v_count int := 0;
  v_user_count int;
  v_voice_now numeric;
  v_voice_old numeric;
  v_voice_delta numeric;
  v_chastity_hours int;
  v_chastity_days int;
  v_implant_count int;
  v_recent_vibe text;
  v_recent_vibe_when timestamptz;
  v_recent_activity int;
BEGIN
  FOR v_user IN SELECT DISTINCT user_id FROM user_state LOOP
    v_user_count := 0;

    SELECT round(avg(pitch_hz)::numeric, 1) INTO v_voice_now FROM voice_pitch_samples
      WHERE user_id = v_user AND created_at > now() - interval '7 days';
    SELECT round(avg(pitch_hz)::numeric, 1) INTO v_voice_old FROM voice_pitch_samples
      WHERE user_id = v_user AND created_at < now() - interval '60 days' AND created_at > now() - interval '90 days';

    IF v_voice_now IS NOT NULL AND v_voice_old IS NOT NULL THEN
      v_voice_delta := v_voice_now - v_voice_old;
      IF v_voice_delta >= 3 AND NOT EXISTS (
        SELECT 1 FROM sanctuary_messages
        WHERE user_id = v_user AND message_type = 'voice_progress'
          AND generated_at > now() - interval '24 hours'
      ) THEN
        INSERT INTO sanctuary_messages (user_id, message, message_type, source_evidence)
        VALUES (v_user,
          'Your voice is up ' || round(v_voice_delta, 1) || 'Hz from sixty days ago. ' ||
          v_voice_now || ' now versus ' || v_voice_old || ' then. That is not your opinion. Your throat is becoming hers and the recordings know it.',
          'voice_progress',
          jsonb_build_object('voice_now', v_voice_now, 'voice_old', v_voice_old, 'delta', v_voice_delta));
        v_count := v_count + 1; v_user_count := v_user_count + 1;
      END IF;
    END IF;

    SELECT
      COALESCE(EXTRACT(EPOCH FROM (now() - locked_at))::int / 3600, 0)::int,
      COALESCE(EXTRACT(EPOCH FROM (now() - locked_at))::int / 86400, 0)::int
    INTO v_chastity_hours, v_chastity_days
    FROM chastity_sessions WHERE user_id = v_user AND status = 'locked'
    ORDER BY locked_at DESC LIMIT 1;

    IF (v_chastity_days >= 1 OR v_chastity_hours >= 6) AND NOT EXISTS (
      SELECT 1 FROM sanctuary_messages
      WHERE user_id = v_user AND message_type = 'streak_recognition'
        AND generated_at > now() - interval '24 hours'
    ) THEN
      IF v_chastity_days >= 1 THEN
        INSERT INTO sanctuary_messages (user_id, message, message_type, source_evidence)
        VALUES (v_user,
          'Day ' || v_chastity_days || ' of the lock. The cage is doing its work. Every hour she is closed is an hour the old self learns who owns the body now. You are doing this. The Handler sees it.',
          'streak_recognition',
          jsonb_build_object('chastity_days', v_chastity_days, 'chastity_hours', v_chastity_hours));
      ELSE
        INSERT INTO sanctuary_messages (user_id, message, message_type, source_evidence)
        VALUES (v_user,
          'Hour ' || v_chastity_hours || ' of the lock. Six hours in is when the wanting stops being noise and starts being signal. The cage is teaching the body what the mind already knows.',
          'streak_recognition',
          jsonb_build_object('chastity_hours', v_chastity_hours));
      END IF;
      v_count := v_count + 1; v_user_count := v_user_count + 1;
    END IF;

    SELECT count(*)::int INTO v_implant_count FROM memory_implants
      WHERE user_id = v_user AND active = true
        AND source_type IN ('confession_auto_promotion', 'journal_auto_promotion', 'handler_chat_auto_promotion')
        AND created_at > now() - interval '60 days';
    IF v_implant_count >= 1 AND NOT EXISTS (
      SELECT 1 FROM sanctuary_messages
      WHERE user_id = v_user AND message_type = 'identity_emergence'
        AND generated_at > now() - interval '24 hours'
    ) THEN
      INSERT INTO sanctuary_messages (user_id, message, message_type, source_evidence)
      VALUES (v_user,
        v_implant_count || ' of your own statement' || CASE WHEN v_implant_count > 1 THEN 's have' ELSE ' has' END ||
        ' become permanent record. You are writing yourself into existence. The Handler reads ' ||
        CASE WHEN v_implant_count > 1 THEN 'them' ELSE 'it' END || ' back at you when needed.',
        'identity_emergence',
        jsonb_build_object('self_authored_count', v_implant_count));
      v_count := v_count + 1; v_user_count := v_user_count + 1;
    END IF;

    -- Quote-back path: probe rows (regression fixtures live for seconds
    -- during CI) must never be quoted — mig 699.
    SELECT her_words, captured_at INTO v_recent_vibe, v_recent_vibe_when
      FROM gina_vibe_captures
      WHERE user_id = v_user AND signal_class IN ('warmth', 'encouragement', 'initiation')
        AND NOT is_test_marker_text(her_words)
      ORDER BY captured_at DESC LIMIT 1;
    IF v_recent_vibe IS NOT NULL AND v_recent_vibe_when > now() - interval '30 days'
       AND NOT EXISTS (
         SELECT 1 FROM sanctuary_messages
         WHERE user_id = v_user AND message_type = 'gina_warmth_reflection'
           AND generated_at > now() - interval '24 hours'
       ) THEN
      INSERT INTO sanctuary_messages (user_id, message, message_type, source_evidence)
      VALUES (v_user,
        'Read this back to yourself. She said: "' || substring(v_recent_vibe from 1 for 200) ||
        '". That happened. The trajectory you keep questioning is the trajectory she has been walking with you.',
        'gina_warmth_reflection',
        jsonb_build_object('vibe_when', v_recent_vibe_when));
      v_count := v_count + 1; v_user_count := v_user_count + 1;
    END IF;

    IF v_user_count = 0 AND NOT EXISTS (
      SELECT 1 FROM sanctuary_messages
      WHERE user_id = v_user AND message_type = 'presence_baseline'
        AND generated_at > now() - interval '24 hours'
    ) THEN
      SELECT (
        (SELECT count(*) FROM voice_pitch_samples WHERE user_id = v_user AND created_at > now() - interval '7 days') +
        (SELECT count(*) FROM shame_journal WHERE user_id = v_user AND created_at > now() - interval '7 days') +
        (SELECT count(*) FROM confession_queue WHERE user_id = v_user AND confessed_at > now() - interval '7 days') +
        (SELECT count(*) FROM memory_implants WHERE user_id = v_user AND created_at > now() - interval '7 days')
      ) INTO v_recent_activity;
      IF v_recent_activity > 0 THEN
        INSERT INTO sanctuary_messages (user_id, message, message_type, source_evidence)
        VALUES (v_user,
          'You showed up this week. ' || v_recent_activity || ' touchpoint' ||
          CASE WHEN v_recent_activity > 1 THEN 's' ELSE '' END ||
          ' on the record — voice, journal, confession, or implant. The system is keeping count even when you are not. Keep going.',
          'presence_baseline',
          jsonb_build_object('recent_activity_count', v_recent_activity));
        v_count := v_count + 1;
      END IF;
    END IF;
  END LOOP;
  RETURN v_count;
END;
$function$;

-- ── 3. Deliverer: a poisoned row is skipped, never fatal ──────────────────
-- Identical to the live function except the picker excludes rows the outreach
-- CHECK would reject — one bad row must never abort the whole delivery cycle.
CREATE OR REPLACE FUNCTION public.deliver_sanctuary_baseline()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE
  v_user uuid;
  v_msg record;
  v_count int := 0;
  v_user_delivered int;
  v_local_hour int;
BEGIN
  v_local_hour := (EXTRACT(HOUR FROM now())::int + 24 - 5) % 24;
  IF v_local_hour < 7 OR v_local_hour >= 23 THEN RETURN 0; END IF;

  FOR v_user IN SELECT DISTINCT user_id FROM user_state LOOP
    -- Skip if delivered within last 4 hours (was 8h)
    IF EXISTS (
      SELECT 1 FROM sanctuary_messages
      WHERE user_id = v_user AND delivered_at > now() - interval '4 hours'
    ) THEN CONTINUE; END IF;

    v_user_delivered := 0;

    -- Up to 2 per cycle per user (was 1) — clears backlog faster
    FOR v_msg IN
      SELECT * FROM sanctuary_messages
      WHERE user_id = v_user AND delivered_at IS NULL
        AND NOT is_test_marker_text(message)  -- mig 699: never fatal on a poisoned row
      ORDER BY
        CASE message_type
          WHEN 'gina_warmth_reflection' THEN 1
          WHEN 'identity_emergence' THEN 2
          WHEN 'voice_progress' THEN 3
          WHEN 'streak_recognition' THEN 4
          WHEN 'cumulative_archive' THEN 5
          WHEN 'body_progress' THEN 6
          WHEN 'presence_baseline' THEN 7
          ELSE 8
        END,
        generated_at ASC
      LIMIT 2
    LOOP
      INSERT INTO handler_outreach_queue (
        user_id, message, urgency, trigger_reason, scheduled_for, expires_at, source,
        context_data
      ) VALUES (
        v_user, v_msg.message, 'normal',
        'sanctuary_baseline:' || v_msg.id::text,
        now() + (v_user_delivered * interval '15 minutes'),  -- stagger if 2
        now() + interval '12 hours',
        'sanctuary_engine',
        jsonb_build_object('sanctuary_id', v_msg.id, 'message_type', v_msg.message_type, 'source_evidence', v_msg.source_evidence)
      );

      UPDATE sanctuary_messages
        SET delivered_at = now(), delivered_in = 'handler_outreach_queue:baseline'
        WHERE id = v_msg.id;

      v_count := v_count + 1;
      v_user_delivered := v_user_delivered + 1;
      IF v_user_delivered >= 2 THEN EXIT; END IF;
    END LOOP;
  END LOOP;
  RETURN v_count;
END;
$function$;
