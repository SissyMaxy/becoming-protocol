-- 656 — Safeword becomes a PERSISTENT latch in the gate, not a 1-hour window.
--
-- Operator directive 2026-07-04: the user is stepping back ("out of the way")
-- and letting Mommy run autonomously — which is only safe if the ejection is
-- bulletproof. It wasn't: conditioning_gate blocked on is_safeword_active(uid,
-- 3600) (a 1h window) OR un-exited aftercare, so ~1h after a safeword (aftercare
-- exited) every engine AUTO-RESUMED on its own. That's a nap, not an exit.
--
-- safeword_latches (mig 627) was designed with "no timer expiry" for exactly
-- this, but the gate never read it. Now it does: while an un-resumed latch
-- exists, the gate stays CLOSED until the user explicitly resumes (sets
-- resumed_at, via resume_from_safeword). "I ejected and I'm out until I choose
-- to come back" is now literally true across every gated engine (recondition,
-- turnout, goon, machine, paid_monetization/revenue, temptation).
--
-- Only the safeword check changes; the other three checks are identical to 653.

CREATE OR REPLACE FUNCTION conditioning_gate(uid UUID, system TEXT)
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pause TIMESTAMPTZ;
  v_elective BOOLEAN;
BEGIN
  -- (1) Safeword: the 1h frame-break window, OR un-exited aftercare, OR — new —
  -- a persistent un-resumed safeword latch. The latch has no timer: it holds the
  -- gate shut until the user comes back on purpose.
  IF is_safeword_active(uid, 3600)
     OR EXISTS (SELECT 1 FROM aftercare_sessions WHERE user_id = uid AND exited_at IS NULL)
     OR EXISTS (SELECT 1 FROM safeword_latches WHERE user_id = uid AND resumed_at IS NULL)
  THEN
    RETURN jsonb_build_object('allow', false, 'reason', 'safeword');
  END IF;

  -- (2) Pause.
  SELECT pause_new_decrees_until INTO v_pause FROM user_state WHERE user_id = uid;
  IF v_pause IS NOT NULL AND v_pause > now() THEN
    RETURN jsonb_build_object('allow', false, 'reason', 'paused');
  END IF;

  -- (3) Elective toggle.
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

  -- (4) Live meet: she is on a real date — conditioning holds its tongue.
  IF EXISTS (SELECT 1 FROM meet_safety_plans WHERE user_id = uid AND status = 'live') THEN
    RETURN jsonb_build_object('allow', false, 'reason', 'live_meet');
  END IF;

  RETURN jsonb_build_object('allow', true, 'reason', 'ok');
END;
$$;
GRANT EXECUTE ON FUNCTION conditioning_gate(UUID, TEXT) TO authenticated, service_role;
COMMENT ON FUNCTION conditioning_gate(UUID, TEXT) IS
  'One gate, fail-closed. Safeword = 1h window OR un-exited aftercare OR un-resumed safeword_latch (persistent). Known systems: goon | machine | paid_monetization | temptation | recondition | turnout. Unknown = deny.';
