-- 298 — Diagnostic: replicate the invariant's exact LATERAL JOIN to see
-- if it returns the expected single row per user_state.
CREATE OR REPLACE FUNCTION debug_chastity_invariant_view()
RETURNS TABLE(user_id UUID, locked BOOLEAN, cnt INTEGER, total_user_state_rows BIGINT)
LANGUAGE sql SECURITY DEFINER AS $$
  SELECT us.user_id, us.chastity_locked, cs.cnt, (SELECT count(*) FROM user_state)
  FROM user_state us
  LEFT JOIN LATERAL (
    SELECT count(*)::int AS cnt
    FROM chastity_sessions
    WHERE user_id = us.user_id AND status = 'locked'
  ) cs ON true
  WHERE us.user_id <> '93327332-7d0d-4888-889a-1607a5776216'::uuid;
$$;
