-- Migration 131: Handler Memory System
-- Formal long-term memory for the conversational Handler.
-- 18 memory types with relevance scoring, decay, and extraction pipeline.

CREATE TABLE IF NOT EXISTS handler_memory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Memory classification
  memory_type TEXT NOT NULL,
  -- Types: preference, fantasy, fear, boundary, trigger, vulnerability,
  --        pattern, relationship, confession, commitment_history,
  --        resistance_pattern, compliance_pattern, sexual_response,
  --        emotional_state, identity_shift, gina_context,
  --        body_change, life_event

  -- Content
  content TEXT NOT NULL,
  context JSONB DEFAULT '{}',        -- Structured metadata about the memory
  source_type TEXT,                    -- conversation, task_completion, session, journal, intake, observation
  source_id UUID,                     -- Reference to the source record

  -- Relevance scoring
  importance INTEGER NOT NULL DEFAULT 3 CHECK (importance BETWEEN 1 AND 5),
  -- 1 = trivial, 2 = minor, 3 = moderate, 4 = significant, 5 = permanent
  decay_rate FLOAT NOT NULL DEFAULT 0.05,
  -- Rate at which memory loses relevance over time (0 = never decays)
  reinforcement_count INTEGER NOT NULL DEFAULT 1,
  -- How many times this memory has been reinforced
  last_reinforced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_retrieved_at TIMESTAMPTZ,
  retrieval_count INTEGER NOT NULL DEFAULT 0,

  -- Lifecycle
  is_active BOOLEAN NOT NULL DEFAULT true,
  consolidated_into UUID REFERENCES handler_memory(id),
  -- If consolidated, points to the merged memory

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Importance 5 memories never decay
ALTER TABLE handler_memory ADD CONSTRAINT importance_5_no_decay
  CHECK (importance < 5 OR decay_rate = 0);

CREATE INDEX idx_memory_user_type ON handler_memory(user_id, memory_type);
CREATE INDEX idx_memory_user_active ON handler_memory(user_id, is_active, importance DESC);
CREATE INDEX idx_memory_user_recent ON handler_memory(user_id, last_reinforced_at DESC);

ALTER TABLE handler_memory ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users own memories" ON handler_memory FOR ALL USING (auth.uid() = user_id);

-- ── Memory extraction log ────────────────────────────────────────────
-- Tracks what has been processed so extraction doesn't re-run on old data.

CREATE TABLE IF NOT EXISTS handler_memory_extraction_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source_type TEXT NOT NULL,
  source_id UUID NOT NULL,
  memories_extracted INTEGER NOT NULL DEFAULT 0,
  extracted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_extraction_log_source ON handler_memory_extraction_log(user_id, source_type, source_id);
ALTER TABLE handler_memory_extraction_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users own extraction log" ON handler_memory_extraction_log FOR ALL USING (auth.uid() = user_id);

-- ── Weekly consolidation cron job ────────────────────────────────────

SELECT cron.schedule(
  'handler-memory-consolidation',
  '0 3 * * 0',
  $$SELECT net.http_post(
    url := current_setting('app.settings.supabase_url') || '/functions/v1/handler-memory',
    body := '{"action": "consolidate"}'::jsonb,
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key'),
      'Content-Type', 'application/json'
    )
  )$$
);
