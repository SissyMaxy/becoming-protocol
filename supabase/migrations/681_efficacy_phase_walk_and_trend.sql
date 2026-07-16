-- 681 - Efficacy engine Phase 1: the phase-walk driver + the trend layer.
--
-- THE UNLOCK: the reconditioning phase machine (mig 649 recon_program_advance) is
-- efficacy-driven on the measure→{retain|reinforce|install} edge, but NOTHING drove
-- the intermediate transitions induction→install→reinforce→…→measure, so programs
-- sat in induction forever and never reached the closed loop. recon_program_walk()
-- drives those early edges on dwell-time + in-phase delivery count, and reclaims the
-- previously-written-never-read next_measure_due_at column as the measure cadence
-- timer (reinforce/reconsolidate → measure). It only ADVANCES through the existing
-- legal-transition gate (recon_program_advance), which self-gates on safeword/pause —
-- so this adds no new authority and cannot skip a phase or bypass a gate.
--
-- recon_measurement_trend() replaces the single-point baseline-vs-current delta with
-- a real direction + velocity over the last N measurements (the efficacy signal the
-- steering loop + surface consume). No user UUIDs / private data in schema history.

BEGIN;

-- ── recon_program_walk(program): advance the early phase edges ──
-- Returns the resulting phase (unchanged if no edge fired). measure→retain/reinforce/
-- install stays owned by recon-measure + the probe card (efficacy-driven) — this only
-- gets a program TO measure.
CREATE OR REPLACE FUNCTION public.recon_program_walk(p_program uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_p          reconditioning_programs%ROWTYPE;
  v_baseline   timestamptz;
  v_dwell      interval;
  v_deliveries int;
  v_reps       int;
  v_next       text := NULL;
  c_induction_dwell constant interval := interval '3 days';
  c_install_dwell   constant interval := interval '5 days';
  c_min_deliveries  constant int := 2;
BEGIN
  SELECT * INTO v_p FROM reconditioning_programs WHERE id = p_program;
  IF NOT FOUND OR v_p.status <> 'running' THEN RETURN NULL; END IF;

  v_dwell := now() - v_p.phase_entered_at;

  -- In-phase deliveries tagged to this target (handler_decrees carries both
  -- recon_target_id and created_at reliably; it is the canonical delivery surface).
  SELECT count(*) INTO v_deliveries
    FROM handler_decrees d
   WHERE d.recon_target_id = v_p.target_id
     AND d.created_at >= v_p.phase_entered_at;

  IF v_p.phase = 'induction' THEN
    -- Cannot install without a baseline (recon_program_advance re-checks this).
    SELECT baseline_captured_at INTO v_baseline
      FROM reconditioning_targets WHERE id = v_p.target_id;
    IF v_baseline IS NOT NULL
       AND v_dwell >= c_induction_dwell
       AND v_deliveries >= c_min_deliveries THEN
      v_next := 'install';
    END IF;

  ELSIF v_p.phase = 'install' THEN
    IF v_dwell >= c_install_dwell AND v_deliveries >= c_min_deliveries THEN
      v_next := 'reinforce';
    END IF;

  ELSIF v_p.phase IN ('reinforce','reconsolidate') THEN
    -- Reclaim next_measure_due_at (set to +7d on entering reinforce/reconsolidate)
    -- as the measure cadence timer. Require at least one graded rep so a measure is
    -- never taken cold.
    SELECT COALESCE(sum(reps), 0) INTO v_reps
      FROM recon_rep_schedule WHERE target_id = v_p.target_id;
    IF v_p.next_measure_due_at IS NOT NULL
       AND now() >= v_p.next_measure_due_at
       AND v_reps >= 1 THEN
      v_next := 'measure';
    END IF;
  END IF;
  -- 'measure' and 'retain' are driven by recon-measure / the probe card (efficacy).

  IF v_next IS NULL THEN
    RETURN v_p.phase;
  END IF;

  IF recon_program_advance(p_program, v_next, 'phase_walk', 'auto: dwell/delivery/timer') THEN
    RETURN v_next;
  END IF;
  RETURN v_p.phase;
END
$fn$;
GRANT EXECUTE ON FUNCTION public.recon_program_walk(uuid) TO authenticated, service_role;

-- ── recon_measurement_trend(target, indicator, window): direction + velocity ──
-- Raw slope/delta over the last N measurements; the CONSUMER compares direction to
-- the target's target_direction to decide "moving the right way." SECURITY INVOKER so
-- table RLS stays authoritative.
CREATE OR REPLACE FUNCTION public.recon_measurement_trend(
  p_target uuid, p_indicator text, p_window int DEFAULT 5
)
RETURNS TABLE (
  n int,
  first_value numeric,
  last_value numeric,
  delta numeric,
  slope_per_day numeric,
  direction smallint
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $fn$
  WITH recent AS (
    SELECT value, captured_at
      FROM recon_measurements
     WHERE target_id = p_target AND indicator_kind = p_indicator
     ORDER BY captured_at DESC
     LIMIT GREATEST(p_window, 2)
  ), ordered AS (
    SELECT value, captured_at,
           EXTRACT(EPOCH FROM (captured_at - min(captured_at) OVER ())) / 86400.0 AS day_x
      FROM recent
  ), agg AS (
    SELECT count(*)::int AS n,
           (array_agg(value ORDER BY captured_at ASC))[1]  AS first_value,
           (array_agg(value ORDER BY captured_at DESC))[1] AS last_value,
           regr_slope(value, day_x) AS slope
      FROM ordered
  )
  SELECT n,
         first_value,
         last_value,
         (last_value - first_value) AS delta,
         COALESCE(slope, 0) AS slope_per_day,
         (CASE WHEN COALESCE(slope, 0) >  0.0001 THEN 1
               WHEN COALESCE(slope, 0) < -0.0001 THEN -1
               ELSE 0 END)::smallint AS direction
    FROM agg;
$fn$;
GRANT EXECUTE ON FUNCTION public.recon_measurement_trend(uuid, text, int) TO authenticated, service_role;

COMMIT;
