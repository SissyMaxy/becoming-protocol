-- Migration 365 — Mommy supervisor: heartbeat log + outreach cron resurrection
--
-- Why this exists:
--   The autonomous loop has the right pieces (mommy-ideate → mommy_code_wishes →
--   kick-builder → mommy-builder → mommy-deploy; outreach-research → outreach-
--   draft-generator → outreach-submit) but no watchdog. If any link stops firing
--   nothing notices until the user notices days later. Supervisor watches the
--   metrics, intervenes when a component goes quiet, and logs every action so
--   /admin can render a green/yellow/red panel.
--
-- This migration installs:
--   1. public.mommy_supervisor_log         — every supervisor evaluation + action
--   2. cron: outreach-draft-generator (6h) — drafter was shipped (348) but not scheduled
--   3. cron: outreach-submit (15min)       — submit fn was shipped (348) but not scheduled
--   4. cron: outreach-research (daily)     — research fn was shipped (348) but not scheduled
--
-- Defensive against a partial 348 merge: the cron scheduling block runs inside
-- a DO ... EXCEPTION wrapper so a missing edge function (404) does not abort
-- the migration. If outreach-* functions are not deployed yet, the cron rows
-- are still inserted — they will start working as soon as the function comes
-- online.

-- ============================================================================
-- 1. mommy_supervisor_log
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.mommy_supervisor_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Metric identifier (e.g. 'queue_depth', 'builder_heartbeat_min',
  -- 'outreach_drafts_24h', 'ci_failures_open', 'crash_loop'). Free text so
  -- new metrics can be added without a schema migration.
  metric TEXT NOT NULL,

  -- The threshold the metric was compared against. NULL when the entry is
  -- a status snapshot rather than a threshold check (e.g. 'run_summary').
  threshold_value NUMERIC,

  -- The observed value at run time. NULL when the metric is non-numeric
  -- (e.g. 'crash_loop' which is a boolean condition).
  observed_value NUMERIC,

  -- Severity: 'ok' (green), 'warn' (yellow), 'fail' (red). The pulse
  -- endpoint rolls these up per-component.
  severity TEXT NOT NULL DEFAULT 'ok' CHECK (severity IN ('ok', 'warn', 'fail')),

  -- The corrective action taken when severity != 'ok'. NULL when no action
  -- was needed (severity='ok') OR the supervisor chose to observe-only.
  -- Vocabulary:
  --   'invoke_ideate'        — POST mommy-ideate to refill the wish queue
  --   'invoke_kick_builder'  — POST kick-builder to wake mommy-builder
  --   'invoke_outreach_drafter' — POST outreach-draft-generator
  --   'invoke_outreach_submit'  — POST outreach-submit
  --   'enqueue_self_heal_wish'  — INSERT a meta_self_heal wish for Mommy to fix herself
  --   'mark_wish_review_required' — flip auto_ship_eligible=false on a crash-loop wish
  --   'observe_only'         — supervisor decided no action this cycle (dampening)
  action_taken TEXT,

  -- The ID of the thing the action targeted (wish_id, edge function name,
  -- etc.) so /admin can link to it.
  action_target TEXT,

  -- Outcome of the action. JSON shape varies per action:
  --   invoke_*: { status: 200/500, body: '...truncated...', latency_ms: N }
  --   enqueue_self_heal_wish: { wish_id: 'uuid' }
  --   mark_wish_review_required: { wish_id: 'uuid', prior_blockers: [] }
  --   observe_only: { reason: '...' }
  action_result JSONB,

  -- Free text the supervisor leaves for human reviewers in /admin. Keep
  -- short (<300 chars). Goes into the tooltip on the status widget.
  notes TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mommy_supervisor_log_run_at
  ON public.mommy_supervisor_log(run_at DESC);
CREATE INDEX IF NOT EXISTS idx_mommy_supervisor_log_severity
  ON public.mommy_supervisor_log(severity, run_at DESC)
  WHERE severity != 'ok';
CREATE INDEX IF NOT EXISTS idx_mommy_supervisor_log_metric
  ON public.mommy_supervisor_log(metric, run_at DESC);

