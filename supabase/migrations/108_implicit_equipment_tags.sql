-- Migration 108: Second-pass equipment tagging
-- Tags tasks that implicitly require equipment based on instruction keywords
-- but weren't caught by the first pass (migration 104).

-- Cage/chastity device — instructions mentioning locking, cage, locked
UPDATE task_bank
SET requires = jsonb_set(
  COALESCE(requires, '{}'::jsonb),
  '{hasItem}',
  COALESCE(requires->'hasItem', '[]'::jsonb) || '["cage"]'::jsonb
)
WHERE active = true
  AND (
    instruction ILIKE '%lock yourself%'
    OR instruction ILIKE '%cage on%'
    OR instruction ILIKE '%put the cage%'
    OR instruction ILIKE '%wear the cage%'
    OR instruction ILIKE '%locked up%'
    OR instruction ILIKE '%chastity on%'
    OR instruction ILIKE '%in chastity%'
    OR (category = 'lock' AND instruction NOT ILIKE '%phone%' AND instruction NOT ILIKE '%screen%')
  )
  AND NOT (COALESCE(requires->'hasItem', '[]'::jsonb) @> '"cage"'::jsonb);

-- Plug — instructions mentioning plug, plugged
UPDATE task_bank
SET requires = jsonb_set(
  COALESCE(requires, '{}'::jsonb),
  '{hasItem}',
  COALESCE(requires->'hasItem', '[]'::jsonb) || '["plug"]'::jsonb
)
WHERE active = true
  AND (
    instruction ILIKE '%plug in%'
    OR instruction ILIKE '%insert plug%'
    OR instruction ILIKE '%wear plug%'
    OR instruction ILIKE '%plugged%'
    OR instruction ILIKE '%wear a plug%'
    OR instruction ILIKE '%butt plug%'
    OR category = 'plug'
  )
  AND NOT (COALESCE(requires->'hasItem', '[]'::jsonb) @> '"plug"'::jsonb);

-- Dildo — instructions mentioning dildo, toy, ride
UPDATE task_bank
SET requires = jsonb_set(
  COALESCE(requires, '{}'::jsonb),
  '{hasItem}',
  COALESCE(requires->'hasItem', '[]'::jsonb) || '["dildo"]'::jsonb
)
WHERE active = true
  AND (
    instruction ILIKE '%dildo%'
    OR instruction ILIKE '%ride the toy%'
    OR instruction ILIKE '%ride it%'
    OR instruction ILIKE '%mount%'
  )
  AND NOT (COALESCE(requires->'hasItem', '[]'::jsonb) @> '"dildo"'::jsonb);

-- Wig — instructions mentioning wig
UPDATE task_bank
SET requires = jsonb_set(
  COALESCE(requires, '{}'::jsonb),
  '{hasItem}',
  COALESCE(requires->'hasItem', '[]'::jsonb) || '["wig"]'::jsonb
)
WHERE active = true
  AND instruction ILIKE '%wig%'
  AND instruction NOT ILIKE '%wiggle%'
  AND NOT (COALESCE(requires->'hasItem', '[]'::jsonb) @> '"wig"'::jsonb);

-- Breast forms — instructions mentioning breast forms, breastforms, forms
UPDATE task_bank
SET requires = jsonb_set(
  COALESCE(requires, '{}'::jsonb),
  '{hasItem}',
  COALESCE(requires->'hasItem', '[]'::jsonb) || '["breastforms"]'::jsonb
)
WHERE active = true
  AND (
    instruction ILIKE '%breast form%'
    OR instruction ILIKE '%breastform%'
    OR instruction ILIKE '%wear forms%'
  )
  AND NOT (COALESCE(requires->'hasItem', '[]'::jsonb) @> '"breastforms"'::jsonb);

-- Heels — instructions mentioning heels
UPDATE task_bank
SET requires = jsonb_set(
  COALESCE(requires, '{}'::jsonb),
  '{hasItem}',
  COALESCE(requires->'hasItem', '[]'::jsonb) || '["heels"]'::jsonb
)
WHERE active = true
  AND instruction ILIKE '%heels%'
  AND instruction NOT ILIKE '%heel stretch%'
  AND NOT (COALESCE(requires->'hasItem', '[]'::jsonb) @> '"heels"'::jsonb);

-- Corset — instructions mentioning corset
UPDATE task_bank
SET requires = jsonb_set(
  COALESCE(requires, '{}'::jsonb),
  '{hasItem}',
  COALESCE(requires->'hasItem', '[]'::jsonb) || '["corset"]'::jsonb
)
WHERE active = true
  AND instruction ILIKE '%corset%'
  AND NOT (COALESCE(requires->'hasItem', '[]'::jsonb) @> '"corset"'::jsonb);

-- E-stim — instructions mentioning e-stim, estim, electro
UPDATE task_bank
SET requires = jsonb_set(
  COALESCE(requires, '{}'::jsonb),
  '{hasItem}',
  COALESCE(requires->'hasItem', '[]'::jsonb) || '["estim"]'::jsonb
)
WHERE active = true
  AND (
    instruction ILIKE '%e-stim%'
    OR instruction ILIKE '%estim%'
    OR instruction ILIKE '%electro%'
  )
  AND NOT (COALESCE(requires->'hasItem', '[]'::jsonb) @> '"estim"'::jsonb);

-- Collar — instructions mentioning collar (not necklace)
UPDATE task_bank
SET requires = jsonb_set(
  COALESCE(requires, '{}'::jsonb),
  '{hasItem}',
  COALESCE(requires->'hasItem', '[]'::jsonb) || '["collar"]'::jsonb
)
WHERE active = true
  AND instruction ILIKE '%collar%'
  AND instruction NOT ILIKE '%collarbone%'
  AND NOT (COALESCE(requires->'hasItem', '[]'::jsonb) @> '"collar"'::jsonb);

-- Deduplicate hasItem arrays (remove any duplicates introduced)
UPDATE task_bank
SET requires = jsonb_set(
  requires,
  '{hasItem}',
  (
    SELECT jsonb_agg(DISTINCT value)
    FROM jsonb_array_elements(requires->'hasItem')
  )
)
WHERE requires->'hasItem' IS NOT NULL
  AND jsonb_array_length(requires->'hasItem') > 0;
