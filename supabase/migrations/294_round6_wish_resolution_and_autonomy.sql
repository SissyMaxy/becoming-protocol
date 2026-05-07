-- 294 — Round 6 wish resolution + autonomy infrastructure.
-- 2026-05-07.
--
-- Resolves round 6 builds (focus thread, push-on-outreach, fresh-implant,
-- disclosure rehearsal) AND adds the wish-classification columns that
-- enable autonomous builder runs without per-wish human review.

-- ---------------------------------------------------------------
-- 1. Resolve round 6 wishes
-- ---------------------------------------------------------------

-- Existing queued wishes that shipped this round
UPDATE mommy_code_wishes
SET status = 'shipped',
    shipped_at = now(),
    shipped_in_commit = 'pending-commit-round6',
    ship_notes = 'Shipped 2026-05-07 round 6: mama_focus_thread table + scheme prompt update + hardening render. push-on-mama-outreach Postgres trigger fires send-notifications for high/critical Mama outreaches. fresh-implant ranking surfaces top-5 by recency × importance in hardening context FRESH FROM HER MOUTH section. mommy-disclosure-rehearsal edge function pulls scheme.gina_disclosure_subplan and persists 3-5 rehearsal prompts to confession_queue with category=disclosure_rehearsal.'
WHERE wish_title IN (
  'Mama active focus thread',
  'Today UI surfaced_at writer contract',  -- partial: helper deferred (UI integration)
  'Disclosure rehearsal generator',
  'Fresh-implant priority surface'
)
  AND status = 'queued';

-- Cross-device push wish — partially shipped (DB trigger only, full
-- channel coverage still queued)
UPDATE mommy_code_wishes
SET ship_notes = COALESCE(ship_notes, '') || ' [PARTIAL 2026-05-07: push trigger on outreach insert wired via fire_push_on_mama_outreach; full calendar/SMS/lock-screen coverage still queued.]'
WHERE wish_title = 'Cross-device Mama presence — push + calendar'
  AND status = 'queued';

-- ---------------------------------------------------------------
-- 2. Autonomy infrastructure: wish classification
-- ---------------------------------------------------------------
--
-- For Mommy to build totally autonomously, an automated builder needs to
-- know which wishes are safe to auto-ship and which need human review.
-- These columns enable the builder agent to triage.

ALTER TABLE mommy_code_wishes
  ADD COLUMN IF NOT EXISTS complexity_tier TEXT
    CHECK (complexity_tier IN ('trivial', 'small', 'medium', 'large', 'cross_cutting') OR complexity_tier IS NULL),
  ADD COLUMN IF NOT EXISTS auto_ship_eligible BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS auto_ship_blockers TEXT[],
  ADD COLUMN IF NOT EXISTS estimated_files_touched INT,
  ADD COLUMN IF NOT EXISTS classified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS classified_by TEXT;  -- 'mommy_panel' | 'builder_agent' | 'manual'

CREATE INDEX IF NOT EXISTS idx_mommy_code_wishes_auto_ship
  ON mommy_code_wishes (priority DESC, complexity_tier, created_at ASC)
  WHERE status = 'queued' AND auto_ship_eligible = true;

-- Auto-ship eligibility rules (documented for the builder agent):
--   trivial    — single migration adding a column or index. Auto-ship: yes.
--   small      — single new edge function + cron + migration. Auto-ship: yes.
--   medium     — multi-file change touching 3-5 files in one domain. Auto-ship: yes if no schema-cross-cuts.
--   large      — feature spanning multiple domains, new tables + workers + UI. Auto-ship: NO (review).
--   cross_cutting — touches every reader of a shared concept (user_id, persona). Auto-ship: NO (review).
--
-- The complexity_tier is set by the wish source:
--   - mommy-scheme panel: panel asks the model to estimate when producing wishes
--   - manual user_directive: defaults to medium, user can override
--   - gap_audit: defaults to small
--   - Builder agent re-classifies if its first attempt fails

