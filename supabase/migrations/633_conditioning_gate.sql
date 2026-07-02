-- 633 — conditioning_gate(uid, system) + safety_exempt_systems registry.
-- DESIGN_TURNING_OUT_2026-07-01.md §5: one gate, four callers.
--
-- conditioning_gate is a PURE READ (STABLE SECURITY DEFINER, no side
-- effects). Callers (goon-trajectory, paid-monetization, machine-overseer
-- start action, temptation-engine) call it as their FIRST act via the
-- fail-closed TS shim supabase/functions/_shared/conditioning-gate.ts —
-- RPC error / malformed reply = denied. The enforcement spine owns WRITING
-- halt state; this gate only reads through one signature.
--
-- Checks, in order:
--   1. safeword  — is_safeword_active(uid, 3600) OR any un-exited
--                  aftercare_sessions row. The aftercare check is a LATCH,
--                  not a 60-second peephole: as long as she is inside an
--                  aftercare session, nothing conditions her.
--   2. paused    — user_state.pause_new_decrees_until in the future.
--   3. elective  — life_as_woman_settings master + per-system toggle
--                  (view pattern from mig 384/375: master_enabled AND
--                  <system>_enabled). UNKNOWN SYSTEM = DENY — a caller that
--                  isn't registered here has no license to condition.
--   4. live_meet — any meet_safety_plans row in status='live': conditioning
--                  holds its tongue during a real date.
--
-- NO EXCEPTION-WHEN-OTHERS wrapper (standing rule: masking constraint
-- violations silently is the bug). Errors propagate; the TS shim converts
-- them to {allowed:false, reason:'gate_error'}.

-- ─── 1. Elective toggles for the four caller systems ────────────────────
-- 'goon' already maps to gooning_enabled (mig 384). machine /
-- paid_monetization / temptation get their own toggles, default OFF for new
-- users per the life-as-woman opt-in floor.
ALTER TABLE life_as_woman_settings
  ADD COLUMN IF NOT EXISTS machine_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS paid_monetization_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS temptation_enabled BOOLEAN NOT NULL DEFAULT FALSE;

-- Grandfather by USAGE EVIDENCE: these engines shipped and ran before the
-- gate existed (machine mig 622/625; goon/paid/temptation generators live
-- for weeks with fulfilled output). Flipping the gate on with default-off
-- toggles would silently brick systems in active use. A system's toggle is
-- seeded TRUE only where evidence of real use exists; master_enabled is
-- raised only for users with at least one evidenced system (it reflects the
-- de-facto state, it does not newly enable anything whose per-system flag
-- stays FALSE).
UPDATE life_as_woman_settings s SET machine_enabled = TRUE
WHERE EXISTS (SELECT 1 FROM machine_sessions m WHERE m.user_id = s.user_id);

UPDATE life_as_woman_settings s SET gooning_enabled = TRUE
WHERE EXISTS (
  SELECT 1 FROM handler_decrees d
  WHERE d.user_id = s.user_id AND d.trigger_source LIKE 'goon_%' AND d.status = 'fulfilled'
);

UPDATE life_as_woman_settings s SET paid_monetization_enabled = TRUE
WHERE EXISTS (
  SELECT 1 FROM handler_decrees d
  WHERE d.user_id = s.user_id
    AND d.trigger_source IN ('paid_stream_block','paid_dm_offer','virtual_gfe','findom_drain','cuddle_prodomme')
);

UPDATE life_as_woman_settings s SET temptation_enabled = TRUE
WHERE EXISTS (
  SELECT 1 FROM handler_decrees d
  WHERE d.user_id = s.user_id AND d.trigger_source = 'temptation_navigate'
);

UPDATE life_as_woman_settings SET master_enabled = TRUE
WHERE machine_enabled OR gooning_enabled OR paid_monetization_enabled OR temptation_enabled;

-- ─── 2. conditioning_gate(uid, system) ──────────────────────────────────
CREATE OR REPLACE FUNCTION conditioning_gate(uid UUID, system TEXT)
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pause TIMESTAMPTZ;
  v_elective BOOLEAN;
