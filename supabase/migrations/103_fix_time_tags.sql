-- 103: Re-tag time-contextual tasks from 'any' to correct time windows
-- 65+ tasks contain time-specific language but are tagged as 'any'

-- Bedtime/before bed → evening
UPDATE task_bank
SET time_window = 'evening'
WHERE (time_window IS NULL OR time_window = 'any')
  AND (instruction ILIKE '%bedtime%'
    OR instruction ILIKE '%before bed%'
    OR instruction ILIKE '%before sleep%'
    OR instruction ILIKE '%going to bed%'
    OR instruction ILIKE '%sleep tonight%');

-- Night/nighttime → night
UPDATE task_bank
SET time_window = 'night'
WHERE (time_window IS NULL OR time_window = 'any')
  AND (instruction ILIKE '%nighttime%'
    OR instruction ILIKE '%at night%'
    OR instruction ILIKE '%tonight%'
    OR instruction ILIKE '%midnight%'
    OR instruction ILIKE '%late night%');

-- Morning-specific → morning
UPDATE task_bank
SET time_window = 'morning'
WHERE (time_window IS NULL OR time_window = 'any')
  AND (instruction ILIKE '%morning shower%'
    OR instruction ILIKE '%wake up%'
    OR instruction ILIKE '%waking up%'
    OR instruction ILIKE '%when you wake%'
    OR instruction ILIKE '%first thing%'
    OR instruction ILIKE '%this morning%'
    OR instruction ILIKE '%start your day%'
    OR instruction ILIKE '%morning routine%');

-- Afternoon-specific → afternoon
UPDATE task_bank
SET time_window = 'afternoon'
WHERE (time_window IS NULL OR time_window = 'any')
  AND (instruction ILIKE '%lunch break%'
    OR instruction ILIKE '%after lunch%'
    OR instruction ILIKE '%afternoon%');
