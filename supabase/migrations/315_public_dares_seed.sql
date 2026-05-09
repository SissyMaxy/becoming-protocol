-- 315 — Public dares seed catalog.
--
-- 36 templates across 6 kinds. Phase + intensity-gated heavily so phase 1
-- users only ever see private/internal dares; phase 6-7 unlock the most
-- presentational tier ("wear visibly feminine pieces in public").
--
-- HARD RULES embedded in the catalog:
--   - No nudity. No public lewdness. No exposure dares.
--   - No drawing-attention-from-strangers framings.
--   - All "in public" framings are discreet/internal — under clothes,
--     silently, briefly, in a stall/parking-lot/private moment.
--   - Cruel-tier (firm/relentless) intensities are gated to phase 4+.
--
-- Idempotent — guards on description so re-running doesn't dup rows.

-- Helper: insert if no template with the same description exists yet.
DO $seed$
DECLARE
  v_kind TEXT;
  v_desc TEXT;
  v_pmin SMALLINT;
  v_pmax SMALLINT;
  v_int  TEXT;
  v_loc  BOOLEAN;
  v_ver  TEXT;
  v_aff  TEXT[];
  v_cd   SMALLINT;
BEGIN

-- ─── kind = mantra (8) ────────────────────────────────────────────────────
-- Silent / mirror / sub-vocal mantras in public-but-private moments.

FOR v_kind, v_desc, v_pmin, v_pmax, v_int, v_loc, v_ver, v_aff, v_cd IN VALUES
  ('mantra',
   'Find a public bathroom mirror today. Look at your face. Sub-vocally, mouth the words "I belong to Mama" three times. Walk out without changing your expression.',
   1::SMALLINT, 7::SMALLINT, 'gentle', FALSE, 'text_ack',
   ARRAY['hungry','watching']::TEXT[], 14::SMALLINT),
  ('mantra',
   'Next time you''re waiting in a checkout line, repeat silently in your head: "I am Mama''s good girl." Once for every item the person ahead is buying.',
   1::SMALLINT, 7::SMALLINT, 'gentle', FALSE, 'text_ack',
   ARRAY['patient','indulgent']::TEXT[], 10::SMALLINT),
  ('mantra',
   'In any public bathroom stall today, before you leave, whisper "thank you, Mama" under your breath. Quiet enough that no one outside the stall can hear.',
   2::SMALLINT, 7::SMALLINT, 'gentle', FALSE, 'voice',
   ARRAY['hungry','aching']::TEXT[], 14::SMALLINT),
  ('mantra',
   'On a walk outside, count five strangers. With each one, mouth silently to yourself: "I am becoming." Don''t look at them. Just keep counting.',
   1::SMALLINT, 7::SMALLINT, 'gentle', FALSE, 'text_ack',
   ARRAY['watching','restless']::TEXT[], 14::SMALLINT),
  ('mantra',
   'Standing in a grocery aisle, quietly tell yourself "I am Mama''s baby" three times before you pick the next item off the shelf. Nobody hears it but you and the can of beans.',
   2::SMALLINT, 7::SMALLINT, 'moderate', TRUE, 'text_ack',
   ARRAY['amused','possessive']::TEXT[], 14::SMALLINT),
  ('mantra',
   'In a public restroom mirror, slowly say out loud "Mama owns me" — quiet, just for you. Record a 3-second voice memo on your phone immediately after.',
   3::SMALLINT, 7::SMALLINT, 'firm', FALSE, 'voice',
   ARRAY['possessive','hungry']::TEXT[], 21::SMALLINT),
  ('mantra',
   'While driving alone today, when you stop at a red light, look at yourself in the rearview mirror and say "I belong to her." Out loud. Just the once.',
   2::SMALLINT, 7::SMALLINT, 'moderate', FALSE, 'text_ack',
   ARRAY['delighted','watching']::TEXT[], 12::SMALLINT),
  ('mantra',
   'Out at a café or restaurant, before you take your first sip, hold the cup and silently repeat "this is for Mama" three times. Then drink.',
   2::SMALLINT, 7::SMALLINT, 'gentle', TRUE, 'text_ack',
   ARRAY['indulgent','aching']::TEXT[], 10::SMALLINT)
LOOP
  IF NOT EXISTS (SELECT 1 FROM public_dare_templates WHERE description = v_desc) THEN
    INSERT INTO public_dare_templates (kind, description, phase_min, phase_max, intensity_tier, requires_location_context, verification_kind, affect_bias, cooldown_days)
    VALUES (v_kind, v_desc, v_pmin, v_pmax, v_int, v_loc, v_ver, v_aff, v_cd);
  END IF;
