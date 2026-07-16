-- 683 - Efficacy engine Phase 3: mechanism attribution.
--
-- Deliveries were tagged with a target (recon_target_id) but never with a MECHANISM,
-- and nothing linked a measured shift back to the deliveries that should have caused
-- it — so "which mechanism actually moves THIS user" was uncomputable. This adds:
--   * a `mechanism` tag on the delivery surface (handler_decrees),
--   * recon_mechanism_profile — per-user, per-target, per-mechanism effectiveness,
--   * recon_attribute_efficacy() — on each new (non-baseline) measurement, credits
--     the mechanisms delivered in the window since the prior measure, proportional to
--     the signed progress toward target_direction (windowed attribution; EMA),
--   * recon_select_mechanism() — picks the mechanism to deliver next, best-first for
--     this user/target, offset by the Phase-2 mechanism_rotation switch counter.
--
-- Additive. No user UUIDs / private data in schema history.

BEGIN;

-- Mechanism tag on the canonical delivery surface.
ALTER TABLE public.handler_decrees
  ADD COLUMN IF NOT EXISTS mechanism text;

-- Per-user, per-target, per-mechanism effectiveness (the response profile).
CREATE TABLE IF NOT EXISTS public.recon_mechanism_profile (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  target_id uuid NOT NULL REFERENCES reconditioning_targets(id) ON DELETE CASCADE,
  mechanism text NOT NULL,
  effectiveness numeric NOT NULL DEFAULT 0,   -- EMA of signed progress-per-share
  sample_n int NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, target_id, mechanism)
);
ALTER TABLE public.recon_mechanism_profile ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS recon_mech_profile_self ON public.recon_mechanism_profile;
CREATE POLICY recon_mech_profile_self ON public.recon_mechanism_profile
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS recon_mech_profile_service ON public.recon_mechanism_profile;
CREATE POLICY recon_mech_profile_service ON public.recon_mechanism_profile
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Windowed attribution: credit the mechanisms delivered since the prior measure.
CREATE OR REPLACE FUNCTION public.recon_attribute_efficacy(p_measurement uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_m       recon_measurements%ROWTYPE;
  v_prior   recon_measurements%ROWTYPE;
  v_dir     text;
  v_progress numeric;
  v_total   int;
  r         RECORD;
  c_alpha   constant numeric := 0.3;   -- EMA weight on the new observation
BEGIN
  SELECT * INTO v_m FROM recon_measurements WHERE id = p_measurement;
  IF NOT FOUND OR v_m.is_baseline THEN RETURN; END IF;

  SELECT target_direction INTO v_dir FROM reconditioning_targets WHERE id = v_m.target_id;

  SELECT * INTO v_prior FROM recon_measurements
   WHERE target_id = v_m.target_id AND indicator_kind = v_m.indicator_kind
     AND captured_at < v_m.captured_at
   ORDER BY captured_at DESC LIMIT 1;
  IF NOT FOUND THEN RETURN; END IF;

  -- signed progress toward the desired direction
  v_progress := (v_m.value - v_prior.value) * (CASE WHEN v_dir = 'decrease' THEN -1 ELSE 1 END);

  SELECT count(*) INTO v_total FROM handler_decrees
   WHERE recon_target_id = v_m.target_id AND mechanism IS NOT NULL
     AND created_at > v_prior.captured_at AND created_at <= v_m.captured_at;
  IF v_total = 0 THEN RETURN; END IF;

  FOR r IN
    SELECT mechanism, count(*)::numeric AS c FROM handler_decrees
     WHERE recon_target_id = v_m.target_id AND mechanism IS NOT NULL
       AND created_at > v_prior.captured_at AND created_at <= v_m.captured_at
     GROUP BY mechanism
  LOOP
    INSERT INTO recon_mechanism_profile (user_id, target_id, mechanism, effectiveness, sample_n, updated_at)
    VALUES (v_m.user_id, v_m.target_id, r.mechanism, v_progress * (r.c / v_total), 1, now())
    ON CONFLICT (user_id, target_id, mechanism) DO UPDATE
      SET effectiveness = recon_mechanism_profile.effectiveness * (1 - c_alpha)
                        + (v_progress * (r.c / v_total)) * c_alpha,
          sample_n = recon_mechanism_profile.sample_n + 1,
          updated_at = now();
  END LOOP;
END
$fn$;

CREATE OR REPLACE FUNCTION public.recon_attribute_efficacy_trg()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $t$
BEGIN
  PERFORM recon_attribute_efficacy(NEW.id);
  RETURN NEW;
END $t$;

DROP TRIGGER IF EXISTS trg_recon_attribute_efficacy ON public.recon_measurements;
CREATE TRIGGER trg_recon_attribute_efficacy
  AFTER INSERT ON public.recon_measurements
  FOR EACH ROW WHEN (NEW.is_baseline = false)
  EXECUTE FUNCTION recon_attribute_efficacy_trg();

-- Pick the mechanism to deliver next: best-effectiveness first for this user/target,
-- offset by the rotation counter (a Phase-2 switch rotates to the next-best). Untried
-- mechanisms rank last (effectiveness NULL → -1e9) so repeated switches explore them.
CREATE OR REPLACE FUNCTION public.recon_select_mechanism(
  p_user uuid, p_target uuid, p_rotation int DEFAULT 0
)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $fn$
DECLARE
  v_mechs text[] := ARRAY['arousal_pairing','trance','pairing','narrative','retrieval'];
  v_ranked text[];
  v_len int;
BEGIN
  SELECT array_agg(m ORDER BY COALESCE(p.effectiveness, -1e9) DESC, COALESCE(p.sample_n, 0) DESC)
    INTO v_ranked
    FROM unnest(v_mechs) AS m
    LEFT JOIN recon_mechanism_profile p
      ON p.user_id = p_user AND p.target_id = p_target AND p.mechanism = m;
  v_len := array_length(v_ranked, 1);
  IF v_len IS NULL OR v_len = 0 THEN RETURN v_mechs[1]; END IF;
  RETURN v_ranked[(COALESCE(p_rotation, 0) % v_len) + 1];
END
$fn$;

GRANT EXECUTE ON FUNCTION public.recon_attribute_efficacy(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.recon_select_mechanism(uuid, uuid, int) TO authenticated, service_role;

COMMIT;
