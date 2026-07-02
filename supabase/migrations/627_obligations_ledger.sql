-- 627 — Enforcement Spine v2: the Obligation Ledger.
--
-- Design: DESIGN_ENFORCEMENT_SPINE_2026-07-01.md §1, §3, §7 L1.
-- Mig 601 built a gate (penalty_may_apply) but not a chokepoint — it was only
-- consulted by writers who volunteered. This makes the ledger the only legal
-- path to a consequence, enforced in the database where volunteering doesn't
-- exist:
--
--   1. obligations — the real table superseding penalty_previews.
--   2. obligation_transition() — the single lifecycle function.
--      filed→due is ILLEGAL (auto-voids + supervisor alarm: visible-before-
--      penalized as a state-machine invariant). missed REQUIRES an evidence
--      row pointer. consequence_fired is terminal and unique.
--   3. enforcement_gate(user) — 'active'|'paused'|'safeword_latched';
--      errors fail CLOSED to 'paused' with a supervisor critical.
--   4. safeword_latches — a safeword LATCHES (no timer expiry); resume is an
--      explicit user action that starts a 24h ramp.
--   5. Chokepoint BEFORE INSERT triggers on slip_log + punishment_queue.
--      Start in WARN mode (allow + log penalty_without_obligation) via the
--      enforcement_settings config row; flip to 'enforce' after the shadow
--      week (mig 640 in the master plan).
--   6. push_unlock_date() — the only sanctioned way to move a chastity
--      unlock date. Applies once per obligation, chain-capped at +7d/14d.
--   7. Auto-file triggers: decrees/commitments/confessions (ported from 601)
--      + punishment_queue, dose_log, workout_prescriptions (new).
--   8. penalty_previews becomes a compatibility view; register_penalty_preview
--      / penalty_may_apply / mark_penalty_applied keep their signatures but
--      read/write the ledger.
--   9. Pause-shift accruer: while paused/latched, live deadlines shift
--      forward so resume never lands on a wall of already-missed deadlines.

-- ─────────────────────────────────────────────────────────────────────────
-- 0. Config: chokepoint mode (warn → enforce is the rollout lever)
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS enforcement_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE enforcement_settings ENABLE ROW LEVEL SECURITY;
DO $do$ BEGIN
  CREATE POLICY enforcement_settings_service ON enforcement_settings
    FOR ALL TO service_role USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $do$;
DO $do$ BEGIN
  CREATE POLICY enforcement_settings_read ON enforcement_settings
    FOR SELECT TO authenticated USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $do$;

INSERT INTO enforcement_settings (key, value)
VALUES ('enforcement_chokepoint_mode', 'warn')
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION enforcement_chokepoint_mode()
RETURNS TEXT LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(
    (SELECT value FROM enforcement_settings WHERE key = 'enforcement_chokepoint_mode'),
    'warn');
$$;
GRANT EXECUTE ON FUNCTION enforcement_chokepoint_mode() TO authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────
-- 1. The ledger
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS obligations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source_table TEXT NOT NULL,
  source_id UUID NOT NULL,
  kind TEXT NOT NULL,                  -- 'decree'|'commitment'|'confession'|'punishment'|'dose'|'workout'|'hard_mode_exit'|legacy kinds
  ask_copy TEXT NOT NULL,              -- plain English (stranger-readable)
  penalty_copy TEXT NOT NULL,
  deadline TIMESTAMPTZ,
  grace_minutes INT NOT NULL DEFAULT 30,
  status TEXT NOT NULL DEFAULT 'filed' CHECK (status IN
    ('filed','surfaced','due','missed','fulfilled','consequence_previewed',
     'consequence_fired','voided','cancelled_system','cancelled_user','paused')),
  surfaced_at TIMESTAMPTZ,             -- genuine render only, never delivered_at (mig 611 rule)
  surfaced_via TEXT,
  evidence_row_table TEXT,
  evidence_row_id UUID,
  consequence_kind TEXT NOT NULL DEFAULT 'internal' CHECK (consequence_kind IN ('internal','outward')),
  consequence_applied_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,            -- compat: penalty_previews.cancelled_at
  preview_outreach_id UUID,            -- companion "cost on the table" outreach
  unlock_push_days INT,                -- push_unlock_date: applied once per obligation
  unlock_pushed_at TIMESTAMPTZ,
  pause_shifted_ms BIGINT NOT NULL DEFAULT 0,
  created_by TEXT NOT NULL DEFAULT 'system',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (source_table, source_id)
);
ALTER TABLE obligations ENABLE ROW LEVEL SECURITY;
DO $do$ BEGIN
  CREATE POLICY obligations_self ON obligations FOR SELECT TO authenticated
    USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $do$;
DO $do$ BEGIN
  CREATE POLICY obligations_service ON obligations FOR ALL TO service_role
    USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $do$;
CREATE INDEX IF NOT EXISTS obligations_live_idx ON obligations(user_id, deadline)
  WHERE status IN ('filed','surfaced','due','missed','consequence_previewed');
CREATE INDEX IF NOT EXISTS obligations_status_idx ON obligations(status, deadline);
CREATE INDEX IF NOT EXISTS obligations_preview_outreach_idx ON obligations(preview_outreach_id)
  WHERE preview_outreach_id IS NOT NULL;

-- All transitions logged.
CREATE TABLE IF NOT EXISTS obligation_transition_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  obligation_id UUID NOT NULL REFERENCES obligations(id) ON DELETE CASCADE,
  from_status TEXT NOT NULL,
  to_status TEXT NOT NULL,
  via TEXT,
  actor TEXT NOT NULL DEFAULT 'system',
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE obligation_transition_log ENABLE ROW LEVEL SECURITY;
DO $do$ BEGIN
  CREATE POLICY oblig_transition_log_service ON obligation_transition_log
    FOR ALL TO service_role USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $do$;
CREATE INDEX IF NOT EXISTS oblig_transition_log_oblig_idx
  ON obligation_transition_log(obligation_id, created_at DESC);

-- ─────────────────────────────────────────────────────────────────────────
-- 2. Safeword latching
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS safeword_latches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source TEXT NOT NULL DEFAULT 'meta_frame_break' CHECK (source IN ('meta_frame_break','manual')),
  meta_frame_break_id UUID,
  latched_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resumed_at TIMESTAMPTZ,              -- explicit user action only, never a timer
  resume_ramp_until TIMESTAMPTZ,       -- resumed_at + 24h; anti-circumvention restores to 3, not 5, during ramp
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE safeword_latches ENABLE ROW LEVEL SECURITY;
DO $do$ BEGIN
  CREATE POLICY safeword_latches_self ON safeword_latches FOR SELECT TO authenticated
    USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $do$;
