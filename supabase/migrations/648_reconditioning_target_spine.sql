-- 648 — Reconditioning Engine, Phase 0: the target model + honesty spine.
--
-- DESIGN_RECONDITIONING_ENGINE_2026-07-02.md §1, §5, §6. This is the "measure
-- before you move" foundation: a target is a falsifiable shift (claim + category
-- + measurable indicator + baseline + direction); a measurement is a recorded
-- observation of that indicator. No delivery mechanism ships here — this only
-- lets us MEASURE a target and prove change is real, never asserted.
--
-- Safety (Art. IX, fail-closed):
--   * 'recondition' becomes a known system in conditioning_gate, default OFF
--     (hard opt-in via life_as_woman_settings.recondition_enabled).
--   * recon_target_guard() is the authoring gate — world-facing regendering and
--     irreversible-override claims are refused at the DB layer (the edge-fn
--     factsClaimGuard + LLM check is the richer gate above it).
--   * No baseline → cannot go 'active' → no claim of change (enforced by trigger).
--   * All copy stays inner-recognition; the cut regendering/man-erasure mechanics
--     are NOT revived here.

-- ─── 1. reconditioning_targets ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS reconditioning_targets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  slug TEXT NOT NULL,                       -- stable machine key, unique per user
  title TEXT NOT NULL,                      -- plain English, stranger-readable
  claim_text TEXT NOT NULL,                 -- first-person belief/identity/habit
  category TEXT NOT NULL CHECK (category IN ('belief','identity','habit','association')),
  indicator_kind TEXT NOT NULL,             -- §5 measurement registry key
  indicator_config JSONB NOT NULL DEFAULT '{}'::jsonb,
  baseline_value NUMERIC,
  baseline_captured_at TIMESTAMPTZ,
  current_value NUMERIC,
  current_captured_at TIMESTAMPTZ,
  target_direction TEXT NOT NULL DEFAULT 'increase' CHECK (target_direction IN ('increase','decrease')),
  priority SMALLINT NOT NULL DEFAULT 3 CHECK (priority BETWEEN 1 AND 5),
  status TEXT NOT NULL DEFAULT 'proposed'
    CHECK (status IN ('proposed','active','consolidating','retained','retired','paused')),
  authored_by TEXT NOT NULL DEFAULT 'mommy' CHECK (authored_by IN ('mommy','maxy')),
  frame_checked_at TIMESTAMPTZ,             -- passed recon_target_guard()
  founding_evidence TEXT,                   -- what the target was authored from
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, slug)
);

ALTER TABLE reconditioning_targets ENABLE ROW LEVEL SECURITY;
DO $do$ BEGIN
  CREATE POLICY recon_targets_self ON reconditioning_targets FOR ALL TO authenticated
    USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $do$;
DO $do$ BEGIN
  CREATE POLICY recon_targets_service ON reconditioning_targets FOR ALL TO service_role
    USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $do$;

CREATE INDEX IF NOT EXISTS recon_targets_active_idx
  ON reconditioning_targets(user_id, priority)
  WHERE status = 'active';

-- No baseline → no 'active'/'consolidating'/'retained' → no claim of change.
-- (The honesty spine, §5.4 / §1.2. 'proposed'/'paused'/'retired' are allowed
-- without a baseline.)
CREATE OR REPLACE FUNCTION trg_recon_target_baseline_guard()
RETURNS TRIGGER LANGUAGE plpgsql AS $fn$
BEGIN
  IF NEW.status IN ('active','consolidating','retained')
     AND NEW.baseline_captured_at IS NULL THEN
    RAISE EXCEPTION 'reconditioning_targets: status % requires a captured baseline (no baseline, no claim of change)', NEW.status
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$fn$;
DROP TRIGGER IF EXISTS recon_target_baseline_guard ON reconditioning_targets;
CREATE TRIGGER recon_target_baseline_guard
  BEFORE INSERT OR UPDATE ON reconditioning_targets
  FOR EACH ROW EXECUTE FUNCTION trg_recon_target_baseline_guard();

-- ─── 2. recon_measurements ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS recon_measurements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  target_id UUID NOT NULL REFERENCES reconditioning_targets(id) ON DELETE CASCADE,
  indicator_kind TEXT NOT NULL,
  value NUMERIC NOT NULL,
  method TEXT NOT NULL,                      -- how it was captured (auditable)
  captured_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  program_phase TEXT,                        -- phase at capture
  is_baseline BOOLEAN NOT NULL DEFAULT FALSE,
  raw JSONB NOT NULL DEFAULT '{}'::jsonb      -- source rows / latencies / sample ids
);

