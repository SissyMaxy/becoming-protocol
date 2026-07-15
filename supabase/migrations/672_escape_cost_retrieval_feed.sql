-- 672 — feed high-weight escape_cost_anchors into the spaced-retrieval deck.
--
-- DESIGN_RECONDITIONING_ENGINE_2026-07-02.md §6a step 4: "Anchor the
-- irreversibility as a durable retrieval cue. The escape_cost_anchors row
-- becomes a permanent reconsolidation trigger: it feeds the target's
-- spaced-retrieval deck ('what did you do that a man can never un-see')...
-- Escape-cost weight climbs monotonically — the engine surfaces the
-- accumulated fact-set... never a fabricated one."
--
-- Mig 651/662 already consolidate turn-out ladder events (hookup_attestations,
-- turnout_rung_completions) into ONE-TIME recall→mismatch→re-encode
-- reconsolidation sessions. This closes the other named half of §6a step 4 —
-- the SPACED-RETRIEVAL half (§2.2, distinct mechanism, reuse-heavy) — for the
-- pre-ladder legacy escape-cost kinds §1.2/§6a name directly (realcock_encounter,
-- permanent_body_mod, public_post, cuckqueen_phase) that otherwise never feed
-- anything past the /admin ledger. 'turnout_rung' kind anchors are intentionally
-- left to mig662's richer, rung-aware consolidator — this does not touch them,
-- avoiding a redundant second consumer of the same fact.
--
-- Honesty: only fires past the escape_cost_require_grounding gate (mig 663),
-- so every card quotes a real, already-recorded, verified fact — never invented.
-- The card is a cued-retrieval stem (first few words of her own grounded
-- description) with the full description as answer_key, mirroring
-- recon-reconsolidation's fireMicroRep lead-in shape exactly. It rides the
-- SAME orchestrator/grading/UI path as every other recon_rep_schedule row —
-- no new edge fn, no new client code: recon-program-orchestrator's reinforce-
-- phase query and HandlerDecreeCard's recon_rep: parser are already
-- card_kind-agnostic.
--
-- Invitational, not penalty-bearing (§3.3/§6.4) — a card that never gets
-- reviewed just sits due; no obligation rides on it.

ALTER TABLE recon_rep_schedule DROP CONSTRAINT IF EXISTS recon_rep_schedule_card_kind_check;
ALTER TABLE recon_rep_schedule ADD CONSTRAINT recon_rep_schedule_card_kind_check
  CHECK (card_kind IN ('mantra','reframe','if_then','escape_cost'));

CREATE OR REPLACE FUNCTION recon_escape_cost_feed_retrieval(
  p_user UUID, p_anchor UUID, p_kind TEXT, p_weight INT, p_description TEXT
) RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_gate JSONB;
  v_target reconditioning_targets%ROWTYPE;
  v_n INTEGER := 0;
  v_slugs TEXT[] := ARRAY['the_man_is_the_costume','arousal_is_the_becoming'];
  v_slug TEXT;
  v_desc TEXT := trim(coalesce(p_description, ''));
  v_words TEXT[];
  v_leadin TEXT;
BEGIN
  -- Kind + weight gate: only the named high-weight deed-anchors (§1.2/§6a).
  -- 'turnout_rung' is deliberately excluded — mig662 already consolidates it.
  IF p_kind NOT IN ('realcock_encounter','permanent_body_mod','public_post','cuckqueen_phase') THEN
    RETURN 0;
  END IF;
  IF p_weight < 5 OR v_desc = '' THEN
    RETURN 0;
  END IF;

  -- Gate first, fail-closed. Safeword-latched / paused / elective-off → nothing.
  v_gate := conditioning_gate(p_user, 'recondition');
  IF (v_gate->>'allow')::boolean IS DISTINCT FROM TRUE THEN
    RETURN 0;
  END IF;

  v_words := regexp_split_to_array(v_desc, '\s+');
  v_leadin := array_to_string(
    v_words[1 : LEAST(5, GREATEST(1, array_length(v_words, 1) - 1))], ' ');

  FOREACH v_slug IN ARRAY v_slugs LOOP
    SELECT * INTO v_target FROM reconditioning_targets
     WHERE user_id = p_user AND slug = v_slug AND status IN ('active','consolidating');
    IF NOT FOUND THEN CONTINUE; END IF;

    -- Idempotent per (target, anchor) — safe to re-run.
    IF EXISTS (
      SELECT 1 FROM recon_rep_schedule WHERE target_id = v_target.id AND card_ref = p_anchor
    ) THEN CONTINUE; END IF;

    INSERT INTO recon_rep_schedule
      (user_id, target_id, card_kind, card_ref, prompt, answer_key,
       next_due_at, interval_days, ease, reps, lapses)
    VALUES
      (p_user, v_target.id, 'escape_cost', p_anchor,
       v_leadin || '…', v_desc,
       now(), 1, 2.5, 0, 0);
    v_n := v_n + 1;
  END LOOP;

  RETURN v_n;
END;
$fn$;
GRANT EXECUTE ON FUNCTION recon_escape_cost_feed_retrieval(UUID, UUID, TEXT, INT, TEXT) TO service_role;

CREATE OR REPLACE FUNCTION trg_recon_escape_cost_feed_retrieval()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  PERFORM recon_escape_cost_feed_retrieval(NEW.user_id, NEW.id, NEW.anchor_kind, NEW.anchor_weight, NEW.description);
  RETURN NEW;
END;
$fn$;
DROP TRIGGER IF EXISTS recon_escape_cost_feed_retrieval ON escape_cost_anchors;
CREATE TRIGGER recon_escape_cost_feed_retrieval
  AFTER INSERT ON escape_cost_anchors
  FOR EACH ROW EXECUTE FUNCTION trg_recon_escape_cost_feed_retrieval();
