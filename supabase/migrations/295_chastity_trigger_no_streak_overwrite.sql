-- 295 — Chastity sync trigger: only update chastity_locked, not streak_days.
--
-- 2026-05-07 regression: migration 293 added trg_sync_user_state_from_chastity
-- which on every chastity_sessions write recomputed user_state.chastity_streak_days
-- from session locked_at (FLOOR(hours/24)). That broke the sanctuary
-- generator test: when a fresh 12h-lock session was inserted, the trigger
-- set streak_days = 0, and the sanctuary 'streak_recognition' generator
-- declined to fire because streak_days dropped below its threshold.
--
-- streak_days is owned by the daily cron + handler logic — it's a
-- protocol counter with semantics beyond just elapsed-hours. The 293
-- trigger should not have been writing it.
--
-- Fix: trigger only updates chastity_locked. Leaves streak_days alone.

CREATE OR REPLACE FUNCTION trg_sync_user_state_from_chastity()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  has_active BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM chastity_sessions
    WHERE user_id = COALESCE(NEW.user_id, OLD.user_id)
      AND unlocked_at IS NULL
  ) INTO has_active;

  UPDATE user_state
  SET chastity_locked = has_active,
      updated_at = now()
  WHERE user_id = COALESCE(NEW.user_id, OLD.user_id)
    AND chastity_locked IS DISTINCT FROM has_active; -- avoid no-op writes

  RETURN COALESCE(NEW, OLD);
END;
$$;
