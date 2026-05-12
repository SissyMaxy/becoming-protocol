-- 371 — Register the voice-coach-daily-cron edge function.
--
-- Daily at 9:00 UTC: voice-coach-daily-cron picks the next unlocked
-- lesson for each canonical user and inserts a handler_outreach_queue
-- row so it surfaces on Today. The mommy_voice_cleanup trigger on
-- handler_outreach_queue scrubs any residual telemetry. The grading
-- side of the loop is api/voice/lesson-attempt (Node), not a cron.
--
-- 9:00 UTC = ~4am ET / ~1am PT. Lands before the user's morning
-- attention window so the lesson card is already on Today when they
-- first check.
--
-- Idempotent: unschedule if present, EXCEPTION blocks for fresh
-- projects without pg_cron / pg_net installed yet.

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

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'voice-coach-daily') THEN
    PERFORM cron.unschedule('voice-coach-daily');
  END IF;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$ BEGIN
  PERFORM cron.schedule(
    'voice-coach-daily',
    '0 9 * * *',
    $cron$SELECT invoke_edge_function('voice-coach-daily-cron', '{}'::jsonb)$cron$
  );
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

NOTIFY pgrst, 'reload schema';
