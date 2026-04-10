CREATE TABLE IF NOT EXISTS memory_reframings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  original_memory TEXT NOT NULL,
  original_context TEXT,
  reframed_version TEXT NOT NULL,
  reframe_technique TEXT,
  emotional_intensity INTEGER CHECK (emotional_intensity BETWEEN 1 AND 10),
  user_accepted BOOLEAN DEFAULT NULL,
  reinforcement_count INTEGER DEFAULT 0,
  source TEXT DEFAULT 'chat',
  conversation_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_referenced_at TIMESTAMPTZ
);

ALTER TABLE memory_reframings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "memory_reframings_select" ON memory_reframings FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "memory_reframings_insert" ON memory_reframings FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "memory_reframings_update" ON memory_reframings FOR UPDATE USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_reframings_user ON memory_reframings(user_id, created_at DESC);
