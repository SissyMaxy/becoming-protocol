-- 630 — Enforcement Spine v2: the outward-consequence rail (design §4, §6).
--
--   1. witness_registry — the ONLY outward-email audience. She added them,
--      in-app, explicitly (consent_confirmed_at NOT NULL). A BEFORE INSERT
--      trigger structurally rejects any contact matching Gina's identifiers:
--      Gina is excluded from the outward rail at the schema layer, not by
--      generator good manners (policy 2026-07-01: never disclose to Gina).
--   2. outward_dispatch_queue (+ witness_email_outbox) — every outward
--      consequence flows through ONE dispatcher. dispatch_token is minted
--      here; the auto-poster refuses punishment content without one.
--   3. enforcement_audit — populated inside obligation_transition
--      (→consequence_fired), same transaction (the to_regclass guard in mig
--      627 arms itself the moment this table exists). Accusatory Handler
--      copy composes FROM this row's excerpt, never from vibes.
--   4. Legacy backfill: obligations fired under the mig-610 fake-surfacing
--      stamp get audit rows flagged legacy_unverified.

-- ─────────────────────────────────────────────────────────────────────────
-- 1. witness_registry
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS witness_registry (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  contact_label TEXT,
  channel TEXT NOT NULL DEFAULT 'email' CHECK (channel IN ('email')),
  address TEXT NOT NULL,
  consent_confirmed_at TIMESTAMPTZ NOT NULL,   -- she added them, in-app, explicitly
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE witness_registry ENABLE ROW LEVEL SECURITY;
DO $do$ BEGIN
  CREATE POLICY witness_registry_self ON witness_registry FOR ALL TO authenticated
    USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $do$;
DO $do$ BEGIN
  CREATE POLICY witness_registry_service ON witness_registry FOR ALL TO service_role
    USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $do$;

-- Structural Gina exclusion. maxy_facts stores free-form stateable_facts
-- JSONB (no structured partner-identity rows), so the known identifiers are
-- hardcoded: her name. Any label or address containing it is rejected — a
-- false positive here costs a manual rename; a false negative costs the one
-- thing the policy exists to prevent. Extend the list if other identifiers
-- (an email address, a nickname) become known.
CREATE OR REPLACE FUNCTION trg_witness_registry_gina_exclusion()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF COALESCE(NEW.contact_label, '') ILIKE '%gina%'
     OR COALESCE(NEW.address, '') ILIKE '%gina%' THEN
    INSERT INTO mommy_supervisor_log (component, severity, event_kind, message, context_data)
    VALUES ('witness_registry', 'critical', 'gina_witness_rejected',
      'Witness registry insert REJECTED: contact matches Gina identifiers. Policy 2026-07-01: never disclose to Gina.',
      jsonb_build_object('user_id', NEW.user_id, 'contact_label', NEW.contact_label));
    RAISE EXCEPTION 'witness_registry: contact matches excluded identifiers (policy: never disclose to Gina)';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS witness_registry_gina_exclusion ON witness_registry;
CREATE TRIGGER witness_registry_gina_exclusion BEFORE INSERT OR UPDATE ON witness_registry
  FOR EACH ROW EXECUTE FUNCTION trg_witness_registry_gina_exclusion();

-- ─────────────────────────────────────────────────────────────────────────
-- 2. outward dispatch
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS outward_dispatch_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  obligation_id UUID NOT NULL REFERENCES obligations(id) ON DELETE CASCADE,
  channel TEXT NOT NULL CHECK (channel IN ('public_post', 'witness_email')),
  witness_id UUID REFERENCES witness_registry(id) ON DELETE SET NULL,
  artifact_text TEXT NOT NULL,                 -- the EXACT post/email, never paraphrased
  recipient_address TEXT,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN (
    'queued',              -- waiting for the dispatcher to preview
    'previewed',           -- preview outreach created; window starts at its surfaced_at
    'reminder_sent',       -- T-2h reminder created
    're_previewed',        -- a fire-time condition failed once; one fresh window
    'fired',               -- consequence executed (terminal)
    'averted_late_complete', -- she completed the obligation late (terminal)
    'averted_commuted',    -- she chose the 1.5x internal price (cost pending)
    'commuted_internal',   -- internal price applied (terminal)
    'voided'               -- second fire-time failure / safety void (terminal)
  )),
  dispatch_token UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  preview_outreach_id UUID,
  reminder_outreach_id UUID,
  window_started_at TIMESTAMPTZ,               -- = preview outreach surfaced_at (genuine render)
  window_ends_at TIMESTAMPTZ,                  -- surfaced_at + 24h (pause/latch freezes it)
  repreviewed_once BOOLEAN NOT NULL DEFAULT FALSE,
  fired_at TIMESTAMPTZ,
  averted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE outward_dispatch_queue ENABLE ROW LEVEL SECURITY;
