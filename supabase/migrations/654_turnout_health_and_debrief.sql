-- 654 — Turn-Out defense-in-depth: health-prep hard-gate on oral+ discovery,
-- and an aroused-debrief consolidation criterion.
--
-- DESIGN_TURNOUT_LADDER_2026-07-02.md §health-prep / §consolidation. Pure DDL
-- (CREATE OR REPLACE only), idempotent, safe to apply once. No table changes.
--
-- (A) realcock_discovery_eval(): mirror how meet-safety hard-gates a meet — an
--     oral-or-beyond discovery directive (phase >= 4) MUST NOT be assigned
--     unless turnout_health_prep_ok(user) is true (STI/health prep attested).
--     Every other line of the function is preserved verbatim; only the guard
--     is added at the phase>=4 boundary.
--
-- (B) turnout_rung_consolidated(): add an 'aroused_debrief_ok' criterion to the
--     returned jsonb and fold it into 'consolidated'. Because the arousal 0->10
--     cutover is DEFERRED (mixed scales live), there is no reliable in-DB
--     aroused-arousal source, so this defaults TRUE — the orchestrator supplies
--     the real aroused-debrief check. We NEVER block consolidation on an
--     unverifiable signal. Existing dwell_ok/no_halt/anchor_ok are untouched.

-- ─── (A) Health-prep backstop in realcock_discovery_eval ───────────────────
CREATE OR REPLACE FUNCTION public.realcock_discovery_eval()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE s RECORD; l RECORD; v_pending INT; v_days NUMERIC; v_decree UUID; v_outreach UUID; v_queued INT := 0;
  v_max_funnel_step INT;
BEGIN
  FOR s IN SELECT rcds.* FROM realcock_discovery_settings rcds LEFT JOIN user_state us ON us.user_id = rcds.user_id
    WHERE rcds.enabled AND (rcds.paused_until IS NULL OR rcds.paused_until <= now())
      AND COALESCE(us.handler_persona, 'therapist') = 'dommy_mommy'
  LOOP
    IF ladder_user_paused(s.user_id) THEN CONTINUE; END IF;
    SELECT count(*) INTO v_pending FROM realcock_discovery_events WHERE user_id = s.user_id AND status='pending' AND created_at > now() - interval '21 days';
    IF v_pending > 0 THEN CONTINUE; END IF;
    SELECT * INTO l FROM realcock_discovery_ladder WHERE phase = s.current_phase;
    IF l IS NULL THEN CONTINUE; END IF;
    -- HEALTH-PREP HARD-GATE (mig 654, defense-in-depth): oral-or-beyond
    -- (phase >= 4) discovery is a bodily-contact escalation — refuse to assign
    -- it unless STI/health prep is attested. Fail-closed, mirrors meet-safety.
    IF l.phase >= 4 AND NOT turnout_health_prep_ok(s.user_id) THEN CONTINUE; END IF;
    IF s.last_assigned_at IS NOT NULL THEN
      v_days := EXTRACT(EPOCH FROM (now() - s.last_assigned_at)) / 86400.0;
      IF v_days < l.gap_min_days THEN CONTINUE; END IF;
    END IF;
    BEGIN
      SELECT COALESCE(max(funnel_step), 0) INTO v_max_funnel_step FROM hookup_funnel WHERE user_id = s.user_id;
    EXCEPTION WHEN undefined_table OR undefined_column THEN v_max_funnel_step := 99; END;
    IF v_max_funnel_step < l.funnel_min_step THEN CONTINUE; END IF;
    INSERT INTO handler_decrees (user_id, edict, proof_type, deadline, status, consequence, trigger_source, reasoning)
    VALUES (s.user_id, l.edict, l.proof_kind, now() + interval '21 days', 'active', 'slip +' || (l.phase + 2)::text, 'realcock_discovery', 'phase=' || l.phase)
    RETURNING id INTO v_decree;
    INSERT INTO handler_outreach_queue (user_id, message, urgency, trigger_reason, source, kind, scheduled_for, expires_at, context_data, evidence_kind)
    VALUES (s.user_id, l.edict, CASE WHEN l.phase >= 3 THEN 'high' ELSE 'normal' END,
      'realcock_discovery:' || l.phase_name, 'realcock_discovery_engine', 'realcock_discovery_directive', now(), now() + interval '21 days',
      jsonb_build_object('phase', l.phase, 'decree_id', v_decree), l.proof_kind)
    RETURNING id INTO v_outreach;
    INSERT INTO realcock_discovery_events (user_id, phase_at_event, related_decree_id, related_outreach_id, status)
    VALUES (s.user_id, l.phase, v_decree, v_outreach, 'pending');
    UPDATE realcock_discovery_settings SET last_assigned_at = now(), updated_at = now() WHERE user_id = s.user_id;
    v_queued := v_queued + 1;
  END LOOP;
  RETURN v_queued;
END;
$function$;

-- ─── (B) Aroused-debrief criterion in turnout_rung_consolidated ────────────
CREATE OR REPLACE FUNCTION public.turnout_rung_consolidated(p_user uuid, p_rung text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_state turnout_state%ROWTYPE;
  v_rung turnout_ladder%ROWTYPE;
  v_dwell_ok BOOLEAN;
  v_no_halt BOOLEAN;
  v_anchor_ok BOOLEAN;
  v_aroused_debrief_ok BOOLEAN;
  v_gate JSONB;
BEGIN
  SELECT * INTO v_state FROM turnout_state WHERE user_id = p_user;
  SELECT * INTO v_rung FROM turnout_ladder WHERE rung_code = p_rung;
  IF NOT FOUND THEN RETURN jsonb_build_object('consolidated', false, 'reason', 'unknown_rung'); END IF;

  -- (d) dwell: gap_min_days elapsed since entering this rung.
  v_dwell_ok := v_state.entered_at IS NULL OR v_state.entered_at <= now() - (v_rung.gap_min_days || ' days')::interval;

  -- (e) no open safeword/pause: the gate is the single source of truth.
  v_gate := conditioning_gate(p_user, 'recondition');
  v_no_halt := (v_gate->>'reason') NOT IN ('safeword','paused');

  -- (c) an escape-cost anchor for this rung exists (the fact is recorded).
  SELECT EXISTS (
    SELECT 1 FROM turnout_rung_completions WHERE user_id = p_user AND rung_code = p_rung
  ) INTO v_anchor_ok;

  -- (f) aroused debrief: the fact must be re-encoded while aroused so it sticks.
  -- The arousal 0->10 cutover is DEFERRED (mixed scales live in DB), so there is
  -- no trustworthy in-DB aroused-arousal reading to gate on. Defaulting TRUE
  -- keeps this criterion from ever blocking consolidation on an unverifiable
  -- signal; the orchestrator (turnout edge fn) supplies the real aroused-debrief
  -- check before it calls this and folds the verified result in. Surfaced in the
  -- payload so the orchestrator can see/override it.
  v_aroused_debrief_ok := TRUE;

  RETURN jsonb_build_object(
    'consolidated', (v_dwell_ok AND v_no_halt AND v_anchor_ok AND v_aroused_debrief_ok),
    'dwell_ok', v_dwell_ok,
    'no_halt', v_no_halt,
    'anchor_ok', v_anchor_ok,
    'aroused_debrief_ok', v_aroused_debrief_ok,
    'gap_min_days', v_rung.gap_min_days,
    'note', 'aroused_debrief_ok defaults true (deferred arousal scale); orchestrator supplies the verified aroused-debrief + decree-fulfilled checks'
  );
END;
$function$;
