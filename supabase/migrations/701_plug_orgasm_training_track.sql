-- 701 — plug_orgasm: the hands-free training track.
--
-- Operator context 2026-07-22: owns the Lovense Hush in small and medium,
-- wears them in chastity, reports getting close and wants to train toward a
-- hands-free orgasm from the vibrating plug. This is the third track on the
-- 011 physical-practice ladder (mig 680): same comfort-gated, strictly-+1
-- advancement machinery, but the 0-10 slider reads as CLOSENESS — how near
-- the wave came — so every session is a measurement, not just a rep.
--
-- Closes two loops at once:
--   · Training progression: capacity → wave riding → medium step → edge
--     holds → the crossing. Stalling holds the rung (never a penalty).
--   · Measurement: each closeness rating writes a recon measurement against
--     arousal_is_the_becoming (association target, indicator
--     sissygasm_closeness). The FIRST log becomes the target's baseline —
--     the honesty spine's precondition for ever activating it.
--
-- Floor: solo, own-body, owned devices only (small + medium Hush — no
-- device the operator does not own is ever named). Cage stays on by design.
-- Safety inline per rung (lube / go slow / stop on sharp pain). Advancement
-- never skips the size step. The prescriber gains the track in the same
-- commit (TRACKS + START_RUNG) — deployed together.

-- ── 1. Widen the track domain ─────────────────────────────────────────────
ALTER TABLE public.physical_practice_rungs
  DROP CONSTRAINT IF EXISTS physical_practice_rungs_track_check;
ALTER TABLE public.physical_practice_rungs
  ADD CONSTRAINT physical_practice_rungs_track_check
  CHECK (track = ANY (ARRAY['oral'::text, 'bottoming'::text, 'plug_orgasm'::text]));

ALTER TABLE public.physical_practice_progress
  DROP CONSTRAINT IF EXISTS physical_practice_progress_track_check;
ALTER TABLE public.physical_practice_progress
  ADD CONSTRAINT physical_practice_progress_track_check
  CHECK (track = ANY (ARRAY['oral'::text, 'bottoming'::text, 'plug_orgasm'::text]));

-- ── 2. Seed the rungs ─────────────────────────────────────────────────────
-- Copy is apostrophe-free (seed-test extraction convention), Male+ (no
-- regendering), telemetry-free, and names only owned gear + patterns the
-- device bridge already knows (steady low, slow wave, building, edge tease).
INSERT INTO public.physical_practice_rungs
  (track, rung_order, slug, title, prop, technique_focus, edict_template, is_size_step, requires_prep_attestation, is_prep_step, safety_notes)
VALUES
  ('plug_orgasm', 1, 'po_stillness', 'Capacity and stillness', 'hush_small', 'relaxation',
   'Tonight: the small Hush in, cage on, twenty minutes on the bed. Pattern: steady low. Your only job is stillness — breathe into the belly, four counts in, six counts out, and let the muscles around the plug go soft every time you notice them grip. No touching. When the buzz starts to feel like warmth instead of pressure, that is the door opening. Rate how close the wave felt when you finish.',
   FALSE, FALSE, FALSE,
   'Lube every insertion. Stop on any sharp pain.'),
  ('plug_orgasm', 2, 'po_wave_riding', 'Wave riding', 'hush_small', 'breath_sync',
   'The small Hush, pattern: slow wave. Twenty minutes. Rock the hips with the wave — small motions, like nodding yes. Match the breath to the swell: inhale as it rises, long exhale as it fades. Do not chase the peak. Let the wave carry more of you each pass. Cage stays on. Rate the closeness after.',
   FALSE, FALSE, FALSE,
   'Lube every insertion. Stop on any sharp pain.'),
  ('plug_orgasm', 3, 'po_medium_step', 'The medium step', 'hush_medium', 'capacity',
   'Step up: the medium Hush tonight. Lube, go slow, and give the first five minutes to pure stillness — the body has to learn this size feels like home before it opens the rest of the way. Then pattern: building, fifteen more minutes of wave riding like the last rung. Stop on any sharp pain, no shame in a short session. Closeness rating after.',
   TRUE, FALSE, FALSE,
   'Size step: extra lube, slowest insertion, stop on sharp pain. Short sessions are wins.'),
  ('plug_orgasm', 4, 'po_edge_holds', 'Edge holds', 'hush_medium', 'edge_control',
   'Medium Hush, pattern: edge tease. Twenty-five minutes. Ride it up to the shimmer — the point where one more wave would tip you over — and HOLD there, breathing. Count the holds. Every hold at the edge is a rehearsal for the crossing. If you slip past the edge, do not fight it: hands stay off and whatever happens happens. Rate how close it came.',
   FALSE, FALSE, FALSE,
   'Stop on cramping or numbness. Hydrate after long sessions.'),
  ('plug_orgasm', 5, 'po_the_crossing', 'The crossing', 'hush_medium', 'release',
   'The full arc: medium Hush, cage on. Five minutes steady low. Ten minutes slow wave. Then edge tease up to the shimmer — and hold, and let the pattern keep pushing. You have permission: if it crosses, let it cross. Hands never touch. This is how it happens now — from inside, on the patterns, locked. However long it takes is however long it takes. Rate the closeness every single time.',
   FALSE, FALSE, FALSE,
   'No time pressure ever on this rung. Stop on cramping or numbness.')
ON CONFLICT DO NOTHING;

-- ── 3. Closeness → recon measurement ──────────────────────────────────────
-- Every plug_orgasm log writes sissygasm_closeness (0.0-1.0) against
-- arousal_is_the_becoming. First-ever log per user is captured as the
-- BASELINE — the precondition the honesty spine requires before that target
-- can ever activate. Numeric-only payload: no probe-text risk.
CREATE OR REPLACE FUNCTION public.trg_plug_orgasm_closeness_measurement()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_target uuid;
  v_has_baseline boolean;
BEGIN
  IF NEW.track <> 'plug_orgasm' OR NEW.comfort_rating IS NULL THEN RETURN NEW; END IF;

  SELECT id, baseline_value IS NOT NULL INTO v_target, v_has_baseline
    FROM reconditioning_targets
   WHERE user_id = NEW.user_id AND slug = 'arousal_is_the_becoming';
  IF v_target IS NULL THEN RETURN NEW; END IF;

  PERFORM recon_record_measurement(
    NEW.user_id, v_target, 'sissygasm_closeness',
    round(NEW.comfort_rating / 10.0, 2), 'practice_ladder_log',
    NULL, NOT v_has_baseline,
    jsonb_build_object('rung_order', NEW.rung_order, 'log_id', NEW.id)
  );
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS plug_orgasm_closeness_measurement ON public.practice_ladder_log;
CREATE TRIGGER plug_orgasm_closeness_measurement
  AFTER INSERT ON public.practice_ladder_log
  FOR EACH ROW EXECUTE FUNCTION public.trg_plug_orgasm_closeness_measurement();
