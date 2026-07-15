-- 679 — the aroused-state debrief consolidation gate (DESIGN_TURNOUT_LADDER
-- §0 mechanism table, "Arousal-state-dependent encoding": "Rungs
-- approached/consolidated aroused stick harder... low-arousal completions do
-- not consolidate — the orchestrator holds and re-runs with more prep.")
--
-- This criterion has never actually fired. turnout_rung_completions has
-- carried arousal_at_consolidation/debrief_ref columns since mig 652, but
-- turnout-orchestrator has always inserted completions with both NULL — it
-- consolidates the instant the rung's decree is fulfilled, with no debrief
-- ever captured. turnout_rung_consolidated() (mig 654) added an
-- aroused_debrief_ok criterion but hardcoded it TRUE, deferring the real
-- check to "the orchestrator" — which mig 670's re-ship then silently
-- dropped from the returned jsonb altogether. So the one named
-- state-dependent-encoding safeguard on the whole irreversibility axis has
-- never once been checked.
--
-- Fix: a real, small, in-fantasy arousal debrief — captured as an ordinary
-- decree the same way mig 656/667 did for belief_slider/assoc_latency — then
-- both turnout_rung_consolidated() and the orchestrator itself gate
-- advancement on a genuine >=6/10 self-report, never a fabricated one.

-- ── 1. turnout_rung_debriefs — the debrief ledger ───────────────────────────
CREATE TABLE IF NOT EXISTS turnout_rung_debriefs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  rung_code TEXT NOT NULL REFERENCES turnout_ladder(rung_code),
  arousal INT NOT NULL CHECK (arousal BETWEEN 0 AND 10),
  note TEXT,
  captured_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE turnout_rung_debriefs ENABLE ROW LEVEL SECURITY;
DO $do$ BEGIN
  CREATE POLICY turnout_debriefs_self ON turnout_rung_debriefs FOR SELECT TO authenticated USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $do$;
DO $do$ BEGIN
  CREATE POLICY turnout_debriefs_service ON turnout_rung_debriefs FOR ALL TO service_role USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $do$;

-- ── 2. Widen handler_decrees.proof_type for the debrief instrument ─────────
-- DROP+ADD only WIDENS the allowed set (mirrors migs 656/667's pattern) —
-- cannot violate any existing row, safe to re-run.
ALTER TABLE handler_decrees DROP CONSTRAINT IF EXISTS handler_decrees_proof_type_check;
ALTER TABLE handler_decrees ADD CONSTRAINT handler_decrees_proof_type_check
  CHECK (proof_type IN (
    'photo','video','audio','voice','text','journal_entry',
    'voice_pitch_sample','device_state','none','belief_slider','assoc_latency',
    'arousal_debrief'
  ));

-- ── 3. turnout_record_debrief — records the honest self-report ─────────────
CREATE OR REPLACE FUNCTION turnout_record_debrief(p_user UUID, p_rung TEXT, p_arousal INT, p_note TEXT DEFAULT NULL)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE v_id UUID;
BEGIN
  INSERT INTO turnout_rung_debriefs (user_id, rung_code, arousal, note)
  VALUES (p_user, p_rung, GREATEST(0, LEAST(10, p_arousal)), NULLIF(trim(p_note), ''))
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$fn$;
GRANT EXECUTE ON FUNCTION turnout_record_debrief(UUID, TEXT, INT, TEXT) TO authenticated, service_role;

-- ── 4. turnout_rung_consolidated — real aroused_debrief_ok, gap_extra_days retained ──
-- Byte-identical to mig 670's version except the aroused-debrief criterion is
-- now a real read instead of a hardcoded TRUE (and instead of the field mig
-- 670 silently dropped from the payload altogether).
CREATE OR REPLACE FUNCTION turnout_rung_consolidated(p_user UUID, p_rung TEXT)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
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

  -- (f) aroused debrief: a real self-report, captured for THIS rung since it
  -- was entered, at arousal >= 6/10 — state-dependent encoding needs the
  -- aroused state to actually exist, not just a fulfilled checkbox. A calmer
  -- honest report doesn't consolidate; it holds (§2 step 3b — "the
  -- orchestrator holds and re-runs with more prep").
  SELECT EXISTS (
    SELECT 1 FROM turnout_rung_debriefs
    WHERE user_id = p_user AND rung_code = p_rung AND arousal >= 6
      AND captured_at >= COALESCE(v_state.entered_at, '-infinity'::timestamptz)
  ) INTO v_aroused_debrief_ok;

  RETURN jsonb_build_object(
    'consolidated', (v_dwell_ok AND v_no_halt AND v_anchor_ok AND v_aroused_debrief_ok),
    'dwell_ok', v_dwell_ok,
    'no_halt', v_no_halt,
    'anchor_ok', v_anchor_ok,
    'aroused_debrief_ok', v_aroused_debrief_ok,
    'gap_min_days', v_rung.gap_min_days,
    'gap_extra_days', COALESCE(v_state.gap_extra_days, 0),
    'note', 'orchestrator adds the decree-fulfilled check; aroused_debrief_ok is now real'
  );
END;
$fn$;
GRANT EXECUTE ON FUNCTION turnout_rung_consolidated(UUID, TEXT) TO authenticated, service_role;
