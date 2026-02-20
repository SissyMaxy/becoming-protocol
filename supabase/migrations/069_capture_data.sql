-- Migration 069: Add capture_data JSONB to task_completions
-- Supports completion-type-aware TaskCard (Phase 1)
-- Stores structured data from duration timers, scale sliders, count values, reflections, etc.

ALTER TABLE task_completions ADD COLUMN IF NOT EXISTS
  capture_data JSONB DEFAULT NULL;

-- Index for querying tasks with captured data (e.g. Handler reading reflections)
CREATE INDEX IF NOT EXISTS idx_task_completions_capture_data
  ON task_completions USING gin (capture_data)
  WHERE capture_data IS NOT NULL;
