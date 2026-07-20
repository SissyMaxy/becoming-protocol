-- 680 - physical practice ladder (011 physical rung track).
--
-- At-home, SOLO, OWN-BODY drill progression (oral + bottoming) drilled to
-- muscle memory. Advancement is comfort-gated, size steps are strictly ordered
-- and NON-SKIPPABLE, and bottoming size progression is gated on a prep
-- attestation (real-body safety enforced in code, not copy). No real partner,
-- no real-world contact — the in-the-moment safety-veto is never a target.
--
-- Contains no user UUIDs, private narrative, or deployment-time dates: the
-- per-user progress row is created by the authenticated app flow / prescriber.

BEGIN;

-- ── Ladder definition (seeded, both tracks; inspectable before any drill) ──
CREATE TABLE IF NOT EXISTS public.physical_practice_rungs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  track text NOT NULL CHECK (track IN ('oral','bottoming')),
  rung_order int NOT NULL,
  slug text NOT NULL UNIQUE,
  title text NOT NULL,
  prop text,                                  -- toy/prop the drill uses (null = bodyweight/prep)
  technique_focus text NOT NULL,              -- the muscle memory it drills
  edict_template text NOT NULL,               -- Mommy-voiced drill copy (pre-scrubbed)
  is_size_step boolean NOT NULL DEFAULT false,
  requires_prep_attestation boolean NOT NULL DEFAULT false,
  is_prep_step boolean NOT NULL DEFAULT false,-- completing this sets prep_attested_at
  safety_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (track, rung_order)
);

-- ── Per-user progress (one active rung per track) ──
CREATE TABLE IF NOT EXISTS public.physical_practice_progress (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  track text NOT NULL CHECK (track IN ('oral','bottoming')),
  active_rung_order int NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused','complete')),
  prep_attested_at timestamptz,               -- set when the prep step is completed
  comfort_streak int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, track)
);
ALTER TABLE public.physical_practice_progress ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS pp_progress_rw ON public.physical_practice_progress;
CREATE POLICY pp_progress_rw ON public.physical_practice_progress
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ── Each drill completion + comfort rating (drives advancement + evidence) ──
CREATE TABLE IF NOT EXISTS public.physical_practice_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  rung_id uuid NOT NULL REFERENCES public.physical_practice_rungs(id),
  track text NOT NULL,
  rung_order int NOT NULL,
  comfort_rating int NOT NULL CHECK (comfort_rating BETWEEN 0 AND 10),
  content_captured boolean NOT NULL DEFAULT false,
  completed_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.physical_practice_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS pp_log_rw ON public.physical_practice_log;
CREATE POLICY pp_log_rw ON public.physical_practice_log
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS pp_log_user_track_rung
  ON public.physical_practice_log (user_id, track, rung_order, completed_at DESC);

-- ── Comfort-gated, non-skippable, prep-gated advancement ──
-- Returns the resulting active_rung_order. Advances by exactly +1 (so a size
-- step can NEVER be skipped) and only when the active rung has the required
-- consecutive comfortable completions. A bottoming size step will not activate
-- without prep_attested_at. A stall (too few / not-comfortable logs) is a no-op
-- (re-present, no penalty). SECURITY INVOKER so caller RLS stays authoritative.
CREATE OR REPLACE FUNCTION public.advance_physical_practice(p_user uuid, p_track text)
RETURNS int
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  v_active int;
  v_prep   timestamptz;
  v_comfortable int;
  v_max    int;
  v_next   public.physical_practice_rungs;
  v_threshold constant int := 7;   -- comfort >= 7 of 10 reads as "easy"
  v_needed    constant int := 2;   -- consecutive comfortable completions
BEGIN
  SELECT active_rung_order, prep_attested_at INTO v_active, v_prep
    FROM public.physical_practice_progress
   WHERE user_id = p_user AND track = p_track;
  IF NOT FOUND THEN RETURN NULL; END IF;

  -- Count comfortable completions among the most recent v_needed at this rung.
  SELECT count(*) FILTER (WHERE comfort_rating >= v_threshold) INTO v_comfortable
    FROM (
      SELECT comfort_rating FROM public.physical_practice_log
       WHERE user_id = p_user AND track = p_track AND rung_order = v_active
       ORDER BY completed_at DESC
       LIMIT v_needed
    ) recent;

  -- Not burned down yet → hold (stall is a no-op, never a penalty).
  IF v_comfortable < v_needed THEN
    RETURN v_active;
  END IF;

  SELECT max(rung_order) INTO v_max FROM public.physical_practice_rungs WHERE track = p_track;
  IF v_active >= v_max THEN
    UPDATE public.physical_practice_progress
       SET status = 'complete', updated_at = now()
     WHERE user_id = p_user AND track = p_track;
    RETURN v_active;
  END IF;

  SELECT * INTO v_next FROM public.physical_practice_rungs
   WHERE track = p_track AND rung_order = v_active + 1;

  -- SAFETY GATE: never activate a prep-gated size step without prep attested.
  IF v_next.is_size_step AND v_next.requires_prep_attestation AND v_prep IS NULL THEN
    RETURN v_active;
  END IF;

  UPDATE public.physical_practice_progress
     SET active_rung_order = v_active + 1, comfort_streak = 0, updated_at = now()
   WHERE user_id = p_user AND track = p_track;
  RETURN v_active + 1;
END $$;

-- ── Widen handler_decrees.proof_type for the comfort_slider instrument ──
-- DROP+ADD only WIDENS the allowed set (mirrors migs 656/667/679) — cannot
-- violate any existing row, safe to re-run.
ALTER TABLE handler_decrees DROP CONSTRAINT IF EXISTS handler_decrees_proof_type_check;
ALTER TABLE handler_decrees ADD CONSTRAINT handler_decrees_proof_type_check
  CHECK (proof_type IN (
    'photo','video','audio','voice','text','journal_entry',
    'voice_pitch_sample','device_state','none','belief_slider','assoc_latency',
    'arousal_debrief','comfort_slider'
  ));