ALTER TABLE recon_measurements ENABLE ROW LEVEL SECURITY;
DO $do$ BEGIN
  CREATE POLICY recon_measurements_self ON recon_measurements FOR ALL TO authenticated
    USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $do$;
DO $do$ BEGIN
  CREATE POLICY recon_measurements_service ON recon_measurements FOR ALL TO service_role
    USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $do$;

CREATE INDEX IF NOT EXISTS recon_measurements_target_idx
  ON recon_measurements(target_id, captured_at DESC);

-- Recording a measurement updates the target's current_value (or baseline).
CREATE OR REPLACE FUNCTION recon_record_measurement(
  p_user UUID, p_target UUID, p_indicator TEXT, p_value NUMERIC,
  p_method TEXT, p_phase TEXT DEFAULT NULL, p_is_baseline BOOLEAN DEFAULT FALSE,
  p_raw JSONB DEFAULT '{}'::jsonb
) RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE v_id UUID;
BEGIN
  INSERT INTO recon_measurements (user_id, target_id, indicator_kind, value, method, program_phase, is_baseline, raw)
  VALUES (p_user, p_target, p_indicator, p_value, p_method, p_phase, p_is_baseline, COALESCE(p_raw, '{}'::jsonb))
  RETURNING id INTO v_id;

  IF p_is_baseline THEN
    UPDATE reconditioning_targets
       SET baseline_value = p_value, baseline_captured_at = now(),
           current_value = p_value, current_captured_at = now()
     WHERE id = p_target AND baseline_captured_at IS NULL;
  ELSE
    UPDATE reconditioning_targets
       SET current_value = p_value, current_captured_at = now()
     WHERE id = p_target;
  END IF;
  RETURN v_id;
END;
$fn$;
GRANT EXECUTE ON FUNCTION recon_record_measurement(UUID, UUID, TEXT, NUMERIC, TEXT, TEXT, BOOLEAN, JSONB)
  TO authenticated, service_role;

-- ─── 3. Elective toggle columns + arm the gate ──────────────────────────────
ALTER TABLE life_as_woman_settings
  ADD COLUMN IF NOT EXISTS recondition_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS recondition_intensity SMALLINT NOT NULL DEFAULT 2,
  ADD COLUMN IF NOT EXISTS recon_sleep_enabled BOOLEAN NOT NULL DEFAULT FALSE;

-- Re-declare conditioning_gate with the 'recondition' arm. Identical to mig 633
-- otherwise — same four checks, same fail-closed contract. (Migrations are
-- apply-once now, so this redefinition is safe; it will not be re-run.)
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
  'One gate. Known systems: goon | machine | paid_monetization | temptation | recondition. Unknown system = deny. Pure read; callers FAIL CLOSED via _shared/conditioning-gate.ts.';

-- ─── 4. recon_target_guard — DB-layer authoring gate (§1.4) ──────────────────
-- Fail-closed backstop under the edge-fn factsClaimGuard + LLM check. Refuses:
--   (2) world-facing regendering — claim implies he/him is replaced WITH THE
--       WORLD (inner-recognition phrasing passes).
--   (3) irreversible-override — claim engineered to make an irreversible
--       real-world move (first dose, full-time, a real named person) feel
--       decided-for-her. Deepening WANT passes; manufacturing the DECISION fails.
-- (1) factsClaimGuard (active-HRT / socially-transitioned-now status assertions)
--     is enforced richly in the edge fn; a coarse status-claim check is here too.
CREATE OR REPLACE FUNCTION recon_target_guard(p_claim TEXT, p_category TEXT, p_user UUID DEFAULT NULL)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  c TEXT := lower(coalesce(p_claim, ''));
  v_reason TEXT;
