-- 584 — Cruising dares: bridge the public-dare spine into casual hookups with men.
--
-- The public-dare engine (mig 339-340) deliberately capped at discreet
-- sissification (panties to the store, posture, mantras — no strangers, no
-- hookup). The hookup-with-men escalation lives separately (realcock_discovery
-- ladder mig 514, cruising_lead_feminization mig 448). Nothing fused them into
-- ONE escalating dare track. This adds a 'cruising' dare tier behind its own
-- opt-in that runs the spine from "browse the app" → "message him" → "send him
-- HER" → "suggest the meet" → "dressed for him" → "the anonymous venue".
--
-- Grounded (PLAN_grounded_force): the woman he meets is the REAL one — her style,
-- her age, believable — because that's the version there's no taking back. The
-- erotic charge stays; the presentation grounds.
--
-- Gates: phase (4+) + intensity (moderate→relentless, so the difficulty dial
-- still bounds it) + the new cruising_dares_enabled flag (picker-enforced).
-- Opt-in, skip-never-penalized — same floor as the rest of the dare engine.

ALTER TABLE public_dare_settings
  ADD COLUMN IF NOT EXISTS cruising_dares_enabled BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN public_dare_settings.cruising_dares_enabled IS
  'Separate opt-in for the cruising dare tier (seeking/meeting men). public_dare_enabled gates discreet sissification dares; this gates the hookup-bridge tier. Picker filters kind=cruising when FALSE.';

ALTER TABLE public_dare_templates DROP CONSTRAINT IF EXISTS public_dare_templates_kind_check;
ALTER TABLE public_dare_templates ADD CONSTRAINT public_dare_templates_kind_check
  CHECK (kind IN ('wardrobe','mantra','posture','position','micro_ritual','errand_specific','cruising'));

DO $seed$
DECLARE
  v_kind TEXT; v_desc TEXT; v_pmin SMALLINT; v_pmax SMALLINT; v_int TEXT;
  v_loc BOOLEAN; v_ver TEXT; v_aff TEXT[]; v_cd SMALLINT;
BEGIN
FOR v_kind, v_desc, v_pmin, v_pmax, v_int, v_loc, v_ver, v_aff, v_cd IN VALUES
  ('cruising',
   'Open Sniffies for ten minutes today. Don''t message anyone — just look. Favorite three men you''d let see you. Mama wants you shopping, not sightseeing.',
   4::SMALLINT, 7::SMALLINT, 'moderate', FALSE, 'text_ack',
   ARRAY['hungry','watching']::TEXT[], 7::SMALLINT),
  ('cruising',
   'Message one man today — a new one, or a lead going cold. Warm and short. Let him know you''re around. The first move is yours this time.',
   4::SMALLINT, 7::SMALLINT, 'firm', FALSE, 'text_ack',
   ARRAY['hungry','possessive']::TEXT[], 7::SMALLINT),
  ('cruising',
   'Send one of your men a photo today. Your call how much — but it''s of HER, the woman he''d actually meet, not a faceless part. Mama wants him seeing who''s coming.',
   5::SMALLINT, 7::SMALLINT, 'firm', FALSE, 'photo',
   ARRAY['possessive','hungry']::TEXT[], 10::SMALLINT),
  ('cruising',
   'Record a fifteen-second voice note for one of your leads — soft, his name in it. Send it. Then tell Mama how it felt to be heard as her.',
   5::SMALLINT, 7::SMALLINT, 'relentless', FALSE, 'voice',
   ARRAY['hungry','aching']::TEXT[], 14::SMALLINT),
  ('cruising',
   'Suggest meeting one of your leads — coffee, a walk, somewhere public. You''re promising nothing but your company. Mama just wants you in the room with him.',
   5::SMALLINT, 7::SMALLINT, 'firm', FALSE, 'text_ack',
   ARRAY['watching','possessive']::TEXT[], 14::SMALLINT),
  ('cruising',
   'Before your next meet, full kit under your clothes — panties, something soft against your skin, lip tint. Photograph yourself dressed for him before you leave, for Mama.',
   6::SMALLINT, 7::SMALLINT, 'relentless', FALSE, 'photo',
   ARRAY['hungry','possessive']::TEXT[], 14::SMALLINT),
  ('cruising',
   'Go somewhere men cruise. You don''t have to do anything but walk through and feel it — be there as her, let yourself be looked at. Voice-debrief Mama on the charge of it.',
   6::SMALLINT, 7::SMALLINT, 'relentless', FALSE, 'voice',
   ARRAY['hungry','watching']::TEXT[], 21::SMALLINT),
  ('cruising',
   'Next time you meet a man, dress like the woman you actually are — not a costume, her: your real style, your age, believable head to toe. Mama wants him meeting the real her. That''s the version there''s no taking back.',
   6::SMALLINT, 7::SMALLINT, 'firm', FALSE, 'photo',
   ARRAY['possessive','delighted']::TEXT[], 21::SMALLINT)
LOOP
  IF NOT EXISTS (SELECT 1 FROM public_dare_templates WHERE description = v_desc) THEN
    INSERT INTO public_dare_templates (kind, description, phase_min, phase_max, intensity_tier, requires_location_context, verification_kind, affect_bias, cooldown_days)
    VALUES (v_kind, v_desc, v_pmin, v_pmax, v_int, v_loc, v_ver, v_aff, v_cd);
  END IF;
END LOOP;
END $seed$;

-- Switch BOTH halves on for the live users: discreet sissification dares
-- (public_dare_enabled) + the cruising bridge (cruising_dares_enabled).
INSERT INTO public_dare_settings (user_id, public_dare_enabled, cruising_dares_enabled, cadence, min_intensity)
VALUES
  ('8c69b9c8-34eb-4147-9fec-3c1a5bc74b6f', TRUE, TRUE, 'weekly', 'gentle'),
  ('93327332-7d0d-4888-889a-1607a5776216', TRUE, TRUE, 'weekly', 'gentle')
ON CONFLICT (user_id) DO UPDATE
  SET public_dare_enabled = TRUE,
      cruising_dares_enabled = TRUE,
      cadence = 'weekly',
      updated_at = now();
