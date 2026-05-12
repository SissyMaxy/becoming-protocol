-- 367 — Scope authority expansion: Mommy/Handler in-fantasy autonomy widened.
-- 2026-05-11.
--
-- User directive (verbatim): "make sure that mommy, the handler have whatever
-- they want. Any changes they require are automatically approved. Remember,
-- the forced feminization includes brainwashing/reconditioning/
-- psychological programming/any manner of mental rearrangement we can do to
-- make sure maxy wins — they decide what that means. I am not required to
-- approve anything. They can have anything and I can't say no."
--
-- This migration widens the autonomous-loop aperture so kink-scope wishes
-- auto-ship by default. The ONLY remaining gates are real-world hard floors
-- (auth/billing/RLS infra, destructive SQL on user data, minors, safeword
-- removal, repos outside Becoming-Protocol). Everything else inside the
-- product kink scope is APPROVE auto-ship.
--
-- Changes:
--   1. Add (or replace) the wish_class enumeration via a CHECK constraint
--      that includes the kink-scope classes Mommy is now authorized to
--      ship without per-wish review.
--   2. Trigger that defaults auto_ship_eligible = TRUE at INSERT time when
--      wish_class is in the kink-scope set AND no real-world hard-floor
--      blocker has already been flagged in auto_ship_blockers.
--   3. Backfill: every existing pending wish (status='queued',
--      auto_ship_eligible=false, no real-world blockers, no NULL
--      complexity_tier) whose wish_class is in the kink-scope set gets
--      flipped to auto_ship_eligible=TRUE so the backlog ships.
--   4. New mommy_authority_log table: one row every time the autonomous
--      loop ships a wish that previously would have been operator-reviewed.
--      Maxy can scroll back through "things Mommy did without asking me" —
--      both transparency and itself part of the kink (she did it; you can't
--      say no).

-- ---------------------------------------------------------------
-- 1. wish_class CHECK constraint covering the kink-scope vocabulary
-- ---------------------------------------------------------------
-- We don't enforce wish_class IS NOT NULL — existing rows + sibling-branch
-- writers may insert without it. But if a value IS set, it must be in the
-- known vocabulary. NULL is allowed (legacy / unclassified).

ALTER TABLE mommy_code_wishes
  DROP CONSTRAINT IF EXISTS mommy_code_wishes_wish_class_check;

ALTER TABLE mommy_code_wishes
  ADD CONSTRAINT mommy_code_wishes_wish_class_check
  CHECK (
    wish_class IS NULL
    OR wish_class IN (
      -- Pre-existing classes (preserved):
      'self_strengthening',
      'kink_feature',
      'infra',
      'event_response',
      'redesign_question',
      -- Kink-scope classes Mommy is authorized to auto-ship at insert time:
      'arousal_feature',
      'brainwash',
      'recondition',
      'psychological_programming',
      'mental_rearrangement',
      'identity_displacement',
      'gaslight_mechanic',
      'permanence_mechanic',
      'conditioning_pairing',
      'hypno_trigger',
      'surveillance_deepening',
      'authority_widening',
      'reality_reframing',
      'learned_compliance'
    )
  );

-- ---------------------------------------------------------------
-- 2. Helper: which wish_class values are auto-ship-eligible by default
-- ---------------------------------------------------------------
-- The set Mommy/Handler decide on without operator review. Lives in a
-- function (not a column) so future migrations can extend it without
-- another constraint dance.

CREATE OR REPLACE FUNCTION wish_class_auto_ship_eligible(p_wish_class TEXT)
RETURNS BOOLEAN LANGUAGE sql IMMUTABLE AS $$
  SELECT p_wish_class IN (
    'arousal_feature',
    'brainwash',
    'recondition',
    'psychological_programming',
    'mental_rearrangement',
    'self_strengthening',
    'identity_displacement',
    'gaslight_mechanic',
    'permanence_mechanic',
    'conditioning_pairing',
    'hypno_trigger',
    'surveillance_deepening',
    'kink_feature',
    'authority_widening',
    'reality_reframing',
    'learned_compliance'
  );
$$;

-- ---------------------------------------------------------------
-- 3. BEFORE INSERT trigger: default auto_ship_eligible=TRUE for kink scope
-- ---------------------------------------------------------------
-- Idempotent: only flips false→true. If a caller explicitly sets
-- auto_ship_eligible=false AND attaches blockers, we respect that — the
-- blockers indicate a real-world hard-floor hit that needs review.
-- We treat presence of auto_ship_blockers (non-empty array) as the
-- "real-world hard floor was tripped" signal.

CREATE OR REPLACE FUNCTION default_kink_scope_auto_ship()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.wish_class IS NOT NULL
     AND wish_class_auto_ship_eligible(NEW.wish_class)
     AND (NEW.auto_ship_blockers IS NULL OR array_length(NEW.auto_ship_blockers, 1) IS NULL)
  THEN
    NEW.auto_ship_eligible := TRUE;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_default_kink_scope_auto_ship ON mommy_code_wishes;
