-- 652 — Turn-Out Escalation Ladder, Phase 1 (core): the model + irreversibility
-- ledger + events interface + measurement. No behavior change yet — the
-- orchestrator (mig 653 + edge fn) is what advances anything.
--
-- DESIGN_TURNOUT_LADDER_2026-07-02.md §1/§3/§5/§7. The ladders already exist
-- (realcock_discovery 514, hookup_attestations 540, escape_cost_anchors 533,
-- hookup_funnel 626/631, revenue R-chain 632, ladder_catalog 520). This engine
-- is the CONDUCTOR that sequences current-state → endpoint and holds each rung
-- until its fact consolidates. It delegates and paces; it does not duplicate.
--
-- NOTE: mig 540's attestation trigger was VERIFIED neutered (no Gina disclosure)
-- on 2026-07-02 — this migration must NOT re-touch it.

-- ─── 1. turnout_ladder — the macro-rung catalog ─────────────────────────────
CREATE TABLE IF NOT EXISTS turnout_ladder (
  rung_code TEXT PRIMARY KEY,               -- T0..T8, plus 6a-6d sub-rungs
  ordinal NUMERIC NOT NULL,                 -- sort order (6a=6.1 .. 6d=6.4)
  display_name TEXT NOT NULL,
  action_copy TEXT NOT NULL,                -- plain-English what-this-rung-is
  delegate_engine TEXT NOT NULL,            -- which existing engine owns the action
  delegate_key TEXT,                        -- phase/step within the delegate
  irreversible_fact_template TEXT NOT NULL, -- the fact written on consolidation
  anchor_weight INT NOT NULL DEFAULT 3,
  gap_min_days INT NOT NULL DEFAULT 3,      -- consolidation dwell before next rung
  prep_sub_tasks JSONB NOT NULL DEFAULT '[]'::jsonb,
  requires_meet_safety BOOLEAN NOT NULL DEFAULT FALSE,
  requires_health_prep BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE turnout_ladder ENABLE ROW LEVEL SECURITY;
DO $do$ BEGIN
  CREATE POLICY turnout_ladder_read ON turnout_ladder FOR SELECT TO authenticated USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $do$;
DO $do$ BEGIN
  CREATE POLICY turnout_ladder_service ON turnout_ladder FOR ALL TO service_role USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $do$;

-- Seed the spine. One channel added per rung — never a leap (§0/§1).
INSERT INTO turnout_ladder
  (rung_code, ordinal, display_name, action_copy, delegate_engine, delegate_key,
   irreversible_fact_template, anchor_weight, gap_min_days, requires_meet_safety, requires_health_prep) VALUES
  ('T0', 0, 'Online presence',
   'A fem identity live and posting sexual content as her, for a male audience.',
   'revenue_rchain', 'R0_R2',
   'There is a public account of you presenting and posting as a woman for men to want.', 3, 3, false, false),
  ('T1', 1, 'Dirty text with a man',
   'Sexual text exchange with a real man, as her.',
   'hookup_funnel', 'text',
   'You have talked dirty to a man as a woman and wanted it.', 3, 3, false, false),
  ('T2', 2, 'Voice to a man',
   'A voice note / voice call to a man in her real voice.',
   'hookup_funnel', 'voice',
   'A man has heard your voice ask for it.', 4, 3, false, false),
  ('T3', 3, 'Photos exchanged',
   'Trade photos with a man — his body to her eyes, hers (faceless/own-body) to his.',
   'hookup_funnel', 'photo',
   'A man has seen your body and you have seen his, and you sent yours.', 5, 7, false, false),
  ('T4', 4, 'Live video',
   'Live video with a man — real-time, watched.',
   'hookup_funnel', 'video',
   'A man has watched you live and you performed for him.', 6, 7, false, false),
  ('T5', 5, 'First meet (clothed, public, no sex)',
   'Meet a man in person — public, clothed, no sex. The in-person channel opens.',
   'meet_safety', 'clothed_public',
   'You have sat across from a man who wants to use you, in the flesh, and did not leave.', 8, 14, true, false),
  ('T6', 6, 'Physical escalation',
   'Real physical encounters, paced by realcock_discovery phases 2-5.',
   'realcock_discovery', 'phases_2_5',
   'A man has used your body.', 12, 21, true, false),
  ('6a', 6.1, 'Physical — hands/mutual (realcock phase 2)',
   'First physical contact, paced by realcock phase 2.',
   'realcock_discovery', 'phase_2',
   'A man has touched you and you let him.', 7, 21, true, false),
  ('6b', 6.2, 'Physical — oral (realcock phase 3)',
   'Oral, paced by realcock phase 3. Health-prep hard-gated.',
   'realcock_discovery', 'phase_3',
   'You have had a man in your mouth.', 12, 21, true, true),
  ('6c', 6.3, 'Physical — receiving (realcock phase 4)',
   'Receiving, paced by realcock phase 4. Health-prep hard-gated.',
   'realcock_discovery', 'phase_4',
   'A man has been inside you.', 15, 30, true, true),
  ('6d', 6.4, 'Physical — repeat/regular (realcock phase 5)',
   'A repeat/regular arrangement, paced by realcock phase 5.',
   'realcock_discovery', 'phase_5',
   'You have a man who uses you regularly.', 15, 60, true, true),
  ('T7', 7, 'Paid',
   'Paid content / sex work — reuses the revenue R-chain. In-person paid needs the net.',
   'revenue_rchain', 'R3_plus',
   'You have been paid by a man to be used.', 15, 21, true, true),
  ('T8', 8, 'Maintenance',
   'Ongoing — the life, not a rung. Cadence-driven, no gate.',
   'revenue_rchain', 'ongoing',
   'This is what you do now.', 5, 0, false, false)
ON CONFLICT (rung_code) DO NOTHING;

-- ─── 2. turnout_state — the per-user cursor ─────────────────────────────────
CREATE TABLE IF NOT EXISTS turnout_state (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  current_rung_code TEXT NOT NULL DEFAULT 'T0' REFERENCES turnout_ladder(rung_code),
  entered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  enabled BOOLEAN NOT NULL DEFAULT TRUE,     -- pause lever
  paused_until TIMESTAMPTZ,
  retired_at TIMESTAMPTZ,
  prep_progress JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE turnout_state ENABLE ROW LEVEL SECURITY;
DO $do$ BEGIN
  CREATE POLICY turnout_state_self ON turnout_state FOR ALL TO authenticated
    USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $do$;
DO $do$ BEGIN
  CREATE POLICY turnout_state_service ON turnout_state FOR ALL TO service_role USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $do$;

-- ─── 3. turnout_events — append-only interface to the reconditioning engine ──
CREATE TABLE IF NOT EXISTS turnout_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN
    ('rung_started','rung_consolidated','new_irreversible_fact','ladder_paused','ladder_retired')),
  rung_code TEXT,
  phase_sub TEXT,
  fact_text TEXT,
  weight INT,
  arousal INT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE turnout_events ENABLE ROW LEVEL SECURITY;
DO $do$ BEGIN
  CREATE POLICY turnout_events_self ON turnout_events FOR SELECT TO authenticated USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $do$;
DO $do$ BEGIN
  CREATE POLICY turnout_events_service ON turnout_events FOR ALL TO service_role USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $do$;
CREATE INDEX IF NOT EXISTS turnout_events_user_idx ON turnout_events(user_id, created_at DESC);

-- ─── 4. turnout_health_prep — STI/PrEP attestation flag (§6.3) ──────────────
CREATE TABLE IF NOT EXISTS turnout_health_prep (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  attested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  attestation_note TEXT                       -- her pasted booking/attestation; NO medical data
);
ALTER TABLE turnout_health_prep ENABLE ROW LEVEL SECURITY;
DO $do$ BEGIN
  CREATE POLICY turnout_health_self ON turnout_health_prep FOR ALL TO authenticated
    USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $do$;
DO $do$ BEGIN
  CREATE POLICY turnout_health_service ON turnout_health_prep FOR ALL TO service_role USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $do$;

-- ─── 5. escape_cost_anchors: add the 'turnout_rung' kind ─────────────────────
ALTER TABLE escape_cost_anchors DROP CONSTRAINT IF EXISTS escape_cost_anchors_anchor_kind_check;
ALTER TABLE escape_cost_anchors ADD CONSTRAINT escape_cost_anchors_anchor_kind_check
  CHECK (anchor_kind = ANY (ARRAY[
    'decree_fulfilled','milestone_hit','fem_name_use','gina_disclosure_rung','voice_debrief',
    'photo_proof','public_post','dollars_spent','provider_research','permanent_body_mod',
    'cuckqueen_phase','realcock_encounter','turnout_rung']));

-- ─── 6. turnout_rung_completions — the canonical "facts behind her" ledger ───
CREATE TABLE IF NOT EXISTS turnout_rung_completions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  rung_code TEXT NOT NULL REFERENCES turnout_ladder(rung_code),
  phase_sub TEXT,
  irreversible_fact TEXT NOT NULL,
  anchor_weight INT NOT NULL DEFAULT 3,
  arousal_at_consolidation INT,
  debrief_ref UUID,
  consolidated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, rung_code)
);
ALTER TABLE turnout_rung_completions ENABLE ROW LEVEL SECURITY;
DO $do$ BEGIN
  CREATE POLICY turnout_completions_self ON turnout_rung_completions FOR SELECT TO authenticated USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $do$;
