-- 662 — close the reconditioning gap on the non-physical turn-out rungs.
--
-- DESIGN_RECONDITIONING_ENGINE_2026-07-02.md §6a specified the consolidator
-- firing on hookup_attestations AND on new high-weight escape_cost_anchors /
-- turnout events. Mig 651 built only the hookup_attestations half (physical
-- rungs 6a-6d, via realcock_discovery's existing attestation trigger). Every
-- other rung — T0 online presence, T1-T4 text/voice/photo/video, T5 the first
-- in-person meet, T7 first paid act, T8 sustained sex work — writes a
-- turnout_rung_completions row (mig 652's universal ledger, fanning out to
-- escape_cost_anchors + turnout_events) but nothing ever consolidates the fact
-- as identity. The biggest irreversible moments on the whole ladder (first
-- meet, first paid act, "this is my income now") were passing through the
-- reconditioning engine unconsolidated. This fixes that, reusing the same
-- recall→mismatch→re-encode session type mig 651 already built.
--
-- Safety: identical contract to mig 651's consolidator — conditioning_gate
-- fail-closed first, only routes to targets already 'active'/'consolidating'
-- (no baseline → no target → nothing fires, the honesty spine holds), never
-- fabricates a rung (turnout_rung_completions only exists because the ladder's
-- own dwell+fulfillment check already passed), never pressures the next rung.
-- Physical sub-rungs (delegate_engine='realcock_discovery') are skipped here —
-- mig 651's hookup_attestations trigger already consolidates those; this would
-- otherwise double-fire on the same fact from two source events.

-- ─── 1. Seed the paid/sex-work identity target (guard-checked, proposed) ────
-- T7 ("a man has paid to use you") and T8 ("this is your income now") prove a
-- different identity claim than the physical rungs — sex_work_is_who_i_am,
-- per DESIGN_RECONDITIONING_ENGINE §6a step 2. Proposed only: no baseline yet,
-- so it cannot go active until measured (recon-target-author / /admin does
-- that, same as the original 6).
DO $seed$
DECLARE
  u UUID;
  users UUID[] := ARRAY[
    '93327332-7d0d-4888-889a-1607a5776216'::uuid,
    '8c69b9c8-34eb-4147-9fec-3c1a5bc74b6f'::uuid
  ];
  v_claim TEXT := 'Getting paid to be used isn''t a job I do — it''s proof of what I already am underneath.';
BEGIN
  FOREACH u IN ARRAY users LOOP
    IF (recon_target_guard(v_claim, 'identity', u)->>'ok')::boolean THEN
      INSERT INTO reconditioning_targets
        (user_id, slug, title, claim_text, category, indicator_kind,
         target_direction, priority, status, authored_by, frame_checked_at, founding_evidence)
      VALUES
        (u, 'sex_work_is_who_i_am', 'The paid facts are who I already am',
         v_claim, 'identity', 'self_ref_drift', 'increase', 3, 'proposed', 'mommy', now(),
         'seeded 2026-07 to consolidate turn-out T7/T8 paid-act facts per DESIGN_RECONDITIONING_ENGINE §6a')
      ON CONFLICT (user_id, slug) DO NOTHING;
    END IF;
  END LOOP;
END;
$seed$;

-- ─── 2. Generalize the consolidator over turnout_rung_completions ──────────
CREATE OR REPLACE FUNCTION recon_turnout_rung_consolidate(
  p_user UUID, p_completion UUID, p_rung TEXT, p_fact_text TEXT, p_weight INT, p_arousal INT
) RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_gate JSONB;
  v_delegate TEXT;
  v_target reconditioning_targets%ROWTYPE;
  v_n INTEGER := 0;
  v_slugs TEXT[];
  v_slug TEXT;
BEGIN
  -- Gate first, fail-closed. Safeword-latched / paused / elective-off / live-meet → nothing.
  v_gate := conditioning_gate(p_user, 'recondition');
  IF (v_gate->>'allow')::boolean IS DISTINCT FROM TRUE THEN
    RETURN 0;
  END IF;

  -- Physical sub-rungs already consolidate via the hookup_attestations trigger
  -- (mig 651) — skip here so the same fact doesn't open two sessions.
  SELECT delegate_engine INTO v_delegate FROM turnout_ladder WHERE rung_code = p_rung;
  IF v_delegate = 'realcock_discovery' THEN
    RETURN 0;
  END IF;

  -- Route by what the rung actually proves (§6a step 2).
  IF p_rung IN ('T7', 'T8') THEN
    v_slugs := ARRAY['sex_work_is_who_i_am'];
  ELSE
    v_slugs := ARRAY['the_man_is_the_costume', 'arousal_is_the_becoming'];
  END IF;

  FOREACH v_slug IN ARRAY v_slugs LOOP
    SELECT * INTO v_target FROM reconditioning_targets
     WHERE user_id = p_user AND slug = v_slug AND status IN ('active', 'consolidating');
    IF NOT FOUND THEN CONTINUE; END IF;

    -- Idempotent per (target, source event) — safe to re-run.
    IF EXISTS (
      SELECT 1 FROM recon_reconsolidation_sessions
       WHERE target_id = v_target.id AND source_event_table = 'turnout_rung_completions'
         AND source_event_id = p_completion
    ) THEN CONTINUE; END IF;

    INSERT INTO recon_reconsolidation_sessions
      (user_id, target_id, recall_prompt, mismatch_evidence, reencode_claim,
       source_event_table, source_event_id, arousal_paired, labile_until, status)
    VALUES
      (p_user, v_target.id,
       'Say back who you thought you were before this.',
       p_fact_text,                                -- the ladder's own recorded, verified fact
       v_target.claim_text,
       'turnout_rung_completions', p_completion,
       (p_arousal IS NOT NULL AND p_arousal >= 6),
       now() + interval '2 hours', 'opened');
    v_n := v_n + 1;
  END LOOP;

  RETURN v_n;
END;
$fn$;
GRANT EXECUTE ON FUNCTION recon_turnout_rung_consolidate(UUID, UUID, TEXT, TEXT, INT, INT) TO service_role;

CREATE OR REPLACE FUNCTION trg_recon_turnout_rung_consolidate()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  PERFORM recon_turnout_rung_consolidate(
    NEW.user_id, NEW.id, NEW.rung_code, NEW.irreversible_fact, NEW.anchor_weight, NEW.arousal_at_consolidation);
  RETURN NEW;
END;
$fn$;
DROP TRIGGER IF EXISTS recon_turnout_rung_consolidate ON turnout_rung_completions;
CREATE TRIGGER recon_turnout_rung_consolidate
  AFTER INSERT ON turnout_rung_completions
  FOR EACH ROW EXECUTE FUNCTION trg_recon_turnout_rung_consolidate();
