-- 598 — Supervisor nudge pattern analyzer + worker replacement triggers.
--
-- Wish ce25ad0b (gap_audit): a worker that repeatedly needs a supervisor
-- nudge is asking for an architectural fix, not another nudge. Track nudge
-- patterns per worker; when one is nudged 5+ times in a week, classify the
-- cause (scheduling conflict / resource starvation / logic bug) and route a
-- targeted fix-wish into the autonomous builder — reducing operator
-- dependency. A "nudge" = a mommy_supervisor_log intervention (severity
-- warning/error/high/critical) for a component.

CREATE TABLE IF NOT EXISTS worker_health_scores (
  worker TEXT PRIMARY KEY,
  health_score INTEGER NOT NULL DEFAULT 100 CHECK (health_score BETWEEN 0 AND 100),
  nudges_7d INTEGER NOT NULL DEFAULT 0,
  last_nudge_at TIMESTAMPTZ,
  last_classification TEXT,
  trend TEXT,                          -- 'improving' | 'worsening' | 'flat'
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS worker_nudge_patterns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  worker TEXT NOT NULL,
  window_start TIMESTAMPTZ NOT NULL,
  window_end TIMESTAMPTZ NOT NULL,
  nudge_count INTEGER NOT NULL,
  classification TEXT NOT NULL,        -- scheduling_conflict | resource_starvation | logic_bug | unknown
  action_taken TEXT NOT NULL,          -- schedule_restagger_wish | resource_scale_wish | replacement_wish | none
  fix_wish_id UUID,
  detail JSONB NOT NULL DEFAULT '{}'::jsonb,
  analyzed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS worker_nudge_patterns_worker_idx ON worker_nudge_patterns(worker, analyzed_at DESC);

-- System health tables — not user-scoped. RLS on; authenticated (the single
-- operator) may read for the /admin pulse panel; writes are service-role.
ALTER TABLE worker_health_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE worker_nudge_patterns ENABLE ROW LEVEL SECURITY;
DO $do$ BEGIN
  CREATE POLICY whs_read ON worker_health_scores FOR SELECT TO authenticated USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $do$;
DO $do$ BEGIN
  CREATE POLICY wnp_read ON worker_nudge_patterns FOR SELECT TO authenticated USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $do$;

-- Analyzer cron: weekly, Sunday 17:00 UTC (after the week's supervisor
-- activity has accumulated, before the Mon/Thu cluster authoring lane).
DO $$
DECLARE v_url TEXT; v_key TEXT;
BEGIN
  v_url := current_setting('app.settings.supabase_url', true);
  IF v_url IS NULL OR length(v_url) = 0 THEN v_url := 'https://atevwvexapiykchvqvhm.supabase.co'; END IF;
  v_key := current_setting('app.settings.service_role_key', true);

  PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'nudge-pattern-analyzer-weekly';

  PERFORM cron.schedule('nudge-pattern-analyzer-weekly', '0 17 * * 0', format(
    $sql$ SELECT net.http_post(url := %L, body := '{}'::jsonb,
      headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' || %L)); $sql$,
    v_url || '/functions/v1/nudge-pattern-analyzer', COALESCE(v_key, '')));
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE '598: nudge analyzer cron registration skipped: %', SQLERRM;
END $$;
