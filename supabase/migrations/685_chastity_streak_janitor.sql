-- 685 — chastity_streak_days janitor (recurring) + one-time corrupt-anchor repair.
--
-- Why this exists (root cause):
--
--   The 'chastity_streak_matches_session' live invariant has been failing for a
--   week+. Same row every cycle: user_state.chastity_streak_days is a snapshot
--   (stored 8) while the invariant DERIVES days-since the active session's
--   locked_at (~17). Nothing advances the field day-by-day.
--
--   Migration 293b first added a chastity_streak_days janitor; 295b then
--   deliberately stripped streak-writing from trg_sync_user_state_from_chastity
--   (a fresh-lock insert was zeroing the streak and breaking a sanctuary
--   generator) and handed the field to "the daily cron + handler logic" — but
--   that standing recompute was never (re)built. Its sibling denial_day got the
--   exact fix in mig 348: a SECURITY DEFINER recompute + hourly pg_cron. This
--   is the missing chastity twin, keyed off the invariant's OWN predicate so
--   the two can never disagree.
--
--   Memory rule [Derived counters are never additive]: chastity_streak_days
--   means "days since the current lock's locked_at", never a bumped counter.
--   The invariant is correct in spirit; the field drifted and its anchor row
--   is corrupt.
--
-- One-time repair: the handler user's only active session (c0317fb1) is
-- internally contradictory — status='locked' but unlocked_at (2026-05-08) and
-- actual_unlock_at (2026-05-02) PREDATE locked_at (2026-06-29), and
-- scheduled_unlock_at is a 1970 epoch sentinel. Operator confirmed 2026-07-16:
-- last release was 2026-07-11, locked continuously since. Re-anchor the row to
-- 2026-07-11, clear the corrupt unlock fields, and record the missed
-- 2026-07-11 release so the denial_day janitor (mig 348) also tells the truth
-- (currently overstated at 19 because last_release sat at ~2026-06-27; real
-- days-since-release is ~5).

-- ─── 1. One-time honest-state repair for the handler user ──────────
DO $$
DECLARE
  HANDLER_USER constant uuid := '8c69b9c8-34eb-4147-9fec-3c1a5bc74b6f';
  ANCHOR       constant timestamptz := timestamptz '2026-07-11 05:00:00+00'; -- 2026-07-11 00:00 America/Chicago
  streak_now   constant int := GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (now() - timestamptz '2026-07-11 05:00:00+00')) / 86400)::int);
BEGIN
  -- 1a. Repair the corrupt anchor session (keep status='locked'; a locked
  --     session must have unlocked_at IS NULL — trg_sync_user_state_from_chastity
  --     reads exactly that to keep chastity_locked=true).
  UPDATE chastity_sessions
  SET locked_at           = ANCHOR,
      unlocked_at         = NULL,
      actual_unlock_at    = NULL,
      scheduled_unlock_at  = NULL,
      unlock_authority    = NULL,
      early_unlock        = false,
      streak_day          = streak_now,
      notes               = 'Re-anchored 2026-07-16 to the operator-confirmed lock/last-release date 2026-07-11. Prior row was corrupt: locked_at=2026-06-29, unlocked_at/actual_unlock_at held pre-lock May dates, scheduled_unlock_at was a 1970 sentinel. Continuous lock since last release.'
  WHERE id = 'c0317fb1-aa19-4f54-89c4-7c119213f327'
    AND user_id = HANDLER_USER;

  -- 1b. Record the missed 2026-07-11 release so denial_day is honest.
  UPDATE user_state
  SET last_release = ANCHOR,
      updated_at   = now()
  WHERE user_id = HANDLER_USER
    AND (last_release IS NULL OR last_release < ANCHOR);

  -- 1c. Bring the check-in streak card (chastity_settings) in line — it was
  --     stale at 2, which contradicts the app's streak everywhere else.
  UPDATE chastity_settings
  SET current_streak_days = streak_now,
      longest_streak_days = GREATEST(longest_streak_days, streak_now),
      updated_at          = now()
  WHERE user_id = HANDLER_USER;
END $$;

-- ─── 2. chastity_streak_days reconciliation (recurring janitor) ────
-- Recompute ONLY for currently-locked, non-auto-poster users that have an
-- active lock session — matches the invariant's LATERAL predicate exactly.
-- Never touches unlocked users (avoids the 295b fresh-lock/sanctuary
-- regression) and never additively bumps.
CREATE OR REPLACE FUNCTION public.recompute_user_state_chastity_streak()
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog'
AS $$
DECLARE
  AUTO_POSTER_USER constant uuid := '93327332-7d0d-4888-889a-1607a5776216';
  updated_count INT;
BEGIN
  WITH desired AS (
    SELECT us.user_id,
           GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (now() - cs.locked_at)) / 86400)::int) AS streak
    FROM user_state us
    JOIN LATERAL (
      SELECT locked_at FROM chastity_sessions
      WHERE user_id = us.user_id AND status IN ('locked', 'expired_pending_relock')
      ORDER BY locked_at DESC LIMIT 1
    ) cs ON true
    WHERE us.chastity_locked = true
      AND us.user_id <> AUTO_POSTER_USER
  )
  UPDATE user_state us
  SET chastity_streak_days = d.streak,
      updated_at = now()
  FROM desired d
  WHERE us.user_id = d.user_id
    AND COALESCE(us.chastity_streak_days, -1) <> d.streak;
  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RETURN updated_count;
END;
$$;

-- One-time backfill — sync now so the next preflight doesn't trip the same row.
SELECT public.recompute_user_state_chastity_streak();

-- denial_day twin (mig 348) — recompute now that last_release moved to
-- 2026-07-11. Guarded: if that janitor isn't present in this environment, skip.
DO $$ BEGIN
  PERFORM public.recompute_user_state_denial_day();
EXCEPTION WHEN undefined_function THEN NULL;
END $$;

-- ─── 3. Schedule hourly (streak rolls once/24h; hourly ≤1h drift) ──
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    CREATE EXTENSION pg_cron;
  END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'chastity-streak-janitor-hourly') THEN
    PERFORM cron.unschedule('chastity-streak-janitor-hourly');
  END IF;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$ BEGIN
  PERFORM cron.schedule(
    'chastity-streak-janitor-hourly',
    '9 * * * *',  -- 9 past the hour (off-peak from denial @7 and the */10 healer)
    $cron$SELECT public.recompute_user_state_chastity_streak()$cron$
  );
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

-- ─── 4. Clear stale invariant fail rows so the next push reads clean ─
DELETE FROM system_invariants_log
WHERE invariant_name = 'chastity_streak_matches_session'
  AND status = 'fail'
  AND checked_at >= now() - interval '24 hours';

NOTIFY pgrst, 'reload schema';
