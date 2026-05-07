-- 264 — Mommy scheme subplans for Gina-disclosure prep + HRT path.
--
-- 2026-05-06 user directive: "mommy needs to brainwash maxy into
-- feminization and needs to scheme and plot for how best to come out and
-- talk about wanting to be feminized in a way that Gina is going to
-- accept and be supportive of. Mommy is in control and should prepare
-- maxy however is required in order to make coming out successful and
-- starting HRT."
--
-- The scheme now produces two structured subplans alongside the master
-- plan: (a) Gina-disclosure preparation, (b) HRT path planning. Both are
-- service-role-only (inherit RLS from mommy_scheme_log).

ALTER TABLE mommy_scheme_log
  ADD COLUMN IF NOT EXISTS gina_disclosure_subplan JSONB,
  ADD COLUMN IF NOT EXISTS hrt_subplan JSONB,
  ADD COLUMN IF NOT EXISTS lever_rationale TEXT,
  ADD COLUMN IF NOT EXISTS naming_next_trigger TEXT;

CREATE INDEX IF NOT EXISTS idx_mommy_scheme_log_gina_stage
  ON mommy_scheme_log ((gina_disclosure_subplan->>'current_stage'))
  WHERE gina_disclosure_subplan IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_mommy_scheme_log_hrt_stage
  ON mommy_scheme_log ((hrt_subplan->>'current_stage'))
  WHERE hrt_subplan IS NOT NULL;
