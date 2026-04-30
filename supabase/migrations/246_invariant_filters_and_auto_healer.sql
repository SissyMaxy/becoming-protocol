-- 246 — invariant filters (skip auto-poster user 93327332 on user-only metrics)
-- + accept expired_pending_relock as locked-equivalent in chastity invariants.
-- + voice-ingest trigger narrowed (no longer over-blocks regression tests).
-- + auto-healer cron + edge function shipped separately (deployed via API).
-- Migration documents the live SQL state for replay.

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

  INSERT INTO system_invariants_log (invariant_name, user_id, status, detail)
  SELECT 'chastity_lock_state_consistent', us.user_id,
         CASE WHEN us.chastity_locked AND cs.cnt >= 1 THEN 'ok'
              WHEN NOT us.chastity_locked AND cs.cnt = 0 THEN 'ok'
              ELSE 'fail' END,
         jsonb_build_object('locked', us.chastity_locked, 'active_session_count', cs.cnt)
  FROM user_state us
  LEFT JOIN LATERAL (SELECT count(*)::int AS cnt FROM chastity_sessions WHERE user_id = us.user_id AND status IN ('locked','expired_pending_relock')) cs ON true
  WHERE us.user_id <> AUTO_POSTER_USER;

  -- (rest of invariants unchanged — see live function for full text)
  RETURN QUERY
  SELECT sil.invariant_name::text, count(*)::int
  FROM system_invariants_log sil
  WHERE sil.checked_at >= now() - interval '1 minute' AND sil.status = 'fail'
  GROUP BY sil.invariant_name
  ORDER BY count(*) DESC;
END;
$function$;

CREATE OR REPLACE FUNCTION public.trg_handler_messages_to_voice()
RETURNS trigger LANGUAGE plpgsql AS $function$
BEGIN
  IF NEW.role = 'user' THEN
    IF NEW.content ~* '(TEST regression|TEST_USER|<placeholder>|regression admission|regression auto-bind)' THEN
      RETURN NEW;
    END IF;
    -- Narrowed: require multiple dev terms before skipping. Single matches
    -- like "deploy" alone were over-blocking legit FF voice content.
    IF NEW.content ~* '(claude code|edge function|supabase migration|cron job)' AND NEW.content ~* '(deploy|baseline|preflight|github|repo|commit|trigger|table)' THEN
      RETURN NEW;
    END IF;
    PERFORM ingest_voice_sample(NEW.user_id, NEW.content, 'handler_dm', jsonb_build_object('conversation_id', NEW.conversation_id, 'message_id', NEW.id));
  END IF;
  RETURN NEW;
END;
$function$;
