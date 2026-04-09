CREATE TABLE IF NOT EXISTS feminine_habit_streaks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  habit_name TEXT NOT NULL,
  current_streak INTEGER NOT NULL DEFAULT 0,
  longest_streak INTEGER NOT NULL DEFAULT 0,
  last_completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, habit_name)
);

ALTER TABLE feminine_habit_streaks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "habit_streaks_select" ON feminine_habit_streaks FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "habit_streaks_insert" ON feminine_habit_streaks FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "habit_streaks_update" ON feminine_habit_streaks FOR UPDATE USING (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS idx_habit_streaks_user ON feminine_habit_streaks(user_id);
