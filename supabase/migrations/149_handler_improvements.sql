-- P6.1: Handler Self-Notes Table
CREATE TABLE IF NOT EXISTS handler_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  note_type TEXT NOT NULL CHECK (note_type IN (
    'observation',
    'strategy',
    'resistance_note',
    'breakthrough',
    'avoid',
    'context',
    'schedule'
  )),
  content TEXT NOT NULL,
  priority INTEGER DEFAULT 0,
  expires_at TIMESTAMPTZ,
  conversation_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_handler_notes_user ON handler_notes(user_id, note_type, created_at DESC);
ALTER TABLE handler_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "handler_notes_user_policy" ON handler_notes
  FOR ALL USING (auth.uid() = user_id);

-- P6.2: Conversation Resistance Classification
CREATE TABLE IF NOT EXISTS conversation_classifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL,
  resistance_level INTEGER DEFAULT 0 CHECK (resistance_level BETWEEN 0 AND 10),
  resistance_type TEXT,
  mood_detected TEXT,
  compliance_score FLOAT,
  vulnerability_detected BOOLEAN DEFAULT FALSE,
  breakthrough_detected BOOLEAN DEFAULT FALSE,
  topics TEXT[],
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_conv_class ON conversation_classifications(user_id, created_at DESC);
ALTER TABLE conversation_classifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "conversation_classifications_user_policy" ON conversation_classifications
  FOR ALL USING (auth.uid() = user_id);
