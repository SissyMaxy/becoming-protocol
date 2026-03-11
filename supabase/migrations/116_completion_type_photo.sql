-- Add 'photo', 'streak', 'tally' as recognized completion types.
-- No schema change needed — completion_type is TEXT, not an enum.
-- This migration exists as documentation of the type expansion.

-- Verify capture_data column exists (added in migration 069)
-- ALTER TABLE task_completions ADD COLUMN IF NOT EXISTS capture_data JSONB DEFAULT NULL;
-- ^ Already exists, no-op.

COMMENT ON TABLE task_completions IS 'Task completion records with rich capture_data JSONB. Completion types: binary, duration, count, batch_count, check_in, confirm, scale, reflect, log_entry, session_complete, photo, streak, tally.';
