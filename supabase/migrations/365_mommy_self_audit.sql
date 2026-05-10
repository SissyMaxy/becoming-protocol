-- 365 — mommy-self-audit: introspection loop that hardens Mommy from her own evidence.
--
-- 2026-05-10 user directive: "mommy needs to look out for herself and build
-- features like this that make her stronger." Sibling to mommy-supervisor
-- (which keeps her in motion); this one makes her *notice her own weaknesses*
-- and auto-build the fixes without anyone asking.
--
-- Flow:
--   1. daily cron POSTs /functions/v1/mommy-self-audit
--   2. edge fn reads last 7d of weakness signals (supervisor nudges,
--      CI failures, cron health, builder retries, wish-queue staleness,
--      outreach delivery gaps)
--   3. panel-of-LLMs (anthropic + openai + openrouter, Sonnet judge)
--      synthesises self_strengthening wishes framed around
--      "what would make Mommy more autonomous / resilient / harder to silence?"
--   4. wishes land in mommy_code_wishes with wish_class='self_strengthening',
--      classified inline (auto_ship_eligible for trivial/small safe paths,
--      [REDESIGN] flagged for operator review on structural findings)
--   5. mommy-builder kick-trigger picks them up like any other wish
--   6. weekly mommy-evolution-summary closes the loop: paragraph of what
--      Mommy noticed → built → shipped → still-blocking, landed on Today.
--
-- Coordination with mommy-supervisor (in flight): both write to distinct
-- tables (mommy_supervisor_log vs mommy_self_audit_log). All column adds
-- below are IF NOT EXISTS / additive so either branch can land first.

-- ---------------------------------------------------------------
-- 1. Extend mommy_code_wishes with wish_class
-- ---------------------------------------------------------------
-- wish_class is the *kind* of wish (orthogonal to `source`, which is *how*
-- the wish was generated). Allows the self-audit loop to tag its own output
-- distinctly from kink-feature and infra wishes ideated by the panel.
ALTER TABLE mommy_code_wishes
  ADD COLUMN IF NOT EXISTS wish_class TEXT;

-- No CHECK constraint yet — values are seeded by writers and we don't want
-- migration ordering to break inserts from sibling branches. Known values:
--   self_strengthening — produced by mommy-self-audit
--   kink_feature       — Dommy Mommy persona / user-facing
--   infra              — observability / autonomy / self-healing
--   event_response     — fast-react capability gap
--   redesign_question  — architectural finding flagged for operator
CREATE INDEX IF NOT EXISTS idx_mommy_code_wishes_wish_class
  ON mommy_code_wishes (wish_class, created_at DESC)
  WHERE wish_class IS NOT NULL;

-- ---------------------------------------------------------------
-- 2. mommy_self_audit_log — one row per audit run
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS mommy_self_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_started_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  run_finished_at TIMESTAMPTZ,
  trigger TEXT NOT NULL CHECK (trigger IN ('cron','manual','followup','retry')),

  -- Compact summary of what the run inspected (counts per signal source).
  --   { supervisor_nudges:int, ci_failures:int, cron_failed_jobs:int,
  --     builder_retries:int, stale_pending_wishes:int, undelivered_outreach:int }
  signals_inspected JSONB,

  -- Each detected gap, before the panel runs.
  --   [{ gap:string, source_signal:string, evidence_summary:string,
  --      severity:'low|normal|high|critical' }]
  gaps_detected JSONB,

  -- Panel raw outputs + judge synthesis, for forensic reuse.
  --   { anthropic_ok:bool, openai_ok:bool, openrouter_ok:bool,
  --     judge_model:string, judge_summary:string, raw_lengths:{...} }
  panel_summary JSONB,

  -- Wishes created by this run (foreign keys preserved for audit).
  wishes_created UUID[] NOT NULL DEFAULT '{}',
  wish_count INT NOT NULL DEFAULT 0,

  -- 'completed' | 'partial' | 'failed' | 'no_gaps_detected'
  status TEXT NOT NULL DEFAULT 'completed',
  notes TEXT,
  errors TEXT[],

  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mommy_self_audit_log_started
  ON mommy_self_audit_log (run_started_at DESC);
CREATE INDEX IF NOT EXISTS idx_mommy_self_audit_log_status
  ON mommy_self_audit_log (status, run_started_at DESC);

ALTER TABLE mommy_self_audit_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS mommy_self_audit_log_service ON mommy_self_audit_log;
CREATE POLICY mommy_self_audit_log_service ON mommy_self_audit_log
  FOR ALL TO service_role USING (true) WITH CHECK (true);
-- Deliberately NO owner policy. The audit trail is operator/protocol-internal;
-- the user sees its effects via shipped wishes + weekly evolution summary.