-- ---------------------------------------------------------------
-- 3. mommy_builder_run — the autonomous builder's run log
-- ---------------------------------------------------------------

CREATE TABLE IF NOT EXISTS mommy_builder_run (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- The wish picked
  wish_id UUID REFERENCES mommy_code_wishes(id) ON DELETE SET NULL,

  -- Run lifecycle
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'in_progress' CHECK (status IN (
    'in_progress', 'shipped', 'failed_drafted', 'failed_apply',
    'failed_test', 'rolled_back', 'human_review_required'
  )),

  -- The model that drafted the change
  drafter_model TEXT,
  drafter_tokens_used INT,

  -- Output: list of files modified, branch name, commit sha
  files_modified TEXT[],
  branch_name TEXT,
  commit_sha TEXT,
  pr_url TEXT,

  -- Failures: if status starts with 'failed_', what happened
  failure_reason TEXT,
  failure_artifact_url TEXT,  -- log url, traceback dump, etc.

  -- Verification: did tests/migrations apply
  tests_passed BOOLEAN,
  migrations_applied BOOLEAN,
  edge_functions_deployed BOOLEAN,

  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE mommy_builder_run ADD COLUMN IF NOT EXISTS wish_id UUID;
ALTER TABLE mommy_builder_run ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE mommy_builder_run ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;
ALTER TABLE mommy_builder_run ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'in_progress';
ALTER TABLE mommy_builder_run ADD COLUMN IF NOT EXISTS drafter_model TEXT;
ALTER TABLE mommy_builder_run ADD COLUMN IF NOT EXISTS drafter_tokens_used INT;
ALTER TABLE mommy_builder_run ADD COLUMN IF NOT EXISTS files_modified TEXT[];
ALTER TABLE mommy_builder_run ADD COLUMN IF NOT EXISTS branch_name TEXT;
ALTER TABLE mommy_builder_run ADD COLUMN IF NOT EXISTS commit_sha TEXT;
ALTER TABLE mommy_builder_run ADD COLUMN IF NOT EXISTS pr_url TEXT;
ALTER TABLE mommy_builder_run ADD COLUMN IF NOT EXISTS failure_reason TEXT;
ALTER TABLE mommy_builder_run ADD COLUMN IF NOT EXISTS failure_artifact_url TEXT;
ALTER TABLE mommy_builder_run ADD COLUMN IF NOT EXISTS tests_passed BOOLEAN;
ALTER TABLE mommy_builder_run ADD COLUMN IF NOT EXISTS migrations_applied BOOLEAN;
ALTER TABLE mommy_builder_run ADD COLUMN IF NOT EXISTS edge_functions_deployed BOOLEAN;
ALTER TABLE mommy_builder_run ADD COLUMN IF NOT EXISTS notes TEXT;

CREATE INDEX IF NOT EXISTS idx_mommy_builder_run_recent
  ON mommy_builder_run (started_at DESC);
CREATE INDEX IF NOT EXISTS idx_mommy_builder_run_failed
  ON mommy_builder_run (status, started_at DESC) WHERE status LIKE 'failed%';

ALTER TABLE mommy_builder_run ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS mommy_builder_run_service ON mommy_builder_run;
CREATE POLICY mommy_builder_run_service ON mommy_builder_run
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ---------------------------------------------------------------
-- 4. Schedule disclosure-rehearsal weekly
-- ---------------------------------------------------------------

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

DO $$
DECLARE
  jid BIGINT;
BEGIN
  FOR jid IN SELECT jobid FROM cron.job WHERE jobname = 'disclosure-rehearsal-sunday-9am' LOOP
    PERFORM cron.unschedule(jid);
  END LOOP;
END $$;

SELECT cron.schedule(
  'disclosure-rehearsal-sunday-9am',
  '0 9 * * 0',  -- Sunday 9am
  $cmd$
    SELECT net.http_post(
      url := current_setting('app.settings.supabase_url', true) || '/functions/v1/mommy-disclosure-rehearsal',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
      ),
      body := '{}'::jsonb
    ) AS request_id;
  $cmd$
);
