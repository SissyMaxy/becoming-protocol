-- Migration 113: Task dismissals tracking for Handler avoidance intelligence
-- Logs when a user dismisses a prescribed task, with context at time of dismissal.

CREATE TABLE IF NOT EXISTS task_dismissals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  task_id TEXT NOT NULL,
  daily_task_id UUID,
  task_domain TEXT,
  task_category TEXT,
  dismissed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  mood_at_dismissal INTEGER,
  arousal_at_dismissal INTEGER,
  exec_function_at_dismissal TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE task_dismissals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users access own dismissals"
  ON task_dismissals FOR ALL USING (auth.uid() = user_id);

CREATE INDEX idx_task_dismissals_user ON task_dismissals(user_id, dismissed_at DESC);
CREATE INDEX idx_task_dismissals_domain ON task_dismissals(user_id, task_domain);
