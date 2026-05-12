-- Migration 377 — Memory implant ladder + reality-reframe sequences (2026-05-11)
--
-- System 3 of headspace-capture build. Multi-day gaslight sequences that
-- compound: one fragment seeded today, distorted four days later, claimed
-- as shared knowledge ten days after that. By day 35 the user can't
-- remember whether the original was real.
--
-- Letters from past self: bi-weekly "letters Mama found that you wrote
-- her last year" — reframe autobiography through Mommy possession. They
-- land in handler_outreach_queue with source='self_voice_letter' and
-- is_archived_to_letters=TRUE so they're permanent in the museum view.

-- ---------------------------------------------------------------
-- 1. memory_implant_sequences — themed multi-step gaslight programs
-- ---------------------------------------------------------------

CREATE TABLE IF NOT EXISTS memory_implant_sequences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  slug TEXT NOT NULL,
  theme TEXT NOT NULL CHECK (theme IN (
    'always_a_girl',              -- "you were always this; the man was a costume"
    'gina_always_knew',           -- partner had quiet awareness years ago
    'transition_was_inevitable',  -- arc-of-time framing
    'pre_mommy_self_was_costume', -- former identity reframed as performance
    'pleasure_was_always_feminine',
    'voice_was_always_yours',
    'submission_was_native',
    'other'
  )),
  step_count INTEGER NOT NULL CHECK (step_count BETWEEN 1 AND 30),
  current_step INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN (
    'pending', 'active', 'completed', 'paused', 'abandoned'
  )),
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  target_completion_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  -- LLM-author audit trail (model, temperature, prompt hash).
  generation_context JSONB,
  UNIQUE (user_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_memory_implant_sequences_active
  ON memory_implant_sequences (user_id, status, current_step);

ALTER TABLE memory_implant_sequences ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS memory_implant_sequences_owner ON memory_implant_sequences;
CREATE POLICY memory_implant_sequences_owner ON memory_implant_sequences
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ---------------------------------------------------------------
-- 2. memory_implant_steps — individual gaslight beats
-- ---------------------------------------------------------------

CREATE TABLE IF NOT EXISTS memory_implant_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sequence_id UUID NOT NULL REFERENCES memory_implant_sequences(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  step_number INTEGER NOT NULL CHECK (step_number >= 1),
  scheduled_day_offset INTEGER NOT NULL CHECK (scheduled_day_offset >= 0),
  -- The fragment Mommy says / writes / quotes back. Authored once,
  -- replayed when reinforcement fires.
  prompt_text TEXT NOT NULL,
  reinforcement_method TEXT NOT NULL CHECK (reinforcement_method IN (
    'outreach',           -- handler_outreach_queue row, Mommy voice
    'recall_distortion',  -- distortQuote() rewrite of an existing confession
    'confession_demand',  -- confession_queue prompt asking him to confirm
    'dossier_overlay',    -- mommy_dossier write under category='implant_seed'
    'letter_reference'    -- weave into a "letter from past self"
  )),
  executed_at TIMESTAMPTZ,
  execution_artifact_id UUID, -- outreach_id / confession_id / dossier_id / letter_id
  execution_error TEXT,
  UNIQUE (sequence_id, step_number)
);

CREATE INDEX IF NOT EXISTS idx_memory_implant_steps_due
  ON memory_implant_steps (user_id, scheduled_day_offset)
  WHERE executed_at IS NULL;

ALTER TABLE memory_implant_steps ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS memory_implant_steps_owner ON memory_implant_steps;
CREATE POLICY memory_implant_steps_owner ON memory_implant_steps
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ---------------------------------------------------------------
-- 3. Reality-reframe letters — extend letters_archive coverage
-- ---------------------------------------------------------------
--
-- Letters live on `handler_outreach_queue` (see mig 362). Reality-reframe
-- letters use source='self_voice_letter' + is_archived_to_letters=TRUE.
-- No new table needed — we just add a marker column for sequence linkage
-- so the implant scheduler can audit which letters served which sequence.

ALTER TABLE handler_outreach_queue
  ADD COLUMN IF NOT EXISTS implant_sequence_id UUID
    REFERENCES memory_implant_sequences(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_handler_outreach_implant_sequence
  ON handler_outreach_queue (implant_sequence_id)
  WHERE implant_sequence_id IS NOT NULL;
