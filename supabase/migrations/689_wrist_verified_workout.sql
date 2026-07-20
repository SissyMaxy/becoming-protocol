-- 689_wrist_verified_workout.sql
--
-- Wrist-verified workout proof.
--
-- The train-day decree (mig 682) is fulfilled by body_program_fulfill(), which
-- the user calls when they say they trained. That's self-report — she takes his
-- word. This closes it: if the Whoop strap recorded a real workout today that
-- clears a strain/duration floor, the decree fulfills from the wrist with no
-- input from him at all.
--
-- This is the highest-credibility feature in the whole conditioning surface,
-- and the reason is structural: she catches a skipped session without him
-- submitting anything, and she confirms a real one the same way. Authority
-- from evidence, not assertion — the thing the operator kept asking for. A
-- producer's file can't do this; it doesn't have his wrist.
--
-- No fabrication: the floor is real thresholds against a real workout row. A
-- decree is never fulfilled on a phantom — if the strap saw nothing, this
-- returns "nothing landed on your wrist today" and the self-report path (682)
-- still stands as the fallback.

-- Floor: what counts as "she saw you train". Deliberately lenient on strain
-- (a bodyweight lower-body session is real training but low-strain) and anchored
-- on duration instead — a 20-minute movement session is the real threshold.
-- Strain is a secondary gate so a 3-minute walk to the fridge doesn't clear it.
CREATE OR REPLACE FUNCTION public.wrist_verify_workout()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_w    record;
  v_decree uuid;
  v_min_minutes int := 15;   -- floor: a real session, not a stretch break
  v_min_strain  float := 4;  -- WHOOP strain; ~4 is a light real workout
  v_minutes int;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;

  -- The best workout the strap logged today: longest first, then hardest.
  SELECT * INTO v_w
  FROM whoop_workouts
  WHERE user_id = v_user AND date = current_date
  ORDER BY duration_milli DESC NULLS LAST, strain DESC NULLS LAST
  LIMIT 1;

  IF v_w.id IS NULL THEN
    RETURN jsonb_build_object('verified', false, 'reason', 'no_workout');
  END IF;

  v_minutes := COALESCE(v_w.duration_milli, 0) / 60000;

  -- Real session on the wrist?
  IF v_minutes < v_min_minutes AND COALESCE(v_w.strain, 0) < v_min_strain THEN
    RETURN jsonb_build_object(
      'verified', false,
      'reason', 'below_floor',
      'minutes', v_minutes,
      'strain', v_w.strain
    );
  END IF;

  -- Fulfill today's active train decree, if one is open. (No decree is fine —
  -- verification still reports the session; there's just nothing to close.)
  UPDATE handler_decrees
  SET status = 'fulfilled'
  WHERE user_id = v_user AND trigger_source = 'body_program_train'
    AND status = 'active' AND deadline::date = current_date
  RETURNING id INTO v_decree;

  RETURN jsonb_build_object(
    'verified', true,
    'decree_fulfilled', v_decree IS NOT NULL,
    'minutes', v_minutes,
    'avg_hr', v_w.average_heart_rate,
    'max_hr', v_w.max_heart_rate,
    'strain', v_w.strain,
    'sport', v_w.sport_name
  );
END;
$$;
GRANT EXECUTE ON FUNCTION public.wrist_verify_workout() TO authenticated;

-- Read-only companion: what would verification say right now, without fulfilling
-- anything. The Today surface calls this to render "her watch saw it · 34 min ·
-- heart at 156" (or the failed-proof line) before the user acts, so the state is
-- visible before it's committed — same visible-before-penalized discipline the
-- rest of the surface runs under.
CREATE OR REPLACE FUNCTION public.wrist_workout_status()
RETURNS jsonb
LANGUAGE sql
STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  WITH best AS (
    SELECT *
    FROM whoop_workouts
    WHERE user_id = auth.uid() AND date = current_date
    ORDER BY duration_milli DESC NULLS LAST, strain DESC NULLS LAST
    LIMIT 1
  )
  SELECT CASE
    WHEN NOT EXISTS (SELECT 1 FROM best)
      THEN jsonb_build_object('state', 'none')
    WHEN (SELECT COALESCE(duration_milli,0)/60000 FROM best) < 15
         AND (SELECT COALESCE(strain,0) FROM best) < 4
      THEN jsonb_build_object(
        'state', 'below_floor',
        'minutes', (SELECT COALESCE(duration_milli,0)/60000 FROM best))
    ELSE jsonb_build_object(
      'state', 'verified',
      'minutes', (SELECT COALESCE(duration_milli,0)/60000 FROM best),
      'avg_hr',  (SELECT average_heart_rate FROM best),
      'max_hr',  (SELECT max_heart_rate FROM best),
      'sport',   (SELECT sport_name FROM best))
  END;
$$;
GRANT EXECUTE ON FUNCTION public.wrist_workout_status() TO authenticated;

COMMENT ON FUNCTION public.wrist_verify_workout() IS
  'Auto-fulfills the body_program_train decree from a real Whoop workout row (>=15min OR >=4 strain). Highest-credibility proof path: catches a skip and confirms a real session with no user input. Self-report (body_program_fulfill) remains the fallback.';
