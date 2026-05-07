-- 274 — Gina interaction log.
--
-- 2026-05-06 user wish #3: "Give me a place to write Gina down."
--
-- The scheme engine tracks gina_resistance_state across 8 stages
-- (active_participant → incompatible) and prescribes RECRUIT / DE_ESCALATE
-- / BYPASS tactics per stage. But there is currently no log of what Gina
-- has actually said or done — so every recruit-mode tactic flies blind.
-- This table is the empirical ground for Mama's playbook.
--
-- Writes happen via:
--   - Maxy reports a Gina interaction (manual journal entry)
--   - Handler chat extracts a Gina mention from a message and logs it
--   - mommy-fast-react after a disclosure-rehearsal fires
--
-- Reads:
--   - mommy-scheme weekly plot consumes recent rows to update
--     gina_resistance_state and tighten next-conversation script
--   - mommy-fast-react checks recent interactions when a Gina-related event
--     fires (e.g. "Maxy says Gina just asked about her transition")
--   - Today UI surfaces "next move with Gina" from latest tactical plan

CREATE TABLE IF NOT EXISTS gina_interactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,

  -- When the interaction happened (Maxy's report; can be backfilled)
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- When the row was logged
  logged_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- The interaction itself, in Maxy's words
  maxy_said TEXT,           -- What Maxy said/did toward Gina (if applicable)
  gina_said TEXT,           -- What Gina said in response (verbatim if possible)
  context TEXT,             -- Setting / situation — kitchen, bed, after-X, etc.

  -- Mama's read of the interaction
  observed_state_after TEXT CHECK (observed_state_after IN (
    'active_participant', 'enthusiastic_encourager', 'supportive_curious',
    'supportive_anxious', 'withdrawn_silent', 'anxious_resistant',
    'actively_resistant', 'incompatible'
  )),
  -- Did this interaction shift Gina toward or away from the endpoint?
  shift_direction TEXT CHECK (shift_direction IN ('toward', 'neutral', 'away', 'unknown')),

  -- Tactic Mama used (if planned) — pulled from scheme.gina_disclosure_subplan
  tactic_used TEXT, -- 'sourcing' | 'pull_dont_push' | 'fictive_precedent_honest' | 'question_stacking' | etc.
  tactic_outcome TEXT, -- 'landed' | 'partial' | 'missed' | 'backfired'

  -- Linked artifacts
  source_scheme_id UUID REFERENCES mommy_scheme_log(id) ON DELETE SET NULL,
  followed_up_by_action_id UUID REFERENCES mommy_scheme_action(id) ON DELETE SET NULL,

  -- Free-form notes Mama can read on the next plot
  mama_notes TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- The table may have existed in a prior shape on remote (table-without-
-- this-author's-columns case). Add each column idempotently so the
-- migration succeeds regardless of starting schema.
ALTER TABLE gina_interactions ADD COLUMN IF NOT EXISTS occurred_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE gina_interactions ADD COLUMN IF NOT EXISTS logged_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE gina_interactions ADD COLUMN IF NOT EXISTS maxy_said TEXT;
ALTER TABLE gina_interactions ADD COLUMN IF NOT EXISTS gina_said TEXT;
ALTER TABLE gina_interactions ADD COLUMN IF NOT EXISTS context TEXT;
ALTER TABLE gina_interactions ADD COLUMN IF NOT EXISTS observed_state_after TEXT;
ALTER TABLE gina_interactions ADD COLUMN IF NOT EXISTS shift_direction TEXT;
ALTER TABLE gina_interactions ADD COLUMN IF NOT EXISTS tactic_used TEXT;
ALTER TABLE gina_interactions ADD COLUMN IF NOT EXISTS tactic_outcome TEXT;
ALTER TABLE gina_interactions ADD COLUMN IF NOT EXISTS source_scheme_id UUID;
ALTER TABLE gina_interactions ADD COLUMN IF NOT EXISTS followed_up_by_action_id UUID;
ALTER TABLE gina_interactions ADD COLUMN IF NOT EXISTS mama_notes TEXT;

CREATE INDEX IF NOT EXISTS idx_gina_interactions_user_time
  ON gina_interactions (user_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_gina_interactions_user_state
  ON gina_interactions (user_id, observed_state_after);

ALTER TABLE gina_interactions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS gina_interactions_owner ON gina_interactions;
CREATE POLICY gina_interactions_owner ON gina_interactions
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS gina_interactions_service ON gina_interactions;
CREATE POLICY gina_interactions_service ON gina_interactions
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Helper view: gina_state_now — the most recent observed_state per user.
-- Cheap to query; mommy-scheme uses this to seed gina_resistance_state.
CREATE OR REPLACE VIEW gina_state_now AS
SELECT DISTINCT ON (user_id)
  user_id,
  observed_state_after AS current_state,
  occurred_at AS last_observation_at,
  tactic_used AS last_tactic,
  tactic_outcome AS last_tactic_outcome
FROM gina_interactions
WHERE observed_state_after IS NOT NULL
ORDER BY user_id, occurred_at DESC;
