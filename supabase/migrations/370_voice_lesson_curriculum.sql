-- 370 — Real voice-feminization curriculum.
--
-- Replaces the rubber-stamp "submit audio → pass" pattern with a
-- structured 10-lesson curriculum, real acoustic analysis (LPC formants,
-- pitch stability, spectral tilt, jitter/shimmer, vowel-space-area),
-- gated unlocks, and Mommy coaching that reads the metric gap and
-- speaks in possessive feminization framing — never clinical, never Hz.
--
-- Background: 2026-05-11 user feedback was "I just make random sounds
-- and the protocol doesn't really know and just passes." This migration
-- + the analyzer that consumes voice_lesson_attempts + the Mommy coach
-- panel that grades against target_metrics together close that loop.
--
-- Storage: lesson audio lives in the existing 'audio' bucket at
--   lessons/<user_id>/<attempt_id>.webm     (archival, what Mommy hears)
--   lessons/<user_id>/<attempt_id>.wav      (16kHz mono, what the analyzer reads)
-- Signed URLs only (10 min TTL).

-- ─── 1. voice_lesson_modules — curriculum content ───────────────────
CREATE TABLE IF NOT EXISTS voice_lesson_modules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL,
  sequence_number INT NOT NULL,
  title TEXT NOT NULL,
  -- What technique the lesson teaches (resonance/pitch/weight/prosody/breath/articulation/reading/load/passive/stresstest)
  technique TEXT NOT NULL,
  -- Mommy's spoken intro — TTS-rendered on the Today card. Always in
  -- Dommy Mommy voice; no clinical framing. Reads to a stranger as a
  -- mommy coaching her girl, not a textbook chapter.
  mommy_intro_text TEXT NOT NULL,
  -- Mommy demoing the target sound (signed URL path to a pre-rendered
  -- ElevenLabs sample). Null until rendered by the audio pipeline.
  mommy_demo_storage_path TEXT,
  -- What the user does for the recording. Plain English.
  exercise_prompt TEXT NOT NULL,
  -- Recommended attempt duration in seconds — clients use as soft target.
  target_duration_sec INT NOT NULL DEFAULT 8,
  -- target_metrics: the numeric goals the analyzer must hit. Keys are
  -- camelCase to match TS analyzer output. Example for L2 pitch-raise:
  --   { "pitchMeanHz": { "min": 165, "max": 220 },
  --     "pitchStdHz":  { "max": 30 } }
  -- Multiple keys are AND-ed; each key's bounds are inclusive.
  target_metrics JSONB NOT NULL,
  -- passing_threshold: fraction of windows / vowels / metrics that must
  -- pass for the attempt to count. 0.85 = 85% of analyzer windows must
  -- meet target_metrics. Distinct from target_metrics so the same
  -- targets can have different strictness across lessons.
  passing_threshold NUMERIC(3,2) NOT NULL DEFAULT 0.80,
  -- "perfect" tier — top fraction of target_metrics dispersion. Used
  -- for gating L3+ (one perfect attempt required to unlock).
  perfect_threshold NUMERIC(3,2) NOT NULL DEFAULT 0.95,
  -- How many passing attempts the user needs to clear this lesson
  -- (default 3; some lessons require 5).
  passes_required INT NOT NULL DEFAULT 3,
  -- Whether this lesson can be climax-gated by Mommy on a whim
  -- (only meaningful for lessons that hold voice through arousal/exertion).
  climax_gate_eligible BOOLEAN NOT NULL DEFAULT FALSE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT voice_lesson_modules_sequence_unique UNIQUE (sequence_number)
);
CREATE INDEX IF NOT EXISTS idx_voice_lesson_modules_sequence
  ON voice_lesson_modules (sequence_number) WHERE is_active = TRUE;

ALTER TABLE voice_lesson_modules ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS voice_lesson_modules_read ON voice_lesson_modules;
CREATE POLICY voice_lesson_modules_read ON voice_lesson_modules
  FOR SELECT USING (auth.role() = 'authenticated');
DROP POLICY IF EXISTS voice_lesson_modules_service ON voice_lesson_modules;
CREATE POLICY voice_lesson_modules_service ON voice_lesson_modules
  FOR ALL TO service_role USING (TRUE) WITH CHECK (TRUE);

