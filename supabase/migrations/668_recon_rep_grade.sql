-- 668 — close the SM-2-lite retrieval-practice grading loop (DESIGN_RECONDITIONING
-- §2.2). recon_rep_schedule rows are created (recon-reconsolidation's micro-rep,
-- and future mantra-ladder cards) with reps=0/lapses=0 and are picked up as "due"
-- by recon-program-orchestrator's reinforce phase — but nothing ever grades them:
-- next_due_at/ease/interval_days never move, so the same due card re-surfaces
-- forever and `habit_adherence` (a live indicator_kind recon-target-author can
-- already choose) has no data to compute — the same "no signal, stuck forever"
-- trap mig 656/667 closed for belief_slider/assoc_latency, this time for the
-- retrieval-practice scheduler itself.
--
-- Grading is a plain self-report (did the retrieval land, or did she blank?) —
-- the same trust level as fulfilling any other decree, no invented LLM judgment.
-- SM-2-lite: correct retrieval expands the interval using the OLD ease, then
-- bumps ease for next time; a miss halves the interval, drops ease, and re-dues
-- tomorrow (contraction, per §2.2 — "a miss/contradiction contracts it").

CREATE OR REPLACE FUNCTION recon_rep_grade(p_rep_id UUID, p_user UUID, p_correct BOOLEAN)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_row recon_rep_schedule%ROWTYPE;
  v_ease NUMERIC;
  v_interval NUMERIC;
BEGIN
  SELECT * INTO v_row FROM recon_rep_schedule WHERE id = p_rep_id AND user_id = p_user;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_found');
  END IF;

  IF p_correct THEN
    v_interval := LEAST(GREATEST(1, v_row.interval_days * v_row.ease), 60);
    v_ease := LEAST(v_row.ease + 0.15, 3.5);
    UPDATE recon_rep_schedule SET
      reps = reps + 1, ease = v_ease, interval_days = v_interval,
      next_due_at = now() + (v_interval || ' days')::interval,
      last_reviewed_at = now()
    WHERE id = p_rep_id;
  ELSE
    v_interval := GREATEST(1, v_row.interval_days * 0.5);
    v_ease := GREATEST(v_row.ease - 0.3, 1.3);
    UPDATE recon_rep_schedule SET
      lapses = lapses + 1, ease = v_ease, interval_days = v_interval,
      next_due_at = now() + interval '1 day',
      last_reviewed_at = now()
    WHERE id = p_rep_id;
  END IF;

  RETURN jsonb_build_object('ok', true, 'correct', p_correct, 'interval_days', v_interval, 'ease', v_ease);
END;
$fn$;

GRANT EXECUTE ON FUNCTION recon_rep_grade(UUID, UUID, BOOLEAN) TO authenticated, service_role;
