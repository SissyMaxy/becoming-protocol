-- Identity Erosion Tracking
-- Tracks specific masculine identity markers being dismantled over time.
-- Each event logs what was detected, its severity, and whether the Handler reframed it.

CREATE TABLE IF NOT EXISTS identity_erosion_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  erosion_type TEXT NOT NULL CHECK (erosion_type IN (
    'name_usage', 'pronoun_shift', 'voice_regression', 'appearance_revert',
    'social_masculine', 'decision_masculine', 'resistance_episode',
    'masculine_memory_shared', 'masculine_thought_confessed'
  )),
  description TEXT NOT NULL,
  severity INTEGER CHECK (severity BETWEEN 1 AND 10),
  handler_response TEXT,
  reframed BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE identity_erosion_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "erosion_select" ON identity_erosion_log FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "erosion_insert" ON identity_erosion_log FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_erosion_user ON identity_erosion_log(user_id, created_at DESC);

-- Prevent deletion of erosion evidence
DROP TRIGGER IF EXISTS block_erosion_delete ON identity_erosion_log;
CREATE TRIGGER block_erosion_delete
  BEFORE DELETE ON identity_erosion_log
  FOR EACH ROW EXECUTE FUNCTION prevent_critical_deletes();
