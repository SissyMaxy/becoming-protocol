-- Migration 210: Chastity streak milestones
-- Emits events when chastity_streak_days crosses 7, 14, 30, 60, 90, 180, 365.

CREATE TABLE IF NOT EXISTS chastity_milestones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE
);

ALTER TABLE chastity_milestones
  ADD COLUMN IF NOT EXISTS milestone_days INTEGER,
  ADD COLUMN IF NOT EXISTS achieved_at TIMESTAMPTZ DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS streak_at_achievement INTEGER,
  ADD COLUMN IF NOT EXISTS handler_notified BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS gina_notified BOOLEAN DEFAULT FALSE;

CREATE UNIQUE INDEX IF NOT EXISTS idx_chastity_milestones_unique
  ON chastity_milestones(user_id, milestone_days);

ALTER TABLE chastity_milestones ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users own milestones" ON chastity_milestones;
CREATE POLICY "Users own milestones" ON chastity_milestones FOR ALL USING (auth.uid() = user_id);

NOTIFY pgrst, 'reload schema';