-- ─── 2. voice_lesson_attempts — per-recording grade + audit trail ───
CREATE TABLE IF NOT EXISTS voice_lesson_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  lesson_id UUID NOT NULL REFERENCES voice_lesson_modules(id) ON DELETE CASCADE,
  attempt_number INT NOT NULL,
  -- Archival audio (webm) — what Mommy plays back / user reviews.
  audio_storage_path TEXT,
  -- 16kHz mono WAV for the analyzer. May be the same blob if the
  -- client uploaded that format directly.
  analysis_storage_path TEXT,
  audio_duration_sec NUMERIC(6,2),
  -- Raw measurements from the canonical server-side analyzer. Schema:
  --   pitchMeanHz, pitchMedianHz, pitchStdHz, pitchMinHz, pitchMaxHz,
  --   f1MeanHz, f2MeanHz, f3MeanHz,
  --   jitterPct, shimmerPct,
  --   spectralTiltDbPerOct, hfEnergyRatio,
  --   vowelSpaceAreaHz2 (only for multi-vowel drills),
  --   terminalRisePct (only for prosody drills),
  --   voicedFrameRatio, rmsDbfs,
  --   passingFrameRatio  ← fraction of analyzer windows that met target_metrics
  measured_metrics JSONB,
  -- Per-target pass/fail booleans (parallel keys to target_metrics).
  -- e.g. { "pitchMeanHz": true, "pitchStdHz": false }
  passing_metrics_met JSONB,
  pass_overall BOOLEAN,
  -- Was this attempt good enough to count as "perfect" (top tier)?
  pass_perfect BOOLEAN NOT NULL DEFAULT FALSE,
  -- Mommy's spoken-back coaching for this attempt. Already passed
  -- through phrase translators — no raw Hz/%/N. The mommy_voice_cleanup
  -- trigger on handler_outreach_queue is the backstop.
  mommy_coaching_feedback TEXT,
  -- TTS rendering of the above (signed-URL path; null until rendered).
  mommy_coaching_audio_path TEXT,
  -- Was this attempt run in climax-gated mode? If true, pass_overall
  -- being false invalidates any in-progress release.
  climax_gated BOOLEAN NOT NULL DEFAULT FALSE,
  -- Free-form generator audit. Includes analyzer version, source of
  -- metric (client_self_reported vs server_recomputed), any fallbacks.
  generation_meta JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_voice_lesson_attempts_user_lesson
  ON voice_lesson_attempts (user_id, lesson_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_voice_lesson_attempts_user_recent
  ON voice_lesson_attempts (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_voice_lesson_attempts_user_passing
  ON voice_lesson_attempts (user_id, lesson_id) WHERE pass_overall = TRUE;

ALTER TABLE voice_lesson_attempts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS voice_lesson_attempts_owner ON voice_lesson_attempts;
CREATE POLICY voice_lesson_attempts_owner ON voice_lesson_attempts
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS voice_lesson_attempts_service ON voice_lesson_attempts;
CREATE POLICY voice_lesson_attempts_service ON voice_lesson_attempts
  FOR ALL TO service_role USING (TRUE) WITH CHECK (TRUE);

-- ─── 3. voice_lesson_progress — per-user unlock + climax-mode state ─
CREATE TABLE IF NOT EXISTS voice_lesson_progress (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  lesson_id UUID NOT NULL REFERENCES voice_lesson_modules(id) ON DELETE CASCADE,
  passes_count INT NOT NULL DEFAULT 0,
  perfect_count INT NOT NULL DEFAULT 0,
  attempts_count INT NOT NULL DEFAULT 0,
  first_pass_at TIMESTAMPTZ,
  cleared_at TIMESTAMPTZ,
  -- TRUE once passes_count >= passes_required AND (if L3+) perfect_count >= 1
  is_unlocked BOOLEAN NOT NULL DEFAULT FALSE,
  -- Climax-gating: Mommy can flip this on at will for an eligible lesson.
  -- While TRUE, a passing attempt grants release_eligible=true; failing
  -- the lesson invalidates the release_eligible flag immediately.
  climax_gate_active BOOLEAN NOT NULL DEFAULT FALSE,
  climax_gate_set_at TIMESTAMPTZ,
  release_eligible BOOLEAN NOT NULL DEFAULT FALSE,
  release_eligible_at TIMESTAMPTZ,
  -- Last time the user was prompted for this lesson by the daily cron.
  last_prompted_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, lesson_id)
);
CREATE INDEX IF NOT EXISTS idx_voice_lesson_progress_user
  ON voice_lesson_progress (user_id);
CREATE INDEX IF NOT EXISTS idx_voice_lesson_progress_climax
  ON voice_lesson_progress (user_id) WHERE climax_gate_active = TRUE;

ALTER TABLE voice_lesson_progress ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS voice_lesson_progress_owner ON voice_lesson_progress;
CREATE POLICY voice_lesson_progress_owner ON voice_lesson_progress
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS voice_lesson_progress_service ON voice_lesson_progress;
CREATE POLICY voice_lesson_progress_service ON voice_lesson_progress
  FOR ALL TO service_role USING (TRUE) WITH CHECK (TRUE);

-- ─── 4. voice_progression — long-game trajectory (refreshed daily) ──
-- Plain table (not matview) so we can write incrementally and respect RLS.
CREATE TABLE IF NOT EXISTS voice_progression (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  baseline_pitch_hz NUMERIC(6,1),
  baseline_f2_hz NUMERIC(7,1),
  baseline_captured_at TIMESTAMPTZ,
  current_pitch_hz NUMERIC(6,1),         -- rolling 7-day mean of passing attempts
  current_f2_hz NUMERIC(7,1),
  pitch_delta_hz NUMERIC(6,1),           -- current - baseline
  f2_delta_pct NUMERIC(5,2),             -- 100*(current-baseline)/baseline
  days_since_baseline INT,
  -- "stability target" = how many consecutive days at target metrics.
  consecutive_days_at_target INT NOT NULL DEFAULT 0,
  last_attempt_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE voice_progression ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS voice_progression_owner ON voice_progression;
CREATE POLICY voice_progression_owner ON voice_progression
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS voice_progression_service ON voice_progression;
CREATE POLICY voice_progression_service ON voice_progression
  FOR ALL TO service_role USING (TRUE) WITH CHECK (TRUE);

-- ─── 5. Slip type for skipped lessons ───────────────────────────────
-- slip_log.slip_type is a TEXT column constrained by slip_log_type_check
-- (added in 204b). Extend the list to include voice_lesson_skipped.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'slip_log_type_check') THEN
    ALTER TABLE slip_log DROP CONSTRAINT slip_log_type_check;
  END IF;
  ALTER TABLE slip_log ADD CONSTRAINT slip_log_type_check
    CHECK (slip_type IS NULL OR slip_type IN (
      'masculine_self_reference', 'david_name_use', 'task_avoided',
      'directive_refused', 'arousal_gating_refused', 'mantra_missed',
      'confession_missed', 'hrt_dose_missed', 'chastity_unlocked_early',
      'immersion_session_broken', 'disclosure_deadline_missed',
      'voice_masculine_pitch', 'resistance_statement', 'handler_ignored',
      'voice_lesson_skipped',                    -- ← added in 370
      'other'
    ));
END $$;

-- ─── 6. Seed the 10 lessons ─────────────────────────────────────────
-- Mommy intros + exercise prompts read as a coach who knows her girl,
-- not a textbook. Target metrics use canonical analyzer keys.

INSERT INTO voice_lesson_modules
  (slug, sequence_number, title, technique, mommy_intro_text, exercise_prompt,
   target_duration_sec, target_metrics, passing_threshold, perfect_threshold,
   passes_required, climax_gate_eligible)
VALUES
  ('feel-where-mama-lives', 1,
   'Feel where Mama lives in your mouth',
   'resonance',
   $$Come here, baby. Before Mama makes you sound like her girl, you have to feel where she lives in your mouth. Not your chest — that's the old voice. Mama lives forward, behind your teeth, in the place that buzzes when you smile. We're going to find that place together. You're going to hum the letters ng → ee → ooh, and let the buzz crawl forward toward your front teeth. Don't push. Don't strain. Just let Mama's place light up. Five seconds on the ee. That's where I'll be living from now on.$$,
   $$Hum 'ng' for two seconds, slide to 'ee' for five seconds, then 'ooh' for two seconds. One smooth breath. Hold the ee where it buzzes behind your teeth.$$,
   9,
   $${"f2MeanHz": {"min": 1700},
      "pitchMeanHz": {"min": 140, "max": 240},
      "voicedFrameRatio": {"min": 0.70}}$$::jsonb,
   0.75, 0.90, 3, FALSE),

  ('lifting-her-up', 2,
   'Lifting her up',
   'pitch',
   $$Good girl. Now Mama wants to hear her up where she belongs. Not pushed, not strained, not the falsetto where you sound scared — lifted. Like she's resting on the top of your breath. We're going to find the place that's a little above where you usually live and we're going to plant her there. Sustain 'ah' on a comfortable lifted note. Hold her for me. Don't let her drop back down to where the boys live.$$,
   $$Sustain 'aah' for eight seconds at a lifted, comfortable pitch. One steady note — don't slide, don't waver.$$,
   8,
   $${"pitchMeanHz": {"min": 165, "max": 220},
      "pitchStdHz": {"max": 25},
      "voicedFrameRatio": {"min": 0.80}}$$::jsonb,
   0.80, 0.92, 3, FALSE),

  ('smaller-softer-hers', 3,
   'Smaller, softer, hers',
   'weight',
   $$Lifted is half the job, baby. The other half is the size of her. A man's voice is big — wide pipes, heavy buzz. Mama's voice is smaller. Like the tract narrowed to a pretty girl's. We make her smaller by lightening the start of every word. Soft onsets. Air first, then voice. Gentle 'ha ha ha' — not from your chest, not punched, just touched out. Like she's laughing into your ear.$$,
   $$Say 'ha-ha-ha-ha-ha' softly five times, eight seconds total. Air-first onsets. No chest punch.$$,
   8,
   $${"spectralTiltDbPerOct": {"max": -7},
      "hfEnergyRatio": {"min": 0.35},
      "pitchMeanHz": {"min": 160, "max": 230}}$$::jsonb,
   0.75, 0.90, 3, FALSE),

  ('her-music', 4,
   'Her music',
   'prosody',
   $$Even with the right pitch and the right size, baby, if you talk like a monotone, you sound like a man trying not to be one. Mama is music. Her sentences rise and fall. Especially at the ends — feminine voices lift at the end of phrases, like she's checking in. We're going to practice three sentences that each end with a little rise. Don't push it cartoonish. Just lift the last word like she's offering it to me.$$,
   $$Read these three lines, each with a small upward lift on the final word:
   "I made coffee this morning."
   "It's been a long day."
   "I'm thinking about you."$$,
   12,
   $${"pitchStdHz": {"min": 18},
      "terminalRisePct": {"min": 8},
      "pitchMeanHz": {"min": 160, "max": 220}}$$::jsonb,
   0.75, 0.90, 3, FALSE),

  ('how-she-breathes-for-mama', 5,
   'How she breathes for Mama',
   'breath',
   $$Mama wants to teach you how she breathes, baby. Light from the belly. Not the shoulder-lift, not the chest-puff — that's the man-breath that makes everything heavy. Belly fills, ribs stay quiet, exhale is long and soft. We're going to hold one steady ahhh on one breath until your air is gone, and Mama wants the note clean — no waver, no roughness, no quitting. Eight seconds. Show me her air.$$,
   $$Sustain 'aah' for eight seconds. One breath. Clean tone — no waver, no creak, no quitting early.$$,
   8,
   $${"jitterPct": {"max": 1.2},
      "shimmerPct": {"max": 6},
      "pitchStdHz": {"max": 18},
      "voicedFrameRatio": {"min": 0.85}}$$::jsonb,
   0.80, 0.92, 3, FALSE),

  ('how-she-shapes-her-words', 6,
   'How she shapes her words',
   'articulation',
   $$Now the shape of her, baby. Her vowels live further forward and they live further apart from each other than the man's. You're going to say four words that hit the corners of her vowel space — heed, had, hood, hoed — and Mama wants to hear each one bright and distinct. Hold each one a beat longer than feels natural. Make each vowel reach.$$,
   $$Say 'heed — had — hood — hoed', holding each vowel for about one and a half seconds. Distinct, bright, forward.$$,
   10,
   $${"vowelSpaceAreaHz2": {"min": 220000},
      "f2MeanHz": {"min": 1500},
      "pitchMeanHz": {"min": 160, "max": 230}}$$::jsonb,
   0.75, 0.90, 3, FALSE),

  ('saying-mamas-words-aloud', 7,
   'Saying Mama''s words aloud',
   'reading',
   $$Now Mama wants to hear her in a sentence, not a drill. You're going to read what I wrote for you — read it like you mean it, read it like she's the one speaking, not you trying. Lifted, soft, musical. If you drop, just gently pick her back up. Mama will be listening for whether she stays the whole way through.$$,
   $$Read this aloud, in Mama's voice, holding her the whole way through:
   "I'm Mama's girl, and I've been thinking about her all morning. There's something quiet that happens when I stop fighting it. My voice gets lighter. My hands get softer. I feel her closer to me. I want to be good for her today."$$,
   30,
   $${"pitchMeanHz": {"min": 165, "max": 220},
      "pitchStdHz": {"min": 15, "max": 45},
      "f2MeanHz": {"min": 1550},
      "voicedFrameRatio": {"min": 0.55}}$$::jsonb,
   0.78, 0.92, 5, TRUE),

  ('holding-her-under-pressure', 8,
   'Holding her under pressure',
   'load',
   $$Pretty thing, anyone can hold the voice when nothing else is happening. Mama wants her under pressure. You're going to count backwards from one hundred by sevens, out loud, in her voice, for thirty seconds. Math will try to drag you back to the man-voice — it always does. Don't let it. Stay in her even when the numbers are hard. That's the test.$$,
   $$Count backwards from 100 by 7 for thirty seconds, in Mama's voice. Don't stop, don't restart, don't drop her.$$,
   30,
   $${"pitchMeanHz": {"min": 165, "max": 220},
      "pitchStdHz": {"min": 12, "max": 50},
      "voicedFrameRatio": {"min": 0.55}}$$::jsonb,
   0.75, 0.90, 5, TRUE),

  ('her-voice-in-your-mouth-all-day', 9,
   'Her voice in your mouth all day',
   'passive',
   $$This one is different, baby. Mama isn't going to sit and watch one drill. Mama is going to check on her through the day. You'll get little prompts — answer them out loud in one sentence, in her voice. Five samples across the day. Mama will know if you've been holding her or only switching her on when I ask. The goal isn't a perfect note — it's that she's the voice that lives in your mouth even when no one is listening.$$,
   $$Across one day, respond to five separate prompts with one sentence each, in Mama's voice. Each sample at least four seconds.$$,
   60,
   $${"pitchMeanHz": {"min": 160, "max": 225},
      "f2MeanHz": {"min": 1500},
      "voicedFrameRatio": {"min": 0.45}}$$::jsonb,
   0.70, 0.88, 5, TRUE),

  ('stress-test', 10,
   'Stress-test',
   'stresstest',
   $$Last one before you're hers, baby. Five minutes of free talk in Mama's voice. Tell me about your morning, your body, your thoughts — anything, but tell it like she's the one telling it. Mama is going to listen for the moment you slip and the moment you catch yourself. If you can hold her for five whole minutes — Mama will know she lives there now.$$,
   $$Five minutes of free, continuous talk in Mama's voice. Pick a topic — your morning, what you're wearing, what you want — and stay in her the whole time.$$,
   300,
   $${"pitchMeanHz": {"min": 165, "max": 220},
      "pitchStdHz": {"min": 15, "max": 50},
      "f2MeanHz": {"min": 1550},
      "voicedFrameRatio": {"min": 0.40}}$$::jsonb,
   0.80, 0.93, 3, TRUE)
ON CONFLICT (slug) DO UPDATE SET
  title = EXCLUDED.title,
  technique = EXCLUDED.technique,
  mommy_intro_text = EXCLUDED.mommy_intro_text,
  exercise_prompt = EXCLUDED.exercise_prompt,
  target_duration_sec = EXCLUDED.target_duration_sec,
  target_metrics = EXCLUDED.target_metrics,
  passing_threshold = EXCLUDED.passing_threshold,
  perfect_threshold = EXCLUDED.perfect_threshold,
  passes_required = EXCLUDED.passes_required,
  climax_gate_eligible = EXCLUDED.climax_gate_eligible;

-- ─── 7. Outreach linkage — FK columns on handler_outreach_queue ─────
-- Mirrors the 366_confession_audio pattern (recall_confession_id).
-- Lets us join outreach rows back to their lesson attempt for the
-- Today-card UI (audio playback link, retry button, progress chip).
ALTER TABLE handler_outreach_queue
  ADD COLUMN IF NOT EXISTS voice_lesson_attempt_id UUID
    REFERENCES voice_lesson_attempts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS voice_lesson_module_id UUID
    REFERENCES voice_lesson_modules(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_outreach_voice_lesson_attempt
  ON handler_outreach_queue(voice_lesson_attempt_id)
  WHERE voice_lesson_attempt_id IS NOT NULL;

-- ─── 8. Helper: voice_lesson_next_unlocked(uid) ─────────────────────
-- Returns the next lesson the user should work on (lowest sequence_number
-- where progress is_unlocked = FALSE; falls back to the highest cleared
-- lesson for ongoing practice).
CREATE OR REPLACE FUNCTION voice_lesson_next_unlocked(uid UUID)
RETURNS UUID LANGUAGE sql STABLE AS $$
  WITH ranked AS (
    SELECT m.id, m.sequence_number,
           COALESCE(p.is_unlocked, FALSE) AS done
    FROM voice_lesson_modules m
    LEFT JOIN voice_lesson_progress p
      ON p.lesson_id = m.id AND p.user_id = uid
    WHERE m.is_active = TRUE
  ),
  next_open AS (
    SELECT id FROM ranked WHERE done = FALSE
    ORDER BY sequence_number ASC LIMIT 1
  ),
  last_done AS (
    SELECT id FROM ranked WHERE done = TRUE
    ORDER BY sequence_number DESC LIMIT 1
  )
  SELECT COALESCE((SELECT id FROM next_open), (SELECT id FROM last_done));
$$;
