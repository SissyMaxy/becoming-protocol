-- Migration 379 — Register headspace-capture crons (2026-05-11)
--
-- Schedules for the three new subsystems shipped under standing authority:
--   09:00 UTC daily — mommy-daily-plan-author (5am local for US East;
--                     edge fn picks current local date per user)
--   02:00 UTC daily — mommy-ambient-author (drafts unrendered tracks for
--                     users without a fresh primary worktime/sleep set)
--   02:30 UTC daily — mommy-ambient-render (picks up render_status='pending')
--   06:00 UTC daily — mommy-implant-step-scheduler (fires steps whose
--                     scheduled_day_offset matches today-started_at)
--   07:00 UTC Sunday — mommy-reality-reframe-letters (bi-weekly cadence
--                      via odd/even week-of-year gate inside the fn)
--
-- Each block is idempotent — unschedule-then-schedule with EXCEPTION
-- guards for fresh projects without pg_cron.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    CREATE EXTENSION pg_cron;
  END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net') THEN
    CREATE EXTENSION pg_net;
  END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- ---------- mommy-daily-plan-author (daily 09:00 UTC) ----------
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'mommy-daily-plan-author-daily') THEN
    PERFORM cron.unschedule('mommy-daily-plan-author-daily');
  END IF;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$ BEGIN
  PERFORM cron.schedule(
    'mommy-daily-plan-author-daily',
    '0 9 * * *',
    $cron$SELECT invoke_edge_function('mommy-daily-plan-author', '{}'::jsonb)$cron$
  );
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

-- ---------- mommy-ambient-author (daily 02:00 UTC) ----------
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'mommy-ambient-author-daily') THEN
    PERFORM cron.unschedule('mommy-ambient-author-daily');
  END IF;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$ BEGIN
  PERFORM cron.schedule(
    'mommy-ambient-author-daily',
    '0 2 * * *',
    $cron$SELECT invoke_edge_function('mommy-ambient-author', '{}'::jsonb)$cron$
  );
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

-- ---------- mommy-ambient-render (daily 02:30 UTC) ----------
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'mommy-ambient-render-daily') THEN
    PERFORM cron.unschedule('mommy-ambient-render-daily');
  END IF;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$ BEGIN
  PERFORM cron.schedule(
    'mommy-ambient-render-daily',
    '30 2 * * *',
    $cron$SELECT invoke_edge_function('mommy-ambient-render', '{}'::jsonb)$cron$
  );
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

-- ---------- mommy-implant-step-scheduler (daily 06:00 UTC) ----------
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'mommy-implant-step-scheduler-daily') THEN
    PERFORM cron.unschedule('mommy-implant-step-scheduler-daily');
  END IF;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$ BEGIN
  PERFORM cron.schedule(
    'mommy-implant-step-scheduler-daily',
    '0 6 * * *',
    $cron$SELECT invoke_edge_function('mommy-implant-step-scheduler', '{}'::jsonb)$cron$
  );
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

-- ---------- mommy-reality-reframe-letters (weekly Sun 07:00 UTC; fn gates bi-weekly) ----------
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'mommy-reality-reframe-letters-weekly') THEN
    PERFORM cron.unschedule('mommy-reality-reframe-letters-weekly');
  END IF;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$ BEGIN
  PERFORM cron.schedule(
    'mommy-reality-reframe-letters-weekly',
    '0 7 * * 0',
    $cron$SELECT invoke_edge_function('mommy-reality-reframe-letters', '{}'::jsonb)$cron$
  );
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

NOTIFY pgrst, 'reload schema';
