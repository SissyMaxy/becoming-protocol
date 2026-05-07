-- 261 — Backfill columns for mommy_ideation_log if it existed in a prior shape.
--
-- 260 created the table with `IF NOT EXISTS`, but on the live DB the table
-- already existed from a prior migration that wasn't checked into source.
-- That made 260 a no-op and the new columns (openrouter_raw, judged,
-- panel_summary, etc.) never got added. The rewritten mommy-ideate edge
-- fn writes those columns, so the inserts would fail on the prior shape.
--
-- All ADD COLUMN IF NOT EXISTS — idempotent regardless of starting state.

ALTER TABLE mommy_ideation_log ADD COLUMN IF NOT EXISTS anthropic_raw TEXT;
ALTER TABLE mommy_ideation_log ADD COLUMN IF NOT EXISTS openai_raw TEXT;
ALTER TABLE mommy_ideation_log ADD COLUMN IF NOT EXISTS openrouter_raw TEXT;
ALTER TABLE mommy_ideation_log ADD COLUMN IF NOT EXISTS judged TEXT;
ALTER TABLE mommy_ideation_log ADD COLUMN IF NOT EXISTS judge_model TEXT;
ALTER TABLE mommy_ideation_log ADD COLUMN IF NOT EXISTS panel_summary JSONB;
ALTER TABLE mommy_ideation_log ADD COLUMN IF NOT EXISTS context_snapshot JSONB;
ALTER TABLE mommy_ideation_log ADD COLUMN IF NOT EXISTS active_features_count INT;
ALTER TABLE mommy_ideation_log ADD COLUMN IF NOT EXISTS pain_points_count INT;
