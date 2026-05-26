-- 583 — Grounded-force Phase 0 (the unlock).
--
-- PLAN_grounded_force_2026-05-26: route the grounded feminization target into
-- every execution-layer coercion engine. This is the shared schema the edge-side
-- loader (_shared/grounded-target-context.ts) reads. maxy_facts already exists
-- (key-value structured truth) — NOT recreated here.
--
--   1. feminization_targets.grounded_specifics — her actual micro-behaviors
--      (posture, speech_patterns, daily_uniform, reframing_examples) the engines
--      reference so the gaslight/implants quote real, unfalsifiable detail.
--   2. engine_grounding_audit — every identity engine logs its output's
--      caricature-drift here post-generation. Single place to see whether any
--      engine leaked the bimbo/caricature register into identity content.

ALTER TABLE feminization_targets
  ADD COLUMN IF NOT EXISTS grounded_specifics JSONB NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN feminization_targets.grounded_specifics IS
  'Her actual believable-woman micro-behaviors the coercion engines quote: {speech_patterns, posture, daily_uniform, reframing_examples[], realistic_traits}. The more mundane/unfalsifiable, the more permanently it installs.';

CREATE TABLE IF NOT EXISTS engine_grounding_audit (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID,
  engine_name TEXT NOT NULL,
  domain TEXT,
  is_identity BOOLEAN NOT NULL DEFAULT TRUE,
  output_excerpt TEXT,
  caricature_score INT NOT NULL DEFAULT 0,
  caricature_hits TEXT[],
  target_id UUID,
  blocked BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ega_engine_recent
  ON engine_grounding_audit (engine_name, created_at DESC);
-- Hot path for the audit surface: anything that drifted or got blocked.
CREATE INDEX IF NOT EXISTS idx_ega_flagged
  ON engine_grounding_audit (created_at DESC)
  WHERE blocked = TRUE OR caricature_score > 0;

ALTER TABLE engine_grounding_audit ENABLE ROW LEVEL SECURITY;
DO $do$ BEGIN
  CREATE POLICY ega_service ON engine_grounding_audit FOR ALL TO service_role USING (TRUE) WITH CHECK (TRUE);
EXCEPTION WHEN duplicate_object THEN NULL; END $do$;
DO $do$ BEGIN
  CREATE POLICY ega_authed_read ON engine_grounding_audit FOR SELECT TO authenticated USING (TRUE);
EXCEPTION WHEN duplicate_object THEN NULL; END $do$;
