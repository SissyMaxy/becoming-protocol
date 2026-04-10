CREATE TABLE IF NOT EXISTS decision_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  decision_text TEXT NOT NULL,
  handler_alternative TEXT,
  outcome TEXT CHECK (outcome IN ('original', 'handler_choice', 'compromise', 'unknown') OR outcome IS NULL),
  context TEXT,
  conversation_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ
);

ALTER TABLE decision_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "decision_log_select" ON decision_log FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "decision_log_insert" ON decision_log FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "decision_log_update" ON decision_log FOR UPDATE USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_decisions_user ON decision_log(user_id, created_at DESC);
