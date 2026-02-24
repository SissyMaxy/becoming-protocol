-- Migration 107: Intimate domain level rebalance
-- Current: 21% at level 1-2 (146/684). Target: ≥25%.
-- Strategy: Clone ~35 level-3 intimate tasks to level 1 and level 2
-- with softer instruction text and adjusted points.

-- Clone level 3 intimate tasks to level 1 (gentler versions)
INSERT INTO task_bank (
  category, domain, intensity, instruction, subtext,
  requires, exclude_if, completion_type, duration_minutes, target_count,
  points, haptic_pattern, content_unlock, affirmation,
  ratchet_triggers, can_intensify, can_clone, track_resistance,
  is_core, created_by, parent_task_id, active,
  time_window, requires_privacy, pivot_if_unable
)
SELECT
  category, domain, 1 as intensity,
  -- Soften instruction for level 1
  CASE
    WHEN instruction ILIKE '%edge%' THEN regexp_replace(instruction, '(?i)edge', 'touch yourself gently', 'g')
    WHEN instruction ILIKE '%minutes%' THEN regexp_replace(instruction, '\d+ minutes?', '2 minutes', 'g')
    ELSE 'Gentle version: ' || instruction
  END as instruction,
  'Start small. Build the habit.' as subtext,
  '{}' as requires,  -- No requirements for level 1
  exclude_if, completion_type,
  LEAST(duration_minutes, 5) as duration_minutes,
  target_count,
  10 as points,  -- Level 1 points
  haptic_pattern, content_unlock,
  COALESCE(affirmation, 'Good girl. You showed up.') as affirmation,
  ratchet_triggers, can_intensify, can_clone, track_resistance,
  false as is_core, 'seed' as created_by, id as parent_task_id, true as active,
  time_window, requires_privacy,
  'Skip this one — do any skincare or self-care task instead.' as pivot_if_unable
FROM task_bank
WHERE domain = 'intimate'
  AND intensity = 3
  AND active = true
ORDER BY random()
LIMIT 18;

-- Clone level 3 intimate tasks to level 2 (moderate versions)
INSERT INTO task_bank (
  category, domain, intensity, instruction, subtext,
  requires, exclude_if, completion_type, duration_minutes, target_count,
  points, haptic_pattern, content_unlock, affirmation,
  ratchet_triggers, can_intensify, can_clone, track_resistance,
  is_core, created_by, parent_task_id, active,
  time_window, requires_privacy, pivot_if_unable
)
SELECT
  category, domain, 2 as intensity,
  -- Moderate adjustment for level 2
  CASE
    WHEN instruction ILIKE '%minutes%' THEN regexp_replace(instruction, '\d+ minutes?', '5 minutes', 'g')
    ELSE instruction
  END as instruction,
  COALESCE(subtext, 'Building presence.') as subtext,
  '{}' as requires,  -- Minimal requirements for level 2
  exclude_if, completion_type,
  LEAST(duration_minutes, 10) as duration_minutes,
  target_count,
  20 as points,  -- Level 2 points
  haptic_pattern, content_unlock,
  COALESCE(affirmation, 'Good girl.') as affirmation,
  ratchet_triggers, can_intensify, can_clone, track_resistance,
  false as is_core, 'seed' as created_by, id as parent_task_id, true as active,
  time_window, requires_privacy,
  'Do a lighter version: half the time, half the intensity.' as pivot_if_unable
FROM task_bank
WHERE domain = 'intimate'
  AND intensity = 3
  AND active = true
ORDER BY random()
LIMIT 18;
