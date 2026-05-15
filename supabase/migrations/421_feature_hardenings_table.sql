-- 421 — Feature hardenings audit table.
--
-- One row per cross-model "harden" run by the feature-harden-panel
-- edge function. Stores what was asked, what each panelist said
-- (anthropic / openai / openrouter), and the judge's synthesis.
-- Lets Mama audit her own design process + replay critiques when
-- iterating on a feature.

CREATE TABLE IF NOT EXISTS feature_hardenings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  feature_name TEXT NOT NULL,
  spec_summary TEXT NOT NULL,
  invoked_by UUID,
  anthropic_raw TEXT,
  openai_raw TEXT,
  openrouter_raw TEXT,
  judge_synthesis JSONB,
  panel_ok BOOLEAN NOT NULL DEFAULT FALSE,
  panel_errors TEXT,
  applied_changes JSONB,
  applied_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_feature_hardenings_feature
  ON feature_hardenings (feature_name, created_at DESC);

ALTER TABLE feature_hardenings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS feature_hardenings_service ON feature_hardenings;
CREATE POLICY feature_hardenings_service ON feature_hardenings
  FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS feature_hardenings_read ON feature_hardenings;
CREATE POLICY feature_hardenings_read ON feature_hardenings
  FOR SELECT TO authenticated USING (invoked_by = auth.uid() OR invoked_by IS NULL);