BEGIN
  -- (1) Safeword latch: 1h window on the frame-break signal PLUS any
  -- un-exited aftercare session, regardless of how old — being inside
  -- aftercare means conditioning is off until she leaves it.
  IF is_safeword_active(uid, 3600) OR EXISTS (
    SELECT 1 FROM aftercare_sessions
    WHERE user_id = uid AND exited_at IS NULL
  ) THEN
    RETURN jsonb_build_object('allow', false, 'reason', 'safeword');
  END IF;

  -- (2) Pause.
  SELECT pause_new_decrees_until INTO v_pause FROM user_state WHERE user_id = uid;
  IF v_pause IS NOT NULL AND v_pause > now() THEN
    RETURN jsonb_build_object('allow', false, 'reason', 'paused');
  END IF;

  -- (3) Elective toggle. Mirrors the life_as_woman_system_active view
  -- contract (master_enabled AND <system>_enabled) reading the settings
  -- table directly. Unknown system = deny. No settings row = deny.
  SELECT CASE system
    WHEN 'goon'              THEN s.master_enabled AND s.gooning_enabled
    WHEN 'machine'           THEN s.master_enabled AND s.machine_enabled
    WHEN 'paid_monetization' THEN s.master_enabled AND s.paid_monetization_enabled
    WHEN 'temptation'        THEN s.master_enabled AND s.temptation_enabled
    ELSE FALSE
  END INTO v_elective
  FROM life_as_woman_settings s WHERE s.user_id = uid;
  IF v_elective IS DISTINCT FROM TRUE THEN
    RETURN jsonb_build_object('allow', false, 'reason', 'elective_off');
  END IF;

  -- (4) Live meet: she is on a real date — conditioning holds its tongue.
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
  'One gate, four callers (goon-trajectory, paid-monetization, machine-overseer start, temptation-engine). Pure read; callers FAIL CLOSED via _shared/conditioning-gate.ts. Known systems: goon | machine | paid_monetization | temptation. Unknown system = deny.';

-- ─── 3. safety_exempt_systems registry ──────────────────────────────────
-- Systems that must NEVER be suppressed, pruned, or gated: they are the
-- safety net itself. Any cron prune, gate rollout, or suppression sweep
-- MUST consult this table and skip everything in it (the mig 329 prune that
-- killed the surface-guarantor for ~6 weeks is the standing scar).
CREATE TABLE IF NOT EXISTS safety_exempt_systems (
  system TEXT PRIMARY KEY,
  note TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE safety_exempt_systems ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS safety_exempt_systems_read ON safety_exempt_systems;
CREATE POLICY safety_exempt_systems_read ON safety_exempt_systems
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS safety_exempt_systems_service ON safety_exempt_systems;
CREATE POLICY safety_exempt_systems_service ON safety_exempt_systems
  FOR ALL TO service_role USING (true) WITH CHECK (true);

INSERT INTO safety_exempt_systems (system, note) VALUES
  ('meet_safety_watch',    'Per-minute pg_cron watcher over armed/live meet plans. Killing it removes the net while she is out with a stranger.'),
  ('machine_deadman_sweep', 'Per-minute sweep that aborts machine sessions with stale ticks. Killing it leaves the rig running with no brain.'),
  ('safeword-heal',        'Safeword recovery path. Must run even (especially) when every conditioning system is halted.'),
  ('surface-guarantor',    'Visible-before-penalized enforcer. Killing it lets penalties fire on tasks the user never saw (mig 329 scar).')
ON CONFLICT (system) DO NOTHING;

COMMENT ON TABLE safety_exempt_systems IS
  'Registry of never-suppress systems. Cron prunes, conditioning-gate rollouts, and suppression sweeps MUST consult this table and whitelist every row. conditioning_gate() does not apply to these; they run under safeword, pause, and live-meet conditions by design.';

NOTIFY pgrst, 'reload schema';
