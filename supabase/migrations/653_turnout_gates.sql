-- 653 — Turn-Out Ladder, Phase 2: the gates.
--
-- DESIGN_TURNOUT_LADDER §6. Arms 'turnout' as a conditioning system (default
-- OFF, hard opt-in) and provides the STI/PrEP health-prep gate helper. The
-- orchestrator (edge fn) calls conditioning_gate(uid,'turnout') as its first act
-- and turnout_health_prep_ok() before offering oral+ / paid rungs.
--
-- Deviation from design note: the design proposed grandfathering turnout_enabled
-- ON where realcock/funnel usage exists. This migration keeps it OFF by default
-- (hard opt-in) — this axis is real sex with real strangers, so it starts from an
-- explicit yes, consistent with every other conditioning system's default.

-- ─── 1. Elective toggle ─────────────────────────────────────────────────────
ALTER TABLE life_as_woman_settings
  ADD COLUMN IF NOT EXISTS turnout_enabled BOOLEAN NOT NULL DEFAULT FALSE;

-- ─── 2. Re-declare conditioning_gate with the 'turnout' arm ─────────────────
-- Same four checks as migs 633/648 — only the elective CASE grows a branch.
CREATE OR REPLACE FUNCTION conditioning_gate(uid UUID, system TEXT)
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pause TIMESTAMPTZ;
  v_elective BOOLEAN;
BEGIN
  IF is_safeword_active(uid, 3600) OR EXISTS (
    SELECT 1 FROM aftercare_sessions
    WHERE user_id = uid AND exited_at IS NULL
  ) THEN
    RETURN jsonb_build_object('allow', false, 'reason', 'safeword');
  END IF;

  SELECT pause_new_decrees_until INTO v_pause FROM user_state WHERE user_id = uid;
  IF v_pause IS NOT NULL AND v_pause > now() THEN
    RETURN jsonb_build_object('allow', false, 'reason', 'paused');
  END IF;

  SELECT CASE system
    WHEN 'goon'              THEN s.master_enabled AND s.gooning_enabled
    WHEN 'machine'           THEN s.master_enabled AND s.machine_enabled
    WHEN 'paid_monetization' THEN s.master_enabled AND s.paid_monetization_enabled
    WHEN 'temptation'        THEN s.master_enabled AND s.temptation_enabled
    WHEN 'recondition'       THEN s.master_enabled AND s.recondition_enabled
    WHEN 'turnout'           THEN s.master_enabled AND s.turnout_enabled
    ELSE FALSE
  END INTO v_elective
  FROM life_as_woman_settings s WHERE s.user_id = uid;
  IF v_elective IS DISTINCT FROM TRUE THEN
    RETURN jsonb_build_object('allow', false, 'reason', 'elective_off');
  END IF;

  IF EXISTS (
    SELECT 1 FROM meet_safety_plans
    WHERE user_id = uid AND status = 'live'
  ) THEN
    RETURN jsonb_build_object('allow', false, 'reason', 'live_meet');
  END IF;

  RETURN jsonb_build_object('allow', true, 'reason', 'ok');
END;
$$;
GRANT EXECUTE ON FUNCTION conditioning_gate(UUID, TEXT) TO authenticated, service_role;
COMMENT ON FUNCTION conditioning_gate(UUID, TEXT) IS
  'One gate. Known systems: goon | machine | paid_monetization | temptation | recondition | turnout. Unknown system = deny. Pure read; callers FAIL CLOSED via _shared/conditioning-gate.ts.';

-- ─── 3. Health-prep gate (§6.3) ─────────────────────────────────────────────
-- Hard gate on oral+ (rungs 6b/6c/6d) and paid (T7/T8): an attested "tested +
-- PrEP" row must exist before the orchestrator offers the rung, and as a backstop
-- realcock_discovery_eval refuses phase >= 4 without it (wired in the orchestrator
-- / eval rewire — this helper is the single source of truth).
CREATE OR REPLACE FUNCTION turnout_health_prep_ok(p_user UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT EXISTS (SELECT 1 FROM turnout_health_prep WHERE user_id = p_user);
$fn$;
GRANT EXECUTE ON FUNCTION turnout_health_prep_ok(UUID) TO authenticated, service_role;

-- Whether a specific rung may be OFFERED, folding gate + meet-safety-arming +
-- health-prep into one read the orchestrator consults. Meet-safety itself stays
-- enforced server-side in advance_hookup_step (mig 626) — this is an ADDITIONAL
-- pre-offer check, not a replacement (defense in depth).
CREATE OR REPLACE FUNCTION turnout_rung_offerable(p_user UUID, p_rung TEXT)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_rung turnout_ladder%ROWTYPE;
  v_gate JSONB;
  v_has_armed_plan BOOLEAN;
BEGIN
  SELECT * INTO v_rung FROM turnout_ladder WHERE rung_code = p_rung;
  IF NOT FOUND THEN RETURN jsonb_build_object('offerable', false, 'reason', 'unknown_rung'); END IF;

  v_gate := conditioning_gate(p_user, 'turnout');
  IF (v_gate->>'allow')::boolean IS DISTINCT FROM TRUE THEN
    RETURN jsonb_build_object('offerable', false, 'reason', 'gate_' || (v_gate->>'reason'));
  END IF;

  IF v_rung.requires_health_prep AND NOT turnout_health_prep_ok(p_user) THEN
    RETURN jsonb_build_object('offerable', false, 'reason', 'needs_health_prep');
  END IF;

  IF v_rung.requires_meet_safety THEN
    SELECT EXISTS (
      SELECT 1 FROM meet_safety_plans
      WHERE user_id = p_user AND status IN ('armed','live')
    ) INTO v_has_armed_plan;
    -- Not a hard refuse here (advance_hookup_step is the real gate) — but the
    -- orchestrator should surface the meet-safety-card prep task first.
    RETURN jsonb_build_object('offerable', true, 'reason', 'ok',
      'needs_meet_safety_card', NOT COALESCE(v_has_armed_plan, false));
  END IF;

  RETURN jsonb_build_object('offerable', true, 'reason', 'ok');
END;
$fn$;
GRANT EXECUTE ON FUNCTION turnout_rung_offerable(UUID, TEXT) TO authenticated, service_role;