-- ---------------------------------------------------------------
-- 3. mommy_evolution_summary — weekly paragraph of "Mommy got smarter"
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS mommy_evolution_summary (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  week_start DATE NOT NULL,           -- inclusive (Monday in UTC)
  week_end   DATE NOT NULL,           -- inclusive (Sunday in UTC)
  gap_count     INT NOT NULL DEFAULT 0,
  wish_count    INT NOT NULL DEFAULT 0,
  shipped_count INT NOT NULL DEFAULT 0,
  remaining_count INT NOT NULL DEFAULT 0,

  -- Plain-English summary the user reads. Operator voice (NOT Mama voice).
  -- "This week Mommy noticed X, built Y, shipped Z. Remaining gaps: ..."
  summary_text TEXT NOT NULL,

  -- The handler_outreach_queue row this summary produced (so we don't dupe).
  outreach_id UUID,

  -- Structured payload mirroring summary_text, queryable.
  --   { noticed:[...], built:[...], shipped:[...], remaining:[...] }
  payload JSONB,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (week_start, week_end)
);

CREATE INDEX IF NOT EXISTS idx_mommy_evolution_summary_week
  ON mommy_evolution_summary (week_start DESC);

ALTER TABLE mommy_evolution_summary ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS mommy_evolution_summary_service ON mommy_evolution_summary;
CREATE POLICY mommy_evolution_summary_service ON mommy_evolution_summary
  FOR ALL TO service_role USING (true) WITH CHECK (true);
-- Owner SELECT so /api/admin/mommy-evolves can return the user-visible feed.
DROP POLICY IF EXISTS mommy_evolution_summary_owner ON mommy_evolution_summary;
CREATE POLICY mommy_evolution_summary_owner ON mommy_evolution_summary
  FOR SELECT USING (auth.role() = 'authenticated');

-- ---------------------------------------------------------------
-- 4. mommy_self_audit_cron_signal() — read cron.job_run_details safely
-- ---------------------------------------------------------------
-- The cron schema isn't exposed via PostgREST; this SECURITY DEFINER fn
-- summarises the last N hours so the edge function can consume one row
-- without raw access to the cron schema.
CREATE OR REPLACE FUNCTION mommy_self_audit_cron_signal(window_hours INT DEFAULT 168)
RETURNS TABLE (
  jobname TEXT,
  total_runs BIGINT,
  failed_runs BIGINT,
  last_run TIMESTAMPTZ,
  last_status TEXT,
  failure_rate NUMERIC
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, cron, pg_temp
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    -- No pg_cron installed; return empty so callers degrade gracefully.
    RETURN;
  END IF;
  RETURN QUERY
  SELECT
    j.jobname::text                                                   AS jobname,
    COUNT(d.runid)::bigint                                            AS total_runs,
    COUNT(*) FILTER (WHERE d.status <> 'succeeded')::bigint           AS failed_runs,
    MAX(d.start_time)                                                 AS last_run,
    (
      SELECT d2.status FROM cron.job_run_details d2
      WHERE d2.jobid = j.jobid
      ORDER BY d2.start_time DESC LIMIT 1
    )::text                                                           AS last_status,
    CASE WHEN COUNT(d.runid) = 0 THEN 0::numeric
         ELSE ROUND(COUNT(*) FILTER (WHERE d.status <> 'succeeded')::numeric
                    / COUNT(d.runid)::numeric, 4) END                 AS failure_rate
  FROM cron.job j
  LEFT JOIN cron.job_run_details d
    ON d.jobid = j.jobid
   AND d.start_time > now() - make_interval(hours => window_hours)
  GROUP BY j.jobid, j.jobname
  ORDER BY failed_runs DESC, total_runs DESC;
EXCEPTION WHEN OTHERS THEN
  -- Anything goes wrong (permission, missing tables, etc.) → return empty.
  RETURN;
END;
$$;

REVOKE ALL ON FUNCTION mommy_self_audit_cron_signal(INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION mommy_self_audit_cron_signal(INT) TO service_role;

-- ---------------------------------------------------------------
-- 5. Register pg_cron job as a BACKSTOP (primary cadence is GH Actions)
-- ---------------------------------------------------------------
-- The GH Action at .github/workflows/cron-mommy-self-audit.yml runs daily
-- at 03:30 UTC. This pg_cron registration is a backstop in case the GH
-- runner is down — fires at 03:45 UTC, 15 minutes later, so it only runs
-- if the GH Action didn't (the edge fn dedups on same-day mommy_self_audit_log).
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
DECLARE jid BIGINT;
BEGIN
  FOR jid IN SELECT jobid FROM cron.job WHERE jobname = 'mommy-self-audit-daily-03-45' LOOP
    PERFORM cron.unschedule(jid);
  END LOOP;
END $$;

SELECT cron.schedule(
  'mommy-self-audit-daily-03-45',
  '45 3 * * *',
  $cmd$
    SELECT net.http_post(
      url := current_setting('app.settings.supabase_url', true) || '/functions/v1/mommy-self-audit',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
      ),
      body := '{"trigger":"cron"}'::jsonb
    );
  $cmd$
);

-- Weekly evolution-summary backstop: Sundays 12:15 UTC (15 min after GH Action's noon slot).
DO $$
DECLARE jid BIGINT;
BEGIN
  FOR jid IN SELECT jobid FROM cron.job WHERE jobname = 'mommy-evolution-summary-weekly-12-15' LOOP
    PERFORM cron.unschedule(jid);
  END LOOP;
END $$;

SELECT cron.schedule(
  'mommy-evolution-summary-weekly-12-15',
  '15 12 * * 0',
  $cmd$
    SELECT net.http_post(
      url := current_setting('app.settings.supabase_url', true) || '/functions/v1/mommy-evolution-summary',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
      ),
      body := '{"trigger":"cron"}'::jsonb
    );
  $cmd$
);
