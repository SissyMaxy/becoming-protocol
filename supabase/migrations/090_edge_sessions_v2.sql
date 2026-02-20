-- Migration 090: Edge Sessions V2
-- Immersive edge session tracking for the new session interface

CREATE TABLE IF NOT EXISTS edge_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) NOT NULL,
  task_id TEXT,                          -- originating daily_task.id (nullable for standalone)
  session_type TEXT NOT NULL DEFAULT 'edge_training',
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  end_reason TEXT,                       -- goal_reached | user_ended | abandoned | timeout
  edge_count INTEGER NOT NULL DEFAULT 0,
  target_edges INTEGER NOT NULL DEFAULT 10,
  total_duration_sec INTEGER NOT NULL DEFAULT 0,
  edges JSONB DEFAULT '[]'::JSONB,       -- array of EdgeRecord objects
  post_mood TEXT,                        -- settled | aching | overwhelmed | euphoric
  post_notes TEXT,
  completion_type TEXT,                  -- denial | ruined | hands_free | full | emergency_stop
  points_awarded INTEGER NOT NULL DEFAULT 0,
  denial_day_at_start INTEGER,
  arousal_at_start INTEGER,
  status TEXT NOT NULL DEFAULT 'active', -- active | completed | abandoned
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_edge_sessions_user ON edge_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_edge_sessions_created ON edge_sessions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_edge_sessions_status ON edge_sessions(user_id, status);

ALTER TABLE edge_sessions ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'edge_sessions' AND policyname = 'Users manage own edge sessions'
  ) THEN
    CREATE POLICY "Users manage own edge sessions" ON edge_sessions
      FOR ALL USING (auth.uid() = user_id);
  END IF;
END $$;
