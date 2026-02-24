-- 098: Assign completion_type to tasks that are missing it
-- ~40 tasks have null completion_type.

-- Tasks with duration_minutes set → duration
UPDATE task_bank SET completion_type = 'duration'
WHERE (completion_type IS NULL OR completion_type = '')
  AND duration_minutes IS NOT NULL AND duration_minutes > 0;

-- Tasks with target_count set → count
UPDATE task_bank SET completion_type = 'count'
WHERE (completion_type IS NULL OR completion_type = '')
  AND target_count IS NOT NULL AND target_count > 0;

-- Remaining nulls → binary (simple done/skip)
UPDATE task_bank SET completion_type = 'binary'
WHERE completion_type IS NULL OR completion_type = '';