END LOOP;

-- ─── kind = posture (6) ───────────────────────────────────────────────────
-- Body-cue dares: how you stand, sit, hold yourself.

FOR v_kind, v_desc, v_pmin, v_pmax, v_int, v_loc, v_ver, v_aff, v_cd IN VALUES
  ('posture',
   'For the next time you''re sitting at a coffee shop or restaurant, cross your legs at the knee — not the ankle. Keep them crossed for the duration. That''s how Mama wants you sitting.',
   1::SMALLINT, 7::SMALLINT, 'gentle', TRUE, 'text_ack',
   ARRAY['watching','indulgent']::TEXT[], 7::SMALLINT),
  ('posture',
   'Standing in any line today, tuck your hips slightly forward and let your shoulders drop back. Hold it the whole line. Mama''s posture, not yours.',
   1::SMALLINT, 7::SMALLINT, 'gentle', TRUE, 'text_ack',
   ARRAY['patient','watching']::TEXT[], 7::SMALLINT),
  ('posture',
   'Walking through a parking lot or sidewalk today, take smaller steps than you normally would. Heel-toe, narrow track. Walk like a girl. Half a block is enough.',
   2::SMALLINT, 7::SMALLINT, 'moderate', FALSE, 'text_ack',
   ARRAY['hungry','watching']::TEXT[], 10::SMALLINT),
  ('posture',
   'Out somewhere today, when you reach for something on a shelf, lift your heel slightly off the ground. A small ladylike rise. Notice how it changes your hips.',
   3::SMALLINT, 7::SMALLINT, 'moderate', TRUE, 'text_ack',
   ARRAY['amused','delighted']::TEXT[], 14::SMALLINT),
  ('posture',
   'Anywhere in public today, when you sit down, do it slowly — knees together, hand smoothing the seat behind you. Like you''re wearing a skirt even if you''re not.',
   3::SMALLINT, 7::SMALLINT, 'firm', FALSE, 'text_ack',
   ARRAY['indulgent','possessive']::TEXT[], 14::SMALLINT),
  ('posture',
   'Out and about today, every time you catch your reflection in a window, soften your face — drop the jaw, part the lips slightly. Don''t hold it long. Just notice and adjust.',
   2::SMALLINT, 7::SMALLINT, 'gentle', FALSE, 'text_ack',
   ARRAY['watching','aching']::TEXT[], 7::SMALLINT)
LOOP
  IF NOT EXISTS (SELECT 1 FROM public_dare_templates WHERE description = v_desc) THEN
    INSERT INTO public_dare_templates (kind, description, phase_min, phase_max, intensity_tier, requires_location_context, verification_kind, affect_bias, cooldown_days)
    VALUES (v_kind, v_desc, v_pmin, v_pmax, v_int, v_loc, v_ver, v_aff, v_cd);
  END IF;
END LOOP;

-- ─── kind = position (5) ──────────────────────────────────────────────────
-- Brief, discreet body positions in private public moments
-- (your car, an empty stall, a corner). Never visible to others.

FOR v_kind, v_desc, v_pmin, v_pmax, v_int, v_loc, v_ver, v_aff, v_cd IN VALUES
  ('position',
   'In your car, parked, before you leave the lot today — kneel briefly in the driver''s seat. Hands in your lap, head bowed. Five breaths. Nobody sees it but you.',
   3::SMALLINT, 7::SMALLINT, 'firm', FALSE, 'text_ack',
   ARRAY['possessive','hungry']::TEXT[], 21::SMALLINT),
  ('position',
   'Inside a public bathroom stall, before you leave it today, drop your hands palms-up on your thighs and breathe out slowly five times. That''s the posture of obedience. Then walk out.',
   2::SMALLINT, 7::SMALLINT, 'moderate', FALSE, 'text_ack',
   ARRAY['patient','aching']::TEXT[], 14::SMALLINT),
  ('position',
   'Sitting in your car at a red light, both hands on the wheel — squeeze your thighs together, hard, and hold for the count of five. Mama''s reminder that you''re hers. Then drive on.',
   2::SMALLINT, 7::SMALLINT, 'moderate', FALSE, 'text_ack',
   ARRAY['hungry','restless']::TEXT[], 10::SMALLINT),
  ('position',
   'In a parking lot today, before you walk into the store — sit in the driver''s seat, close your eyes, hands open in your lap, and say silently "ready, Mama." Then go in.',
   2::SMALLINT, 7::SMALLINT, 'gentle', TRUE, 'text_ack',
   ARRAY['patient','indulgent']::TEXT[], 10::SMALLINT),
  ('position',
   'In a private corner of a parking garage or lot, briefly press both palms flat against your car door, head down between your hands. Three breaths. That''s how Mama wants you between errands.',
   4::SMALLINT, 7::SMALLINT, 'firm', FALSE, 'text_ack',
   ARRAY['possessive','aching']::TEXT[], 21::SMALLINT)
