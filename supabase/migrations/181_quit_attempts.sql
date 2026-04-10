CREATE TABLE IF NOT EXISTS quit_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  attempt_type TEXT NOT NULL CHECK (attempt_type IN ('disable_feature', 'skip_task', 'pause_protocol', 'detransition_request', 'feature_lockout_request', 'general_quit')),
  target_feature TEXT,
  reason_given TEXT,
  cooldown_required_hours INTEGER NOT NULL DEFAULT 24,
  cooldown_until TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '24 hours'),
  approved_at TIMESTAMPTZ,
  approved_by TEXT,
  cancelled_at TIMESTAMPTZ,
  conditions_required TEXT[],
  conditions_met BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE quit_attempts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "quit_attempts_select" ON quit_attempts FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "quit_attempts_insert" ON quit_attempts FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "quit_attempts_update" ON quit_attempts FOR UPDATE USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_quit_attempts_user ON quit_attempts(user_id, created_at DESC);
