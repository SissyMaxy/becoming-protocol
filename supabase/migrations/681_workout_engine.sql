-- 681_workout_engine.sql
-- Activates the dormant body-program (src/lib/body-program.ts) as a REAL,
-- tracked workout. Three pieces:
--   1. workout_set_log — the per-set spine (reps/weight/duration over time),
--      so "am I progressing" is answerable and history exists.
--   2. body_program_start() — seeds the body_conditioning reconditioning
--      target so the pure day-computer runs (program_start = today ⇒ day 0).
--   3. fitness_log_session streak-bug fix — current_streak_weeks did
--      GREATEST(x,1) forever, so the weekly streak froze at 1. Now it grows
--      across consecutive weeks and resets after a gap.
--
-- Prod-consistent: verified against the live schema (reconditioning_targets
-- NOT-NULL columns, exercise_streaks unique(user_id), fitness_log_session
-- signature). No mommy_order_* columns are touched (they don't exist in prod).

-- ── 1. Per-set workout log ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.workout_set_log (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid NOT NULL,
  session_uid      uuid NOT NULL,            -- groups the sets of one session
  exercise_name    text NOT NULL,
  set_number       int  NOT NULL,
  reps             int,
  weight_kg        numeric,
  duration_seconds int,
  program_week     int,
  program_day      text,
  session_name     text,
  logged_at        timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.workout_set_log ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_workout_set_log_user_session
  ON public.workout_set_log(user_id, session_uid);
CREATE INDEX IF NOT EXISTS idx_workout_set_log_user_exercise
  ON public.workout_set_log(user_id, exercise_name, logged_at DESC);

DROP POLICY IF EXISTS workout_set_log_owner ON public.workout_set_log;
CREATE POLICY workout_set_log_owner ON public.workout_set_log
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ── 2. Activation RPC ───────────────────────────────────────────────────────
-- Idempotent: re-activating refreshes program_start to today.
CREATE OR REPLACE FUNCTION public.body_program_start(p_split text DEFAULT 'lower_led_3x')
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_user  uuid := auth.uid();
  v_id    uuid;
  v_start text := current_date::text;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;

  SELECT id INTO v_id FROM reconditioning_targets
  WHERE user_id = v_user AND indicator_config->>'program' = 'body_conditioning'
  ORDER BY created_at DESC LIMIT 1;

  IF v_id IS NOT NULL THEN
    UPDATE reconditioning_targets
    SET indicator_config = jsonb_build_object(
          'program', 'body_conditioning', 'split', p_split, 'program_start', v_start),
        status = 'active'
    WHERE id = v_id;
    RETURN v_id;
  END IF;

  INSERT INTO reconditioning_targets
    (user_id, slug, title, claim_text, category, indicator_kind,
     indicator_config, target_direction, status, authored_by)
  VALUES
    (v_user, 'body_conditioning', 'The body she is building',
     'My body is being shaped for me, one session at a time.',
     'body', 'program',
     jsonb_build_object('program', 'body_conditioning', 'split', p_split, 'program_start', v_start),
     'increase', 'active', 'mommy')
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.body_program_start(text) TO authenticated;

-- ── 3. Weekly-streak fix ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fitness_log_session(p_user uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_last      DATE;
  v_prev_week DATE;
  v_this_week DATE := date_trunc('week', now())::date;
  v_streak    INT;
  v_total     INT;
  v_week      INT;
  v_already   BOOLEAN := FALSE;
BEGIN
  INSERT INTO exercise_streaks
    (user_id, total_sessions, sessions_this_week, current_streak_weeks, week_start, last_session_at)
  VALUES (p_user, 0, 0, 0, v_this_week, NULL)
  ON CONFLICT (user_id) DO NOTHING;

  SELECT last_session_at::date, week_start, COALESCE(current_streak_weeks, 0)
    INTO v_last, v_prev_week, v_streak
    FROM exercise_streaks WHERE user_id = p_user;

  IF v_last IS NOT NULL AND v_last = now()::date THEN
    v_already := TRUE;                                   -- already moved today
  ELSIF v_prev_week = v_this_week THEN
    -- another session this week: streak holds (min 1 on first-ever)
    UPDATE exercise_streaks SET
      total_sessions       = COALESCE(total_sessions, 0) + 1,
      sessions_this_week   = COALESCE(sessions_this_week, 0) + 1,
      current_streak_weeks = GREATEST(v_streak, 1),
      last_session_at = now(), updated_at = now()
    WHERE user_id = p_user;
  ELSIF v_last IS NOT NULL AND v_prev_week = v_this_week - INTERVAL '7 days' THEN
    -- first session of a consecutive new week: the streak grows
    UPDATE exercise_streaks SET
      total_sessions       = COALESCE(total_sessions, 0) + 1,
      sessions_this_week   = 1,
      week_start           = v_this_week,
      current_streak_weeks = v_streak + 1,
      last_session_at = now(), updated_at = now()
    WHERE user_id = p_user;
  ELSE
    -- first ever, or a gap week: the streak (re)starts at 1
    UPDATE exercise_streaks SET
      total_sessions       = COALESCE(total_sessions, 0) + 1,
      sessions_this_week   = 1,
      week_start           = v_this_week,
      current_streak_weeks = 1,
      last_session_at = now(), updated_at = now()
    WHERE user_id = p_user;
  END IF;

  SELECT total_sessions, sessions_this_week INTO v_total, v_week
    FROM exercise_streaks WHERE user_id = p_user;
  RETURN jsonb_build_object(
    'logged', NOT v_already, 'already_today', v_already,
    'total_sessions', v_total, 'sessions_this_week', v_week);
END;
$$;
