-- Migration 060: Micro-task identity reinforcement system
-- Brief interrupts during work hours for posture, scent, voice, awareness, gait, anchor

-- ===========================================
-- 1. Micro-Task Configuration (per user)
-- ===========================================

CREATE TABLE IF NOT EXISTS micro_task_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL UNIQUE,
  enabled BOOLEAN DEFAULT true,
  work_start TIME DEFAULT '09:00',
  work_end TIME DEFAULT '17:00',
  tasks_per_day INTEGER DEFAULT 8,
  min_gap_minutes INTEGER DEFAULT 45,
  max_gap_minutes INTEGER DEFAULT 90,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE micro_task_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own micro config" ON micro_task_config
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own micro config" ON micro_task_config
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own micro config" ON micro_task_config
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own micro config" ON micro_task_config
  FOR DELETE USING (auth.uid() = user_id);

-- ===========================================
-- 2. Micro-Task Completions (log each attempt)
-- ===========================================

CREATE TABLE IF NOT EXISTS micro_task_completions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  micro_task_type TEXT NOT NULL,
  instruction TEXT NOT NULL,
  result TEXT NOT NULL, -- 'completed', 'skipped', 'expired'
  points_awarded INTEGER DEFAULT 0,
  scheduled_at TIMESTAMPTZ NOT NULL,
  responded_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE micro_task_completions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own micro completions" ON micro_task_completions
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own micro completions" ON micro_task_completions
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_micro_completions_user_date
  ON micro_task_completions(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_micro_completions_user_scheduled
  ON micro_task_completions(user_id, scheduled_at DESC);
