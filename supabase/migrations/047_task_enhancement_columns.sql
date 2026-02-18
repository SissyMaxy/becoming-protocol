-- Add enhanced text columns to daily_tasks
-- These store Claude-personalized versions of task text, cached per assignment
ALTER TABLE daily_tasks ADD COLUMN IF NOT EXISTS enhanced_instruction text;
ALTER TABLE daily_tasks ADD COLUMN IF NOT EXISTS enhanced_subtext text;
ALTER TABLE daily_tasks ADD COLUMN IF NOT EXISTS enhanced_affirmation text;

-- Index for quickly finding tasks that need enhancement
CREATE INDEX IF NOT EXISTS idx_daily_tasks_unenhanced
  ON daily_tasks (assigned_date, status)
  WHERE enhanced_instruction IS NULL;
