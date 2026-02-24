-- 097: Assign categories to uncategorized tasks
-- ~284 tasks have empty or null category. Infer from instruction text.

-- Arousal/edge tasks
UPDATE task_bank SET category = 'edge'
WHERE (category IS NULL OR category = '')
  AND (instruction ILIKE '%edge%' OR instruction ILIKE '%arousal%' OR instruction ILIKE '%orgasm%');

-- Chastity/lock tasks
UPDATE task_bank SET category = 'lock'
WHERE (category IS NULL OR category = '')
  AND (instruction ILIKE '%cage%' OR instruction ILIKE '%chastity%' OR instruction ILIKE '%lock%');

-- Plug/anal tasks
UPDATE task_bank SET category = 'plug'
WHERE (category IS NULL OR category = '')
  AND (instruction ILIKE '%plug%' OR instruction ILIKE '%anal%');

-- Wear/clothing tasks
UPDATE task_bank SET category = 'wear'
WHERE (category IS NULL OR category = '')
  AND (instruction ILIKE '%wear%' OR instruction ILIKE '%panties%' OR instruction ILIKE '%bra%'
    OR instruction ILIKE '%lingerie%' OR instruction ILIKE '%stockings%' OR instruction ILIKE '%heels%');

-- Listen/audio tasks
UPDATE task_bank SET category = 'listen'
WHERE (category IS NULL OR category = '')
  AND (instruction ILIKE '%listen%' OR instruction ILIKE '%audio%' OR instruction ILIKE '%hypno%');

-- Say/verbal tasks
UPDATE task_bank SET category = 'say'
WHERE (category IS NULL OR category = '')
  AND (instruction ILIKE '%say%' OR instruction ILIKE '%repeat%' OR instruction ILIKE '%affirmation%'
    OR instruction ILIKE '%mantra%');

-- Practice/skill tasks
UPDATE task_bank SET category = 'practice'
WHERE (category IS NULL OR category = '')
  AND (instruction ILIKE '%practice%' OR instruction ILIKE '%voice%' OR instruction ILIKE '%walk%'
    OR instruction ILIKE '%makeup%' OR instruction ILIKE '%posture%');

-- Apply/sensory tasks
UPDATE task_bank SET category = 'apply'
WHERE (category IS NULL OR category = '')
  AND (instruction ILIKE '%apply%' OR instruction ILIKE '%lotion%' OR instruction ILIKE '%scent%'
    OR instruction ILIKE '%perfume%' OR instruction ILIKE '%moisturize%');

-- Watch/visual tasks
UPDATE task_bank SET category = 'watch'
WHERE (category IS NULL OR category = '')
  AND (instruction ILIKE '%watch%' OR instruction ILIKE '%video%' OR instruction ILIKE '%look at%');

-- Care/self-care tasks
UPDATE task_bank SET category = 'care'
WHERE (category IS NULL OR category = '')
  AND (instruction ILIKE '%skincare%' OR instruction ILIKE '%shower%' OR instruction ILIKE '%shave%'
    OR instruction ILIKE '%protein%' OR instruction ILIKE '%water%' OR instruction ILIKE '%sleep%');

-- Ritual tasks
UPDATE task_bank SET category = 'ritual'
WHERE (category IS NULL OR category = '')
  AND (instruction ILIKE '%ritual%' OR instruction ILIKE '%routine%' OR instruction ILIKE '%daily%'
    OR instruction ILIKE '%every morning%' OR instruction ILIKE '%every night%');

-- Commit tasks
UPDATE task_bank SET category = 'commit'
WHERE (category IS NULL OR category = '')
  AND (instruction ILIKE '%commit%' OR instruction ILIKE '%promise%' OR instruction ILIKE '%agree%'
    OR instruction ILIKE '%pledge%');

-- Surrender tasks
UPDATE task_bank SET category = 'surrender'
WHERE (category IS NULL OR category = '')
  AND (instruction ILIKE '%surrender%' OR instruction ILIKE '%give up%' OR instruction ILIKE '%accept%'
    OR instruction ILIKE '%submit%');

-- Default remainder to 'explore'
UPDATE task_bank SET category = 'explore'
WHERE (category IS NULL OR category = '');

-- Deactivate tasks with no instruction (broken data)
UPDATE task_bank SET active = false
WHERE instruction IS NULL OR instruction = '';
