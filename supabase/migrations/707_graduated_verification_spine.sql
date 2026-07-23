-- 707 — graduated verification: the app stops treating your word as proof.
--
-- Operator chose "Graduated + honest" 2026-07-23 after demonstrating the hole:
-- every "done" (comfort_slider, text, even photo decrees) fulfilled on the
-- user's word alone — proof types were decorative, and a false "done" wrote a
-- clean-looking data point straight into the efficacy loop.
--
-- Graduated + honest, per the container rules (a tap is NEVER blocked or
-- penalized — disengagement can't be punished):
--   · A completion still always succeeds.
--   · But whether it is VERIFIED is computed SERVER-SIDE from witness trails
--     the user cannot fake by tapping — the device event trail (a real Lovense
--     command that reached the device) or the Whoop HR envelope in the session
--     window. verify_session_witness() is the single source of truth.
--   · Unverified self-reports are RECORDED (the user still sees their own
--     closeness trend) but flagged, and the efficacy engine never treats them
--     as objective evidence — an unverified point does NOT set the target
--     baseline or move its authoritative value.
--
-- Honest today: BOTH witnesses currently read dark — 590/590 device_events are
-- 'device_offline' (backend has never reached the Lovense) and Whoop died in
-- spring. So plug logs correctly record 'self_reported' now, and auto-upgrade
-- to 'device_verified'/'wrist_verified' the moment either source comes online.
-- Nothing here fabricates a witness that isn't there.

-- ── 1. Verification column on the drill log ───────────────────────────────
ALTER TABLE public.practice_ladder_log
  ADD COLUMN IF NOT EXISTS verification TEXT NOT NULL DEFAULT 'self_reported'
  CHECK (verification IN ('self_reported','device_verified','wrist_verified'));

-- ── 2. The witness check (server-side, unfakeable) ────────────────────────
-- Looks for corroboration in the window ending at now. Device trail first
-- (independent of Whoop), then the wrist. Returns the strongest witness found,
-- else 'self_reported'. A tap alone can never produce either trail.
CREATE OR REPLACE FUNCTION public.verify_session_witness(p_user uuid, p_window_minutes int DEFAULT 40)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog'
AS $fn$
DECLARE
  v_since timestamptz := now() - (p_window_minutes || ' minutes')::interval;
BEGIN
  -- Device witness: a real command that REACHED the device (not 'device_offline').
  IF EXISTS (
    SELECT 1 FROM device_events
     WHERE user_id = p_user AND created_at > v_since
       AND event_type <> 'device_offline'
  ) THEN
    RETURN 'device_verified';
  END IF;

  -- Wrist witness: a Whoop session or elevated day-strain HR landed in the window.
  IF EXISTS (
    SELECT 1 FROM whoop_workouts
     WHERE user_id = p_user AND created_at > v_since
  ) THEN
    RETURN 'wrist_verified';
  END IF;

  RETURN 'self_reported';
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.verify_session_witness(uuid, int) TO authenticated, service_role;

-- ── 3. Rewire the closeness → measurement trigger ─────────────────────────
-- Replaces mig 701's trigger. Now:
--   · stamps practice_ladder_log.verification from the witness check
--   · writes the recon_measurement with verification in raw
--   · only VERIFIED points establish the baseline or move the target's
--     authoritative value — unverified self-report is recorded but never
--     becomes objective efficacy evidence (the pollution the operator caught).
CREATE OR REPLACE FUNCTION public.trg_plug_orgasm_closeness_measurement()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_target uuid;
  v_has_verified_baseline boolean;
  v_verif text;
  v_value numeric;
BEGIN
  IF NEW.track <> 'plug_orgasm' OR NEW.comfort_rating IS NULL THEN RETURN NEW; END IF;

  -- Witness check + stamp the log row (the row is being inserted; set the field).
  v_verif := verify_session_witness(NEW.user_id, 40);
  NEW.verification := v_verif;

  SELECT id INTO v_target FROM reconditioning_targets
   WHERE user_id = NEW.user_id AND slug = 'arousal_is_the_becoming';
  IF v_target IS NULL THEN RETURN NEW; END IF;

  v_value := round(NEW.comfort_rating / 10.0, 2);

  -- Does a VERIFIED baseline already exist for this indicator?
  SELECT EXISTS (
    SELECT 1 FROM recon_measurements
     WHERE target_id = v_target AND indicator_kind = 'sissygasm_closeness'
       AND is_baseline = true
       AND COALESCE(raw->>'verification','self_reported') <> 'self_reported'
  ) INTO v_has_verified_baseline;

  -- Always record the point (the user sees their own trend), tagged with its
  -- verification. is_baseline only when this is a VERIFIED first baseline.
  INSERT INTO recon_measurements
    (user_id, target_id, indicator_kind, value, method, is_baseline, raw)
  VALUES (
    NEW.user_id, v_target, 'sissygasm_closeness', v_value, 'practice_ladder_log',
    (v_verif <> 'self_reported' AND NOT v_has_verified_baseline),
    jsonb_build_object('rung_order', NEW.rung_order, 'verification', v_verif)
  );

  -- Only VERIFIED measurements move the target's authoritative value. Unverified
  -- self-report is history for the user, never objective evidence for the engine.
  IF v_verif <> 'self_reported' THEN
    IF NOT v_has_verified_baseline THEN
      UPDATE reconditioning_targets
         SET baseline_value = v_value, baseline_captured_at = now(),
             current_value = v_value, current_captured_at = now()
       WHERE id = v_target AND baseline_captured_at IS NULL;
    ELSE
      UPDATE reconditioning_targets
         SET current_value = v_value, current_captured_at = now()
       WHERE id = v_target;
    END IF;
  END IF;

  RETURN NEW;
END;
$fn$;

-- Trigger must be BEFORE INSERT now (it sets NEW.verification on the row).
DROP TRIGGER IF EXISTS plug_orgasm_closeness_measurement ON public.practice_ladder_log;
CREATE TRIGGER plug_orgasm_closeness_measurement
  BEFORE INSERT ON public.practice_ladder_log
  FOR EACH ROW EXECUTE FUNCTION public.trg_plug_orgasm_closeness_measurement();

-- ── 4. Registry counts only VERIFIED points as efficacy evidence ──────────
-- The experiment review (mig 703) treated every measurement as evidence.
-- Now the efficacy verdict counts verified measurements only; unverified
-- self-reports drop to the adherence side with an explicit note, so a mechanic
-- is never judged "working" (or "flat") on unverifiable self-report.
CREATE OR REPLACE FUNCTION public.conditioning_experiment_review()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  e RECORD;
  v_target uuid;
  v_window int;
  v_since timestamptz;
  v_delivered int;
  v_measured int;          -- verified measurements (efficacy evidence)
  v_self_reported int;     -- unverified self-reports (adherence only)
  v_trend RECORD;
  v_verdict text;
  v_reason text;
  v_count int := 0;
BEGIN
  FOR e IN SELECT * FROM conditioning_experiments
            WHERE status = 'active' AND next_review_at <= now()
  LOOP
    v_window := GREATEST(e.review_cadence_days * 2, 14);
    v_since  := now() - (v_window || ' days')::interval;

    SELECT (SELECT count(*) FROM handler_decrees
             WHERE user_id = e.user_id AND trigger_source LIKE e.delivery_source_like
               AND created_at > v_since)
         + (SELECT count(*) FROM handler_outreach_queue
             WHERE user_id = e.user_id AND trigger_reason LIKE e.delivery_source_like
               AND created_at > v_since)
      INTO v_delivered;

    SELECT id INTO v_target FROM reconditioning_targets
     WHERE user_id = e.user_id AND slug = e.target_slug;

    -- Split measurements: verified (efficacy) vs self-reported (adherence only).
    SELECT
      count(*) FILTER (WHERE COALESCE(raw->>'verification','self_reported') <> 'self_reported'),
      count(*) FILTER (WHERE COALESCE(raw->>'verification','self_reported') = 'self_reported')
      INTO v_measured, v_self_reported
      FROM recon_measurements
     WHERE user_id = e.user_id AND indicator_kind = e.indicator_kind
       AND captured_at > v_since;

    v_trend := NULL;
    IF v_target IS NOT NULL AND v_measured > 0 THEN
      SELECT * INTO v_trend
        FROM recon_measurement_trend(v_target, e.indicator_kind, GREATEST(v_measured, 5));
    END IF;

    IF v_measured = 0 AND v_delivered = 0 AND v_self_reported = 0 THEN
      v_verdict := 'dead_loop';
      v_reason  := format('Nothing delivered, nothing measured in %s days — the loop is not running.', v_window);
    ELSIF v_measured = 0 AND v_self_reported > 0 THEN
      v_verdict := 'adherence_limited';
      v_reason  := format('%s self-reported sessions but ZERO verified — no witness (device/wrist) corroborated any of them, so none count as efficacy evidence. Reconnect a witness source before judging this mechanic.', v_self_reported);
    ELSIF v_measured = 0 THEN
      v_verdict := 'dead_loop';
      v_reason  := format('%s deliveries, zero verified measurements in %s days — running blind.', v_delivered, v_window);
    ELSIF v_measured < e.min_measured_sessions THEN
      v_verdict := 'insufficient_data';
      v_reason  := format('%s of %s minimum VERIFIED sessions (%s more self-reported, uncounted) — keep going.', v_measured, e.min_measured_sessions, v_self_reported);
    ELSIF v_delivered > 0 AND (v_measured * 100 / GREATEST(v_delivered, 1)) < e.min_adherence_pct THEN
      v_verdict := 'adherence_limited';
      v_reason  := format('Verified %s of %s delivered (< %s%%) — flatness here is adherence, not efficacy.', v_measured, v_delivered, e.min_adherence_pct);
    ELSIF v_trend IS NOT NULL AND v_trend.delta IS NOT NULL AND v_trend.direction >= 0 AND v_trend.delta > 0 THEN
      v_verdict := 'improving';
      v_reason  := format('Verified indicator moved %s over %s measurements (slope %s/day). Rule: %s', v_trend.delta, v_trend.n, round(COALESCE(v_trend.slope_per_day, 0), 4), e.decision_rule);
    ELSE
      v_verdict := 'flat_consider_rotate';
      v_reason  := format('Evidence floor met (%s verified, adherence ok) and the indicator is not moving. Kill criterion: %s', v_measured, e.kill_criterion);
    END IF;

    INSERT INTO conditioning_experiment_verdicts
      (experiment_id, window_days, delivered_count, measured_count, trend_delta, trend_slope_per_day, verdict, reasoning)
    VALUES
      (e.id, v_window, v_delivered, v_measured,
       CASE WHEN v_trend IS NULL THEN NULL ELSE v_trend.delta END,
       CASE WHEN v_trend IS NULL THEN NULL ELSE v_trend.slope_per_day END,
       v_verdict, v_reason);

    INSERT INTO mommy_supervisor_log (component, severity, event_kind, message, context_data)
    VALUES ('experiment_review',
            CASE v_verdict WHEN 'dead_loop' THEN 'warning' WHEN 'flat_consider_rotate' THEN 'warning' ELSE 'info' END,
            'experiment_verdict',
            format('[%s] %s — %s', e.slug, v_verdict, v_reason),
            jsonb_build_object('experiment_id', e.id, 'slug', e.slug, 'verdict', v_verdict,
                               'delivered', v_delivered, 'verified', v_measured, 'self_reported', v_self_reported));

    UPDATE conditioning_experiments
       SET next_review_at = now() + (review_cadence_days || ' days')::interval
     WHERE id = e.id;
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END;
$fn$;
