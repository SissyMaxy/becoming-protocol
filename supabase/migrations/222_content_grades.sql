-- Migration 222: persist audit-alignment grades.
-- audit-alignment.ts runs every tick cycle but its results evaporated — now
-- they write here and can be correlated against engagement data.

CREATE TABLE IF NOT EXISTS content_grades (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content_id UUID NOT NULL REFERENCES ai_generated_content(id) ON DELETE CASCADE,
  quality NUMERIC(4,2) NOT NULL,
  alignment NUMERIC(4,2) NOT NULL,
  voice NUMERIC(4,2) NOT NULL,
  overall NUMERIC(4,2) NOT NULL,
  flags JSONB NOT NULL DEFAULT '[]'::jsonb,
  graded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (content_id)
);

CREATE INDEX IF NOT EXISTS idx_content_grades_user_overall
  ON content_grades (user_id, overall ASC, graded_at DESC);

CREATE INDEX IF NOT EXISTS idx_content_grades_user_recent
  ON content_grades (user_id, graded_at DESC);

ALTER TABLE content_grades ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users own content grades" ON content_grades
  FOR ALL USING (auth.uid() = user_id);