-- service_role only. The pulse API uses service-role to read, /admin gets
-- the rolled-up status not raw rows. No reason for end-users to read the
-- raw log directly.
ALTER TABLE public.mommy_supervisor_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS mommy_supervisor_log_service ON public.mommy_supervisor_log;
CREATE POLICY mommy_supervisor_log_service ON public.mommy_supervisor_log
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Authenticated users get an explicit deny — there is no policy granting
-- SELECT to authenticated, so RLS blocks them. The pulse endpoint reads
-- with service-role and rolls up.

-- ============================================================================
-- 2-4. Outreach cron jobs (defensive: skip silently if pg_cron / function URL
--      not configured rather than aborting the migration)
-- ============================================================================

-- Use the same `DO $$ ... EXCEPTION WHEN OTHERS THEN NULL; END $$` pattern
-- the rest of the migrations use for cron operations on Supabase remote.

DO $$
DECLARE
  base_url TEXT;
  service_key TEXT;
BEGIN
  -- Pull the project base URL + service role key from the vault. If either
  -- is missing the cron rows still go in, they just won't fire until the
  -- secret lands. The supervisor will surface this as a 'cron_unconfigured'
  -- warning.
  BEGIN
    SELECT decrypted_secret INTO base_url
      FROM vault.decrypted_secrets WHERE name = 'project_url' LIMIT 1;
  EXCEPTION WHEN OTHERS THEN base_url := NULL;
  END;
  BEGIN
    SELECT decrypted_secret INTO service_key
      FROM vault.decrypted_secrets WHERE name = 'service_role_key' LIMIT 1;
  EXCEPTION WHEN OTHERS THEN service_key := NULL;
  END;

  -- 2. outreach-draft-generator — every 6h. Generates new drafts pending review.
  --    If a community has auto_submit_enabled=true the drafts will flow through
  --    outreach-submit on the 15min cron below. Otherwise they wait for manual
  --    approval in /admin.
  BEGIN
    PERFORM cron.unschedule('outreach-draft-generator-6h');
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
  BEGIN
    PERFORM cron.schedule(
      'outreach-draft-generator-6h',
      '23 */6 * * *',
      format(
        $cron$
        SELECT net.http_post(
          url := %L || '/functions/v1/outreach-draft-generator',
          headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || %L
          ),
          body := jsonb_build_object('triggered_by', 'cron-365')
        )
        $cron$,
        COALESCE(base_url, ''), COALESCE(service_key, '')
      )
    );
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  -- 3. outreach-submit — every 15 min. Pulls approved drafts where the
  --    community has auto_submit_enabled=true AND the user has met the
  --    engagement threshold AND rate limits allow it. Reddit-only (FetLife
  --    + Discord drafts must be submitted manually per migration 348).
  BEGIN
    PERFORM cron.unschedule('outreach-submit-15min');
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
  BEGIN
    PERFORM cron.schedule(
      'outreach-submit-15min',
      '7-59/15 * * * *',
      format(
        $cron$
        SELECT net.http_post(
          url := %L || '/functions/v1/outreach-submit',
          headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || %L
          ),
          body := jsonb_build_object('triggered_by', 'cron-365')
        )
        $cron$,
        COALESCE(base_url, ''), COALESCE(service_key, '')
      )
    );
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  -- 4. outreach-research — daily 04:45 UTC. Refreshes posting_rules_summary,
  --    member_count, last_researched_at on enabled communities.
  BEGIN
    PERFORM cron.unschedule('outreach-research-daily');
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
  BEGIN
    PERFORM cron.schedule(
      'outreach-research-daily',
      '45 4 * * *',
      format(
        $cron$
        SELECT net.http_post(
          url := %L || '/functions/v1/outreach-research',
          headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || %L
          ),
          body := jsonb_build_object('triggered_by', 'cron-365')
        )
        $cron$,
        COALESCE(base_url, ''), COALESCE(service_key, '')
      )
    );
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
END $$;

NOTIFY pgrst, 'reload schema';