DO $do$ BEGIN
  CREATE POLICY safeword_latches_service ON safeword_latches FOR ALL TO service_role
    USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $do$;
CREATE INDEX IF NOT EXISTS safeword_latches_open_idx ON safeword_latches(user_id)
  WHERE resumed_at IS NULL;

-- A safeword (or panic gesture) frame-break LATCHES. The 120-min snap-back
-- window is deleted — the latch never expires on a timer.
CREATE OR REPLACE FUNCTION trg_safeword_latch()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.triggered_by IN ('safeword', 'panic_gesture') THEN
    IF NOT EXISTS (SELECT 1 FROM safeword_latches WHERE user_id = NEW.user_id AND resumed_at IS NULL) THEN
      INSERT INTO safeword_latches (user_id, source, meta_frame_break_id)
      VALUES (NEW.user_id, 'meta_frame_break', NEW.id);
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS safeword_latch ON meta_frame_breaks;
CREATE TRIGGER safeword_latch AFTER INSERT ON meta_frame_breaks
  FOR EACH ROW EXECUTE FUNCTION trg_safeword_latch();

-- Resume: explicit user action. Stamps resumed_at + the 24h ramp.
CREATE OR REPLACE FUNCTION resume_from_safeword(p_user UUID)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_updated INT;
BEGIN
  UPDATE safeword_latches
     SET resumed_at = now(), resume_ramp_until = now() + interval '24 hours'
   WHERE user_id = p_user AND resumed_at IS NULL;
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated > 0;
END;
$$;
GRANT EXECUTE ON FUNCTION resume_from_safeword(UUID) TO authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────
-- 3. The gate — one function, three states, fail-closed
-- ─────────────────────────────────────────────────────────────────────────

