-- 649 — Reconditioning Engine, Phase 1a: programs + the phase state machine.
--
-- DESIGN_RECONDITIONING_ENGINE §3. A program is a multi-week state machine over
-- ONE target that composes the existing mechanisms (induction → install →
-- reinforce → reconsolidate → measure → retain). This migration is the DB spine
-- for that machine; the orchestrator edge fn (recon-program-orchestrator) drives
-- it and emits the single daily Focus task. Phase transitions go through one
-- legal-matrix function, mirroring obligation_transition (mig 627).

-- ─── 1. reconditioning_programs ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS reconditioning_programs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  target_id UUID NOT NULL REFERENCES reconditioning_targets(id) ON DELETE CASCADE,
  phase TEXT NOT NULL DEFAULT 'induction'
    CHECK (phase IN ('induction','install','reinforce','reconsolidate','measure','retain')),
  phase_entered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  intensity SMALLINT NOT NULL DEFAULT 2 CHECK (intensity BETWEEN 1 AND 5),
  next_measure_due_at TIMESTAMPTZ,
  measures_held SMALLINT NOT NULL DEFAULT 0,   -- consecutive non-regressing measures
  status TEXT NOT NULL DEFAULT 'running'
    CHECK (status IN ('running','paused','completed','retired')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- One live program per target (a target runs at most one campaign at a time).
  UNIQUE (target_id)
);

ALTER TABLE reconditioning_programs ENABLE ROW LEVEL SECURITY;
DO $do$ BEGIN
  CREATE POLICY recon_programs_self ON reconditioning_programs FOR ALL TO authenticated
    USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $do$;
DO $do$ BEGIN
  CREATE POLICY recon_programs_service ON reconditioning_programs FOR ALL TO service_role
    USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $do$;

CREATE INDEX IF NOT EXISTS recon_programs_running_idx
  ON reconditioning_programs(user_id) WHERE status = 'running';

-- ─── 2. transition log ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS recon_program_transition_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id UUID NOT NULL,
  from_phase TEXT,
  to_phase TEXT,
  via TEXT,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE recon_program_transition_log ENABLE ROW LEVEL SECURITY;
DO $do$ BEGIN
  CREATE POLICY recon_ptl_service ON recon_program_transition_log FOR ALL TO service_role
    USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $do$;
CREATE INDEX IF NOT EXISTS recon_ptl_idx ON recon_program_transition_log(program_id, created_at DESC);

-- ─── 3. recon_start_program(target_id) ──────────────────────────────────────
-- Starts a campaign in 'induction'. REQUIRES a captured baseline (the target's
-- baseline-guard trigger also blocks status='active' without one) — no baseline,
-- no claim of change. Enforces the ≤3 concurrent active targets cap (Art. IV).
CREATE OR REPLACE FUNCTION recon_start_program(p_target UUID)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_t reconditioning_targets%ROWTYPE;
  v_active_count INT;
  v_prog UUID;
BEGIN
  SELECT * INTO v_t FROM reconditioning_targets WHERE id = p_target;
  IF NOT FOUND THEN RAISE EXCEPTION 'recon_start_program: target % not found', p_target; END IF;

  IF v_t.baseline_captured_at IS NULL THEN
    RAISE EXCEPTION 'recon_start_program: target % has no baseline — capture one first (no baseline, no claim)', p_target;
  END IF;

  -- Already has a program? Return it (idempotent).
  SELECT id INTO v_prog FROM reconditioning_programs WHERE target_id = p_target;
  IF v_prog IS NOT NULL THEN RETURN v_prog; END IF;

  -- Cap: at most 3 active targets at once (Art. IV minimal-by-subtraction).
  SELECT count(*) INTO v_active_count
    FROM reconditioning_targets
   WHERE user_id = v_t.user_id AND status = 'active';
  IF v_active_count >= 3 THEN
    RAISE EXCEPTION 'recon_start_program: user % already has 3 active targets (the 4th waits in proposed)', v_t.user_id;
  END IF;

  UPDATE reconditioning_targets SET status = 'active' WHERE id = p_target;

  INSERT INTO reconditioning_programs (user_id, target_id, phase, status, next_measure_due_at)
  VALUES (v_t.user_id, p_target, 'induction', 'running', now() + interval '7 days')
  RETURNING id INTO v_prog;

  INSERT INTO recon_program_transition_log (program_id, from_phase, to_phase, via, note)
  VALUES (v_prog, NULL, 'induction', 'recon_start_program', 'campaign started');

  RETURN v_prog;
END;
$fn$;
GRANT EXECUTE ON FUNCTION recon_start_program(UUID) TO authenticated, service_role;

-- ─── 4. recon_program_advance(program_id, to_phase) ─────────────────────────
-- The single legal-transition function. Mirrors obligation_transition's matrix.
-- Regression (measure → install) is legal and expected — the "zoom out at
-- iteration 2" rule: a stalled target drops back to install, it is not forced.
CREATE OR REPLACE FUNCTION recon_program_advance(
  p_program UUID, p_to TEXT, p_via TEXT DEFAULT 'orchestrator', p_note TEXT DEFAULT NULL
) RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_p reconditioning_programs%ROWTYPE;
  v_gate JSONB;
  v_legal BOOLEAN := FALSE;
