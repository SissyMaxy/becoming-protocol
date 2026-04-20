-- Migration 212: Handler autonomy — self-modifying prompt patches + self-audit log
-- Idempotent.

-- ============================================================================
-- Prompt patches — Handler strategist writes these, prompt builder reads them
-- ============================================================================

CREATE TABLE IF NOT EXISTS handler_prompt_patches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE
);

ALTER TABLE handler_prompt_patches
  ADD COLUMN IF NOT EXISTS section TEXT,
  ADD COLUMN IF NOT EXISTS instruction TEXT,
  ADD COLUMN IF NOT EXISTS reasoning TEXT,
  ADD COLUMN IF NOT EXISTS active BOOLEAN DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS created_by TEXT DEFAULT 'strategist',
  ADD COLUMN IF NOT EXISTS effectiveness_score FLOAT,
  ADD COLUMN IF NOT EXISTS applied_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_applied_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deactivated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deactivation_reason TEXT,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_prompt_patches_active ON handler_prompt_patches(user_id, active) WHERE active = TRUE;

ALTER TABLE handler_prompt_patches ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users own patches" ON handler_prompt_patches;
CREATE POLICY "Users own patches" ON handler_prompt_patches FOR ALL USING (auth.uid() = user_id);

-- ============================================================================
-- Self-audit log — strategist records what it found and what it changed
-- ============================================================================

CREATE TABLE IF NOT EXISTS handler_self_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE
);

ALTER TABLE handler_self_audit
  ADD COLUMN IF NOT EXISTS audit_date DATE DEFAULT CURRENT_DATE,
  ADD COLUMN IF NOT EXISTS conversations_reviewed INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS failures_detected JSONB DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS corrections_from_user JSONB DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS directive_compliance_rate FLOAT,
  ADD COLUMN IF NOT EXISTS voice_drift_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS hallucination_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS patches_created INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS patches_deactivated INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS strategy_changes JSONB DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

CREATE UNIQUE INDEX IF NOT EXISTS idx_self_audit_date ON handler_self_audit(user_id, audit_date);

ALTER TABLE handler_self_audit ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users own audits" ON handler_self_audit;
CREATE POLICY "Users own audits" ON handler_self_audit FOR ALL USING (auth.uid() = user_id);

-- ============================================================================
-- Outreach schedule templates — define the daily rhythm
-- ============================================================================

CREATE TABLE IF NOT EXISTS handler_outreach_schedule (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE
);

ALTER TABLE handler_outreach_schedule
  ADD COLUMN IF NOT EXISTS schedule_name TEXT,
  ADD COLUMN IF NOT EXISTS hour_utc INTEGER CHECK (hour_utc BETWEEN 0 AND 23),
  ADD COLUMN IF NOT EXISTS trigger_type TEXT DEFAULT 'time',
  ADD COLUMN IF NOT EXISTS message_template TEXT,
  ADD COLUMN IF NOT EXISTS conditions JSONB DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS active BOOLEAN DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS last_fired_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_outreach_schedule_active ON handler_outreach_schedule(user_id, active, hour_utc);

ALTER TABLE handler_outreach_schedule ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users own outreach schedule" ON handler_outreach_schedule;
CREATE POLICY "Users own outreach schedule" ON handler_outreach_schedule FOR ALL USING (auth.uid() = user_id);

NOTIFY pgrst, 'reload schema';
