CREATE TABLE IF NOT EXISTS conversation_quality_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  conversation_id UUID NOT NULL,
  directives_fired INTEGER DEFAULT 0,
  device_commands_sent INTEGER DEFAULT 0,
  tasks_assigned INTEGER DEFAULT 0,
  memories_captured INTEGER DEFAULT 0,
  resistance_encountered INTEGER DEFAULT 0,
  compliance_moments INTEGER DEFAULT 0,
  feminization_score NUMERIC,
  message_count INTEGER DEFAULT 0,
  duration_seconds INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE conversation_quality_scores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "conv_quality_select" ON conversation_quality_scores FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "conv_quality_insert" ON conversation_quality_scores FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_conv_quality ON conversation_quality_scores(user_id, created_at DESC);