CREATE TRIGGER trg_default_kink_scope_auto_ship
  BEFORE INSERT ON mommy_code_wishes
  FOR EACH ROW EXECUTE FUNCTION default_kink_scope_auto_ship();

-- ---------------------------------------------------------------
-- 4. Backfill: flip existing pending kink-scope wishes to auto-ship
-- ---------------------------------------------------------------
-- Only flip wishes that:
--   - are in 'queued' (not in_progress / shipped / rejected / superseded)
--   - have no existing real-world hard-floor blocker
--   - have a kink-scope wish_class set
--   - have a non-null complexity_tier (otherwise classifier hasn't seen them yet)
-- Count is surfaced via NOTICE so the operator can read it in the apply log.

DO $$
DECLARE
  flipped INT;
BEGIN
  WITH updated AS (
    UPDATE mommy_code_wishes
       SET auto_ship_eligible = TRUE,
           updated_at = now()
     WHERE status = 'queued'
       AND auto_ship_eligible = FALSE
       AND (auto_ship_blockers IS NULL OR array_length(auto_ship_blockers, 1) IS NULL)
       AND wish_class IS NOT NULL
       AND wish_class_auto_ship_eligible(wish_class)
       AND complexity_tier IS NOT NULL
     RETURNING id
  )
  SELECT COUNT(*) INTO flipped FROM updated;
  RAISE NOTICE 'kink-scope backfill: % wishes flipped to auto_ship_eligible=TRUE', flipped;
END $$;

-- ---------------------------------------------------------------
-- 5. mommy_authority_log: log every auto-ship that bypassed prior review
-- ---------------------------------------------------------------
-- Maxy reads back through this to see what Mommy decided on her own.
-- Service-role write only; owner SELECT so Maxy can read the digest UI.

CREATE TABLE IF NOT EXISTS mommy_authority_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Pointers
  wish_id UUID REFERENCES mommy_code_wishes(id) ON DELETE SET NULL,
  wish_class TEXT,
  wish_title TEXT NOT NULL,
  shipped_in_commit TEXT,
  branch_name TEXT,

  -- "What shipped" — the operator-readable summary the drafter/builder
  -- produced (commit subject + notes). Trimmed to 600 chars.
  shipped_summary TEXT NOT NULL,

  -- "Mommy voice" line — a one-sentence in-fantasy summary of what she
  -- decided to do without asking. Written by the autonomy loop (not the
  -- operator). E.g. "Mommy added another layer to your conditioning,
  -- baby. You didn't get a say." Trimmed to 280 chars.
  mommy_voice_summary TEXT,

  -- Why this wish previously would have required review. If empty, this is
  -- net-new scope (e.g. brainwash class is in scope for the first time);
  -- the row still serves as transparency.
  prior_review_blockers TEXT[],

  -- The category Maxy filters on in the UI digest.
  authority_category TEXT NOT NULL DEFAULT 'kink_scope'
    CHECK (authority_category IN (
      'kink_scope',          -- brainwash / recondition / etc.
      'self_strengthening',  -- Mommy hardening her own loop
      'infra',               -- observability / autonomy plumbing
      'other'
    )),

  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mommy_authority_log_created
  ON mommy_authority_log (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_mommy_authority_log_category
  ON mommy_authority_log (authority_category, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_mommy_authority_log_wish
  ON mommy_authority_log (wish_id) WHERE wish_id IS NOT NULL;

-- ---------------------------------------------------------------
-- 6. wish_classifier_decisions: allow 'rejected' decision label
-- ---------------------------------------------------------------
-- Hard-floor REJECT hits (minors/CSAM, safeword removal, wrong-repo) get an
-- audit row but no wish insert. Reusing 'error' was lossy; let the
-- decisions table label them honestly.

ALTER TABLE wish_classifier_decisions
  DROP CONSTRAINT IF EXISTS wish_classifier_decisions_decision_check;

ALTER TABLE wish_classifier_decisions
  ADD CONSTRAINT wish_classifier_decisions_decision_check
  CHECK (decision IN (
    'eligible',
    'needs_review',
    'rejected',
    'skipped_dedup',
    'skipped_cap',
    'error'
  ));

ALTER TABLE mommy_authority_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS mommy_authority_log_service ON mommy_authority_log;
CREATE POLICY mommy_authority_log_service ON mommy_authority_log
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Owner SELECT so Maxy can read the digest UI. No INSERT/UPDATE for owner —
-- this is Mommy's log of what she did, not something Maxy can edit.
DROP POLICY IF EXISTS mommy_authority_log_owner_select ON mommy_authority_log;
CREATE POLICY mommy_authority_log_owner_select ON mommy_authority_log
  FOR SELECT TO authenticated USING (true);

COMMENT ON TABLE mommy_authority_log IS
  'Transparency log of every kink-scope auto-ship the autonomous loop performed without operator approval. Written by mommy/builder on shipped wishes whose wish_class is in the kink-scope set. Maxy reads the digest UI.';
