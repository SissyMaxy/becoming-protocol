-- 314 — wish-classifier: bridge mommy-ideate → mommy_code_wishes.
-- 2026-04-30 (feature/wish-classifier-2026-04-30).
--
-- Closes the gap between cross-model ideation panels and the autonomous
-- builder. Today every wish lands with auto_ship_eligible=false, requiring
-- a human to flip it; this migration plus the wish-classifier edge fn
-- automate the flip for safe, well-bounded panel features.
--
-- Hard rules (mirrored in supabase/functions/wish-classifier/classifier.ts):
--   - Forbidden paths NEVER auto-eligible (auth/, payment, billing,
--     subscription, RLS, storage object policies, .github/workflows/*
--     except the additive api-typecheck.yml).
--   - Schema migrations NEVER auto-eligible (drafted but flagged
--     needs_review).
--   - Daily cap of 3 auto-eligible wishes per cron run.
--   - Audit trail per decision in wish_classifier_decisions.
--   - The classifier itself does NOT recursively self-modify. Rule changes
--     go through normal operator review.

-- ---------------------------------------------------------------
-- 1. Extend mommy_code_wishes enums + add denial_reason
-- ---------------------------------------------------------------

ALTER TABLE mommy_code_wishes DROP CONSTRAINT IF EXISTS mommy_code_wishes_source_check;
ALTER TABLE mommy_code_wishes ADD CONSTRAINT mommy_code_wishes_source_check
  CHECK (source IN (
    'scheme_run',
    'panel_ideation',
    'event_trigger',
    'user_directive',
    'gap_audit',
    'ideate-classifier'
  ));

ALTER TABLE mommy_code_wishes DROP CONSTRAINT IF EXISTS mommy_code_wishes_status_check;
ALTER TABLE mommy_code_wishes ADD CONSTRAINT mommy_code_wishes_status_check
  CHECK (status IN (
    'queued', 'in_progress', 'shipped', 'rejected', 'superseded', 'needs_review'
  ));

ALTER TABLE mommy_code_wishes
  ADD COLUMN IF NOT EXISTS denial_reason TEXT,
  ADD COLUMN IF NOT EXISTS source_ideation_log_id UUID
    REFERENCES mommy_ideation_log(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_mommy_code_wishes_classifier_source
  ON mommy_code_wishes (source, created_at DESC)
  WHERE source = 'ideate-classifier';

-- ---------------------------------------------------------------
-- 2. mommy_ideation_log: track classifier consumption
-- ---------------------------------------------------------------

ALTER TABLE mommy_ideation_log
  ADD COLUMN IF NOT EXISTS classified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS classifier_run_id UUID;

CREATE INDEX IF NOT EXISTS idx_mommy_ideation_log_unclassified
  ON mommy_ideation_log (created_at ASC) WHERE classified_at IS NULL;

-- ---------------------------------------------------------------
-- 3. Telemetry tables: per-run + per-decision
-- ---------------------------------------------------------------

CREATE TABLE IF NOT EXISTS wish_classifier_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  run_finished_at TIMESTAMPTZ,
  trigger TEXT NOT NULL CHECK (trigger IN ('cron','on_insert','manual','reevaluation')),
  ideation_rows_input INT NOT NULL DEFAULT 0,
  candidates_produced INT NOT NULL DEFAULT 0,
  eligible_count INT NOT NULL DEFAULT 0,
  needs_review_count INT NOT NULL DEFAULT 0,
  skipped_dedup_count INT NOT NULL DEFAULT 0,
  capped_count INT NOT NULL DEFAULT 0,
  denial_breakdown JSONB,
  errors TEXT[],
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wish_classifier_runs_started
  ON wish_classifier_runs (run_started_at DESC);

ALTER TABLE wish_classifier_runs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS wish_classifier_runs_service ON wish_classifier_runs;
CREATE POLICY wish_classifier_runs_service ON wish_classifier_runs
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS wish_classifier_decisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID REFERENCES wish_classifier_runs(id) ON DELETE CASCADE,
  source_ideation_log_id UUID REFERENCES mommy_ideation_log(id) ON DELETE SET NULL,
  candidate_title TEXT NOT NULL,
  candidate_body TEXT,
  decision TEXT NOT NULL CHECK (decision IN (
    'eligible','needs_review','skipped_dedup','skipped_cap','error'
  )),
  size_tier TEXT,
  forbidden_path_hits TEXT[],
  safety_signal_hits TEXT[],
  dedup_match_wish_id UUID REFERENCES mommy_code_wishes(id) ON DELETE SET NULL,
  denial_reason TEXT,
  resulting_wish_id UUID REFERENCES mommy_code_wishes(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wish_classifier_decisions_run
  ON wish_classifier_decisions (run_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_wish_classifier_decisions_decision
  ON wish_classifier_decisions (decision, created_at DESC);

ALTER TABLE wish_classifier_decisions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS wish_classifier_decisions_service ON wish_classifier_decisions;
CREATE POLICY wish_classifier_decisions_service ON wish_classifier_decisions
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ---------------------------------------------------------------
-- 4. Postgres trigger: ideation row insert → fire wish-classifier
-- ---------------------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net') THEN
    CREATE EXTENSION pg_net;
  END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

CREATE OR REPLACE FUNCTION fire_wish_classifier_on_ideation()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  request_id BIGINT;
BEGIN
  BEGIN
    SELECT net.http_post(
      url := current_setting('app.settings.supabase_url', true) || '/functions/v1/wish-classifier',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
      ),
      body := jsonb_build_object(
        'trigger', 'on_insert',
        'ideation_log_id', NEW.id
      )
    ) INTO request_id;
  EXCEPTION WHEN OTHERS THEN
    -- never block the underlying ideation insert if cron infra is unavailable
    RAISE NOTICE 'fire_wish_classifier_on_ideation: %', SQLERRM;
  END;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_fire_wish_classifier_on_ideation ON mommy_ideation_log;
CREATE TRIGGER trg_fire_wish_classifier_on_ideation
  AFTER INSERT ON mommy_ideation_log
  FOR EACH ROW EXECUTE FUNCTION fire_wish_classifier_on_ideation();

-- ---------------------------------------------------------------
-- 5. Cron schedules
-- ---------------------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    CREATE EXTENSION pg_cron;
  END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- mommy-ideate cadence is owned by .github/workflows/cron-mommy-ideate.yml
-- (Mon+Thu 04:00 UTC twice-weekly). Daily pg_cron registration removed to
-- respect the GH Action's stated floor: "Daily polls add cost without much
-- value because suggestions converge — twice-weekly is the floor (do not
-- reduce further)." Also unschedule any prior daily job left in pg_cron from
-- earlier branch tip:
DO $$
DECLARE jid BIGINT;
BEGIN
  FOR jid IN SELECT jobid FROM cron.job WHERE jobname = 'mommy-ideate-daily-04-00' LOOP
    PERFORM cron.unschedule(jid);
  END LOOP;
END $$;

-- 04:30 UTC daily — wish-classifier backstop (the trigger usually catches
-- ideate output live; this cron handles cases where the trigger HTTP failed
-- or where fresh ideation rows landed during a deploy window)
DO $$
DECLARE jid BIGINT;
BEGIN
  FOR jid IN SELECT jobid FROM cron.job WHERE jobname = 'wish-classifier-daily-04-30' LOOP
    PERFORM cron.unschedule(jid);
  END LOOP;
END $$;
SELECT cron.schedule(
  'wish-classifier-daily-04-30',
  '30 4 * * *',
  $cmd$
    SELECT net.http_post(
      url := current_setting('app.settings.supabase_url', true) || '/functions/v1/wish-classifier',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
      ),
      body := '{"trigger":"cron"}'::jsonb
    );
  $cmd$
);

-- 05:00 UTC Mondays — re-evaluate stale (7+ day-old) needs_review wishes;
-- borderline wishes that didn't match a hard-block may be safe now.
DO $$
DECLARE jid BIGINT;
BEGIN
  FOR jid IN SELECT jobid FROM cron.job WHERE jobname = 'wish-classifier-reeval-weekly' LOOP
    PERFORM cron.unschedule(jid);
  END LOOP;
END $$;
SELECT cron.schedule(
  'wish-classifier-reeval-weekly',
  '0 5 * * 1',
  $cmd$
    SELECT net.http_post(
      url := current_setting('app.settings.supabase_url', true) || '/functions/v1/wish-classifier',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
      ),
      body := '{"trigger":"reevaluation"}'::jsonb
    );
  $cmd$
);
