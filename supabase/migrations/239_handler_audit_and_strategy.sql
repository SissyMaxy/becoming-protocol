-- handler_audit_findings — Code-audit agent writes structured findings here
-- after reading source files. The Handler surfaces top findings in chat
-- and on Today, and over time some findings are auto-implemented.
--
-- Source: weekly cron in handler-code-audit edge fn, alternating Sonnet
-- and gpt-4o auditor lenses for cross-model coverage.

CREATE TABLE IF NOT EXISTS handler_audit_findings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  file_path TEXT NOT NULL,
  audited_by TEXT NOT NULL,
  finding_type TEXT NOT NULL CHECK (finding_type IN (
    'permissive_default',
    'missing_anticircum',
    'ratchet_opportunity',
    'dead_code',
    'unfinished_engine',
    'anti_pattern',
    'voice_drift',
    'leak_risk'
  )),
  severity TEXT NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  suggested_fix TEXT,
  code_excerpt TEXT,
  line_start INT,
  line_end INT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN (
    'open',
    'acknowledged',
    'implemented',
    'rejected',
    'duplicate',
    'auto_applied'
  )),
  auto_actionable BOOLEAN NOT NULL DEFAULT false,
  acknowledged_at TIMESTAMPTZ,
  implemented_at TIMESTAMPTZ,
  finding_hash TEXT,
  context JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_audit_findings_user_status
  ON handler_audit_findings(user_id, status, severity DESC, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_findings_hash
  ON handler_audit_findings(user_id, finding_hash) WHERE finding_hash IS NOT NULL;

ALTER TABLE handler_audit_findings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see their own audit findings"
  ON handler_audit_findings FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Service role manages audit findings"
  ON handler_audit_findings FOR ALL
  USING (auth.role() = 'service_role');


CREATE TABLE IF NOT EXISTS handler_strategic_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  generated_by TEXT NOT NULL,
  critique_by TEXT,
  state_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  weaknesses JSONB NOT NULL DEFAULT '[]'::jsonb,
  escalation_moves JSONB NOT NULL DEFAULT '[]'::jsonb,
  loopholes JSONB NOT NULL DEFAULT '[]'::jsonb,
  contradictions JSONB NOT NULL DEFAULT '[]'::jsonb,
  summary TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'superseded', 'archived')),
  superseded_by UUID REFERENCES handler_strategic_plans(id)
);

CREATE INDEX IF NOT EXISTS idx_strategic_plans_user
  ON handler_strategic_plans(user_id, status, created_at DESC);

ALTER TABLE handler_strategic_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see their own strategic plans"
  ON handler_strategic_plans FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Service role manages strategic plans"
  ON handler_strategic_plans FOR ALL
  USING (auth.role() = 'service_role');
