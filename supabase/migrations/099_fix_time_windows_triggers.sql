-- 099: Fix invalid time windows and add dayOfWeek support for triggers

-- Fix invalid 'friday_evening' time window → 'evening' + dayOfWeek=[5]
UPDATE task_bank
SET
  time_window = 'evening',
  requires = jsonb_set(
    COALESCE(requires::jsonb, '{}'::jsonb),
    '{dayOfWeek}',
    '[5]'::jsonb
  )
WHERE time_window = 'friday_evening';

-- Fix 'weekend' time window → 'any' + dayOfWeek=[0,6]
UPDATE task_bank
SET
  time_window = 'any',
  requires = jsonb_set(
    COALESCE(requires::jsonb, '{}'::jsonb),
    '{dayOfWeek}',
    '[0,6]'::jsonb
  )
WHERE time_window = 'weekend';

-- Fix 'weekday' time window → 'any' + dayOfWeek=[1,2,3,4,5]
UPDATE task_bank
SET
  time_window = 'any',
  requires = jsonb_set(
    COALESCE(requires::jsonb, '{}'::jsonb),
    '{dayOfWeek}',
    '[1,2,3,4,5]'::jsonb
  )
WHERE time_window = 'weekday';

-- Fix 'daytime' → map to both morning and afternoon
UPDATE task_bank
SET time_window = 'any'
WHERE time_window = 'daytime';