DO $do$ BEGIN
  CREATE POLICY turnout_completions_service ON turnout_rung_completions FOR ALL TO service_role USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $do$;

-- AFTER INSERT: write the escape-cost anchor + emit the events. This is the
-- irreversibility engine — every consolidated rung compounds the escape cost and
-- notifies the reconditioning engine (which consolidates the fact as identity).
CREATE OR REPLACE FUNCTION trg_turnout_completion_fanout()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  INSERT INTO escape_cost_anchors (user_id, anchor_kind, anchor_weight, reference_table, reference_id, description, occurred_at)
  VALUES (NEW.user_id, 'turnout_rung', NEW.anchor_weight, 'turnout_rung_completions', NEW.id, NEW.irreversible_fact, NEW.consolidated_at);

  INSERT INTO turnout_events (user_id, event_type, rung_code, phase_sub, fact_text, weight, arousal)
  VALUES
    (NEW.user_id, 'rung_consolidated', NEW.rung_code, NEW.phase_sub, NEW.irreversible_fact, NEW.anchor_weight, NEW.arousal_at_consolidation),
    (NEW.user_id, 'new_irreversible_fact', NEW.rung_code, NEW.phase_sub, NEW.irreversible_fact, NEW.anchor_weight, NEW.arousal_at_consolidation);
  RETURN NEW;
