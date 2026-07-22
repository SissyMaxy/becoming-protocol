-- 692 — body_program_start: capture the baseline the recon spine demands.
--
-- The baseline guard (trg_recon_target_baseline_guard, added to the recon
-- spine after 681 was written) rejects status='active' rows with no
-- baseline_captured_at — "no baseline, no claim of change". body_program_start
-- inserted straight to 'active' with no baseline, so the Start button failed
-- for any fresh user (23514 from the trigger, surfaced as a silent null).
--
-- The body program's honest baseline is the body at start. baseline_value is
-- NUMERIC on this table: use the latest hip measurement when one exists (hips
-- are the program's primary growth metric); otherwise NULL — the guard only
-- requires baseline_captured_at, and the kickoff mirror shot the program
-- itself orders is the visual baseline.
--
-- ALSO prod-corrected from 681: category must be one of belief/identity/habit/
-- association (the live CHECK) — 681 wrote 'body', which the constraint
-- rejects. The program is a habit target.

CREATE OR REPLACE FUNCTION public.body_program_start(p_split text DEFAULT 'lower_led_3x')
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_user     uuid := auth.uid();
  v_id       uuid;
  v_start    text := current_date::text;
  v_baseline numeric;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;

  -- Numeric baseline = latest hip measurement (primary growth metric), when known.
  SELECT hips_inches INTO v_baseline
  FROM body_measurements
  WHERE user_id = v_user AND hips_inches IS NOT NULL
  ORDER BY measured_at DESC
  LIMIT 1;

  SELECT id INTO v_id FROM reconditioning_targets
  WHERE user_id = v_user AND indicator_config->>'program' = 'body_conditioning'
  ORDER BY created_at DESC LIMIT 1;

  IF v_id IS NOT NULL THEN
    UPDATE reconditioning_targets
    SET indicator_config = jsonb_build_object(
          'program', 'body_conditioning', 'split', p_split, 'program_start', v_start),
        status = 'active',
        baseline_value = coalesce(baseline_value, v_baseline),
        baseline_captured_at = coalesce(baseline_captured_at, now())
    WHERE id = v_id;
    RETURN v_id;
  END IF;

  INSERT INTO reconditioning_targets
    (user_id, slug, title, claim_text, category, indicator_kind,
     indicator_config, target_direction, status, authored_by,
     baseline_value, baseline_captured_at)
  VALUES
    (v_user, 'body_conditioning', 'The body she is building',
     'My body is being shaped for me, one session at a time.',
     'habit', 'program',
     jsonb_build_object('program', 'body_conditioning', 'split', p_split, 'program_start', v_start),
     'increase', 'active', 'mommy',
     v_baseline, now())
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.body_program_start(text) TO authenticated;
