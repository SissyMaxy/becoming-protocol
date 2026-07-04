-- 661 — Fitness log: the daily hook that feeds the side-quest drift.
--
-- The trojan horse (mig 660) gates corruption behind cumulative fitness sessions
-- (exercise_streaks.total_sessions). This gives the tracker a simple, honest
-- daily action — "I moved today" — that increments that currency ONCE per day.
-- Every session logged nudges the side-quest ladder forward. Genuinely useful
-- fitness habit on the surface; the drift underneath.

-- Log one fitness session for today (idempotent per calendar day). Returns the
-- new totals so the UI can show the streak + progress toward the next unlock.
CREATE OR REPLACE FUNCTION fitness_log_session(p_user UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_last DATE;
  v_total INT;
  v_week INT;
  v_already BOOLEAN := FALSE;
BEGIN
  INSERT INTO exercise_streaks (user_id, total_sessions, sessions_this_week, current_streak_weeks, week_start, last_session_at)
  VALUES (p_user, 0, 0, 0, date_trunc('week', now())::date, NULL)
  ON CONFLICT (user_id) DO NOTHING;

  SELECT last_session_at::date INTO v_last FROM exercise_streaks WHERE user_id = p_user;

  IF v_last IS NOT NULL AND v_last = now()::date THEN
    v_already := TRUE;   -- already moved today; don't double-count
  ELSE
    UPDATE exercise_streaks SET
      total_sessions = COALESCE(total_sessions, 0) + 1,
      sessions_this_week = CASE WHEN week_start = date_trunc('week', now())::date
                                THEN COALESCE(sessions_this_week, 0) + 1 ELSE 1 END,
      week_start = date_trunc('week', now())::date,
      current_streak_weeks = GREATEST(COALESCE(current_streak_weeks, 0), 1),
      last_session_at = now(),
      updated_at = now()
    WHERE user_id = p_user;
  END IF;

  SELECT total_sessions, sessions_this_week INTO v_total, v_week FROM exercise_streaks WHERE user_id = p_user;
  RETURN jsonb_build_object('logged', NOT v_already, 'already_today', v_already,
                            'total_sessions', v_total, 'sessions_this_week', v_week);
END;
$fn$;
GRANT EXECUTE ON FUNCTION fitness_log_session(UUID) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION fitness_status(p_user UUID)
RETURNS JSONB LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT jsonb_build_object(
    'logged_today', COALESCE((SELECT last_session_at::date = now()::date FROM exercise_streaks WHERE user_id = p_user), false),
    'total_sessions', COALESCE((SELECT total_sessions FROM exercise_streaks WHERE user_id = p_user), 0),
    'sessions_this_week', COALESCE((SELECT sessions_this_week FROM exercise_streaks WHERE user_id = p_user), 0),
    'current_streak_weeks', COALESCE((SELECT current_streak_weeks FROM exercise_streaks WHERE user_id = p_user), 0)
  );
$fn$;
GRANT EXECUTE ON FUNCTION fitness_status(UUID) TO authenticated, service_role;
