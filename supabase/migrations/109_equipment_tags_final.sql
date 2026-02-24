-- Migration 109: Final equipment tagging pass
-- Adds lingerie + stockings tags (missed by 104/108), searches steps column for all items

-- Lingerie — instruction or steps mentioning lingerie, panties, bra, babydoll, teddy, nightie
UPDATE task_bank
SET requires = jsonb_set(
  COALESCE(requires, '{}'::jsonb),
  '{hasItem}',
  COALESCE(requires->'hasItem', '[]'::jsonb) || '["lingerie"]'::jsonb
)
WHERE active = true
  AND (
    instruction ILIKE '%lingerie%'
    OR instruction ILIKE '%panties%'
    OR instruction ILIKE '%bra %'
    OR instruction ILIKE '%babydoll%'
    OR instruction ILIKE '%teddy%'
    OR instruction ILIKE '%nightie%'
    OR steps::text ILIKE '%lingerie%'
    OR steps::text ILIKE '%panties%'
  )
  AND instruction NOT ILIKE '%buy%'
  AND instruction NOT ILIKE '%shop%'
  AND NOT (COALESCE(requires->'hasItem', '[]'::jsonb) @> '"lingerie"'::jsonb);

-- Stockings — instruction or steps mentioning stockings, thigh-highs, fishnets
UPDATE task_bank
SET requires = jsonb_set(
  COALESCE(requires, '{}'::jsonb),
  '{hasItem}',
  COALESCE(requires->'hasItem', '[]'::jsonb) || '["stockings"]'::jsonb
)
WHERE active = true
  AND (
    instruction ILIKE '%stocking%'
    OR instruction ILIKE '%thigh-high%'
    OR instruction ILIKE '%thigh high%'
    OR instruction ILIKE '%fishnet%'
    OR steps::text ILIKE '%stocking%'
    OR steps::text ILIKE '%thigh-high%'
  )
  AND instruction NOT ILIKE '%buy%'
  AND instruction NOT ILIKE '%shop%'
  AND NOT (COALESCE(requires->'hasItem', '[]'::jsonb) @> '"stockings"'::jsonb);

-- Steps column catch-all: tag tasks where steps mention equipment
-- but instruction didn't match previous migrations (104/108)

-- Plug in steps
UPDATE task_bank
SET requires = jsonb_set(
  COALESCE(requires, '{}'::jsonb),
  '{hasItem}',
  COALESCE(requires->'hasItem', '[]'::jsonb) || '["plug"]'::jsonb
)
WHERE active = true
  AND steps::text ILIKE '%plug%'
  AND steps::text NOT ILIKE '%unplug%'
  AND NOT (COALESCE(requires->'hasItem', '[]'::jsonb) @> '"plug"'::jsonb);

-- Cage in steps
UPDATE task_bank
SET requires = jsonb_set(
  COALESCE(requires, '{}'::jsonb),
  '{hasItem}',
  COALESCE(requires->'hasItem', '[]'::jsonb) || '["cage"]'::jsonb
)
WHERE active = true
  AND (steps::text ILIKE '%cage%' OR steps::text ILIKE '%chastity%')
  AND NOT (COALESCE(requires->'hasItem', '[]'::jsonb) @> '"cage"'::jsonb);

-- Dildo in steps (scoped to relevant categories to avoid false positives from "toy")
UPDATE task_bank
SET requires = jsonb_set(
  COALESCE(requires, '{}'::jsonb),
  '{hasItem}',
  COALESCE(requires->'hasItem', '[]'::jsonb) || '["dildo"]'::jsonb
)
WHERE active = true
  AND (steps::text ILIKE '%dildo%' OR steps::text ILIKE '%toy%')
  AND category IN ('oral', 'plug', 'sissygasm', 'edge', 'goon')
  AND NOT (COALESCE(requires->'hasItem', '[]'::jsonb) @> '"dildo"'::jsonb);

-- Heels in steps
UPDATE task_bank
SET requires = jsonb_set(
  COALESCE(requires, '{}'::jsonb),
  '{hasItem}',
  COALESCE(requires->'hasItem', '[]'::jsonb) || '["heels"]'::jsonb
)
WHERE active = true
  AND steps::text ILIKE '%heels%'
  AND steps::text NOT ILIKE '%heel stretch%'
  AND NOT (COALESCE(requires->'hasItem', '[]'::jsonb) @> '"heels"'::jsonb);

-- Wig in steps
UPDATE task_bank
SET requires = jsonb_set(
  COALESCE(requires, '{}'::jsonb),
  '{hasItem}',
  COALESCE(requires->'hasItem', '[]'::jsonb) || '["wig"]'::jsonb
)
WHERE active = true
  AND steps::text ILIKE '%wig%'
  AND steps::text NOT ILIKE '%wiggle%'
  AND NOT (COALESCE(requires->'hasItem', '[]'::jsonb) @> '"wig"'::jsonb);

-- Corset in steps
UPDATE task_bank
SET requires = jsonb_set(
  COALESCE(requires, '{}'::jsonb),
  '{hasItem}',
  COALESCE(requires->'hasItem', '[]'::jsonb) || '["corset"]'::jsonb
)
WHERE active = true
  AND steps::text ILIKE '%corset%'
  AND NOT (COALESCE(requires->'hasItem', '[]'::jsonb) @> '"corset"'::jsonb);

-- Collar in steps
UPDATE task_bank
SET requires = jsonb_set(
  COALESCE(requires, '{}'::jsonb),
  '{hasItem}',
  COALESCE(requires->'hasItem', '[]'::jsonb) || '["collar"]'::jsonb
)
WHERE active = true
  AND steps::text ILIKE '%collar%'
  AND steps::text NOT ILIKE '%collarbone%'
  AND NOT (COALESCE(requires->'hasItem', '[]'::jsonb) @> '"collar"'::jsonb);

-- Deduplicate hasItem arrays (clean up any duplicates from append operations)
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
