-- 301 — interactive dossier quiz drip (2026-04-30 spec)
--
-- Investigation findings (mommy_dossier was empty, 0 rows on this user):
--   * mommy_dossier (mig 270) is a 9-category per-user knowledge table:
--     gina, name, body, confession_seed, resistance, turn_ons, turn_offs,
--     history, preferences. UNIQUE(user_id, question_key); importance 1-5;
--     active flag; source IN ('quiz','auto_extracted','manual_edit').
--   * Existing UI: src/components/persona/MommyDossierQuiz.tsx (single-
--     question form), MommyDossierBanner.tsx (Today nudge).
--     src/lib/persona/mommy-dossier-questions.ts hardcodes 23 questions.
--     The banner is the only shipped path; the user never finished it.
--   * Consumers — what reads mommy_dossier today:
--       - api/handler/chat.ts:124 — pulls importance >= 3, orders by
--         importance desc, injects into the Mommy chat system prompt as
--         "WHAT MAMA KNOWS ABOUT HER".
--       - mommy-recall (supabase/functions/mommy-recall) does NOT read
--         mommy_dossier — it pulls from memory_implants instead.
--       - mommy-tease (supabase/functions/mommy-tease) does NOT read
--         mommy_dossier either; it reads memory_implants.
--       - mommy-scheme + _shared/mommy-hardening-context.ts have no direct
--         read either; chat.ts is the lone consumer right now.
--     So the impact of filling the dossier today is concentrated in chat.
--     mommy-recall / mommy-tease / mommy-scheme become candidates for a
--     follow-up wiring change, not blocked by this migration.
--   * Gaps this migration fills:
--       - dossier_questions: shared catalog of seedable questions with
--         phase / intensity gates and priority ordering.
--       - dossier_question_responses: per-user delivery + answer log so a
--         drip cron can pace questions, mark skips, and never re-ask
--         skipped questions for 14 days.
--   * The existing src/lib/persona/mommy-dossier-questions.ts hardcoded
--     bank stays in place (it powers the MommyDossierQuiz component as a
--     fallback when DB seed isn't loaded yet); the seed in 302 mirrors
--     and extends it to 5-6 per category.

CREATE TABLE IF NOT EXISTS dossier_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Stable identifier; written into mommy_dossier.question_key on answer.
  question_key TEXT NOT NULL UNIQUE,
  category TEXT NOT NULL CHECK (category IN (
    'gina', 'name', 'body', 'confession_seed', 'resistance',
    'turn_ons', 'turn_offs', 'history', 'preferences'
  )),
  question_text TEXT NOT NULL,
  -- Optional placeholder/help text rendered beneath the prompt.
  placeholder TEXT,
  expected_response_kind TEXT NOT NULL DEFAULT 'text' CHECK (
    expected_response_kind IN ('text', 'single_choice', 'multi_choice', 'numeric', 'yes_no')
  ),
  -- For choice-style questions: array of { value, label } objects.
  choices JSONB,
  -- Phase gate: never asked when user_state.current_phase < phase_min.
  phase_min INT NOT NULL DEFAULT 0 CHECK (phase_min BETWEEN 0 AND 5),
  -- Intensity gate. Maps to user_state.escalation_level:
  --   1-2 -> gentle, 3-4 -> firm, 5 -> cruel
  -- Question only asked when current intensity >= intensity_min.
  intensity_min TEXT NOT NULL DEFAULT 'gentle' CHECK (
    intensity_min IN ('gentle', 'firm', 'cruel')
  ),
  -- Lower priority surfaces earlier (1 = most urgent).
  priority INT NOT NULL DEFAULT 50,
  -- importance copied into mommy_dossier on answer.
  importance INT NOT NULL DEFAULT 3 CHECK (importance BETWEEN 1 AND 5),
  tone TEXT NOT NULL DEFAULT 'soft' CHECK (tone IN ('soft', 'direct', 'filthy')),
  input_length TEXT NOT NULL DEFAULT 'long' CHECK (input_length IN ('short', 'long')),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_dossier_questions_active_priority
  ON dossier_questions (active, priority);
CREATE INDEX IF NOT EXISTS idx_dossier_questions_category
  ON dossier_questions (category, active);

ALTER TABLE dossier_questions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS dossier_questions_read ON dossier_questions;
CREATE POLICY dossier_questions_read ON dossier_questions
  FOR SELECT USING (true);
DROP POLICY IF EXISTS dossier_questions_service ON dossier_questions;
CREATE POLICY dossier_questions_service ON dossier_questions
  FOR ALL TO service_role USING (true) WITH CHECK (true);


-- Per-user delivery + answer log. One row per delivery event; re-asking
-- a previously-skipped question after the 14d cooldown creates a new row.
CREATE TABLE IF NOT EXISTS dossier_question_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  question_id UUID NOT NULL REFERENCES dossier_questions(id) ON DELETE CASCADE,
  -- Denormalized so callers can match by key without an extra join.
  question_key TEXT NOT NULL,
  delivered_at TIMESTAMPTZ,
  answered_at TIMESTAMPTZ,
  response_text TEXT,
  response_choices JSONB,
  skipped BOOLEAN NOT NULL DEFAULT FALSE,
  skip_reason TEXT,
  -- Binds the response row back to the outreach card that surfaced it,
  -- so the answer UI can ack the right outreach on submit.
  outreach_id UUID REFERENCES handler_outreach_queue(id) ON DELETE SET NULL,
  source TEXT NOT NULL DEFAULT 'drip' CHECK (source IN ('drip', 'catchup', 'manual')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_dossier_qresp_user_delivered
  ON dossier_question_responses (user_id, delivered_at DESC);
CREATE INDEX IF NOT EXISTS idx_dossier_qresp_user_question
  ON dossier_question_responses (user_id, question_id);
CREATE INDEX IF NOT EXISTS idx_dossier_qresp_skipped
  ON dossier_question_responses (user_id, skipped, updated_at DESC) WHERE skipped;
CREATE INDEX IF NOT EXISTS idx_dossier_qresp_pending
  ON dossier_question_responses (user_id, delivered_at)
  WHERE answered_at IS NULL AND skipped = FALSE;

CREATE OR REPLACE FUNCTION trg_dossier_qresp_updated()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END;
$$;
DROP TRIGGER IF EXISTS dossier_qresp_updated_at ON dossier_question_responses;
CREATE TRIGGER dossier_qresp_updated_at
  BEFORE UPDATE ON dossier_question_responses
  FOR EACH ROW EXECUTE FUNCTION trg_dossier_qresp_updated();

ALTER TABLE dossier_question_responses ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS dossier_qresp_owner ON dossier_question_responses;
CREATE POLICY dossier_qresp_owner ON dossier_question_responses
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS dossier_qresp_service ON dossier_question_responses;
CREATE POLICY dossier_qresp_service ON dossier_question_responses
  FOR ALL TO service_role USING (true) WITH CHECK (true);
