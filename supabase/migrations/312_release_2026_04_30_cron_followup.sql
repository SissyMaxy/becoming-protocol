-- 312_release_2026_04_30_cron_followup.sql
-- Release-time fixups for crons added in this release wave.
--
-- Why: 309_calendar_integration registered calendar-sync-daily and
-- calendar-place-rituals-daily with literal 'PLACEHOLDER_SERVICE_KEY' in
-- the auth header. That cron will silently 401 every morning. Drop and
-- re-register both using invoke_edge_function() — the SECURITY DEFINER
-- helper introduced in 044 that pulls service_role_key from
-- app.settings and falls back to '' (which still fails, but the failure
-- is observable instead of a hardcoded sentinel string).
--
-- Also adds the two crons that should have shipped with their migrations
-- but didn't:
--   - mommy-mantra-daily (305)  — daily mantra delivery
--   - wardrobe-expiry-daily (311) — sweep expired prescriptions

-- ---------- calendar-sync-daily — re-register via helper ----------
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'calendar-sync-daily') THEN
    PERFORM cron.unschedule('calendar-sync-daily');
  END IF;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$ BEGIN
  PERFORM cron.schedule(
    'calendar-sync-daily',
    '15 4 * * *',  -- 04:15 UTC daily
    $cron$SELECT invoke_edge_function('calendar-sync', '{}'::jsonb)$cron$
  );
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

-- ---------- calendar-place-rituals-daily ----------
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'calendar-place-rituals-daily') THEN
    PERFORM cron.unschedule('calendar-place-rituals-daily');
  END IF;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$ BEGIN
  PERFORM cron.schedule(
    'calendar-place-rituals-daily',
    '30 4 * * *',  -- 04:30 UTC daily, after sync
    $cron$SELECT invoke_edge_function('calendar-place-rituals', '{}'::jsonb)$cron$
  );
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

-- ---------- mommy-mantra-daily ----------
-- Mantra delivery once per day per user. The function fans out internally,
-- the cron just kicks the loop. 13:00 UTC = morning across most US zones.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'mommy-mantra-daily') THEN
    PERFORM cron.unschedule('mommy-mantra-daily');
  END IF;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$ BEGIN
  PERFORM cron.schedule(
    'mommy-mantra-daily',
    '0 13 * * *',  -- 13:00 UTC daily
    $cron$SELECT invoke_edge_function('mommy-mantra', '{}'::jsonb)$cron$
  );
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

-- ---------- wardrobe-expiry-daily ----------
-- Daily sweep aligned to evening (22:00 UTC, near mommy-bedtime).
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'wardrobe-expiry-daily') THEN
    PERFORM cron.unschedule('wardrobe-expiry-daily');
  END IF;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$ BEGIN
  PERFORM cron.schedule(
    'wardrobe-expiry-daily',
    '0 22 * * *',  -- 22:00 UTC daily
    $cron$SELECT invoke_edge_function('wardrobe-prescription-expiry', '{}'::jsonb)$cron$
  );
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

NOTIFY pgrst, 'reload schema';
