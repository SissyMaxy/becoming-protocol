-- 670 — turnout-orchestrator resistance pacing (DESIGN_TURNOUT_LADDER_2026-07-02.md
-- §2 step 5, "Pace by real signals").
--
-- The orchestrator's own header comment has said since mig 653 shipped it:
-- "full resistance-pacing is a follow-up." The design is explicit that this is
-- not optional decoration — it is the anti-pattern guard the whole slope
-- depends on ("On resistance the orchestrator lowers the barrier, it does not
-- push harder — the zoom-out-at-iteration-2 rule"). Until now, turnout-
-- orchestrator issued the same full-weight rung ask every run regardless of
-- how many times she'd missed it — exactly the "push harder on a resisted
-- step" failure mode the reconditioning engine's adaptive-intensity pattern
-- (recon-program-orchestrator, §3.4) already guards against on the parallel
-- engine. This closes the same gap here, reusing that pattern's shape.
--
-- gap_extra_days widens the per-rung consolidation dwell (turnout_rung_consolidated)
-- when the current rung's decree lane shows high skip-rate, and decays back down
-- when she's engaging — never the reverse. It never changes WHAT she's asked
-- (the rung sequence is fixed), only paces HOW HARD and HOW SOON the ask returns.

ALTER TABLE turnout_state
  ADD COLUMN IF NOT EXISTS gap_extra_days INT NOT NULL DEFAULT 0;

-- Re-ship turnout_rung_consolidated with gap_extra_days folded into the dwell
-- check. Everything else is byte-identical to mig 652's version.
CREATE OR REPLACE FUNCTION turnout_rung_consolidated(p_user UUID, p_rung TEXT)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_state turnout_state%ROWTYPE;
  v_rung turnout_ladder%ROWTYPE;
  v_dwell_ok BOOLEAN;
  v_no_halt BOOLEAN;
  v_anchor_ok BOOLEAN;
  v_gate JSONB;
BEGIN
  SELECT * INTO v_state FROM turnout_state WHERE user_id = p_user;
  SELECT * INTO v_rung FROM turnout_ladder WHERE rung_code = p_rung;
  IF NOT FOUND THEN RETURN jsonb_build_object('consolidated', false, 'reason', 'unknown_rung'); END IF;

  -- (d) dwell: gap_min_days + any resistance-widened extra elapsed since entry.
  v_dwell_ok := v_state.entered_at IS NULL OR v_state.entered_at <=
    now() - ((v_rung.gap_min_days + COALESCE(v_state.gap_extra_days, 0)) || ' days')::interval;

  -- (e) no open safeword/pause: the gate is the single source of truth.
  v_gate := conditioning_gate(p_user, 'recondition');
  v_no_halt := (v_gate->>'reason') NOT IN ('safeword','paused');

  -- (c) an escape-cost anchor for this rung exists (the fact is recorded).
  SELECT EXISTS (
    SELECT 1 FROM turnout_rung_completions WHERE user_id = p_user AND rung_code = p_rung
  ) INTO v_anchor_ok;

  RETURN jsonb_build_object(
    'consolidated', (v_dwell_ok AND v_no_halt AND v_anchor_ok),
    'dwell_ok', v_dwell_ok,
    'no_halt', v_no_halt,
    'anchor_ok', v_anchor_ok,
    'gap_min_days', v_rung.gap_min_days,
    'gap_extra_days', COALESCE(v_state.gap_extra_days, 0),
    'note', 'orchestrator adds decree-fulfilled + aroused-debrief checks'
  );
END;
$fn$;
GRANT EXECUTE ON FUNCTION turnout_rung_consolidated(UUID, TEXT) TO authenticated, service_role;
