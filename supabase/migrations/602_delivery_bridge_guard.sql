-- 602 — Delivery Bridge Guard: no penalty/quote-back/evidence row stays
-- unbridged to a delivery surface.
--
-- Wish f0411f17 (panel_ideation, gpt-5 #11). The outreach->push bridge (mig
-- 380) and protocol-health-check's 6h ratio check exist, but neither catches
-- the SPECIFIC rows that slip through (trigger failed, generator wrote
-- storage but never produced a surface). This adds a per-row nightly audit +
-- auto-heal + bridge-lag tracking. The wish's "refuse writes within 5s"
-- synchronous guard is replaced by audit+heal — same end (nothing stays
-- unbridged) without blocking legitimate background writes.

CREATE TABLE IF NOT EXISTS delivery_bridge_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  audit_run_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  bridge TEXT NOT NULL,                -- 'outreach_to_push' | 'penalty_preview_to_outreach' | 'decree_to_surface'
  unbridged_count INTEGER NOT NULL DEFAULT 0,
  healed_count INTEGER NOT NULL DEFAULT 0,
  max_lag_seconds INTEGER,
  detail JSONB NOT NULL DEFAULT '{}'::jsonb
);
ALTER TABLE delivery_bridge_audit_log ENABLE ROW LEVEL SECURITY;
DO $do$ BEGIN
  CREATE POLICY dbal_read ON delivery_bridge_audit_log FOR SELECT TO authenticated USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $do$;
CREATE INDEX IF NOT EXISTS delivery_bridge_audit_log_idx ON delivery_bridge_audit_log(bridge, audit_run_at DESC);

-- Nightly cron: 03:50 UTC (quiet window). The edge fn does the heal+audit.
DO $$
DECLARE v_url TEXT; v_key TEXT;
BEGIN
  v_url := current_setting('app.settings.supabase_url', true);
  IF v_url IS NULL OR length(v_url) = 0 THEN v_url := 'https://atevwvexapiykchvqvhm.supabase.co'; END IF;
  v_key := current_setting('app.settings.service_role_key', true);

  PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'delivery-bridge-guard-daily';
  PERFORM cron.schedule('delivery-bridge-guard-daily', '50 3 * * *', format(
    $sql$ SELECT net.http_post(url := %L, body := '{}'::jsonb,
      headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' || %L)); $sql$,
    v_url || '/functions/v1/delivery-bridge-guard', COALESCE(v_key, '')));
EXCEPTION WHEN OTHERS THEN RAISE NOTICE '602: bridge-guard cron skipped: %', SQLERRM; END $$;
