-- 253 — chastity_lock_state_consistent: don't count expired_pending_relock
-- as an active lock when checking lock-state consistency.
--
-- Bug: invariant flagged "locked=false, active_session_count=1" as a fail,
-- but the session was status='expired_pending_relock'. That state means
-- "the prior lock window expired; user is currently unlocked and owes a
-- relock." It is a directive/queue state, not a current-lock state.
--
-- Migration 246 included expired_pending_relock in the active-session count
-- intentionally for the streak-matching invariant (so a streak doesn't reset
-- mid-relock-window), but applied the same predicate to the lock-state
-- invariant where it doesn't fit. The lock-state check should only count
-- sessions whose status='locked'.
--
-- Replays the full check_system_invariants definition (matching 246) with
-- the chastity_lock_state_consistent block tightened.

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
  LEFT JOIN LATERAL (SELECT locked_at, status FROM chastity_sessions WHERE user_id = us.user_id AND status IN ('locked','expired_pending_relock') ORDER BY locked_at DESC LIMIT 1) cs ON true
  WHERE us.user_id <> AUTO_POSTER_USER;

  -- Tightened: only status='locked' counts as an active lock for state-consistency.
  -- expired_pending_relock means "user currently unlocked, owes a relock" —
  -- that's a queue state, not a lock state.
  INSERT INTO system_invariants_log (invariant_name, user_id, status, detail)
  SELECT 'chastity_lock_state_consistent', us.user_id,
         CASE WHEN us.chastity_locked AND cs.cnt >= 1 THEN 'ok'
              WHEN NOT us.chastity_locked AND cs.cnt = 0 THEN 'ok'
              ELSE 'fail' END,
         jsonb_build_object('locked', us.chastity_locked, 'active_session_count', cs.cnt)
  FROM user_state us
  LEFT JOIN LATERAL (SELECT count(*)::int AS cnt FROM chastity_sessions WHERE user_id = us.user_id AND status = 'locked') cs ON true
  WHERE us.user_id <> AUTO_POSTER_USER;

  RETURN QUERY
  SELECT sil.invariant_name::text, count(*)::int
  FROM system_invariants_log sil
  WHERE sil.checked_at >= now() - interval '1 minute' AND sil.status = 'fail'
  GROUP BY sil.invariant_name
  ORDER BY count(*) DESC;
END;
$function$;
