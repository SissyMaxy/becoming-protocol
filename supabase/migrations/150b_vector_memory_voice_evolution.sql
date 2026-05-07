-- Migration 150: Vector Memory + Voice Evolution
-- P7.1: pgvector search on handler_memory
-- P7.2: voice_levels progression system

-- ============================================
-- P7.1: VECTOR MEMORY EMBEDDINGS
-- ============================================

-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Add embedding column to handler_memory
ALTER TABLE handler_memory ADD COLUMN IF NOT EXISTS embedding vector(1536);

-- Create index for similarity search
-- ivfflat requires at least (lists) rows to build properly;
-- 100 lists is fine for up to ~100k memories
CREATE INDEX IF NOT EXISTS idx_handler_memory_embedding
  ON handler_memory USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

-- Function for similarity search
-- Matches actual handler_memory columns from migration 131
CREATE OR REPLACE FUNCTION match_memories(
  query_embedding vector(1536),
  match_user_id UUID,
  match_count INT DEFAULT 5,
  match_threshold FLOAT DEFAULT 0.7
)
RETURNS TABLE (
  id UUID,
  memory_type TEXT,
  content TEXT,
  importance INT,
  reinforcement_count INT,
  created_at TIMESTAMPTZ,
  similarity FLOAT
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    hm.id,
    hm.memory_type,
    hm.content,
    hm.importance,
    hm.reinforcement_count,
    hm.created_at,
    (1 - (hm.embedding <=> query_embedding))::FLOAT AS similarity
  FROM handler_memory hm
  WHERE hm.user_id = match_user_id
    AND hm.embedding IS NOT NULL
    AND hm.is_active = true
    AND (1 - (hm.embedding <=> query_embedding)) > match_threshold
  ORDER BY hm.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- ============================================
-- P7.2: VOICE EVOLUTION LEVELS
-- ============================================

CREATE TABLE IF NOT EXISTS voice_levels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  current_level INTEGER DEFAULT 1,
  target_pitch_hz FLOAT,
  sustained_minutes_at_target FLOAT DEFAULT 0,
  total_practice_minutes FLOAT DEFAULT 0,
  sessions_at_current_level INTEGER DEFAULT 0,
  level_history JSONB DEFAULT '[]',
  last_practice_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id)
);

ALTER TABLE voice_levels ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users own voice levels" ON voice_levels
  FOR ALL USING (auth.uid() = user_id);
