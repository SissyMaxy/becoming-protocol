-- Feature 16: Shame Journal System
-- Stores shame/embarrassment entries for Handler to reference during sessions

CREATE TABLE IF NOT EXISTS shame_journal (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  entry_text TEXT NOT NULL,
  prompt_used TEXT,
  emotional_intensity INTEGER CHECK (emotional_intensity BETWEEN 1 AND 10),
  handler_response TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE shame_journal ENABLE ROW LEVEL SECURITY;
CREATE POLICY "shame_journal_select" ON shame_journal FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "shame_journal_insert" ON shame_journal FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_shame_journal_user ON shame_journal(user_id, created_at DESC);
