-- 663 — escape_cost_anchors: a deed-anchor must be grounded in a real event.
--
-- Found 2026-07-04: a user's "on the record" showed 47, but ALL 47 anchors had
-- reference_id = NULL — seed/roleplay data, no real events. Among them a
-- realcock_encounter ("a man has watched you") and a permanent_body_mod (actually
-- a kneel-endurance decree, mislabeled). The BecomingHero surfaced this as
-- "only goes up" like a real ledger, and the reconditioning/turn-out engines
-- consolidate these as IDENTITY — so a fabricated anchor conditions her on a lie.
-- That is the deepest violation of the no-fabrication floor.
--
-- Cleaned the seed data already. This guard prevents recurrence: any anchor whose
-- kind asserts a discrete real-world deed MUST carry a reference_id to the event
-- that produced it. Aggregate/derived kinds (dollars_spent, milestone_hit,
-- fem_name_use) may remain reference-less.

CREATE OR REPLACE FUNCTION trg_escape_cost_require_grounding()
RETURNS TRIGGER LANGUAGE plpgsql AS $fn$
BEGIN
  IF NEW.reference_id IS NULL AND NEW.anchor_kind IN (
    'realcock_encounter','permanent_body_mod','public_post','cuckqueen_phase',
    'turnout_rung','voice_debrief','gina_disclosure_rung','photo_proof',
    'decree_fulfilled','provider_research'
  ) THEN
    RAISE EXCEPTION 'escape_cost_anchors: % must reference a real event (reference_id); an ungrounded deed-anchor is fabrication', NEW.anchor_kind
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS escape_cost_require_grounding ON escape_cost_anchors;
CREATE TRIGGER escape_cost_require_grounding
  BEFORE INSERT ON escape_cost_anchors
  FOR EACH ROW EXECUTE FUNCTION trg_escape_cost_require_grounding();
