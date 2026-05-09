-- 301 — Auto phase advancement logs + progress snapshots + auto-advance settings.
-- 2026-05-07.
--
-- Sibling of the (unmerged) feature/identity-persistence-2026-04-30 branch
-- that adds `feminine_self.transformation_phase` (1..7) and the
-- `transformation_phase_defs` lookup. The cron (`phase-advance` edge fn)
-- evaluates each user once per day; if they meet the next phase's
-- requirements it advances them and queues a Mama-voice congratulation.
--
-- This migration ONLY adds the new tables + the two settings toggles on
-- user_state. It does NOT create `feminine_self` / `transformation_phase_defs`
-- — those land with the identity branch. The edge fn checks for table
-- existence at runtime and exits cleanly if either is absent, so this
-- migration is safe to ship before the identity branch lands.

-- ---------------------------------------------------------------
-- 1. phase_advancement_log — irreversible record of every advance
--    (manual or auto). Used to render the user's phase history and
--    to wire the celebration outreach back to the row that produced it.
-- ---------------------------------------------------------------

CREATE TABLE IF NOT EXISTS phase_advancement_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  from_phase INTEGER NOT NULL CHECK (from_phase BETWEEN 0 AND 7),
  to_phase   INTEGER NOT NULL CHECK (to_phase   BETWEEN 1 AND 7),

  advanced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- TRUE for cron-driven advances, FALSE for the existing
  -- manual `advancePhase` button path so we can A/B which one
  -- the user actually advances through.
  auto_advanced BOOLEAN NOT NULL DEFAULT FALSE,

  -- Snapshot of every requirement that passed. Shape mirrors the
  -- `requirements_state` JSONB on phase_progress_snapshots so the
  -- UI can render a uniform checklist for both pre- and post-advance.
  met_requirements JSONB NOT NULL DEFAULT '{}'::jsonb,

  -- The handler_outreach_queue row that contained the Mama-voice
  -- celebration. NULLable so manual advances (no congratulation
  -- queued) don't violate the FK.
  congratulation_outreach_id UUID REFERENCES handler_outreach_queue(id) ON DELETE SET NULL,

  -- New honorific surfaced to the user (NOT applied — surfacing only).
  -- Pulled from the new phase's def `unlocks` list when it differs
  -- from the user's current honorific.
  suggested_honorific TEXT,

  CONSTRAINT phase_advancement_no_regression CHECK (to_phase > from_phase)
);

CREATE INDEX IF NOT EXISTS idx_phase_adv_user_time
  ON phase_advancement_log(user_id, advanced_at DESC);

ALTER TABLE phase_advancement_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "phase_adv_select_own" ON phase_advancement_log;
CREATE POLICY "phase_adv_select_own"
  ON phase_advancement_log FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "phase_adv_insert_own" ON phase_advancement_log;
CREATE POLICY "phase_adv_insert_own"
  ON phase_advancement_log FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- The cron writes via service role; no DELETE / UPDATE policies — phase
-- advances are irreversible. (Operator demotion would happen out-of-band.)

-- Block deletes so the auto-healer / janitor crons can't accidentally
-- erase the user's phase history.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'prevent_critical_deletes') THEN
    DROP TRIGGER IF EXISTS block_phase_adv_delete ON phase_advancement_log;
    EXECUTE 'CREATE TRIGGER block_phase_adv_delete
             BEFORE DELETE ON phase_advancement_log
             FOR EACH ROW EXECUTE FUNCTION prevent_critical_deletes()';
  END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- ---------------------------------------------------------------
-- 2. phase_progress_snapshots — daily evaluator output for users
--    who DIDN'T advance. Powers the "progress to next phase"
--    checklist in the Identity settings page.
-- ---------------------------------------------------------------

CREATE TABLE IF NOT EXISTS phase_progress_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  evaluated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  current_phase INTEGER NOT NULL CHECK (current_phase BETWEEN 0 AND 7),
  target_phase  INTEGER NOT NULL CHECK (target_phase  BETWEEN 1 AND 7),

  -- Each requirement: { required, actual, met } with optional `unit`.
  --   {
  --     "compliance_pct":    { "required": 0.8, "actual": 0.65, "met": false, "unit": "ratio" },
  --     "primers_completed": { "required": ["voice_drill_1","mantra_a"], "actual": ["voice_drill_1"], "met": false },
  --     "wardrobe_lingerie": { "required": 3, "actual": 1, "met": false, "unit": "count" },
  --     "min_dwell_days":    { "required": 7, "actual": 12, "met": true,  "unit": "days" }
  --   }
  requirements_state JSONB NOT NULL DEFAULT '{}'::jsonb,

  -- Convenience flag — true iff every key in requirements_state has met=true.
  -- The cron sets this AND inserts a phase_advancement_log row in the same
  -- transaction; both are present so the UI can decide whether to celebrate
  -- without re-evaluating.
  all_met BOOLEAN NOT NULL DEFAULT FALSE,

  -- If any requirement is failing, summarise which (text list) so the UI
  -- can render a one-liner without parsing the full JSONB.
  failing_summary TEXT
);

-- Latest-snapshot lookups dominate.
CREATE INDEX IF NOT EXISTS idx_phase_progress_user_time
  ON phase_progress_snapshots(user_id, evaluated_at DESC);

-- Audit / history queries.
CREATE INDEX IF NOT EXISTS idx_phase_progress_target
  ON phase_progress_snapshots(user_id, target_phase, evaluated_at DESC);

ALTER TABLE phase_progress_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "phase_progress_select_own" ON phase_progress_snapshots;
CREATE POLICY "phase_progress_select_own"
  ON phase_progress_snapshots FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "phase_progress_insert_own" ON phase_progress_snapshots;
CREATE POLICY "phase_progress_insert_own"
  ON phase_progress_snapshots FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- ---------------------------------------------------------------
-- 3. user_state toggles — auto-advance + congratulation switches.
--    Defaults: both ON. When auto-advance is OFF the cron skips
--    that user entirely (no snapshot either) — privacy first.
-- ---------------------------------------------------------------

ALTER TABLE user_state
  ADD COLUMN IF NOT EXISTS auto_advance_phases BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS phase_advance_congratulate BOOLEAN NOT NULL DEFAULT TRUE;

-- ---------------------------------------------------------------
-- 4. Cron schedule — daily 06:15 UTC.
--    Off-cycle from the existing 06:00 mommy-mood and 06:30 capability-digest
--    crons so they don't collide on the cluster. Idempotent: every advance
--    writes a phase_advancement_log row, and the evaluator early-exits if
--    a row was already written today.
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

-- Unschedule any prior incarnation so re-applying the migration is safe.
DO $$
DECLARE jid BIGINT;
BEGIN
  FOR jid IN SELECT jobid FROM cron.job WHERE jobname = 'phase-advance-daily-6am15' LOOP
    PERFORM cron.unschedule(jid);
  END LOOP;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'phase-advance-daily-6am15',
  '15 6 * * *',
  $cmd$
    SELECT net.http_post(
      url := current_setting('app.settings.supabase_url', true) || '/functions/v1/phase-advance',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
      ),
      body := '{}'::jsonb
    ) AS request_id;
  $cmd$
);
