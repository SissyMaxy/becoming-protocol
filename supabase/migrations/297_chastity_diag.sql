-- 297 — Diagnostic helper to expose what check_system_invariants sees.
-- Returns the same count the invariant uses, plus the actual rows it
-- sees, so we can compare to REST's view and spot the discrepancy.

CREATE OR REPLACE FUNCTION debug_chastity_locked_count(uid UUID)
RETURNS TABLE(cnt BIGINT, sample_ids JSONB)
LANGUAGE sql SECURITY DEFINER AS $$
  SELECT
    count(*),
    jsonb_agg(jsonb_build_object('id', id, 'status', status, 'locked_at', locked_at, 'unlocked_at', unlocked_at))
  FROM chastity_sessions
  WHERE user_id = uid AND status = 'locked';
$$;
