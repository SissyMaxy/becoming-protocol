CREATE TABLE IF NOT EXISTS handler_desires (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  desire TEXT NOT NULL,
  category TEXT CHECK (category IN ('appearance', 'voice', 'behavior', 'social', 'sexual', 'identity', 'submission', 'escalation')),
  urgency INTEGER CHECK (urgency BETWEEN 1 AND 10) DEFAULT 5,
  progress_notes TEXT[],
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'achieved', 'abandoned', 'escalated')),
  target_date TIMESTAMPTZ,
  achieved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE handler_desires ENABLE ROW LEVEL SECURITY;
CREATE POLICY "desires_select" ON handler_desires FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "desires_insert" ON handler_desires FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "desires_update" ON handler_desires FOR UPDATE USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_desires_user ON handler_desires(user_id, status);

DROP TRIGGER IF EXISTS block_desires_delete ON handler_desires;
CREATE TRIGGER block_desires_delete
  BEFORE DELETE ON handler_desires
  FOR EACH ROW EXECUTE FUNCTION prevent_critical_deletes();
