-- 100: Fix privacy + evening conflict
-- Tasks that require privacy AND are locked to evening create a conflict
-- because privacy is often unavailable in the evening.
-- Set these to time_window='any' so the real-time privacy filter handles them dynamically.

UPDATE task_bank
SET time_window = 'any'
WHERE requires_privacy = true
  AND time_window = 'evening';

-- Also fix tasks that require privacy AND are locked to 'night'
-- Same logic — let privacy filter decide dynamically
UPDATE task_bank
SET time_window = 'any'
WHERE requires_privacy = true
  AND time_window = 'night';
