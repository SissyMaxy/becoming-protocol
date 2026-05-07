-- 296 — Align chastity sync trigger with the invariant's active-session
-- predicate (status='locked' instead of unlocked_at IS NULL).
--
-- Migration 253's chastity_lock_state_consistent invariant counts
-- "active sessions" as those with `status = 'locked'`. My migrations
-- 293 + 295 sync trigger used `unlocked_at IS NULL`. These disagree on
-- edge cases — e.g., a row with status='unlocked' but unlocked_at NULL,
-- or status='locked' with unlocked_at populated, both observed in the
-- live data. The trigger flips chastity_locked using one predicate, the
-- invariant audits with another, drift opens up.
--
-- Fix: trigger uses status='locked' to match the invariant exactly.

CREATE OR REPLACE FUNCTION trg_sync_user_state_from_chastity()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  has_active BOOLEAN;
BEGIN
  -- MATCH the invariant's predicate: status='locked', not unlocked_at IS NULL.
  -- The invariant in migration 253 is the source of truth for "is the user
  -- currently locked"; the trigger now agrees.
  SELECT EXISTS (
    SELECT 1 FROM chastity_sessions
    WHERE user_id = COALESCE(NEW.user_id, OLD.user_id)
      AND status = 'locked'
  ) INTO has_active;

  UPDATE user_state
  SET chastity_locked = has_active,
      updated_at = now()
  WHERE user_id = COALESCE(NEW.user_id, OLD.user_id)
    AND chastity_locked IS DISTINCT FROM has_active;

  RETURN COALESCE(NEW, OLD);
END;
$$;

-- One-time backfill: any drift left from when the trigger had the
-- different predicate gets reconciled with the invariant's view.
UPDATE user_state us
SET chastity_locked = EXISTS (
      SELECT 1 FROM chastity_sessions cs
      WHERE cs.user_id = us.user_id AND cs.status = 'locked'
    ),
    updated_at = now()
WHERE us.chastity_locked IS DISTINCT FROM EXISTS (
  SELECT 1 FROM chastity_sessions cs
  WHERE cs.user_id = us.user_id AND cs.status = 'locked'
);
