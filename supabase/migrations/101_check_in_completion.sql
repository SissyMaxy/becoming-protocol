-- 101: Convert long-duration tasks (2+ hours) from 'duration' to 'check_in'
-- These tasks shouldn't show a countdown timer — user does the activity
-- and checks in when done.

UPDATE task_bank
SET completion_type = 'check_in'
WHERE completion_type = 'duration'
  AND duration_minutes IS NOT NULL
  AND duration_minutes > 120;
