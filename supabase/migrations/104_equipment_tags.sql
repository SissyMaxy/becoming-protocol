-- 104: Tag tasks with hasItem equipment requirements
-- 195 tasks require equipment but the requires.hasItem field isn't populated.
-- This migration tags them so the rules engine can filter by owned items.

-- Plug tasks
UPDATE task_bank
SET requires = jsonb_set(
  COALESCE(requires::jsonb, '{}'::jsonb),
  '{hasItem}',
  '["plug"]'::jsonb
)
WHERE (requires::jsonb->>'hasItem' IS NULL OR requires::jsonb->'hasItem' = '[]'::jsonb)
  AND (instruction ILIKE '%plug%' OR category = 'plug')
  AND instruction NOT ILIKE '%buy%'
  AND instruction NOT ILIKE '%order%'
  AND instruction NOT ILIKE '%acquire%';

-- Cage/chastity tasks
UPDATE task_bank
SET requires = jsonb_set(
  COALESCE(requires::jsonb, '{}'::jsonb),
  '{hasItem}',
  '["cage"]'::jsonb
)
WHERE (requires::jsonb->>'hasItem' IS NULL OR requires::jsonb->'hasItem' = '[]'::jsonb)
  AND (instruction ILIKE '%cage%' OR instruction ILIKE '%chastity device%' OR category = 'lock')
  AND instruction NOT ILIKE '%buy%'
  AND instruction NOT ILIKE '%order%';

-- Wig tasks
UPDATE task_bank
SET requires = jsonb_set(
  COALESCE(requires::jsonb, '{}'::jsonb),
  '{hasItem}',
  '["wig"]'::jsonb
)
WHERE (requires::jsonb->>'hasItem' IS NULL OR requires::jsonb->'hasItem' = '[]'::jsonb)
  AND (instruction ILIKE '%wig%' OR instruction ILIKE '%your wig%')
  AND instruction NOT ILIKE '%buy%'
  AND instruction NOT ILIKE '%shop%';

-- Breastforms
UPDATE task_bank
SET requires = jsonb_set(
  COALESCE(requires::jsonb, '{}'::jsonb),
  '{hasItem}',
  '["breastforms"]'::jsonb
)
WHERE (requires::jsonb->>'hasItem' IS NULL OR requires::jsonb->'hasItem' = '[]'::jsonb)
  AND (instruction ILIKE '%breast form%' OR instruction ILIKE '%breastform%' OR instruction ILIKE '%breast insert%');

-- Heels
UPDATE task_bank
SET requires = jsonb_set(
  COALESCE(requires::jsonb, '{}'::jsonb),
  '{hasItem}',
  '["heels"]'::jsonb
)
WHERE (requires::jsonb->>'hasItem' IS NULL OR requires::jsonb->'hasItem' = '[]'::jsonb)
  AND (instruction ILIKE '%heels%' OR instruction ILIKE '%high heel%')
  AND instruction NOT ILIKE '%buy%'
  AND instruction NOT ILIKE '%shop%';

-- E-stim
UPDATE task_bank
SET requires = jsonb_set(
  COALESCE(requires::jsonb, '{}'::jsonb),
  '{hasItem}',
  '["estim"]'::jsonb
)
WHERE (requires::jsonb->>'hasItem' IS NULL OR requires::jsonb->'hasItem' = '[]'::jsonb)
  AND (instruction ILIKE '%e-stim%' OR instruction ILIKE '%estim%' OR instruction ILIKE '%electro%');

-- Dildo
UPDATE task_bank
SET requires = jsonb_set(
  COALESCE(requires::jsonb, '{}'::jsonb),
  '{hasItem}',
  '["dildo"]'::jsonb
)
WHERE (requires::jsonb->>'hasItem' IS NULL OR requires::jsonb->'hasItem' = '[]'::jsonb)
  AND (instruction ILIKE '%dildo%' OR instruction ILIKE '%toy%')
  AND category IN ('oral', 'plug', 'sissygasm');

-- Makeup
UPDATE task_bank
SET requires = jsonb_set(
  COALESCE(requires::jsonb, '{}'::jsonb),
  '{hasItem}',
  '["makeup"]'::jsonb
)
WHERE (requires::jsonb->>'hasItem' IS NULL OR requires::jsonb->'hasItem' = '[]'::jsonb)
  AND (instruction ILIKE '%makeup%' OR instruction ILIKE '%lipstick%' OR instruction ILIKE '%mascara%'
    OR instruction ILIKE '%eyeliner%' OR instruction ILIKE '%foundation%')
  AND domain = 'makeup';
