-- 315 — Compliance-aware difficulty curve.
--
-- A daily evaluator computes a per-user difficulty band from rolling
-- 14-day compliance signals (handler_commitments fulfilled rate, slip
-- count, fulfillment streak). Downstream consumers (mommy-mantra,
-- mommy-touch, mommy-prescribe, gaslight) read the band and gate
-- intensity_tier / cadence / public-dare bias / gaslight enable.
--
-- Hard rules (enforced in code, listed here for audit):
--   - User can ALWAYS lock the band manually via override_band — the
--     evaluator must not move past a locked value.
--   - 'recovery' band forces softer treatment regardless of compliance:
--       * gaslight short-circuits to 'off'
--       * prescription cadence is forced to occasional or paused
--       * mantra intensity ceiling is 'gentle'
--       * touch task cap halved
--     This is the aftercare-floor invariant — recovery is a HOLD, not
--     a reward removal.
--   - Band changes are logged to autonomous_escalation_log with
--     engine='compliance_difficulty' for operator visibility.
--   - Phase ceiling sits BELOW the band ceiling: a phase-1 user at
--     'cruel' band still doesn't get phase-5+ content. Bands modulate
--     intensity within the user's phase range; they don't lift it.

-- ─── 1. compliance_difficulty_state ──────────────────────────────────────
-- One row per user, written by the daily evaluator. Reads are hot
-- (every consumer touches this row), so we keep it narrow + indexed
-- on user_id PK.
CREATE TABLE IF NOT EXISTS compliance_difficulty_state (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Current band the evaluator settled on. Default 'gentle' so a
  -- fresh user (no signal yet) gets a soft start.
  current_difficulty_band TEXT NOT NULL DEFAULT 'gentle' CHECK (current_difficulty_band IN (
    'recovery', 'gentle', 'firm', 'cruel'
  )),

  -- Manual override: when set, the evaluator MUST NOT change the band.
  -- NULL = automatic. The Identity-page override toggle writes this.
  override_band TEXT CHECK (override_band IN (
    'recovery', 'gentle', 'firm', 'cruel'
  )),
  override_set_at TIMESTAMPTZ,

  -- Last evaluator pass — informational, also drives the next-eval gate.
  last_evaluated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  next_evaluation_at TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '24 hours'),

  -- Snapshot from the last pass — exposed in the Identity UI for the
  -- "matching her tone to where you are this week" copy. Read-only to
  -- consumers; the evaluator overwrites on each pass.
  compliance_pct_14d NUMERIC(5,2),    -- 0.00 .. 100.00
  slip_count_14d INTEGER NOT NULL DEFAULT 0,
  streak_days INTEGER NOT NULL DEFAULT 0,

  -- Why the band moved (or stayed). Short string, not user-facing.
  -- Examples: 'bumped:high_compliance', 'dropped:slip_spike',
  -- 'stable', 'override_held'.
  last_change_reason TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_compliance_difficulty_next_eval
  ON compliance_difficulty_state (next_evaluation_at);

ALTER TABLE compliance_difficulty_state ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS compliance_difficulty_owner ON compliance_difficulty_state;
CREATE POLICY compliance_difficulty_owner ON compliance_difficulty_state FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS compliance_difficulty_service ON compliance_difficulty_state;
CREATE POLICY compliance_difficulty_service ON compliance_difficulty_state FOR ALL
  TO service_role USING (true) WITH CHECK (true);

-- updated_at trigger — uses the standard helper added by an earlier
-- migration. Soft-fail if not present.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'update_updated_at_column') THEN
    EXECUTE 'DROP TRIGGER IF EXISTS update_compliance_difficulty_updated_at ON compliance_difficulty_state';
    EXECUTE 'CREATE TRIGGER update_compliance_difficulty_updated_at
             BEFORE UPDATE ON compliance_difficulty_state
             FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()';
  END IF;
END $$;
