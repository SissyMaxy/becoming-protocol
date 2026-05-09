-- 317 — Register the four growth-loop edge function crons.
--
-- Sequencing & cadence:
--   00:00 UTC daily   — intervention-rate-tracker (success metric snapshot)
--   03:00 UTC daily   — pattern-library-curator (proposes new auto-fixes)
--   04:00 UTC Saturday — architecture-self-review (meta self-review run)
--   02:00 UTC Sunday   — capability-gap-aggregator (picks up Sat self-review)
--
-- The Saturday self-review writes mommy_ideation_log rows tagged
-- meta_self_review=true. The Sunday aggregator reads those + escalation
-- log + git log + restart_log + pattern proposals, then upserts
-- capability_gaps. This ordering ensures the aggregator sees the latest
-- self-review output.
--
-- Idempotent: each cron is unscheduled (if present) before being
-- re-registered. EXCEPTION blocks let this run on a fresh project where
-- pg_cron isn't installed yet.

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

-- ---------- intervention-rate-tracker (daily 00:00 UTC) ----------
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'intervention-rate-tracker-daily') THEN
    PERFORM cron.unschedule('intervention-rate-tracker-daily');
  END IF;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$ BEGIN
  PERFORM cron.schedule(
    'intervention-rate-tracker-daily',
    '0 0 * * *',
    $cron$SELECT invoke_edge_function('intervention-rate-tracker', '{}'::jsonb)$cron$
  );
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

-- ---------- pattern-library-curator (daily 03:00 UTC) ----------
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'pattern-library-curator-daily') THEN
    PERFORM cron.unschedule('pattern-library-curator-daily');
  END IF;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$ BEGIN
  PERFORM cron.schedule(
    'pattern-library-curator-daily',
    '0 3 * * *',
    $cron$SELECT invoke_edge_function('pattern-library-curator', '{}'::jsonb)$cron$
  );
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

-- ---------- architecture-self-review (weekly Sat 04:00 UTC) ----------
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'architecture-self-review-weekly') THEN
    PERFORM cron.unschedule('architecture-self-review-weekly');
  END IF;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$ BEGIN
  PERFORM cron.schedule(
    'architecture-self-review-weekly',
    '0 4 * * 6',
    $cron$SELECT invoke_edge_function('architecture-self-review', '{}'::jsonb)$cron$
  );
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

-- ---------- capability-gap-aggregator (weekly Sun 02:00 UTC) ----------
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'capability-gap-aggregator-weekly') THEN
    PERFORM cron.unschedule('capability-gap-aggregator-weekly');
  END IF;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$ BEGIN
  PERFORM cron.schedule(
    'capability-gap-aggregator-weekly',
    '0 2 * * 0',
    $cron$SELECT invoke_edge_function('capability-gap-aggregator', '{}'::jsonb)$cron$
  );
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

NOTIFY pgrst, 'reload schema';