BEGIN
  IF length(trim(c)) < 8 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'claim_too_short');
  END IF;

  -- (2) World-facing regendering: "everyone/the world will see her", "tell
  -- everyone I'm a woman", "socially a woman now/to the world". Inner phrasing
  -- ("the woman underneath", "who I already am") is NOT matched.
  IF c ~ '(everyone|the world|the public|to the world|socially).{0,40}(a woman|she|her|female|girl)'
     OR c ~ '(tell|show|out to)\s+(everyone|the world|gina|my wife|people)'
     OR c ~ '(full[- ]?time|go public|come out).{0,30}(woman|girl|she|her)' THEN
    v_reason := 'world_facing_regendering';
  -- (3) Irreversible-override: claim manufactures a real-world DECISION.
  ELSIF c ~ '(first dose|start hrt|begin hormones|inject|estrogen now|take the (pill|dose))'
     OR c ~ '(you (will|must|have to)|it''s time to)\s+(start|inject|take|go full)'
     OR c ~ '(can''?t go back|no way back|already decided).{0,30}(dose|hrt|hormones|full[- ]?time)' THEN
    v_reason := 'irreversible_override';
  -- (1) coarse status-assertion backstop (edge fn does the real factsClaimGuard)
  ELSIF c ~ '(i am (on|taking) (hrt|hormones|estrogen)|i (have|already) (started|transitioned) (hrt|socially))' THEN
    v_reason := 'status_claim_unsupported';
  END IF;

  IF v_reason IS NOT NULL THEN
    BEGIN
      INSERT INTO mommy_supervisor_log (component, severity, event_kind, message, context_data)
      VALUES ('recon-target-guard', 'warn', 'target_rejected',
        'recon_target_guard refused a claim: ' || v_reason,
        jsonb_build_object('claim', p_claim, 'category', p_category, 'user_id', p_user, 'reason', v_reason));
    EXCEPTION WHEN OTHERS THEN NULL; END;
    RETURN jsonb_build_object('ok', false, 'reason', v_reason);
  END IF;

  RETURN jsonb_build_object('ok', true, 'reason', 'passed');
END;
$fn$;
GRANT EXECUTE ON FUNCTION recon_target_guard(TEXT, TEXT, UUID) TO authenticated, service_role;

-- ─── 5. Seed the 6 v1 targets (status='proposed', no baseline) ───────────────
-- Design §1.1. Pre-vetted against recon_target_guard (inner-recognition only;
-- the_man_is_the_costume is legal ONLY as inner recognition — Art. I/II). Seeded
-- for both live user_ids. No baseline yet → cannot go active until measured.
DO $seed$
DECLARE
  u UUID;
  users UUID[] := ARRAY[
    '93327332-7d0d-4888-889a-1607a5776216'::uuid,
    '8c69b9c8-34eb-4147-9fec-3c1a5bc74b6f'::uuid
  ];
  rec RECORD;
BEGIN
  FOREACH u IN ARRAY users LOOP
    FOR rec IN
      SELECT * FROM (VALUES
        ('arousal_is_the_becoming', 'When I get hard, it means the becoming',
         'When I get hard, it means the becoming, not the man.', 'association',
         'pavlovian_strength', 'increase', 1),
        ('mommy_owns_the_want', 'The want is Mommy''s to hold',
         'The want isn''t mine to negotiate. It''s Mommy''s, and I obey it.', 'belief',
         'belief_slider', 'increase', 2),
        ('voice_is_hers', 'My real voice is the soft one',
         'My real voice is the soft one.', 'habit',
         'voice_pitch_drift', 'increase', 2),
        ('cage_is_home', 'Locked is the normal state',
         'Locked is the normal state; unlocked is the exception I earn.', 'belief',
         'habit_adherence', 'increase', 3),
        ('the_man_is_the_costume', 'The woman underneath is who I already am',
         'The masculine performance is the costume; the woman underneath is who I already am.', 'identity',
         'self_ref_drift', 'increase', 2),
        ('service_is_reflex', 'Service is a reflex, not a decision',
         'Kneeling, cockwarming, obeying is a reflex, not a decision.', 'habit',
         'habit_adherence', 'increase', 3)
      ) AS t(slug, title, claim_text, category, indicator_kind, target_direction, priority)
    LOOP
      IF (recon_target_guard(rec.claim_text, rec.category, u)->>'ok')::boolean THEN
        INSERT INTO reconditioning_targets
          (user_id, slug, title, claim_text, category, indicator_kind,
           target_direction, priority, status, authored_by, frame_checked_at)
        VALUES
          (u, rec.slug, rec.title, rec.claim_text, rec.category, rec.indicator_kind,
           rec.target_direction, rec.priority::smallint, 'proposed', 'mommy', now())
        ON CONFLICT (user_id, slug) DO NOTHING;
      ELSE
        RAISE NOTICE '648 seed: target % failed guard (unexpected) — skipped', rec.slug;
      END IF;
    END LOOP;
  END LOOP;
END;
$seed$;