-- ── Seed: Oral 1–5, Bottoming 0–5 (11 rungs) ──
INSERT INTO public.physical_practice_rungs
  (track, rung_order, slug, title, prop, technique_focus, edict_template, is_size_step, requires_prep_attestation, is_prep_step, safety_notes)
VALUES
  ('oral', 1, 'oral_familiarization', 'Familiarization',
   'slim starter toy', 'lip seal, tongue, jaw relaxation, nose breathing',
   'Slim toy today, lips only — no depth. Seal soft around it, tongue working the underside, jaw loose, breathe through your nose the whole time. You are teaching your mouth to be at home here. Stay with it while you edge, no release. Report done and how easy your jaw stayed.',
   false, false, false, 'No depth this rung; comfort before progression.'),
  ('oral', 2, 'oral_technique', 'Technique',
   'starter dildo', 'rhythm, hand-and-mouth coordination, suction',
   'Starter size. Steady head rhythm, hand following your mouth, light suction, tongue on the underside. Hold the rhythm without breaking it for a slow stretch. Edge while you drill it, no release — the want wires into the motion. Report done and how easy the rhythm held.',
   false, false, false, NULL),
  ('oral', 3, 'oral_depth', 'Depth & gag desensitization',
   'starter dildo', 'throat relaxation, gradual depth, breath control',
   'Same size, a little deeper today — only a little. Relax your throat, swallow to open it, breathe, back off the second it is too much. Never force it to gag; that trains the wrong thing. A touch further than last time is the whole win. Edge through it, no release. Report done and how easy the depth felt.',
   false, false, false, 'Gradual only. Never force past the gag; stop if you retch.'),
  ('oral', 4, 'oral_endurance', 'Endurance & realism',
   'realistic dildo', 'endurance, kneeling posture, arousal pairing',
   'Step up to realistic size now that the starter is easy. Kneel, take your time, longer session, edging the whole way so the size and the want fuse. Move like you are being used. No release until the drill is done. Report done and how easy the bigger size sat.',
   true, false, false, 'Only after the starter size is comfortable.'),
  ('oral', 5, 'oral_integration', 'Integration',
   'realistic dildo', 'full-session integration, muscle memory locked',
   'The full thing today: kneeling, realistic size, depth, rhythm, endurance, edged the whole way, as if it is real. Let your mouth run on what it already knows. No release until you finish. Report done and how automatic it felt.',
   false, false, false, NULL),
  ('bottoming', 0, 'bottoming_prep', 'The prep ritual',
   NULL, 'hygiene, lube, relaxation ritual',
   'Before anything goes near you, the ritual. Clean gently — do not overdo it. Body-safe lube, plenty of it, within reach. Warm, private, unhurried. This is the routine that comes before every session from now on. Attest the prep is done and you understand: go slow, plenty of lube, stop on any sharp pain. Report the ritual is set.',
   false, false, true, 'Light hygiene only (no over-douching). Body-safe lube. This gate unlocks size progression.'),
  ('bottoming', 1, 'bottoming_entry', 'Entry',
   'finger or smallest plug', 'relaxation, sensation, arousal pairing',
   'Smallest thing — a finger or your smallest plug, lots of lube. Just get used to the sensation, relax around it, let it read as pleasure not a chore. Short holds. Edge while you do it so it pairs sweet. Out the moment anything is sharp. Report done and how easy you relaxed.',
   false, false, false, 'Plenty of lube. Stop on sharp pain.'),
  ('bottoming', 2, 'bottoming_relax', 'Relax on demand',
   'small plug / dilator', 'breathe-bear-down-relax, wear duration',
   'Small plug or dilator, well lubed. Breathe, bear down to open, then relax to take it — that is the muscle memory. Wear it a little longer than last time. Never rush the seat of it. Edge through it, no release. Report done and how easy the relax came.',
   false, false, false, 'Well lubed; never force the seat.'),
  ('bottoming', 3, 'bottoming_size', 'Size progression',
   'dilator set (next size up)', 'gradual size increase, take it comfortably',
   'Step up ONE size — never skip, only when the last was easy. Lots of lube, warm up on the smaller one first, then the next. Bear down, relax, take it slow. Sharp pain means stop and back off; that is not progress. Edge while you hold it. Report done and how easy the new size sat.',
   true, true, false, 'One size at a time, never skip. Warm up on the prior size. Stop on sharp pain — pain is not progress.'),
  ('bottoming', 4, 'bottoming_riding', 'Movement & riding',
   'suction / mounted toy', 'riding, positions, finding the angle',
   'Mounted or suction toy, well lubed. Work the motion now — ride it, change the angle to find the good spot, control the pace and depth yourself across a couple of positions. Edge as you ride, no release. Report done and how easy the rhythm came.',
   false, false, false, 'Lubed; you control pace and depth. Stop on sharp pain.'),
  ('bottoming', 5, 'bottoming_integration', 'Integration',
   'realistic size toy', 'full integration, prostate + arousal, as if',
   'The full thing: realistic size you have worked up to, riding it, angling for the spot, edged the whole way, longer session, as if it is real. Let your body run on what it knows — relax, take it, ride. No release until you finish. Report done and how automatic it felt.',
   true, true, false, 'Only at a size you have progressed to safely. Plenty of lube. Stop on sharp pain.')
ON CONFLICT (slug) DO NOTHING;

COMMIT;