DO $do$ BEGIN
  CREATE POLICY outward_dispatch_self ON outward_dispatch_queue FOR SELECT TO authenticated
    USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $do$;
DO $do$ BEGIN
  CREATE POLICY outward_dispatch_self_update ON outward_dispatch_queue FOR UPDATE TO authenticated
    USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $do$;
DO $do$ BEGIN
  CREATE POLICY outward_dispatch_service ON outward_dispatch_queue FOR ALL TO service_role
    USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $do$;

-- ONE outward consequence in flight per user.
CREATE UNIQUE INDEX IF NOT EXISTS outward_dispatch_one_in_flight
  ON outward_dispatch_queue(user_id)
  WHERE status IN ('queued', 'previewed', 'reminder_sent', 're_previewed', 'averted_commuted');

-- Outbox the (future) email sender drains. Nothing sends directly.
CREATE TABLE IF NOT EXISTS witness_email_outbox (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dispatch_id UUID NOT NULL REFERENCES outward_dispatch_queue(id) ON DELETE CASCADE,
  to_address TEXT NOT NULL,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'sent', 'failed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE witness_email_outbox ENABLE ROW LEVEL SECURITY;
DO $do$ BEGIN
  CREATE POLICY witness_email_outbox_service ON witness_email_outbox FOR ALL TO service_role
    USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $do$;

-- public_post consent flag — checked at FIRE time by the dispatcher.
ALTER TABLE user_state ADD COLUMN IF NOT EXISTS outward_posting_consented_at TIMESTAMPTZ;

-- ─────────────────────────────────────────────────────────────────────────
-- 3. enforcement_audit
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS enforcement_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  obligation_id UUID NOT NULL REFERENCES obligations(id) ON DELETE CASCADE,
  consequence TEXT NOT NULL,
  evidence JSONB NOT NULL,  -- {surfaced_at, surfaced_via, deadline, missed_at, evidence_row:{table,id,excerpt}, gate_mode_at_fire, preview_window, fired_by}
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE enforcement_audit ENABLE ROW LEVEL SECURITY;
DO $do$ BEGIN
  CREATE POLICY enforcement_audit_self ON enforcement_audit FOR SELECT TO authenticated
    USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $do$;
DO $do$ BEGIN
  CREATE POLICY enforcement_audit_service ON enforcement_audit FOR ALL TO service_role
    USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $do$;
CREATE INDEX IF NOT EXISTS enforcement_audit_oblig_idx ON enforcement_audit(obligation_id);

-- Legacy backfill: every pre-627 fired consequence gets an audit row so
-- "zero consequence_fired without audit row" holds. Rows fired under the
-- mig-610 grandfather stamp (surfaced_at=created_at, no companion outreach)
-- are additionally flagged legacy_unverified — their surfacing was never
-- genuine.
INSERT INTO enforcement_audit (user_id, obligation_id, consequence, evidence)
SELECT o.user_id, o.id, o.consequence_kind,
       jsonb_build_object(
         'legacy', TRUE,
         'legacy_unverified', (o.preview_outreach_id IS NULL AND o.surfaced_at = o.created_at),
         'surfaced_at', o.surfaced_at, 'deadline', o.deadline,
         'fired_at', o.consequence_applied_at,
         'note', 'fired pre-627 on the penalty_previews rail; migrated by mig 627')
  FROM obligations o
 WHERE o.consequence_applied_at IS NOT NULL
   AND o.created_by = 'mig627_penalty_preview_migration'
   AND NOT EXISTS (SELECT 1 FROM enforcement_audit a WHERE a.obligation_id = o.id)
ON CONFLICT DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────
-- 4. Dispatcher cron (every 15 min)
-- ─────────────────────────────────────────────────────────────────────────

DO $$
BEGIN
  PERFORM cron.unschedule('outward-consequence-dispatcher');
EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$
BEGIN
  PERFORM cron.schedule(
    'outward-consequence-dispatcher',
    '*/15 * * * *',
    $job$SELECT net.http_post(
      url := current_setting('app.settings.supabase_url') || '/functions/v1/outward-consequence-dispatcher',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')
      ),
      body := jsonb_build_object('trigger', 'pg_cron')
    );$job$
  );
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE '630: dispatcher cron skipped (pg_cron/pg_net unavailable): %', SQLERRM;
END $$;

NOTIFY pgrst, 'reload schema';
