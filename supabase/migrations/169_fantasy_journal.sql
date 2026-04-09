CREATE TABLE IF NOT EXISTS fantasy_journal (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  entry_text TEXT NOT NULL,
  fantasy_type TEXT CHECK (fantasy_type IN ('dream', 'fantasy', 'intrusive_thought', 'craving', 'confession')),
  feminine_content_score INTEGER DEFAULT 0 CHECK (feminine_content_score BETWEEN 0 AND 10),
  handler_can_reference BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE fantasy_journal ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fantasy_journal_select" ON fantasy_journal FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "fantasy_journal_insert" ON fantasy_journal FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS idx_fantasy_journal_user ON fantasy_journal(user_id, created_at DESC);