BEGIN
  SELECT * INTO v_p FROM reconditioning_programs WHERE id = p_program FOR UPDATE;
  IF NOT FOUND THEN RETURN FALSE; END IF;
  IF v_p.status <> 'running' THEN RETURN FALSE; END IF;      -- paused/retired/completed don't advance
  IF v_p.phase = p_to THEN RETURN TRUE; END IF;             -- idempotent

  -- Safeword/pause/live-meet backstop: never advance a program while gated.
  v_gate := conditioning_gate(v_p.user_id, 'recondition');
  IF (v_gate->>'allow')::boolean IS DISTINCT FROM TRUE THEN
    INSERT INTO recon_program_transition_log (program_id, from_phase, to_phase, via, note)
    VALUES (p_program, v_p.phase, p_to, p_via, 'REFUSED: gate ' || COALESCE(v_gate->>'reason','unknown'));
    RETURN FALSE;
  END IF;

  -- Legal transition matrix. 'install' is reachable from BOTH induction (normal
  -- first entry) and measure (regression — the "zoom out at iteration 2" rule).
  v_legal := CASE
    WHEN p_to = 'install'       THEN v_p.phase IN ('induction','measure')
    WHEN p_to = 'reinforce'     THEN v_p.phase IN ('install','reconsolidate','measure')
    WHEN p_to = 'reconsolidate' THEN v_p.phase = 'reinforce'
    WHEN p_to = 'measure'       THEN v_p.phase IN ('reinforce','reconsolidate')
    WHEN p_to = 'retain'        THEN v_p.phase = 'measure'
    ELSE FALSE
  END;

  IF NOT v_legal THEN
    INSERT INTO recon_program_transition_log (program_id, from_phase, to_phase, via, note)
    VALUES (p_program, v_p.phase, p_to, p_via, 'REFUSED: illegal transition');
    RETURN FALSE;
  END IF;

  -- install requires the baseline (belt-and-suspenders; start already enforced it).
  IF p_to = 'install' AND NOT EXISTS (
    SELECT 1 FROM reconditioning_targets WHERE id = v_p.target_id AND baseline_captured_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'recon_program_advance: cannot enter install without a baseline (program %)', p_program;
  END IF;

  UPDATE reconditioning_programs
     SET phase = p_to, phase_entered_at = now(),
         -- measures_held counts consecutive non-regressing measures. A regression
         -- (measure→install) resets it; progress (measure→reinforce) increments it;
         -- everything else leaves it. retain is only reached with held >= 2.
         measures_held = CASE
           WHEN p_to = 'install'   AND v_p.phase = 'measure' THEN 0
           WHEN p_to = 'reinforce' AND v_p.phase = 'measure' THEN measures_held + 1
           ELSE measures_held END,
         next_measure_due_at = CASE
           WHEN p_to = 'measure' THEN now()
           WHEN p_to IN ('reinforce','reconsolidate') THEN now() + interval '7 days'
           ELSE next_measure_due_at END
   WHERE id = p_program;

  -- Entering 'retain' completes the target's active campaign and frees a slot.
  IF p_to = 'retain' THEN
    UPDATE reconditioning_targets SET status = 'retained' WHERE id = v_p.target_id;
  END IF;

  INSERT INTO recon_program_transition_log (program_id, from_phase, to_phase, via, note)
  VALUES (p_program, v_p.phase, p_to, p_via, p_note);
  RETURN TRUE;
END;
$fn$;
GRANT EXECUTE ON FUNCTION recon_program_advance(UUID, TEXT, TEXT, TEXT) TO authenticated, service_role;

-- ─── 5. recon_program_set_status — pause / resume / retire ──────────────────
-- Retire is sacred + one-tap (§6.6): halts the campaign and retires the target.
-- Pause is what recon-safeword-halt calls for every running program (mig 651).
CREATE OR REPLACE FUNCTION recon_program_set_status(
  p_program UUID, p_status TEXT, p_via TEXT DEFAULT 'user'
) RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE v_p reconditioning_programs%ROWTYPE;
BEGIN
  IF p_status NOT IN ('running','paused','completed','retired') THEN RETURN FALSE; END IF;
  SELECT * INTO v_p FROM reconditioning_programs WHERE id = p_program FOR UPDATE;
  IF NOT FOUND THEN RETURN FALSE; END IF;

  UPDATE reconditioning_programs SET status = p_status WHERE id = p_program;

  IF p_status = 'retired' THEN
    UPDATE reconditioning_targets SET status = 'retired' WHERE id = v_p.target_id;
  ELSIF p_status = 'paused' THEN
    UPDATE reconditioning_targets SET status = 'paused'
     WHERE id = v_p.target_id AND status = 'active';
  ELSIF p_status = 'running' AND v_p.status = 'paused' THEN
    UPDATE reconditioning_targets SET status = 'active'
     WHERE id = v_p.target_id AND status = 'paused';
  END IF;

  INSERT INTO recon_program_transition_log (program_id, from_phase, to_phase, via, note)
  VALUES (p_program, v_p.phase, v_p.phase, p_via, 'status → ' || p_status);
  RETURN TRUE;
END;
$fn$;
GRANT EXECUTE ON FUNCTION recon_program_set_status(UUID, TEXT, TEXT) TO authenticated, service_role;
