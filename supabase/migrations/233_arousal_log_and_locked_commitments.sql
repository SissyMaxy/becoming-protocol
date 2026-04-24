-- Migration 233: Arousal log + locked commitments + forced lockdown triggers

CREATE TABLE IF NOT EXISTS arousal_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  value INTEGER NOT NULL CHECK (value BETWEEN 0 AND 10),
  note TEXT,
  source TEXT NOT NULL DEFAULT 'self_report',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_arousal_log_user_time ON arousal_log(user_id, created_at DESC);
ALTER TABLE arousal_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "arousal_log_owner" ON arousal_log FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

ALTER TABLE handler_commitments ADD COLUMN IF NOT EXISTS locked BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE handler_commitments ADD COLUMN IF NOT EXISTS locked_reason TEXT;

CREATE TABLE IF NOT EXISTS forced_lockdown_triggers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  trigger_type TEXT NOT NULL CHECK (trigger_type IN (
    'chastity_overdue', 'commit_miss', 'compliance_crash',
    'mantra_missed', 'arousal_unbounded', 'manual'
  )),
  fired_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ,
  duration_minutes INTEGER NOT NULL DEFAULT 30,
  reason TEXT NOT NULL,
  blocks_app BOOLEAN NOT NULL DEFAULT TRUE
);
CREATE INDEX IF NOT EXISTS idx_forced_lockdown_user_active ON forced_lockdown_triggers(user_id, resolved_at);
ALTER TABLE forced_lockdown_triggers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "forced_lockdown_owner" ON forced_lockdown_triggers FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