-- VOLATILE (not STABLE) on purpose: the fail-closed exception path INSERTs a
-- supervisor critical, and Postgres forbids writes in non-volatile functions.
CREATE OR REPLACE FUNCTION enforcement_gate(p_user UUID)
RETURNS TABLE (mode TEXT, until TIMESTAMPTZ, reason TEXT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_pause_until TIMESTAMPTZ;
  v_ramp_until TIMESTAMPTZ;
BEGIN
  -- 1. Open latch → safeword_latched (never expires on a timer).
  IF EXISTS (SELECT 1 FROM safeword_latches sl WHERE sl.user_id = p_user AND sl.resumed_at IS NULL) THEN
    RETURN QUERY SELECT 'safeword_latched'::TEXT, NULL::TIMESTAMPTZ, 'open safeword latch'::TEXT;
    RETURN;
  END IF;
  -- An open post-safeword aftercare session is equivalent to a latch.
  IF EXISTS (SELECT 1 FROM aftercare_sessions a WHERE a.user_id = p_user
             AND a.entry_trigger = 'post_safeword' AND a.exited_at IS NULL) THEN
    RETURN QUERY SELECT 'safeword_latched'::TEXT, NULL::TIMESTAMPTZ, 'open post-safeword aftercare session'::TEXT;
    RETURN;
  END IF;
  -- 2. Pause.
  SELECT us.pause_new_decrees_until INTO v_pause_until FROM user_state us WHERE us.user_id = p_user;
  IF v_pause_until IS NOT NULL AND v_pause_until > now() THEN
    RETURN QUERY SELECT 'paused'::TEXT, v_pause_until, 'pause_new_decrees_until active'::TEXT;
    RETURN;
  END IF;
  -- 3. Active — surface the resume ramp so callers that soften during ramp
  --    (anti-circumvention) can read it from the same call.
  SELECT MAX(sl.resume_ramp_until) INTO v_ramp_until FROM safeword_latches sl
   WHERE sl.user_id = p_user AND sl.resume_ramp_until > now();
  IF v_ramp_until IS NOT NULL THEN
    RETURN QUERY SELECT 'active'::TEXT, v_ramp_until, 'resume_ramp'::TEXT;
    RETURN;
  END IF;
  RETURN QUERY SELECT 'active'::TEXT, NULL::TIMESTAMPTZ, NULL::TEXT;
EXCEPTION WHEN OTHERS THEN
  -- FAIL CLOSED AND LOUD (design §3 / §6 gate_error_failed_closed). This is
  -- deliberately not a silent swallow: the error is logged as a supervisor
  -- CRITICAL and the gate reports 'paused' so no consequence can fire on a
  -- broken gate. (Sanctioned exception to the no-EXCEPTION-WHEN-OTHERS rule:
  -- the design explicitly requires errors to fail closed here.)
  INSERT INTO mommy_supervisor_log (component, severity, event_kind, message, context_data)
  VALUES ('enforcement_gate', 'critical', 'gate_error_failed_closed',
    'enforcement_gate errored — failing closed to paused: ' || SQLERRM,
    jsonb_build_object('user_id', p_user));
  RETURN QUERY SELECT 'paused'::TEXT, NULL::TIMESTAMPTZ, ('gate error: ' || SQLERRM)::TEXT;
END;
$$;
GRANT EXECUTE ON FUNCTION enforcement_gate(UUID) TO authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────
-- 4. The transition function — single lifecycle chokepoint
-- ─────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION obligation_transition(
  p_obligation UUID,
  p_to TEXT,
  p_via TEXT DEFAULT NULL,
  p_evidence_table TEXT DEFAULT NULL,
  p_evidence_id UUID DEFAULT NULL,
  p_actor TEXT DEFAULT 'system'
) RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_o obligations%ROWTYPE;
  v_gate_mode TEXT;
  v_legal BOOLEAN := FALSE;
BEGIN
  SELECT * INTO v_o FROM obligations WHERE id = p_obligation FOR UPDATE;
  IF NOT FOUND THEN RETURN FALSE; END IF;
  IF v_o.status = p_to THEN RETURN TRUE; END IF;  -- idempotent

  -- Terminal states never transition again.
  IF v_o.status IN ('consequence_fired','voided','cancelled_system','cancelled_user','fulfilled') THEN
    RETURN FALSE;
  END IF;

  -- Gate backstop: no penalty-path transition while non-active.
  IF p_to IN ('due','missed','consequence_previewed','consequence_fired') THEN
    SELECT g.mode INTO v_gate_mode FROM enforcement_gate(v_o.user_id) g;
    IF v_gate_mode IS DISTINCT FROM 'active' THEN
      INSERT INTO obligation_transition_log (obligation_id, from_status, to_status, via, actor, note)
      VALUES (p_obligation, v_o.status, p_to, p_via, p_actor, 'REFUSED: gate ' || COALESCE(v_gate_mode, 'unknown'));
      RETURN FALSE;
    END IF;
  END IF;

  -- filed → due is ILLEGAL: a deadline passing on a never-surfaced obligation
  -- voids it permanently and alarms. Visible-before-penalized as invariant.
  IF v_o.status = 'filed' AND p_to = 'due' THEN
    UPDATE obligations SET status = 'voided', cancelled_at = now() WHERE id = p_obligation;
    INSERT INTO obligation_transition_log (obligation_id, from_status, to_status, via, actor, note)
    VALUES (p_obligation, 'filed', 'voided', p_via, p_actor, 'illegal filed->due: never surfaced, penalty permanently dead');
    INSERT INTO mommy_supervisor_log (component, severity, event_kind, message, context_data)
    VALUES ('obligation_ledger', 'warning', 'obligation_voided_unsurfaced',
      'Obligation reached its deadline without EVER surfacing — voided. The generator''s surface path may be broken.',
      jsonb_build_object('obligation_id', p_obligation, 'user_id', v_o.user_id,
                         'source_table', v_o.source_table, 'source_id', v_o.source_id,
                         'created_by', v_o.created_by, 'kind', v_o.kind));
    RETURN FALSE;
  END IF;

  -- Legal transition matrix.
  v_legal := CASE
    WHEN p_to = 'surfaced'              THEN v_o.status IN ('filed','paused')
    WHEN p_to = 'due'                   THEN v_o.status = 'surfaced'
    WHEN p_to = 'missed'                THEN v_o.status = 'due'
    WHEN p_to = 'consequence_previewed' THEN v_o.status = 'missed'
    WHEN p_to = 'consequence_fired'     THEN v_o.status = 'consequence_previewed'
    WHEN p_to = 'fulfilled'             THEN v_o.status IN ('filed','surfaced','due','missed','consequence_previewed','paused')
    WHEN p_to = 'voided'                THEN v_o.status IN ('filed','surfaced','due','missed','consequence_previewed','paused')
    WHEN p_to = 'cancelled_system'      THEN v_o.status IN ('filed','surfaced','due','missed','consequence_previewed','paused')
    WHEN p_to = 'cancelled_user'        THEN v_o.status IN ('filed','surfaced','due','missed','consequence_previewed','paused')
    WHEN p_to = 'paused'                THEN v_o.status IN ('filed','surfaced','due')
    ELSE FALSE
  END;
  IF NOT v_legal THEN
    INSERT INTO obligation_transition_log (obligation_id, from_status, to_status, via, actor, note)
    VALUES (p_obligation, v_o.status, p_to, p_via, p_actor, 'REFUSED: illegal transition');
    RETURN FALSE;
  END IF;

  -- missed REQUIRES an evidence row pointer. Supportive-until-evidence,
  -- made structural.
  IF p_to = 'missed' THEN
    IF COALESCE(p_evidence_table, v_o.evidence_row_table) IS NULL
       OR COALESCE(p_evidence_id, v_o.evidence_row_id) IS NULL THEN
      RAISE EXCEPTION 'obligation_transition: -> missed requires evidence_row_table + evidence_row_id (obligation %)', p_obligation;
    END IF;
  END IF;

  -- consequence_fired is terminal and UNIQUE — never re-fires.
  IF p_to = 'consequence_fired' AND v_o.consequence_applied_at IS NOT NULL THEN
    RETURN FALSE;
  END IF;

  UPDATE obligations SET
    status = p_to,
    surfaced_at = CASE WHEN p_to = 'surfaced' THEN COALESCE(surfaced_at, now()) ELSE surfaced_at END,
    surfaced_via = CASE WHEN p_to = 'surfaced' THEN COALESCE(p_via, surfaced_via) ELSE surfaced_via END,
    evidence_row_table = CASE WHEN p_to = 'missed' THEN COALESCE(p_evidence_table, evidence_row_table) ELSE evidence_row_table END,
    evidence_row_id = CASE WHEN p_to = 'missed' THEN COALESCE(p_evidence_id, evidence_row_id) ELSE evidence_row_id END,
    consequence_applied_at = CASE WHEN p_to = 'consequence_fired' THEN now() ELSE consequence_applied_at END,
    cancelled_at = CASE WHEN p_to IN ('voided','cancelled_system','cancelled_user') THEN now() ELSE cancelled_at END
  WHERE id = p_obligation;

  INSERT INTO obligation_transition_log (obligation_id, from_status, to_status, via, actor)
  VALUES (p_obligation, v_o.status, p_to, p_via, p_actor);

  -- Audit row, same transaction (design §6). enforcement_audit is created in
  -- mig 630 (same release train) — guard so 627..629 can run first.
  IF p_to = 'consequence_fired' AND to_regclass('public.enforcement_audit') IS NOT NULL THEN
    INSERT INTO enforcement_audit (user_id, obligation_id, consequence, evidence)
    VALUES (v_o.user_id, p_obligation, v_o.consequence_kind,
      jsonb_build_object(
        'surfaced_at', v_o.surfaced_at, 'surfaced_via', v_o.surfaced_via,
        'deadline', v_o.deadline, 'grace_minutes', v_o.grace_minutes,
        'evidence_row', jsonb_build_object('table', COALESCE(p_evidence_table, v_o.evidence_row_table),
                                           'id', COALESCE(p_evidence_id, v_o.evidence_row_id)),
        'gate_mode_at_fire', 'active',
        'fired_by', p_actor, 'via', p_via));
  END IF;

  RETURN TRUE;
END;
$$;
GRANT EXECUTE ON FUNCTION obligation_transition(UUID, TEXT, TEXT, TEXT, UUID, TEXT) TO service_role;

-- Helper for the surface-guarantor: void the obligation attached to a source
-- row that expired without ever surfacing.
CREATE OR REPLACE FUNCTION void_obligation_for_source(p_source_table TEXT, p_source_id UUID)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id UUID; v_status TEXT;
BEGIN
  SELECT id, status INTO v_id, v_status FROM obligations
   WHERE source_table = p_source_table AND source_id = p_source_id;
  IF v_id IS NULL THEN RETURN FALSE; END IF;
  IF v_status IN ('voided','cancelled_system','cancelled_user','fulfilled','consequence_fired') THEN
    RETURN FALSE;
  END IF;
  RETURN obligation_transition(v_id, 'voided', 'surface_guarantor', NULL, NULL, 'surface-guarantor');
END;
$$;
GRANT EXECUTE ON FUNCTION void_obligation_for_source(TEXT, UUID) TO service_role;

-- ─────────────────────────────────────────────────────────────────────────
-- 5. Filing: file_obligation() — obligation + companion outreach
-- ─────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION file_obligation(
  p_user UUID, p_source_table TEXT, p_source_id UUID,
  p_kind TEXT, p_ask_copy TEXT, p_penalty_copy TEXT,
  p_deadline TIMESTAMPTZ,
  p_grace_minutes INT DEFAULT 30,
  p_consequence_kind TEXT DEFAULT 'internal',
  p_created_by TEXT DEFAULT 'system',
  p_urgency TEXT DEFAULT 'normal'
) RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_id UUID;
  v_outreach UUID;
  v_msg TEXT;
BEGIN
  INSERT INTO obligations (user_id, source_table, source_id, kind, ask_copy, penalty_copy,
                           deadline, grace_minutes, consequence_kind, created_by)
  VALUES (p_user, p_source_table, p_source_id, p_kind, p_ask_copy, p_penalty_copy,
          p_deadline, p_grace_minutes, p_consequence_kind, p_created_by)
  ON CONFLICT (source_table, source_id) DO NOTHING
  RETURNING id INTO v_id;

  IF v_id IS NULL THEN
    SELECT id INTO v_id FROM obligations WHERE source_table = p_source_table AND source_id = p_source_id;
    RETURN v_id;  -- idempotent: already filed
  END IF;

  -- Companion "cost on the table" outreach. kind stays 'penalty_preview' so
  -- the existing delivery bridge + mirror machinery keep working.
  v_msg := p_ask_copy || ' Cost if missed: ' || p_penalty_copy ||
           CASE WHEN p_deadline IS NOT NULL
                THEN ' Deadline ' || to_char(p_deadline AT TIME ZONE 'utc', 'Mon DD HH24:MI') || ' UTC. It''s written here so it can''t be a surprise.'
                ELSE ' It''s written here so it can''t be a surprise.' END;
  BEGIN
    INSERT INTO handler_outreach_queue (user_id, message, urgency, trigger_reason, source, kind, scheduled_for, expires_at)
    VALUES (p_user, v_msg, COALESCE(p_urgency, 'normal'),
      'obligation_preview:' || p_kind || ':' || p_source_id::text,
      'penalty_preview', 'penalty_preview',
      now(), COALESCE(p_deadline, now() + interval '48 hours'))
    RETURNING id INTO v_outreach;
    UPDATE obligations SET preview_outreach_id = v_outreach WHERE id = v_id;
  EXCEPTION WHEN OTHERS THEN
    -- NOT swallowed (mig 601 regression): outreach failure is logged LOUD as
    -- a supervisor error, and the obligation stays 'filed' — which means the
    -- penalty can never fire until surfacing succeeds. Self-limiting.
    INSERT INTO mommy_supervisor_log (component, severity, event_kind, message, context_data)
    VALUES ('obligation_ledger', 'error', 'preview_outreach_failed',
      'Companion preview outreach insert failed — obligation stays filed and cannot fire: ' || SQLERRM,
      jsonb_build_object('obligation_id', v_id, 'user_id', p_user,
                         'source_table', p_source_table, 'source_id', p_source_id));
  END;

  RETURN v_id;
END;
$$;
GRANT EXECUTE ON FUNCTION file_obligation(UUID, TEXT, UUID, TEXT, TEXT, TEXT, TIMESTAMPTZ, INT, TEXT, TEXT, TEXT) TO authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────
-- 6. Migrate penalty_previews data → obligations, then compat view
-- ─────────────────────────────────────────────────────────────────────────

DO $$
BEGIN
  IF to_regclass('public.penalty_previews') IS NOT NULL
     AND EXISTS (SELECT 1 FROM information_schema.tables
                 WHERE table_schema = 'public' AND table_name = 'penalty_previews'
                   AND table_type = 'BASE TABLE') THEN
    INSERT INTO obligations (user_id, source_table, source_id, kind, ask_copy, penalty_copy,
                             deadline, grace_minutes, status, surfaced_at,
                             consequence_applied_at, cancelled_at, preview_outreach_id,
                             evidence_row_table, evidence_row_id,
                             created_by, created_at)
    SELECT pp.user_id, pp.source_table, pp.source_id, pp.penalty_kind,
           'Task on record (migrated from the penalty-preview rail).',
           pp.penalty_copy, pp.deadline, pp.grace_minutes,
           CASE
             WHEN pp.applied_at IS NOT NULL THEN 'consequence_fired'
             WHEN pp.cancelled_at IS NOT NULL THEN 'cancelled_system'
             WHEN pp.surfaced_at IS NOT NULL THEN 'surfaced'
             ELSE 'filed'
           END,
           pp.surfaced_at, pp.applied_at, pp.cancelled_at, pp.preview_outreach_id,
           -- Fired rows carry the source row as evidence (miss-processor
           -- convention) so the ledger-liveness invariant holds for legacy.
           CASE WHEN pp.applied_at IS NOT NULL THEN pp.source_table END,
           CASE WHEN pp.applied_at IS NOT NULL THEN pp.source_id END,
           'mig627_penalty_preview_migration', pp.created_at
      FROM penalty_previews pp
    ON CONFLICT (source_table, source_id) DO NOTHING;

    DROP TABLE IF EXISTS penalty_previews;
  END IF;
END $$;

-- Compatibility view (one release, then dies — L5 cutover). Auto-updatable
-- for the simple columns delivery-bridge-guard touches (preview_outreach_id).
DROP VIEW IF EXISTS penalty_previews;
CREATE VIEW penalty_previews WITH (security_invoker = true) AS
SELECT id, user_id, source_table, source_id,
       kind AS penalty_kind, penalty_copy, deadline, grace_minutes,
       preview_outreach_id, surfaced_at,
       consequence_applied_at AS applied_at,
       cancelled_at, created_at
  FROM obligations;
GRANT SELECT ON penalty_previews TO authenticated;
GRANT SELECT, UPDATE ON penalty_previews TO service_role;

-- register_penalty_preview: same signature as 601, now files an obligation.
CREATE OR REPLACE FUNCTION register_penalty_preview(
  p_user UUID, p_source_table TEXT, p_source_id UUID,
  p_penalty_kind TEXT, p_penalty_copy TEXT, p_deadline TIMESTAMPTZ,
  p_grace_minutes INTEGER DEFAULT 30, p_urgency TEXT DEFAULT 'normal'
) RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN file_obligation(p_user, p_source_table, p_source_id, p_penalty_kind,
    'There is a deadline on your plate.', p_penalty_copy, p_deadline,
    p_grace_minutes, 'internal', 'register_penalty_preview', p_urgency);
END;
$$;
GRANT EXECUTE ON FUNCTION register_penalty_preview(UUID, TEXT, UUID, TEXT, TEXT, TIMESTAMPTZ, INTEGER, TEXT) TO authenticated, service_role;

-- penalty_may_apply: same signature, reads the ledger. Fail-closed.
-- VOLATILE because enforcement_gate() may write its fail-closed alarm.
CREATE OR REPLACE FUNCTION penalty_may_apply(p_source_table TEXT, p_source_id UUID)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_o obligations%ROWTYPE;
  v_gate_mode TEXT;
BEGIN
  SELECT * INTO v_o FROM obligations WHERE source_table = p_source_table AND source_id = p_source_id;
  IF NOT FOUND THEN RETURN FALSE; END IF;                      -- no cost filed = no penalty
  IF v_o.status IN ('voided','cancelled_system','cancelled_user','fulfilled','paused') THEN RETURN FALSE; END IF;
  IF v_o.consequence_applied_at IS NOT NULL THEN RETURN FALSE; END IF;  -- fired once already
  IF v_o.surfaced_at IS NULL THEN RETURN FALSE; END IF;        -- never genuinely surfaced
  IF now() < v_o.surfaced_at + (v_o.grace_minutes || ' minutes')::interval THEN RETURN FALSE; END IF;
  SELECT g.mode INTO v_gate_mode FROM enforcement_gate(v_o.user_id) g;
  IF v_gate_mode IS DISTINCT FROM 'active' THEN RETURN FALSE; END IF;
  RETURN TRUE;
END;
$$;
GRANT EXECUTE ON FUNCTION penalty_may_apply(TEXT, UUID) TO authenticated, service_role;

-- mark_penalty_applied: same signature, drives the ledger transitions.
CREATE OR REPLACE FUNCTION mark_penalty_applied(p_source_table TEXT, p_source_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id UUID; v_status TEXT;
BEGIN
  SELECT id, status INTO v_id, v_status FROM obligations
   WHERE source_table = p_source_table AND source_id = p_source_id;
  IF v_id IS NULL THEN RETURN; END IF;
  -- Walk the row to consequence_fired through the legal path. Each step is a
  -- no-op if refused (gate closed / already terminal).
  IF v_status = 'surfaced' THEN PERFORM obligation_transition(v_id, 'due', 'mark_penalty_applied'); END IF;
  SELECT status INTO v_status FROM obligations WHERE id = v_id;
  IF v_status = 'due' THEN PERFORM obligation_transition(v_id, 'missed', 'mark_penalty_applied', p_source_table, p_source_id); END IF;
  SELECT status INTO v_status FROM obligations WHERE id = v_id;
  IF v_status = 'missed' THEN PERFORM obligation_transition(v_id, 'consequence_previewed', 'mark_penalty_applied'); END IF;
  SELECT status INTO v_status FROM obligations WHERE id = v_id;
  IF v_status = 'consequence_previewed' THEN PERFORM obligation_transition(v_id, 'consequence_fired', 'mark_penalty_applied'); END IF;
END;
$$;
GRANT EXECUTE ON FUNCTION mark_penalty_applied(TEXT, UUID) TO authenticated, service_role;

-- Mirror trigger: genuine outreach surfacing → obligation surfaced.
-- (Replaces 601/611's trg_penalty_preview_mirror_surface; surfaced_at only,
-- never delivered_at — mig 611 rule.)
CREATE OR REPLACE FUNCTION trg_penalty_preview_mirror_surface()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id UUID; v_status TEXT;
BEGIN
  IF NEW.kind = 'penalty_preview' AND NEW.surfaced_at IS NOT NULL THEN
    SELECT id, status INTO v_id, v_status FROM obligations WHERE preview_outreach_id = NEW.id;
    IF v_id IS NOT NULL AND v_status = 'filed' THEN
      PERFORM obligation_transition(v_id, 'surfaced', 'outreach_render');
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS penalty_preview_mirror_surface ON handler_outreach_queue;
CREATE TRIGGER penalty_preview_mirror_surface
  AFTER UPDATE OF surfaced_at, delivered_at, status ON handler_outreach_queue
  FOR EACH ROW EXECUTE FUNCTION trg_penalty_preview_mirror_surface();

-- Decrees carry their own surfaced_at (UI render contract). Mirror it.
CREATE OR REPLACE FUNCTION trg_decree_surface_mirror()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id UUID; v_status TEXT;
BEGIN
  IF NEW.surfaced_at IS NOT NULL AND (OLD.surfaced_at IS NULL) THEN
    SELECT id, status INTO v_id, v_status FROM obligations
     WHERE source_table = 'handler_decrees' AND source_id = NEW.id;
    IF v_id IS NOT NULL AND v_status = 'filed' THEN
      PERFORM obligation_transition(v_id, 'surfaced', 'decree_render');
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS decree_surface_mirror ON handler_decrees;
CREATE TRIGGER decree_surface_mirror
  AFTER UPDATE OF surfaced_at ON handler_decrees
  FOR EACH ROW EXECUTE FUNCTION trg_decree_surface_mirror();

-- ─────────────────────────────────────────────────────────────────────────
-- 7. Chokepoint columns + triggers (WARN mode at ship)
-- ─────────────────────────────────────────────────────────────────────────

ALTER TABLE slip_log ADD COLUMN IF NOT EXISTS obligation_id UUID;
ALTER TABLE punishment_queue ADD COLUMN IF NOT EXISTS obligation_id UUID;

-- slip_log: a SYNTHETIC slip must chain to an obligation in missed /
-- consequence_previewed. Organic (chat-quoted) slips are exempt here and
-- capped in the calculus (mig 628).
CREATE OR REPLACE FUNCTION trg_slip_obligation_chokepoint()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_mode TEXT; v_ok BOOLEAN := FALSE;
BEGIN
  IF NOT COALESCE(NEW.is_synthetic, FALSE) THEN RETURN NEW; END IF;
  IF NEW.obligation_id IS NOT NULL THEN
    SELECT TRUE INTO v_ok FROM obligations
     WHERE id = NEW.obligation_id AND user_id = NEW.user_id
       AND status IN ('missed','consequence_previewed','consequence_fired');
  END IF;
  IF COALESCE(v_ok, FALSE) THEN RETURN NEW; END IF;

  v_mode := enforcement_chokepoint_mode();
  IF v_mode = 'enforce' THEN
    INSERT INTO mommy_supervisor_log (component, severity, event_kind, message, context_data)
    VALUES ('slip_log_chokepoint', 'critical', 'penalty_without_obligation',
      'Synthetic slip REJECTED: no valid missed obligation attached.',
      jsonb_build_object('user_id', NEW.user_id, 'slip_type', NEW.slip_type,
                         'obligation_id', NEW.obligation_id, 'source_text', left(COALESCE(NEW.source_text,''), 200)));
    RAISE EXCEPTION 'slip_log chokepoint: synthetic slip requires an obligation in missed/consequence_previewed (got %)', NEW.obligation_id;
  END IF;
  -- WARN mode: allow + log.
  INSERT INTO mommy_supervisor_log (component, severity, event_kind, message, context_data)
  VALUES ('slip_log_chokepoint', 'warning', 'penalty_without_obligation',
    'Synthetic slip without a valid missed obligation (WARN mode — allowed).',
    jsonb_build_object('user_id', NEW.user_id, 'slip_type', NEW.slip_type,
                       'obligation_id', NEW.obligation_id, 'source_text', left(COALESCE(NEW.source_text,''), 200)));
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS b_slip_obligation_chokepoint ON slip_log;
CREATE TRIGGER b_slip_obligation_chokepoint BEFORE INSERT ON slip_log
  FOR EACH ROW EXECUTE FUNCTION trg_slip_obligation_chokepoint();

-- punishment_queue: every punishment must carry the obligation that justified
-- it. De-escalation tasks are relief work, not penalties — exempt.
CREATE OR REPLACE FUNCTION trg_punishment_obligation_chokepoint()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_mode TEXT; v_ok BOOLEAN := FALSE;
BEGIN
  IF COALESCE(NEW.parameters->>'is_deescalation', 'false') = 'true' THEN RETURN NEW; END IF;
  IF NEW.obligation_id IS NOT NULL THEN
    SELECT TRUE INTO v_ok FROM obligations
     WHERE id = NEW.obligation_id AND user_id = NEW.user_id
       AND status IN ('missed','consequence_previewed','consequence_fired');
  END IF;
  IF COALESCE(v_ok, FALSE) THEN RETURN NEW; END IF;

  v_mode := enforcement_chokepoint_mode();
  IF v_mode = 'enforce' THEN
    INSERT INTO mommy_supervisor_log (component, severity, event_kind, message, context_data)
    VALUES ('punishment_queue_chokepoint', 'critical', 'penalty_without_obligation',
      'Punishment REJECTED: no valid missed obligation attached.',
      jsonb_build_object('user_id', NEW.user_id, 'punishment_type', NEW.punishment_type,
                         'title', NEW.title, 'obligation_id', NEW.obligation_id));
    RAISE EXCEPTION 'punishment_queue chokepoint: punishment requires an obligation in missed/consequence_previewed (got %)', NEW.obligation_id;
  END IF;
  INSERT INTO mommy_supervisor_log (component, severity, event_kind, message, context_data)
  VALUES ('punishment_queue_chokepoint', 'warning', 'penalty_without_obligation',
    'Punishment without a valid missed obligation (WARN mode — allowed).',
    jsonb_build_object('user_id', NEW.user_id, 'punishment_type', NEW.punishment_type,
                       'title', NEW.title, 'obligation_id', NEW.obligation_id));
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS b_punishment_obligation_chokepoint ON punishment_queue;
CREATE TRIGGER b_punishment_obligation_chokepoint BEFORE INSERT ON punishment_queue
  FOR EACH ROW EXECUTE FUNCTION trg_punishment_obligation_chokepoint();

-- ─────────────────────────────────────────────────────────────────────────
-- 8. push_unlock_date — the only sanctioned unlock-date mover
-- ─────────────────────────────────────────────────────────────────────────

-- Derived counters are never additive: this pushes the TARGET (unlock date),
-- never a streak counter. Applies once per obligation; the CHAIN of pushes
-- across obligations is capped at +7 days per rolling 14 days.
CREATE OR REPLACE FUNCTION push_unlock_date(p_user UUID, p_obligation UUID, p_days INT)
RETURNS INT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_o obligations%ROWTYPE;
  v_gate_mode TEXT;
  v_chain_days INT;
  v_apply_days INT;
  v_session RECORD;
  v_new_unlock TIMESTAMPTZ;
BEGIN
  IF p_days IS NULL OR p_days <= 0 THEN RETURN 0; END IF;

  SELECT * INTO v_o FROM obligations WHERE id = p_obligation AND user_id = p_user FOR UPDATE;
  IF NOT FOUND THEN RETURN 0; END IF;
  IF v_o.status NOT IN ('missed','consequence_previewed','consequence_fired') THEN RETURN 0; END IF;
  IF v_o.surfaced_at IS NULL THEN RETURN 0; END IF;            -- never surfaced = never penalized
  IF v_o.unlock_pushed_at IS NOT NULL THEN RETURN 0; END IF;   -- once per obligation

  SELECT g.mode INTO v_gate_mode FROM enforcement_gate(p_user) g;
  IF v_gate_mode IS DISTINCT FROM 'active' THEN RETURN 0; END IF;

  SELECT COALESCE(SUM(unlock_push_days), 0) INTO v_chain_days
    FROM obligations
   WHERE user_id = p_user AND unlock_pushed_at > now() - interval '14 days';
  v_apply_days := LEAST(p_days, GREATEST(0, 7 - v_chain_days));
  IF v_apply_days <= 0 THEN
    INSERT INTO mommy_supervisor_log (component, severity, event_kind, message, context_data)
    VALUES ('push_unlock_date', 'info', 'unlock_push_chain_capped',
      'Unlock push refused — +7d/14d chain cap reached.',
      jsonb_build_object('user_id', p_user, 'obligation_id', p_obligation, 'requested_days', p_days));
    RETURN 0;
  END IF;

  SELECT id, scheduled_unlock_at INTO v_session FROM chastity_sessions
   WHERE user_id = p_user AND status = 'locked'
   ORDER BY locked_at DESC LIMIT 1;
  IF v_session.id IS NULL THEN RETURN 0; END IF;

  v_new_unlock := COALESCE(v_session.scheduled_unlock_at, now()) + (v_apply_days || ' days')::interval;
  UPDATE chastity_sessions SET scheduled_unlock_at = v_new_unlock WHERE id = v_session.id;
  UPDATE user_state SET chastity_scheduled_unlock_at = v_new_unlock WHERE user_id = p_user;
  UPDATE obligations SET unlock_push_days = v_apply_days, unlock_pushed_at = now() WHERE id = p_obligation;

  RETURN v_apply_days;
END;
$$;
GRANT EXECUTE ON FUNCTION push_unlock_date(UUID, UUID, INT) TO service_role;

-- ─────────────────────────────────────────────────────────────────────────
-- 9. Auto-file triggers (601 sources ported + new sinks)
-- ─────────────────────────────────────────────────────────────────────────

-- Retire the 601 preview triggers — file_obligation supersedes them.
DROP TRIGGER IF EXISTS auto_preview_commitment ON handler_commitments;
DROP TRIGGER IF EXISTS auto_preview_decree ON handler_decrees;
DROP TRIGGER IF EXISTS auto_preview_confession ON confession_queue;
DROP FUNCTION IF EXISTS trg_auto_preview_commitment();
DROP FUNCTION IF EXISTS trg_auto_preview_decree();
DROP FUNCTION IF EXISTS trg_auto_preview_confession();

CREATE OR REPLACE FUNCTION trg_oblig_file_commitment()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF COALESCE(NEW.status, 'pending') = 'pending'
     AND NEW.by_when IS NOT NULL
     AND NEW.consequence IS NOT NULL AND length(trim(NEW.consequence)) > 0 THEN
    PERFORM file_obligation(NEW.user_id, 'handler_commitments', NEW.id, 'commitment',
      NEW.what, NEW.consequence, NEW.by_when, 30, 'internal', 'handler_commitments_autofile', 'normal');
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS oblig_file_commitment ON handler_commitments;
CREATE TRIGGER oblig_file_commitment AFTER INSERT ON handler_commitments
  FOR EACH ROW EXECUTE FUNCTION trg_oblig_file_commitment();

CREATE OR REPLACE FUNCTION trg_oblig_file_decree()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF COALESCE(NEW.status, 'active') = 'active'
     AND NEW.deadline IS NOT NULL
     AND NEW.consequence IS NOT NULL AND length(trim(NEW.consequence)) > 0 THEN
    -- Hard-mode de-escalation decrees are relief work: kind hard_mode_exit
    -- (no sub-penalties — the miss-processor writes no pressure for them).
    PERFORM file_obligation(NEW.user_id, 'handler_decrees', NEW.id,
      CASE WHEN NEW.trigger_source = 'hard_mode_deescalation' THEN 'hard_mode_exit' ELSE 'decree' END,
      NEW.edict, NEW.consequence, NEW.deadline, 30, 'internal', 'handler_decrees_autofile', 'normal');
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS oblig_file_decree ON handler_decrees;
CREATE TRIGGER oblig_file_decree AFTER INSERT ON handler_decrees
  FOR EACH ROW EXECUTE FUNCTION trg_oblig_file_decree();

CREATE OR REPLACE FUNCTION trg_oblig_file_confession()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.deadline IS NOT NULL AND NEW.confessed_at IS NULL AND COALESCE(NEW.missed, FALSE) = FALSE THEN
    PERFORM file_obligation(NEW.user_id, 'confession_queue', NEW.id, 'confession',
      NEW.prompt,
      'Miss this confession and it goes on your record as a slip.',
      NEW.deadline, 30, 'internal', 'confession_queue_autofile', 'low');
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS oblig_file_confession ON confession_queue;
CREATE TRIGGER oblig_file_confession AFTER INSERT ON confession_queue
  FOR EACH ROW EXECUTE FUNCTION trg_oblig_file_confession();

-- NEW: punishments are themselves surfaced-before-penalized.
CREATE OR REPLACE FUNCTION trg_oblig_file_punishment()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_kind TEXT; v_penalty TEXT;
BEGIN
  IF COALESCE(NEW.status, 'queued') NOT IN ('queued','active') THEN RETURN NEW; END IF;
  IF COALESCE(NEW.parameters->>'is_deescalation', 'false') = 'true' THEN
    v_kind := 'hard_mode_exit';
    v_penalty := 'No added penalty. Hard Mode simply stays on until this is done.';
  ELSE
    v_kind := 'punishment';
    v_penalty := 'Dodge this and it re-arms once with 24 more hours. Dodge it again and it is commuted: a stiffer replacement task, plus up to 2 days added to your unlock date.';
  END IF;
  PERFORM file_obligation(NEW.user_id, 'punishment_queue', NEW.id, v_kind,
    COALESCE(NEW.title, 'Assigned task') || '. ' || COALESCE(NEW.description, ''),
    v_penalty, NEW.due_by, 30, 'internal', 'punishment_queue_autofile',
    CASE WHEN COALESCE(NEW.severity, 1) >= 3 THEN 'high' ELSE 'normal' END);
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS oblig_file_punishment ON punishment_queue;
CREATE TRIGGER oblig_file_punishment AFTER INSERT ON punishment_queue
  FOR EACH ROW EXECUTE FUNCTION trg_oblig_file_punishment();

-- NEW: scheduled doses. Grace 120 min matches the force-processor's window.
CREATE OR REPLACE FUNCTION trg_oblig_file_dose()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.scheduled_at IS NOT NULL AND NEW.taken_at IS NULL AND COALESCE(NEW.skipped, FALSE) = FALSE THEN
    PERFORM file_obligation(NEW.user_id, 'dose_log', NEW.id, 'dose',
      'Take your scheduled dose and log it.',
      'Missing the dose logs a slip and assigns 50 mantra recitations before sleep.',
      NEW.scheduled_at, 120, 'internal', 'dose_log_autofile', 'low');
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS oblig_file_dose ON dose_log;
CREATE TRIGGER oblig_file_dose AFTER INSERT ON dose_log
  FOR EACH ROW EXECUTE FUNCTION trg_oblig_file_dose();

-- NEW: prescribed workouts. Deadline = end of the scheduled day.
CREATE OR REPLACE FUNCTION trg_oblig_file_workout()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF COALESCE(NEW.status, 'prescribed') = 'prescribed' AND NEW.scheduled_date IS NOT NULL THEN
    PERFORM file_obligation(NEW.user_id, 'workout_prescriptions', NEW.id, 'workout',
      'Complete the prescribed workout' || COALESCE(': ' || NEW.focus_area, '') || '.',
      'Skipping logs a slip and resets your workout streak.',
      (NEW.scheduled_date::timestamptz + interval '23 hours 59 minutes'),
      60, 'internal', 'workout_prescriptions_autofile', 'low');
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS oblig_file_workout ON workout_prescriptions;
CREATE TRIGGER oblig_file_workout AFTER INSERT ON workout_prescriptions
  FOR EACH ROW EXECUTE FUNCTION trg_oblig_file_workout();

-- ─────────────────────────────────────────────────────────────────────────
-- 10. Fulfillment bridges — source completion resolves the obligation
-- ─────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION trg_oblig_fulfill_generic()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_done BOOLEAN := FALSE;
  v_id UUID;
BEGIN
  v_done := CASE TG_TABLE_NAME
    WHEN 'handler_decrees' THEN NEW.status = 'fulfilled'
    WHEN 'handler_commitments' THEN NEW.status IN ('completed','kept','fulfilled')
    WHEN 'confession_queue' THEN NEW.confessed_at IS NOT NULL
    WHEN 'punishment_queue' THEN NEW.status = 'completed'
    WHEN 'dose_log' THEN NEW.taken_at IS NOT NULL
    WHEN 'workout_prescriptions' THEN NEW.status = 'completed'
    ELSE FALSE
  END;
  IF v_done THEN
    SELECT id INTO v_id FROM obligations
     WHERE source_table = TG_TABLE_NAME AND source_id = NEW.id
       AND status IN ('filed','surfaced','due','missed','consequence_previewed','paused');
    IF v_id IS NOT NULL THEN
      PERFORM obligation_transition(v_id, 'fulfilled', 'source_completed');
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS oblig_fulfill_decree ON handler_decrees;
CREATE TRIGGER oblig_fulfill_decree AFTER UPDATE ON handler_decrees
  FOR EACH ROW EXECUTE FUNCTION trg_oblig_fulfill_generic();
DROP TRIGGER IF EXISTS oblig_fulfill_commitment ON handler_commitments;
CREATE TRIGGER oblig_fulfill_commitment AFTER UPDATE ON handler_commitments
  FOR EACH ROW EXECUTE FUNCTION trg_oblig_fulfill_generic();
DROP TRIGGER IF EXISTS oblig_fulfill_confession ON confession_queue;
CREATE TRIGGER oblig_fulfill_confession AFTER UPDATE ON confession_queue
  FOR EACH ROW EXECUTE FUNCTION trg_oblig_fulfill_generic();
DROP TRIGGER IF EXISTS oblig_fulfill_punishment ON punishment_queue;
CREATE TRIGGER oblig_fulfill_punishment AFTER UPDATE ON punishment_queue
  FOR EACH ROW EXECUTE FUNCTION trg_oblig_fulfill_generic();
DROP TRIGGER IF EXISTS oblig_fulfill_dose ON dose_log;
CREATE TRIGGER oblig_fulfill_dose AFTER UPDATE ON dose_log
  FOR EACH ROW EXECUTE FUNCTION trg_oblig_fulfill_generic();
DROP TRIGGER IF EXISTS oblig_fulfill_workout ON workout_prescriptions;
CREATE TRIGGER oblig_fulfill_workout AFTER UPDATE ON workout_prescriptions
  FOR EACH ROW EXECUTE FUNCTION trg_oblig_fulfill_generic();

-- ─────────────────────────────────────────────────────────────────────────
-- 11. cancel_reason on decrees + 494 pause trigger tags its cancels
-- ─────────────────────────────────────────────────────────────────────────

ALTER TABLE handler_decrees ADD COLUMN IF NOT EXISTS cancel_reason TEXT;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'handler_decrees_cancel_reason_check') THEN
    ALTER TABLE handler_decrees ADD CONSTRAINT handler_decrees_cancel_reason_check
      CHECK (cancel_reason IS NULL OR cancel_reason IN
        ('user_skip','throttle','pause_auto_cancel','superseded','system_prune'));
  END IF;
END $do$;

-- Update the mig-494 pause trigger to stamp cancel_reason so anti-
-- circumvention's "ducked" count can exclude pause cancels.
CREATE OR REPLACE FUNCTION trg_respect_decree_pause()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_pause_until TIMESTAMPTZ;
BEGIN
  IF NEW.status <> 'active' THEN RETURN NEW; END IF;
  IF NEW.trigger_source IN (
    'reversal_anchor', 'chastity_checkin', 'sleep_state_first_wake',
    'chain_test_voice_proof', 'mama_capability_digest', 'system_audit'
  ) THEN RETURN NEW; END IF;
  SELECT pause_new_decrees_until INTO v_pause_until FROM user_state WHERE user_id = NEW.user_id;
  IF v_pause_until IS NULL OR v_pause_until <= now() THEN RETURN NEW; END IF;
  NEW.status := 'cancelled';
  NEW.cancel_reason := 'pause_auto_cancel';
  NEW.reasoning := COALESCE(NEW.reasoning, '') ||
    E'\n[auto-cancel ' || now()::text || E'] pause_new_decrees_until=' || v_pause_until::text ||
    E'. Respects mig 494 self-tuning pace — user signaled resistance, generator suppressed.';
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS respect_decree_pause ON handler_decrees;
CREATE TRIGGER respect_decree_pause BEFORE INSERT ON handler_decrees
  FOR EACH ROW EXECUTE FUNCTION trg_respect_decree_pause();

-- ─────────────────────────────────────────────────────────────────────────
-- 12. Pause-shift accruer — deadlines freeze while paused/latched
-- ─────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION obligation_pause_shift_accrue()
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_count INTEGER;
BEGIN
  -- Every 5-min tick while a user is paused or latched, live deadlines slide
  -- 5 minutes forward. On resume, nothing is already-missed.
  UPDATE obligations o
     SET deadline = o.deadline + interval '5 minutes',
         pause_shifted_ms = o.pause_shifted_ms + 300000
   WHERE o.status IN ('filed','surfaced','due')
     AND o.deadline IS NOT NULL
     AND (
       EXISTS (SELECT 1 FROM safeword_latches sl WHERE sl.user_id = o.user_id AND sl.resumed_at IS NULL)
       OR EXISTS (SELECT 1 FROM user_state us WHERE us.user_id = o.user_id
                  AND us.pause_new_decrees_until IS NOT NULL AND us.pause_new_decrees_until > now())
     );
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

-- Schedule (extension-availability guard only — the sanctioned DO/EXCEPTION).
DO $$
BEGIN
  PERFORM cron.unschedule('obligation-pause-shift-accruer');
EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$
BEGIN
  PERFORM cron.schedule('obligation-pause-shift-accruer', '*/5 * * * *',
    'SELECT obligation_pause_shift_accrue();');
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE '627: pause-shift accruer cron skipped (pg_cron unavailable): %', SQLERRM;
END $$;

NOTIFY pgrst, 'reload schema';