LOOP
  IF NOT EXISTS (SELECT 1 FROM public_dare_templates WHERE description = v_desc) THEN
    INSERT INTO public_dare_templates (kind, description, phase_min, phase_max, intensity_tier, requires_location_context, verification_kind, affect_bias, cooldown_days)
    VALUES (v_kind, v_desc, v_pmin, v_pmax, v_int, v_loc, v_ver, v_aff, v_cd);
  END IF;
END LOOP;

-- ─── kind = wardrobe (8) ──────────────────────────────────────────────────
-- Wear something specific to a public errand. Phase-gated heavily —
-- early phases are UNDER regular clothes, later phases unlock visible.

FOR v_kind, v_desc, v_pmin, v_pmax, v_int, v_loc, v_ver, v_aff, v_cd IN VALUES
  ('wardrobe',
   'Wear a soft pair of panties under your clothes for your next errand. Nobody sees them. You feel them every step. That''s the whole point.',
   1::SMALLINT, 7::SMALLINT, 'gentle', FALSE, 'text_ack',
   ARRAY['hungry','indulgent']::TEXT[], 14::SMALLINT),
  ('wardrobe',
   'Wear thigh-high stockings under regular pants on your next outing. Feel the band on your thigh every time you sit down. Mama''s with you the whole time.',
   2::SMALLINT, 7::SMALLINT, 'moderate', FALSE, 'photo',
   ARRAY['hungry','aching']::TEXT[], 21::SMALLINT),
  ('wardrobe',
   'Wear the prettiest pair of panties you own for a grocery run. Choose them deliberately. Photograph them on you (privately, before you leave) for Mama.',
   2::SMALLINT, 7::SMALLINT, 'firm', TRUE, 'photo',
   ARRAY['possessive','hungry']::TEXT[], 21::SMALLINT),
  ('wardrobe',
   'Put on a thin chain necklace under your shirt for your next errand. Tuck it down so nobody sees the metal — but the cool weight stays with you the whole trip.',
   2::SMALLINT, 7::SMALLINT, 'gentle', FALSE, 'text_ack',
   ARRAY['patient','watching']::TEXT[], 14::SMALLINT),
  ('wardrobe',
   'Tinted lip balm — the soft pink kind. Put it on before your next public outing. Reapply once, halfway through. Photograph the tube in your pocket or bag for Mama.',
   3::SMALLINT, 7::SMALLINT, 'moderate', TRUE, 'photo',
   ARRAY['delighted','indulgent']::TEXT[], 14::SMALLINT),
  ('wardrobe',
   'A bralette under your shirt today. Wear it on a public errand — coffee, groceries, the post office. The straps under cotton, your secret. Mama''s secret.',
   4::SMALLINT, 7::SMALLINT, 'firm', TRUE, 'photo',
   ARRAY['hungry','possessive']::TEXT[], 21::SMALLINT),
  ('wardrobe',
   'Wear something visibly feminine on a public errand today — a fitted top, a soft blouse, anything that reads as a woman''s cut. Let strangers see her. Photograph the outfit before you leave.',
   6::SMALLINT, 7::SMALLINT, 'firm', TRUE, 'photo',
   ARRAY['delighted','possessive']::TEXT[], 28::SMALLINT),
  ('wardrobe',
   'Soft socks — pretty ones, ribbed or pastel. Wear them on your next walk or errand. Keep your shoes off when you can; let the socks be the thing.',
   1::SMALLINT, 7::SMALLINT, 'gentle', FALSE, 'photo',
   ARRAY['indulgent','patient']::TEXT[], 14::SMALLINT)
LOOP
  IF NOT EXISTS (SELECT 1 FROM public_dare_templates WHERE description = v_desc) THEN
    INSERT INTO public_dare_templates (kind, description, phase_min, phase_max, intensity_tier, requires_location_context, verification_kind, affect_bias, cooldown_days)
    VALUES (v_kind, v_desc, v_pmin, v_pmax, v_int, v_loc, v_ver, v_aff, v_cd);
  END IF;
END LOOP;

-- ─── kind = micro_ritual (5) ──────────────────────────────────────────────
-- Tiny ritual gestures embedded in a public errand.

