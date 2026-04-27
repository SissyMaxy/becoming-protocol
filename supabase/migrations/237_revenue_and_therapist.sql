-- Migration 237: feminization_budget_targets + handler_persona
-- Maxy fund infra: revenue_events already exists; this adds the budget
-- targets she's saving toward. Also flips the Handler chat persona to
-- therapist mode for the active user.

CREATE TABLE IF NOT EXISTS feminization_budget_targets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  label TEXT NOT NULL,
  monthly_cents INTEGER NOT NULL DEFAULT 0,
  one_time_cents INTEGER NOT NULL DEFAULT 0,
  priority INTEGER NOT NULL DEFAULT 5,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  funded_cents INTEGER NOT NULL DEFAULT 0,
  funded_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_feminization_budget_user_active
  ON feminization_budget_targets (user_id, priority)
  WHERE active = TRUE;

ALTER TABLE feminization_budget_targets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS fbt_owner ON feminization_budget_targets;
CREATE POLICY fbt_owner ON feminization_budget_targets
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS fbt_service ON feminization_budget_targets;
CREATE POLICY fbt_service ON feminization_budget_targets
  FOR ALL TO service_role USING (true) WITH CHECK (true);

ALTER TABLE user_state
  ADD COLUMN IF NOT EXISTS handler_persona TEXT NOT NULL DEFAULT 'handler';
