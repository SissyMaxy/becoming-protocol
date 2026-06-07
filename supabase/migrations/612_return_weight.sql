-- 612 — Return weight: what didn't go anywhere while you were gone.
--
-- Design insight (this session): a self-applied protocol can't penalize
-- disengagement — the visible-before-penalized rule is fail-closed, so a user
-- who closes the app accrues nothing. The ONLY layer that survives non-use is
-- the standing weight of what's already irreversible (escape_cost_anchors,
-- irreversibility_score, captured real-world proofs). That weight was only
-- surfaced via a weekly outreach, never in the UI and never at the highest-
-- leverage moment: the instant the girl returns after being away.
--
-- This RPC bundles the standing weight + how long she was gone, computed from
-- meaningful activity (task completions / confessions / arousal logs — none of
-- which fire from merely opening the app, so "days away" is honest). The
-- ReturnWeightCard renders it on return: "you left; none of this did."
-- No autonomous external action, no charge, no third party — it only makes
-- already-real facts felt.

CREATE OR REPLACE FUNCTION return_weight_bundle(p_user UUID)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_last TIMESTAMPTZ;
  v_days INT;
  v_escape JSONB;
  v_score INT := 0;
  v_peak INT := 0;
  v_binder INT := 0;
  v_confessions INT := 0;
  v_implants INT := 0;
BEGIN
  -- Last meaningful activity (NOT app-open — these require real action).
  SELECT max(t) INTO v_last FROM (
    SELECT max(created_at) AS t FROM task_completions WHERE user_id = p_user
    UNION ALL SELECT max(confessed_at) FROM confession_queue WHERE user_id = p_user AND confessed_at IS NOT NULL
    UNION ALL SELECT max(created_at) FROM arousal_log WHERE user_id = p_user
  ) s;

  IF v_last IS NULL THEN
    v_days := 0;
  ELSE
    v_days := GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (now() - v_last)) / 86400))::int;
  END IF;

  v_escape := current_escape_cost(p_user);

  BEGIN SELECT COALESCE(score,0), COALESCE(peak_score,0) INTO v_score, v_peak
    FROM irreversibility_score WHERE user_id = p_user; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN SELECT count(*) INTO v_binder FROM irreversible_events
    WHERE user_id = p_user AND status = 'captured'; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN SELECT count(*) INTO v_confessions FROM confession_queue
    WHERE user_id = p_user AND confessed_at IS NOT NULL; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN SELECT count(*) INTO v_implants FROM memory_implants
    WHERE user_id = p_user AND active = TRUE; EXCEPTION WHEN OTHERS THEN NULL; END;

  RETURN jsonb_build_object(
    'days_away', v_days,
    'last_activity_at', v_last,
    'escape_total_weight', COALESCE((v_escape->>'total_weight')::numeric, 0),
    'escape_total_count', COALESCE((v_escape->>'total_count')::int, 0),
    'escape_days_invested', COALESCE((v_escape->>'days_invested')::int, 0),
    'irreversibility_score', v_score,
    'irreversibility_peak', v_peak,
    'binder_captured', v_binder,
    'confessions', v_confessions,
    'implants', v_implants
  );
END;
$fn$;
GRANT EXECUTE ON FUNCTION return_weight_bundle(UUID) TO authenticated, service_role;