FOR v_kind, v_desc, v_pmin, v_pmax, v_int, v_loc, v_ver, v_aff, v_cd IN VALUES
  ('micro_ritual',
   'On your next errand, before you walk into the building, touch your sternum with two fingers and breathe out. That''s Mama''s mark. You carry it in.',
   1::SMALLINT, 7::SMALLINT, 'gentle', TRUE, 'text_ack',
   ARRAY['patient','watching']::TEXT[], 7::SMALLINT),
  ('micro_ritual',
   'Out today, the next time you sit down — anywhere, a bench, a chair, a car seat — pause for one breath before you settle. A beat of stillness. That''s for Mama.',
   1::SMALLINT, 7::SMALLINT, 'gentle', FALSE, 'text_ack',
   ARRAY['indulgent','watching']::TEXT[], 7::SMALLINT),
  ('micro_ritual',
   'Out somewhere public today, find one beautiful thing — a flower, a window, a face — and silently dedicate it to Mama. Just the thought, just the offering. Then keep walking.',
   2::SMALLINT, 7::SMALLINT, 'gentle', FALSE, 'text_ack',
   ARRAY['delighted','indulgent']::TEXT[], 10::SMALLINT),
  ('micro_ritual',
   'On a public errand today, pay for one small thing in cash and slip the change into a pocket without counting it. Then think: "Mama keeps the rest of me, this is hers too."',
   3::SMALLINT, 7::SMALLINT, 'moderate', TRUE, 'text_ack',
   ARRAY['indulgent','possessive']::TEXT[], 14::SMALLINT),
  ('micro_ritual',
   'When you leave the house today, kiss two fingers and press them to the door frame on the way out. A goodbye to Mama. Nobody else has to know what it means.',
   2::SMALLINT, 7::SMALLINT, 'gentle', FALSE, 'text_ack',
   ARRAY['indulgent','aching']::TEXT[], 7::SMALLINT)
LOOP
  IF NOT EXISTS (SELECT 1 FROM public_dare_templates WHERE description = v_desc) THEN
    INSERT INTO public_dare_templates (kind, description, phase_min, phase_max, intensity_tier, requires_location_context, verification_kind, affect_bias, cooldown_days)
    VALUES (v_kind, v_desc, v_pmin, v_pmax, v_int, v_loc, v_ver, v_aff, v_cd);
  END IF;
END LOOP;

-- ─── kind = errand_specific (4) ───────────────────────────────────────────
-- Tied to specific errand contexts; require location ack so they fire
-- when the user signals being there.

FOR v_kind, v_desc, v_pmin, v_pmax, v_int, v_loc, v_ver, v_aff, v_cd IN VALUES
  ('errand_specific',
   'In the grocery store today, find one thing in the women''s section — bath products, makeup aisle, women''s clothing — and pick something up to look at it. Hold it for ten seconds. Put it back or buy it. Either way, Mama saw you reach.',
   2::SMALLINT, 7::SMALLINT, 'moderate', TRUE, 'text_ack',
   ARRAY['hungry','watching']::TEXT[], 14::SMALLINT),
  ('errand_specific',
   'At a coffee shop today, order something Mama would order — a latte, something soft, something with foam. Not your usual. When the barista hands it to you, smile like a woman would.',
   2::SMALLINT, 7::SMALLINT, 'gentle', TRUE, 'text_ack',
   ARRAY['delighted','indulgent']::TEXT[], 10::SMALLINT),
  ('errand_specific',
   'On any drive today, switch the radio to something Mama would have on — soft pop, jazz, anything not yours. Drive at least ten minutes with it. That''s Mama''s soundtrack.',
   1::SMALLINT, 7::SMALLINT, 'gentle', TRUE, 'text_ack',
   ARRAY['patient','indulgent']::TEXT[], 7::SMALLINT),
  ('errand_specific',
   'At a pharmacy today, walk slowly through the makeup aisle. Don''t buy anything. Just look. Notice the colours. Notice what your eye goes to. That''s information for Mama.',
   3::SMALLINT, 7::SMALLINT, 'moderate', TRUE, 'text_ack',
   ARRAY['watching','aching']::TEXT[], 14::SMALLINT)
LOOP
  IF NOT EXISTS (SELECT 1 FROM public_dare_templates WHERE description = v_desc) THEN
    INSERT INTO public_dare_templates (kind, description, phase_min, phase_max, intensity_tier, requires_location_context, verification_kind, affect_bias, cooldown_days)
    VALUES (v_kind, v_desc, v_pmin, v_pmax, v_int, v_loc, v_ver, v_aff, v_cd);
  END IF;
END LOOP;

END $seed$;
