-- 260 — Mommy hardening panel + ideation log table.
--
-- Sprint 5 (2026-05-06): user flagged that mommy-ideate / cross-model work
-- wasn't actually getting full context, and asked whether OpenRouter was
-- being used as a third perspective. Audit found:
--   - Two-provider panel only (Anthropic + OpenAI), no third lens.
--   - mommy-ideate had inlined-and-drifted character spec.
--   - No state, no active-features, no pain-points, no voice samples in prompt.
--   - mommy_ideation_log was being inserted into but never existed.
--
-- This migration creates the log table with the new schema (openrouter_raw,
-- judged, judge_model, panel_summary, etc.) so the rewritten mommy-ideate
-- can persist its panel output for after-the-fact audit.

CREATE TABLE IF NOT EXISTS mommy_ideation_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Raw outputs per panel member (stored even if request failed — empty strings)
  anthropic_raw TEXT,
  openai_raw TEXT,
  openrouter_raw TEXT,
  -- Synthesized output from judge pass (Anthropic Sonnet by default)
  judged TEXT,
  judge_model TEXT,
  -- Per-member status summary (ok/fail/finish_reason/length/error)
  panel_summary JSONB,
  -- State snapshot at generation time so we can replay the conditions
  context_snapshot JSONB,
  active_features_count INT,
  pain_points_count INT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_mommy_ideation_log_created
  ON mommy_ideation_log (created_at DESC);

-- Service-role only (cron writes; user_id-scoped audit comes via wrapper view if needed)
ALTER TABLE mommy_ideation_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS mommy_ideation_log_service ON mommy_ideation_log;
CREATE POLICY mommy_ideation_log_service ON mommy_ideation_log
  FOR ALL TO service_role USING (true) WITH CHECK (true);