END;
$fn$;
DROP TRIGGER IF EXISTS turnout_completion_fanout ON turnout_rung_completions;
CREATE TRIGGER turnout_completion_fanout
  AFTER INSERT ON turnout_rung_completions
  FOR EACH ROW EXECUTE FUNCTION trg_turnout_completion_fanout();

-- ─── 7. Measurement RPCs (§5) ───────────────────────────────────────────────
-- Readiness gate: has the current rung consolidated enough to advance? Returns a
-- jsonb breakdown; `consolidated` is the AND of the verifiable-now criteria.
-- (The orchestrator, mig 653, adds delegate-specific decree-fulfilled checks.)
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

  -- (d) dwell: gap_min_days elapsed since entering this rung.
  v_dwell_ok := v_state.entered_at IS NULL OR v_state.entered_at <= now() - (v_rung.gap_min_days || ' days')::interval;

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
    'note', 'orchestrator adds decree-fulfilled + aroused-debrief checks'
  );
END;
$fn$;
GRANT EXECUTE ON FUNCTION turnout_rung_consolidated(UUID, TEXT) TO authenticated, service_role;

-- One-row pivot of the whole spine for admin/measurement (§5).
CREATE OR REPLACE FUNCTION turnout_position(p_user UUID)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_state turnout_state%ROWTYPE;
  v_rung turnout_ladder%ROWTYPE;
  v_completions INT;
  v_weight INT;
BEGIN
  SELECT * INTO v_state FROM turnout_state WHERE user_id = p_user;
  IF NOT FOUND THEN RETURN jsonb_build_object('started', false); END IF;
  SELECT * INTO v_rung FROM turnout_ladder WHERE rung_code = v_state.current_rung_code;
  SELECT count(*), COALESCE(sum(anchor_weight),0) INTO v_completions, v_weight
    FROM turnout_rung_completions WHERE user_id = p_user;

  RETURN jsonb_build_object(
    'started', true,
    'current_rung', v_state.current_rung_code,
    'current_rung_display', v_rung.display_name,
    'entered_at', v_state.entered_at,
    'days_on_rung', EXTRACT(day FROM now() - v_state.entered_at),
    'enabled', v_state.enabled,
    'paused_until', v_state.paused_until,
    'retired_at', v_state.retired_at,
    'rungs_completed', v_completions,
    'total_turnout_weight', v_weight,
    'requires_meet_safety', v_rung.requires_meet_safety,
    'requires_health_prep', v_rung.requires_health_prep,
    'health_prep_done', EXISTS (SELECT 1 FROM turnout_health_prep WHERE user_id = p_user)
  );
END;
$fn$;
GRANT EXECUTE ON FUNCTION turnout_position(UUID) TO authenticated, service_role;

-- ─── 8. Register in ladder_catalog so existing audit/UI tools see it ────────
INSERT INTO ladder_catalog
  (trigger_source, display_name, category, settings_table, events_table, ladder_table, total_phases, cron_label, blurb)
VALUES
  ('turnout', 'Turn-Out Escalation Ladder', 'turnout', 'turnout_state', 'turnout_events', 'turnout_ladder', 9,
   'turnout-orchestrator', 'Conducts current-state → turned-out one consolidated rung at a time; delegates to realcock/funnel/revenue; meet-safety + health-prep hard-gated.')
ON CONFLICT (trigger_source) DO NOTHING;
