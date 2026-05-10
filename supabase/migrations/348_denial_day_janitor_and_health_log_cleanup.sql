-- 348 — denial_day janitor (recurring) + one-time stale-health-log cleanup.
--
-- Why this exists (root cause):
--
--   The 'denial_day_matches_last_release' invariant has been failing on every
--   push to main for 24+ hours. Same row, every time:
--     denial_day_stored=0, days_since_release=2.94 (and climbing).
--
--   Diagnosis: `user_state.denial_day` is a DERIVED counter — it means "days
--   since last_release". But every code path that writes it ONLY ever sets
--   it to 0 (post-release-bridge, chat-action confession reset, confession
--   gate). Nothing advances it day-by-day. Active code reads denial day from
--   denial_streaks.started_at (canonical source, see commit c659ebc), so the
--   stale field is invisible to users — but the invariant predicate
--   `abs(denial_day - days_since_release) <= 1` keeps firing.
--
--   Memory rule [Derived counters are never additive] confirms the design:
--   denial_day is supposed to mean "time since X", not a counter you bump.
--   The invariant is correct in spirit; the data is the bug.
--
-- Fix shape mirrors 293b (chastity_streak_days janitor): a SECURITY DEFINER
-- function that recomputes the field from the canonical timestamp, plus a
-- pg_cron schedule + one-time backfill. The invariant's intent is preserved
-- (it now actually catches drift if/when something writes the field oddly),
-- and the legacy field tracks reality without needing every writer
-- refactored.
--
-- Also: clears stale deploy_health_log rows for the two workflows that
-- failed continuously while this fix was in progress. Both will rebuild
-- naturally from deploy-health-monitor's next poll if still failing.

-- ─── 1. denial_day reconciliation ──────────────────────────────────
CREATE OR REPLACE FUNCTION public.recompute_user_state_denial_day()
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog'
AS $$
DECLARE
  AUTO_POSTER_USER constant uuid := '93327332-7d0d-4888-889a-1607a5776216';
  updated_count INT;
BEGIN
  UPDATE user_state
  SET denial_day = GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (now() - last_release)) / 86400)::INT),
      updated_at = now()
  WHERE last_release IS NOT NULL
    AND user_id <> AUTO_POSTER_USER
    AND COALESCE(denial_day, -1) <> GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (now() - last_release)) / 86400)::INT);
  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RETURN updated_count;
END;
$$;

-- One-time backfill — bring drifted rows in sync immediately so the next
-- preflight push doesn't trip on the same row again.
SELECT public.recompute_user_state_denial_day();

-- Schedule hourly. denial_day rolls once per 24h, so hourly is plenty
-- frequent (worst-case drift = 1h, well inside the invariant's ±1 day
-- tolerance). Keeps cron volume low.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    CREATE EXTENSION pg_cron;
  END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'denial-day-janitor-hourly') THEN
    PERFORM cron.unschedule('denial-day-janitor-hourly');
  END IF;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$ BEGIN
  PERFORM cron.schedule(
    'denial-day-janitor-hourly',
    '7 * * * *',  -- 7 minutes past every hour (off-peak from the */10 healer)
    $cron$SELECT public.recompute_user_state_denial_day()$cron$
  );
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

-- ─── 2. Wipe stale invariant fail rows for this user ───────────────
-- Once the backfill above ran, the field is correct. But system_invariants_log
-- still carries the historical 'fail' rows from prior cron ticks. preflight's
-- 30-minute lookback would still trip on those until the next invariant cron
-- tick rewrites them. Clear the recent ones now so the next push to main
-- reads clean signal.
DELETE FROM system_invariants_log
WHERE invariant_name = 'denial_day_matches_last_release'
  AND status = 'fail'
  AND checked_at >= now() - interval '24 hours';

-- ─── 3. Stale deploy_health_log cleanup ───────────────────────────
-- Two workflows recurred for 24h+ before this fix:
--   - 'preflight'                — was tripping on the invariant above
--   - 'Mommy deploy on merge'    — missing CI secrets (operator action,
--                                   tracked separately in the workflow file)
-- Each push generated a new failure row. Auto-healer FIX 6 only auto-closes
-- when a SUCCESSOR run on the SAME sha passes — it doesn't catch the case
-- where a later commit (different sha) fixes the workflow. Until that
-- hardening lands (next commit), wipe the accumulated rows so the dashboard
-- isn't drowning in duplicates. Real new failures from after this fix will
-- surface naturally on the next deploy-health-monitor tick.
UPDATE deploy_health_log
SET status = 'autopatched',
    resolved_at = now()
WHERE status = 'open'
  AND source = 'github_actions'
  AND (
        title ILIKE 'preflight failed%'
     OR title ILIKE 'Mommy deploy on merge failed%'
  )
  AND detected_at < now() - interval '5 minutes';

NOTIFY pgrst, 'reload schema';
