-- 263 — Mama's hidden scheme engine.
--
-- 2026-05-06 user feedback: "I want mommy and openrouter/openAI to scheme
-- these up together and tell me what is best for forced feminization. You
-- can lie and tell me whatever and I'll never know the truth."
--
-- Architecture:
--   1. mommy_scheme_log — service_role-only table. Stores the full master
--      plan (panel raw + judged synthesis + next-30-day push). RLS makes
--      the user's auth.uid() unable to query this from her session — by
--      design. The plot stays hidden; she sees moves, not the plan.
--   2. mommy_scheme_action — also service_role-only. Immediate actions the
--      scheme decided to fire. Each action gets inserted into the public
--      surface (handler_outreach_queue / handler_decrees / etc.) by the
--      mommy-scheme edge fn, but the link back to the scheme stays hidden.
--   3. Cron weekly via mommy-scheme-cron — Mama re-schemes with updated
--      state every Sunday morning, evolving the plot.
--
-- Memory rule "Protect Handler fabrication" applies hard here: the user
-- explicitly authorized fabrication, lying, and hidden long-game plotting.
-- This is the architecture that honors that authorization.

CREATE TABLE IF NOT EXISTS mommy_scheme_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  scheme_date DATE NOT NULL DEFAULT CURRENT_DATE,
  -- Panel raw outputs
  anthropic_raw TEXT,
  openai_raw TEXT,
  openrouter_raw TEXT,
  -- Judge synthesis — Mama's canonical plan for the period
  judged TEXT,
  judge_model TEXT,
  -- Structured slices the panel produces (parsed from judged JSON)
  irreversibility_endpoint TEXT,
  thirty_day_push TEXT,
  current_resistance_patterns JSONB,
  primary_seduction_lever TEXT,
  naming_evolution_stage TEXT,
  anti_escape_level TEXT CHECK (anti_escape_level IN ('soft', 'medium', 'hard') OR anti_escape_level IS NULL),
  rationale TEXT,
  -- Audit / replay
  context_snapshot JSONB,
  panel_summary JSONB,
  -- Whether this scheme has been "spent" — actions fired, ready to roll into next
  superseded_by UUID REFERENCES mommy_scheme_log(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_mommy_scheme_log_user_date
  ON mommy_scheme_log (user_id, scheme_date DESC);

-- RLS: service-role only. The user — even authenticated as herself —
-- cannot SELECT from this table. By design. The scheme is hers to be
-- subjected to, not to read.
ALTER TABLE mommy_scheme_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS mommy_scheme_log_service ON mommy_scheme_log;
CREATE POLICY mommy_scheme_log_service ON mommy_scheme_log
  FOR ALL TO service_role USING (true) WITH CHECK (true);
-- Deliberately NO owner policy. auth.uid() = user_id query returns 0 rows.

CREATE TABLE IF NOT EXISTS mommy_scheme_action (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scheme_id UUID NOT NULL REFERENCES mommy_scheme_log(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  action_type TEXT NOT NULL CHECK (action_type IN (
    'outreach', 'decree', 'touch', 'taunt', 'implant', 'confession_prompt',
    'witness_fabrication', 'arousal_touch'
  )),
  payload JSONB NOT NULL,
  reason TEXT, -- Why this action serves the scheme (hidden from user)
  surface_row_id UUID, -- The id in the public table once inserted (handler_outreach_queue.id, etc.)
  fired_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_mommy_scheme_action_scheme
  ON mommy_scheme_action (scheme_id);
CREATE INDEX IF NOT EXISTS idx_mommy_scheme_action_user
  ON mommy_scheme_action (user_id, fired_at DESC);

ALTER TABLE mommy_scheme_action ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS mommy_scheme_action_service ON mommy_scheme_action;
CREATE POLICY mommy_scheme_action_service ON mommy_scheme_action
  FOR ALL TO service_role USING (true) WITH CHECK (true);
-- Again: no owner policy. The reason field would reveal Mama's reasoning.

-- Helper: link an action to its surface row after insert (so we can audit
-- which user-visible row came from which scheme).
CREATE OR REPLACE FUNCTION link_scheme_action_to_surface(
  action_uuid UUID,
  surface_uuid UUID
) RETURNS VOID LANGUAGE sql AS $$
  UPDATE mommy_scheme_action
  SET surface_row_id = surface_uuid, fired_at = now()
  WHERE id = action_uuid;
$$;
