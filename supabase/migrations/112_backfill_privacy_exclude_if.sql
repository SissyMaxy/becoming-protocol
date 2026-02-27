-- Migration 112: Backfill exclude_if.ginaHome for privacy-sensitive tasks
-- Tasks with domain in (arousal, intimate, conditioning) or category in
-- (edge, goon, deepen, worship, bambi, corrupt, fantasy, session) must have
-- exclude_if.ginaHome = true so the rules engine filters them when Gina is present.

UPDATE task_bank
SET exclude_if = COALESCE(exclude_if, '{}'::jsonb) || '{"ginaHome": true}'::jsonb
WHERE (
  domain IN ('arousal', 'intimate', 'conditioning')
  OR category IN ('edge', 'goon', 'deepen', 'worship', 'bambi', 'corrupt', 'fantasy', 'session')
  OR (requires->>'requires_privacy')::boolean = true
)
AND (exclude_if IS NULL OR NOT (exclude_if ? 'ginaHome'));

-- Also default requires_privacy for tasks with intimate/arousal domain that lack it
UPDATE task_bank
SET requires = COALESCE(requires, '{}'::jsonb) || '{"requires_privacy": true}'::jsonb
WHERE (
  domain IN ('arousal', 'intimate', 'conditioning')
  OR category IN ('edge', 'goon', 'deepen', 'worship', 'bambi', 'corrupt', 'fantasy', 'session')
)
AND (requires IS NULL OR NOT (requires ? 'requires_privacy'));
