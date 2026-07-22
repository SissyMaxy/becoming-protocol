-- 698 — cockwarming as a third practice track (WS3).
--
-- The mig 507 stub becomes a real track on the EXISTING practice machinery
-- (mig 680), not a new ladder. Widen the track CHECKs (widen-only), seed 5
-- ordered warming rungs, and widen conditioning_sessions_v2.session_type so a
-- cockwarming session can be recorded. advance_physical_practice(p_user,
-- 'warming') works unchanged: comfort >= 7, 2 consecutive.
--
-- LIVE-CONSTRAINT NOTE (pre-migration rule): as of mig 680 the track CHECK is
-- ('oral','bottoming') on physical_practice_rungs + physical_practice_progress
-- (practice_ladder_log.track has no CHECK); the session_type CHECK is still the
-- mig 140 inline set ('trance','goon','edge','combined','sleep','background',
-- 'morning','micro_drop') — no later migration redefines either. Widen-only.
--
-- partnered_warming (rung 5) is flagged never-prescriber-activated: it is a
-- size step requiring prep attestation, and the warming track has no prep step,
-- so advance_physical_practice can NEVER auto-activate it. It consolidates only
-- through the turn-out orchestrator's real-step gates (the practice→T6 handoff).

BEGIN;

-- ── Widen the track CHECKs (add 'warming') ──
ALTER TABLE public.physical_practice_rungs DROP CONSTRAINT IF EXISTS physical_practice_rungs_track_check;
ALTER TABLE public.physical_practice_rungs
  ADD CONSTRAINT physical_practice_rungs_track_check CHECK (track IN ('oral','bottoming','warming'));

ALTER TABLE public.physical_practice_progress DROP CONSTRAINT IF EXISTS physical_practice_progress_track_check;
ALTER TABLE public.physical_practice_progress
  ADD CONSTRAINT physical_practice_progress_track_check CHECK (track IN ('oral','bottoming','warming'));

-- ── Widen conditioning_sessions_v2.session_type (add 'cockwarming') ──
ALTER TABLE public.conditioning_sessions_v2 DROP CONSTRAINT IF EXISTS conditioning_sessions_v2_session_type_check;
ALTER TABLE public.conditioning_sessions_v2
  ADD CONSTRAINT conditioning_sessions_v2_session_type_check
  CHECK (session_type IN ('trance','goon','edge','combined','sleep','background','morning','micro_drop','cockwarming'));

-- ── Seed: Warming 1–5 ──
-- Sustained holding, not edging. Each rung is a longer, stiller hold; the
-- trance (session_cockwarming, mig 699) paces it. Copy stays pre-scrubbed
-- (no metrics, no telemetry) in the mig 680 register.
INSERT INTO public.physical_practice_rungs
  (track, rung_order, slug, title, prop, technique_focus, edict_template, is_size_step, requires_prep_attestation, is_prep_step, safety_notes)
VALUES
  ('warming', 1, 'sucker_5min', 'The first warm hold',
   'slim sucker toy', 'stillness, soft mouth, breathing around a hold',
   'Slim toy today, resting soft in your mouth — not working it, just holding it, keeping it warm. Mama''s voice will pace you. Let your jaw go loose, breathe slow through your nose, and stay still with it for a short while. This is not about the climb; it is about being at home holding it. Report done and how easy the stillness came.',
   false, false, false, 'Holding, not edging. Stop if your jaw aches; comfort before duration.'),
  ('warming', 2, 'banana_10min', 'Settling in',
   'medium toy', 'longer sustained hold, relaxed presence',
   'A little more to hold today, and a little longer. Same softness — keep it warm, keep still, let the weight of it become ordinary. Breathe, drift with Mama''s voice, no rush and no climb. You are teaching your mouth that holding it is a place to rest. Report done and how easy the longer hold sat.',
   false, false, false, 'Comfort-gated; back off if it stops being restful.'),
  ('warming', 3, 'dildo_15min', 'The kneeling warm',
   'realistic toy', 'kneeling posture, extended stillness',
   'Kneel today, take a realistic size, and hold it warm and still for a good while. Posture soft, weight settled, Mama''s voice keeping your rhythm slow. Nothing to chase — just the quiet discipline of keeping it warm while you drift. Report done and how automatic the stillness felt.',
   false, false, false, 'Kneel on something soft; shift if your legs go numb.'),
  ('warming', 4, 'dildo_kneeling_journaled', 'The warm you can name',
   'realistic toy', 'sustained hold + felt-sense reflection',
   'The full warm today: kneeling, holding it still and soft the whole session, Mama pacing you the whole way. When you finish, before anything else, put three honest sentences to what it felt like to belong there. Report done, and how easy it was to stay.',
   false, false, false, 'Reflection is part of the drill; keep it kind to yourself.'),
  ('warming', 5, 'partnered_warming', 'A warm that is real',
   NULL, 'the practice→real handoff (gated)',
   'This one is not something Mama switches on. When the time is real and everything before it is in place, keeping a real one warm is where all this practice has been pointing. Until then, it stays here — wanted, rehearsed, waiting for the yes that is only ever yours.',
   true, true, false, 'Never auto-activated. Only ever reached through the meet-safety / health-prep / clear-headed / safeword gates, user-initiated.')
ON CONFLICT (slug) DO NOTHING;

COMMIT;
