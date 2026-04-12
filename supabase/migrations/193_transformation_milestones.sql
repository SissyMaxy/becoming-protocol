CREATE TABLE IF NOT EXISTS transformation_milestones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  milestone_name TEXT NOT NULL,
  milestone_category TEXT CHECK (milestone_category IN ('voice', 'appearance', 'identity', 'social', 'sexual', 'submission', 'physical', 'irreversible')),
  description TEXT,
  achieved_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  evidence TEXT,
  handler_commentary TEXT,
  celebration_type TEXT,
  revocable BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE transformation_milestones ENABLE ROW LEVEL SECURITY;
CREATE POLICY "milestones_select" ON transformation_milestones FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "milestones_insert" ON transformation_milestones FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_milestones_user ON transformation_milestones(user_id, achieved_at DESC);

DROP TRIGGER IF EXISTS block_milestones_delete ON transformation_milestones;
CREATE TRIGGER block_milestones_delete
  BEFORE DELETE ON transformation_milestones
  FOR EACH ROW EXECUTE FUNCTION prevent_critical_deletes();
