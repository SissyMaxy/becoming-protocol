CREATE TABLE IF NOT EXISTS accountability_blog (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  entry_type TEXT NOT NULL CHECK (entry_type IN ('gate_miss', 'streak_break', 'quit_attempt', 'compliance_failure', 'milestone_achieved', 'daily_summary')),
  entry_text TEXT NOT NULL,
  severity TEXT CHECK (severity IN ('info', 'warning', 'failure', 'achievement')),
  public_visible BOOLEAN DEFAULT TRUE,
  day_number INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE accountability_blog ENABLE ROW LEVEL SECURITY;

CREATE POLICY "accountability_blog_public_read" ON accountability_blog FOR SELECT USING (public_visible = TRUE);
CREATE POLICY "accountability_blog_insert" ON accountability_blog FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP TRIGGER IF EXISTS block_blog_delete ON accountability_blog;
CREATE TRIGGER block_blog_delete
  BEFORE DELETE ON accountability_blog
  FOR EACH ROW EXECUTE FUNCTION prevent_critical_deletes();

CREATE INDEX IF NOT EXISTS idx_blog_public ON accountability_blog(public_visible, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_blog_user ON accountability_blog(user_id, created_at DESC);
