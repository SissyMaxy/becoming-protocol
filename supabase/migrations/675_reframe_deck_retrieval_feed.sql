-- 675 — feed the narrative_reframings deck into the spaced-retrieval schedule.
--
-- DESIGN_RECONDITIONING_ENGINE_2026-07-02.md §2.7: "add target_id to
-- narrative_reframings. Each target owns a small deck of reframe cards (old
-- thought → Mommy-frame). These become retrieval reps in §2.2's schedule
-- (she supplies the reframe, not reads it)."
--
-- Mig 650 added the nullable narrative_reframings.recon_target_id column but
-- nothing has ever set it, and nothing has ever read it — the three reframe
-- authors (handler-evolve, handler-outreach-auto, handler-autonomous journal
-- reframer) all write real, voice-gated reframe cards with no target linkage,
-- while recon-reconsolidation's card_kind='reframe' rows are a DIFFERENT,
-- already-built mechanism (self-generated reencode_claim text from a
-- reconsolidation session, not the reframe deck at all). This closes the
-- other, still-dead half of §2.7 — the actual authored reframe deck — using
-- the exact reuse-first shape mig 672/673/674 already established for other
-- half-wired columns: an AFTER INSERT trigger that classifies and feeds,
-- no new edge function, no new client code.
--
-- AFTER INSERT (not BEFORE): the voice-gate trigger (mig 532/548) is a
-- BEFORE INSERT trigger that RETURNs NULL to silently cancel a bad-voice
-- row. Firing after insert guarantees we only ever schedule a retrieval rep
-- for a reframe that actually survived the voice gate.
--
-- Classification is a plain angle→slug table, not an LLM call — cheap,
-- deterministic, auditable. Only the two targets whose claim is actually
-- about self-narrative/interpretation (identity + belief) receive reframe
-- reps; the habit/association targets (voice_is_hers, cage_is_home,
-- service_is_reflex, arousal_is_the_becoming) don't fit reframe content and
-- are left alone. Identity-category linkage is additionally gated on
-- ego_mechanic_active(uid,'recall_corrector') — mirroring the same
-- self-narrative double-gate recon-reconsolidation already enforces for the
-- identity target, applied consistently here rather than re-litigated.

CREATE OR REPLACE FUNCTION recon_reframe_angle_target_slug(p_angle TEXT)
RETURNS TEXT LANGUAGE sql IMMUTABLE AS $fn$
  SELECT CASE p_angle
    WHEN 'feminine_essence'    THEN 'the_man_is_the_costume'
    WHEN 'authentic_self'      THEN 'the_man_is_the_costume'
    WHEN 'body_signal'         THEN 'the_man_is_the_costume'
    WHEN 'body_betrayal'       THEN 'the_man_is_the_costume'
    WHEN 'inevitable_arc'      THEN 'the_man_is_the_costume'
    WHEN 'sissification_path'  THEN 'the_man_is_the_costume'
    WHEN 'suppression_evidence' THEN 'mommy_owns_the_want'
    WHEN 'hrt_urgency'         THEN 'mommy_owns_the_want'
    WHEN 'pattern_recognition' THEN 'mommy_owns_the_want'
    WHEN 'timeline_reflection' THEN 'mommy_owns_the_want'
    WHEN 'consistency_thread'  THEN 'mommy_owns_the_want'
    WHEN 'deeper_meaning'      THEN 'mommy_owns_the_want'
    ELSE NULL
  END;
$fn$;

CREATE OR REPLACE FUNCTION recon_reframe_feed_retrieval(p_row narrative_reframings)
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_gate JSONB;
  v_slug TEXT;
  v_target reconditioning_targets%ROWTYPE;
  v_text TEXT := trim(coalesce(p_row.reframed_text, ''));
  v_words TEXT[];
  v_leadin TEXT;
BEGIN
  IF p_row.recon_target_id IS NOT NULL OR v_text = '' THEN
    RETURN 0;
  END IF;

  v_slug := recon_reframe_angle_target_slug(p_row.reframe_angle);
  IF v_slug IS NULL THEN
    RETURN 0;
  END IF;

  -- Gate first, fail-closed. Safeword-latched / paused / elective-off → nothing.
  v_gate := conditioning_gate(p_row.user_id, 'recondition');
  IF (v_gate->>'allow')::boolean IS DISTINCT FROM TRUE THEN
    RETURN 0;
  END IF;

  SELECT * INTO v_target FROM reconditioning_targets
   WHERE user_id = p_row.user_id AND slug = v_slug AND status IN ('active', 'consolidating');
  IF NOT FOUND THEN
    RETURN 0;
  END IF;

  -- Self-narrative double-gate: identity-category linkage requires the ego
  -- opt-in, same as recon-reconsolidation already enforces.
  IF v_target.category = 'identity' AND NOT ego_mechanic_active(p_row.user_id, 'recall_corrector') THEN
    RETURN 0;
  END IF;

  UPDATE narrative_reframings SET recon_target_id = v_target.id WHERE id = p_row.id;

  v_words := regexp_split_to_array(v_text, '\s+');
  v_leadin := array_to_string(v_words[1 : LEAST(6, GREATEST(1, array_length(v_words, 1) - 1))], ' ');

  INSERT INTO recon_rep_schedule
    (user_id, target_id, card_kind, card_ref, prompt, answer_key,
     next_due_at, interval_days, ease, reps, lapses)
  VALUES
    (p_row.user_id, v_target.id, 'reframe', p_row.id,
     'Finish Mommy''s reframe, in your own words — no peeking: "' || v_leadin || '…"', v_text,
     now(), 1, 2.5, 0, 0);

  RETURN 1;
END;
$fn$;
GRANT EXECUTE ON FUNCTION recon_reframe_feed_retrieval(narrative_reframings) TO service_role;

CREATE OR REPLACE FUNCTION trg_recon_reframe_feed_retrieval()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  PERFORM recon_reframe_feed_retrieval(NEW);
  RETURN NEW;
END;
$fn$;
DROP TRIGGER IF EXISTS recon_reframe_feed_retrieval ON narrative_reframings;
CREATE TRIGGER recon_reframe_feed_retrieval
  AFTER INSERT ON narrative_reframings
  FOR EACH ROW EXECUTE FUNCTION trg_recon_reframe_feed_retrieval();
