-- 106: Clone intimate-domain tasks at lower intensity levels
-- The intimate domains (arousal, conditioning) are heavily skewed toward intensity 4-5.
-- This creates softer variants at intensity 1-2 for newer users.

-- Clone arousal domain tasks (intensity 4-5) as intensity 2 variants
INSERT INTO task_bank (
  category, domain, intensity, instruction, subtext,
  requires, exclude_if, completion_type, duration_minutes, target_count,
  points, affirmation, can_intensify, can_clone, track_resistance, is_core,
  created_by, active, time_window, requires_privacy
)
SELECT
  category, domain,
  2 AS intensity,
  REPLACE(
    REPLACE(
      REPLACE(instruction, '30 minutes', '10 minutes'),
      '20 minutes', '5 minutes'
    ),
    '15 minutes', '5 minutes'
  ) AS instruction,
  'Softer version — build comfort before intensity.' AS subtext,
  requires, exclude_if,
  CASE
    WHEN completion_type = 'duration' AND duration_minutes > 15 THEN 'check_in'
    ELSE completion_type
  END AS completion_type,
  CASE
    WHEN duration_minutes IS NOT NULL THEN LEAST(duration_minutes, 10)
    ELSE duration_minutes
  END AS duration_minutes,
  target_count,
  GREATEST(5, points / 2) AS points,
  affirmation, false, false, false, false,
  'seed', true, time_window, requires_privacy
FROM task_bank
WHERE domain = 'arousal'
  AND intensity >= 4
  AND active = true
LIMIT 15;

-- Clone conditioning domain tasks (intensity 4-5) as intensity 1 variants
INSERT INTO task_bank (
  category, domain, intensity, instruction, subtext,
  requires, exclude_if, completion_type, duration_minutes, target_count,
  points, affirmation, can_intensify, can_clone, track_resistance, is_core,
  created_by, active, time_window, requires_privacy
)
SELECT
  category, domain,
  1 AS intensity,
  REPLACE(
    REPLACE(
      REPLACE(instruction, '30 minutes', '5 minutes'),
      '20 minutes', '5 minutes'
    ),
    '15 minutes', '5 minutes'
  ) AS instruction,
  'Gentle introduction — no pressure, just exploration.' AS subtext,
  requires, exclude_if,
  'binary' AS completion_type,
  CASE
    WHEN duration_minutes IS NOT NULL THEN LEAST(duration_minutes, 5)
    ELSE duration_minutes
  END AS duration_minutes,
  target_count,
  GREATEST(3, points / 3) AS points,
  affirmation, false, false, false, false,
  'seed', true, time_window, requires_privacy
FROM task_bank
WHERE domain = 'conditioning'
  AND intensity >= 4
  AND active = true
LIMIT 15;
