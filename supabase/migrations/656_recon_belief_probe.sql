-- 656 — Belief-slider probe surface: close the honesty-spine gap for
-- belief_slider-indicator reconditioning targets (DESIGN_RECONDITIONING §5.2).
--
-- recon-measure (the weekly cron) explicitly skips belief_slider / assoc_latency
-- / self_ref_drift / habit_adherence indicators because they need a probe UI, not
-- computable data. The only place that ever recorded a belief_slider measurement
-- was ReconditioningPanel's probe controls, which live behind debug mode in
-- Settings — never in the daily flow. Result: `mommy_owns_the_want` (seeded in
-- mig 648, indicator_kind='belief_slider', priority 2) can never capture a
-- baseline, so it can never leave 'proposed' — "no baseline, no claim" (§5.4)
-- holds it hostage with no path forward, forever.
--
-- This adds the DB half of a real probe surface delivered as an ordinary decree
-- (see recon-program-orchestrator + HandlerDecreeCard/FocusMode): a genuine
-- slider, not a text box pretending to be one, and a single RPC that records the
-- measurement AND drives the program's phase machine off it using the identical
-- normalized-delta rule recon-measure applies server-side — so a probe answered
-- from the Focus card and one computed by the weekly cron never disagree.

-- ── 1. Widen handler_decrees.proof_type to add 'belief_slider' ──────────────
-- DROP+ADD only WIDENS the allowed set (mirrors mig 587's pattern) — cannot
-- violate any existing row, safe to re-run.
ALTER TABLE handler_decrees DROP CONSTRAINT IF EXISTS handler_decrees_proof_type_check;
ALTER TABLE handler_decrees ADD CONSTRAINT handler_decrees_proof_type_check
  CHECK (proof_type IN (
    'photo','video','audio','voice','text','journal_entry',
    'voice_pitch_sample','device_state','none','belief_slider'
  ));

-- ── 2. recon_record_measurement_and_advance ─────────────────────────────────
CREATE OR REPLACE FUNCTION recon_record_measurement_and_advance(
  p_user UUID, p_target UUID, p_indicator TEXT, p_value NUMERIC,
  p_method TEXT, p_is_baseline BOOLEAN DEFAULT FALSE, p_raw JSONB DEFAULT '{}'::jsonb
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_target reconditioning_targets%ROWTYPE;
  v_prog reconditioning_programs%ROWTYPE;
  v_meas_id UUID;
  v_to TEXT := NULL;
  v_advanced BOOLEAN := FALSE;
  v_norm_delta NUMERIC;
  v_dir INT;
  v_base NUMERIC;
BEGIN
  SELECT * INTO v_target FROM reconditioning_targets WHERE id = p_target AND user_id = p_user;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'recon_record_measurement_and_advance: target % not found for user %', p_target, p_user;
  END IF;

  SELECT * INTO v_prog FROM reconditioning_programs WHERE target_id = p_target;

  -- recon_record_measurement (mig 648) does the insert + baseline capture;
  -- reused verbatim so the two write paths can never drift apart.
  v_meas_id := recon_record_measurement(
    p_user, p_target, p_indicator, p_value, p_method,
    v_prog.phase, p_is_baseline, p_raw
  );

  -- Drive the phase machine only on a genuine re-measure while the program is
  -- actually sitting in 'measure' (§5.3: delta drives the machine, not the
  -- copy). Mirrors recon-measure's PROGRESS_EPSILON=0.02 normalized-delta rule.
  IF NOT p_is_baseline AND v_prog.id IS NOT NULL AND v_prog.status = 'running' AND v_prog.phase = 'measure' THEN
    v_dir := CASE WHEN v_target.target_direction = 'decrease' THEN -1 ELSE 1 END;
    v_base := NULLIF(v_target.baseline_value, 0);
    v_norm_delta := CASE WHEN v_base IS NULL THEN 0
                         ELSE ((p_value - v_target.baseline_value) / ABS(v_base)) * v_dir END;
    v_to := CASE
      WHEN v_norm_delta > 0.02 THEN
        (CASE WHEN COALESCE(v_prog.measures_held, 0) >= 1 THEN 'retain' ELSE 'reinforce' END)
      ELSE 'install' -- regression/flat → drop back (architecture wrong, not under-tuned)
    END;
    v_advanced := recon_program_advance(
      v_prog.id, v_to, 'recon_record_measurement_and_advance',
      format('normDelta=%s', round(v_norm_delta, 3))
    );
  END IF;

  RETURN jsonb_build_object('measurement_id', v_meas_id, 'advanced', v_advanced, 'to_phase', v_to);
END;
$fn$;
GRANT EXECUTE ON FUNCTION recon_record_measurement_and_advance(UUID, UUID, TEXT, NUMERIC, TEXT, BOOLEAN, JSONB)
  TO authenticated, service_role;
