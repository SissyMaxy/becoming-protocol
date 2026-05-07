-- 299 — Re-apply migration 253's tightening of chastity_lock_state_consistent.
--
-- Diagnostic finding: live check_system_invariants() returns
-- active_session_count = 2 for Maxy (1 status='locked' from test +
-- 1 status='expired_pending_relock' historical). My diagnostic that
-- replicates 253's predicate (status='locked' only) returns 1.
-- So the live function must be running 246's definition (which counts
-- both 'locked' AND 'expired_pending_relock'), not 253's.
--
-- Either 246 was re-applied via tracker repair after 253, or 253's
-- CREATE OR REPLACE didn't take. Either way, re-apply the tightened
-- definition now to resolve the persistent invariant failure.

CREATE OR REPLACE FUNCTION public.check_system_invariants()
RETURNS TABLE(invariant_name text, fail_count integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'cron', 'pg_catalog'
AS $function$
DECLARE
  AUTO_POSTER_USER constant uuid := '93327332-7d0d-4888-889a-1607a5776216';
BEGIN
  INSERT INTO system_invariants_log (invariant_name, user_id, status, detail)
  SELECT 'denial_day_matches_last_release', user_id,
         CASE WHEN abs(denial_day - (EXTRACT(EPOCH FROM (now() - last_release))::int / 86400)) <= 1 THEN 'ok' ELSE 'fail' END,
         jsonb_build_object('denial_day_stored', denial_day,
                            'days_since_release', round((EXTRACT(EPOCH FROM (now() - last_release)) / 86400)::numeric, 2),
                            'last_release', last_release)
  FROM user_state WHERE last_release IS NOT NULL AND user_id <> AUTO_POSTER_USER;

  INSERT INTO system_invariants_log (invariant_name, user_id, status, detail)
  SELECT 'chastity_streak_matches_session', us.user_id,
         CASE WHEN us.chastity_locked = false THEN 'ok'
              WHEN cs.locked_at IS NULL THEN 'fail'
              WHEN abs(COALESCE(us.chastity_streak_days,0) - (EXTRACT(EPOCH FROM (now() - cs.locked_at))::int / 86400)) <= 2 THEN 'ok'
              ELSE 'fail' END,
         jsonb_build_object('locked', us.chastity_locked, 'streak_days_stored', us.chastity_streak_days,
                            'session_locked_at', cs.locked_at, 'session_status', cs.status)
  FROM user_state us
  LEFT JOIN LATERAL (
    SELECT locked_at, status FROM chastity_sessions
    WHERE user_id = us.user_id AND status IN ('locked','expired_pending_relock')
    ORDER BY locked_at DESC LIMIT 1
  ) cs ON true
  WHERE us.user_id <> AUTO_POSTER_USER;

  -- Tightened: only status='locked' counts as an active lock for state-consistency.
  -- expired_pending_relock = "user currently unlocked, owes a relock" — queue state, not lock state.
  INSERT INTO system_invariants_log (invariant_name, user_id, status, detail)
  SELECT 'chastity_lock_state_consistent', us.user_id,
         CASE WHEN us.chastity_locked AND cs.cnt >= 1 THEN 'ok'
              WHEN NOT us.chastity_locked AND cs.cnt = 0 THEN 'ok'
              ELSE 'fail' END,
         jsonb_build_object('locked', us.chastity_locked, 'active_session_count', cs.cnt)
  FROM user_state us
  LEFT JOIN LATERAL (
    SELECT count(*)::int AS cnt FROM chastity_sessions
    WHERE user_id = us.user_id AND status = 'locked'
  ) cs ON true
  WHERE us.user_id <> AUTO_POSTER_USER;

  RETURN QUERY
    SELECT il.invariant_name, count(*)::int AS fail_count
    FROM system_invariants_log il
    WHERE il.checked_at >= now() - interval '5 minutes'
      AND il.status = 'fail'
    GROUP BY il.invariant_name;
END;
$function$;
