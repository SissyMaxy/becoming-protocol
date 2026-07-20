-- 682_workout_enforcement.sql
-- Enforcement for the body program: a train day becomes a real deadline-bearing
-- handler_decree, so it surfaces as the pressing Focus task, files an obligation
-- (oblig_file_decree → visible-before-penalized), and feeds the slip/penalty
-- ledger on skip — exactly like every other consequence-bearing task.
--
-- Doctrine-aligned: pressed while engaged, not an absence-penalty. The decree is
-- ensured when the user opens the app on a train day; once it exists it has a
-- deadline and consequence and escalates on its own.
--
-- Prod-consistent: clean handler_decrees columns only (no mommy_order_*). The
-- edict is embodied (passes the clerical + quality gates), trigger_source is
-- 'body_program_train' (matches none of the propagate_* triggers).

-- Ensure today's train-day decree exists. Idempotent per day. The frontend
-- passes Mommy's command for today's computed session as the edict.
CREATE OR REPLACE FUNCTION public.body_program_ensure_decree(
  p_edict text,
  p_session_name text DEFAULT 'training'
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_id   uuid;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF p_edict IS NULL OR length(p_edict) < 20 THEN RETURN NULL; END IF;

  -- Only for users with an active body-conditioning program.
  PERFORM 1 FROM reconditioning_targets
  WHERE user_id = v_user AND indicator_config->>'program' = 'body_conditioning'
    AND status = 'active' LIMIT 1;
  IF NOT FOUND THEN RETURN NULL; END IF;

  -- Dedup: keep exactly one active train decree per calendar day.
  SELECT id INTO v_id FROM handler_decrees
  WHERE user_id = v_user AND trigger_source = 'body_program_train'
    AND status = 'active' AND deadline::date = current_date
  LIMIT 1;
  IF v_id IS NOT NULL THEN RETURN v_id; END IF;

  INSERT INTO handler_decrees
    (user_id, edict, proof_type, deadline, status, consequence, trigger_source, reasoning)
  VALUES
    (v_user, p_edict, 'timer',
     date_trunc('day', now()) + interval '1 day' - interval '1 minute',
     'active',
     'A skipped training day is a slip — the gap shows, and she does not let it pass.',
     'body_program_train',
     'body-program: ' || p_session_name)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.body_program_ensure_decree(text, text) TO authenticated;

-- Mark today's train decree fulfilled (fires oblig_fulfill_decree → resolves
-- the obligation). Called when the user finishes/logs the session.
CREATE OR REPLACE FUNCTION public.body_program_fulfill()
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_n int;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  UPDATE handler_decrees
  SET status = 'fulfilled'
  WHERE user_id = v_user AND trigger_source = 'body_program_train'
    AND status = 'active' AND deadline::date = current_date;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n > 0;
END;
$$;
GRANT EXECUTE ON FUNCTION public.body_program_fulfill() TO authenticated;
