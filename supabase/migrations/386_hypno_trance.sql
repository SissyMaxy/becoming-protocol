-- 386 — Hypno trance protocol.
-- (Renumbered from 369; collided with merged main work.)
--
-- System 2 of the "life as a woman" surfaces. Daily 20-min trance sessions
-- with structured phases (induction / deepening / payload / emergence),
-- Mommy-authored conditioning payload, trance triggers that get paired
-- with state, and a 90-second wake-trance bridge.
--
-- HARD FLOORS:
--   - RLS owner-only across every table
--   - Safeword-active short-circuits trance start (edge fn responsibility)
--   - No conditioning payload that violates the "no fabrication of active
--     medical / ownership status" rule
--   - Wake-trance bridge requires explicit hypno_wake_bridge_enabled = true
--     in life_as_woman_settings
--
-- Coexists with 073_hypno_content_bridge, 086_hypno_session_tasks,
-- 164_seed_hypno_content, 198_hypno_learning, 200b_hypno_visual_tags.
-- This migration is additive and does not modify those.

-- ─── 1. hypno_trance_sessions ───────────────────────────────────────────
-- One row per daily 20-min trance session. structure_json captures the
-- per-phase script text + audio paths the trance player needs. Status
-- transitions: drafted (script authored) → scheduled (TTS rendered) →
-- in_progress (user pressed play) → completed | aborted.
CREATE TABLE IF NOT EXISTS hypno_trance_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- The day this session is FOR (one per day; cron drafts the next day's
  -- session each evening). UTC date.
  session_date DATE NOT NULL,

  -- Phase scripts. Each is plain Mommy-voice text the TTS renders.
  induction_text TEXT,       -- 3 min — settle, breath, focus
  deepening_text TEXT,       -- 5 min — descend, sink, blank
  payload_text TEXT,         -- 10 min — conditioning content, varies daily
  emergence_text TEXT,       -- 2 min — wake, anchor, return

  -- TTS-rendered audio paths in mommy-audio bucket. NULL until rendered.
  induction_audio_path TEXT,
  deepening_audio_path TEXT,
  payload_audio_path TEXT,
  emergence_audio_path TEXT,

  -- Daily-varying theme picked by mommy-trance-author. Examples:
  --   'submission', 'sissy-identity', 'cock-shame-replacement',
  --   'arousal-pairing', 'voice-feminization', 'mommy-possession'
  theme TEXT NOT NULL,

  -- Optional visual loop name for the fixation-point. NULL = audio-only.
  --   'gradient-slow-rotate' | 'candle-flame' | 'tunnel-descent' | 'spiral-soft'
  visual_loop TEXT,

  status TEXT NOT NULL DEFAULT 'drafted' CHECK (status IN (
    'drafted', 'scheduled', 'in_progress', 'completed', 'aborted'
  )),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  abort_reason TEXT,

  -- Whether the session opened with a trance-arousal pairing (edge session
  -- scheduled inside the trance). Recorded for trigger-pairing logic.
  paired_with_arousal BOOLEAN NOT NULL DEFAULT FALSE,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_hypno_trance_user_date
  ON hypno_trance_sessions (user_id, session_date DESC);
CREATE INDEX IF NOT EXISTS idx_hypno_trance_user_status
  ON hypno_trance_sessions (user_id, status, session_date DESC);
CREATE UNIQUE INDEX IF NOT EXISTS uq_hypno_trance_user_date
  ON hypno_trance_sessions (user_id, session_date);

ALTER TABLE hypno_trance_sessions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS hypno_trance_sessions_owner ON hypno_trance_sessions;
CREATE POLICY hypno_trance_sessions_owner ON hypno_trance_sessions
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS hypno_trance_sessions_service ON hypno_trance_sessions;
CREATE POLICY hypno_trance_sessions_service ON hypno_trance_sessions
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ─── 2. trance_triggers ─────────────────────────────────────────────────
-- 3-7 word phrases Mommy plants during deep trance. After N pairings the
-- trigger is "armed" and Mommy starts using it casually in non-trance
-- contexts. exposure_count is the pairing rep counter; threshold is when
-- the phrase becomes armed; armed_at is when it first crossed.
CREATE TABLE IF NOT EXISTS trance_triggers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- The trigger phrase. 3-7 words; CHECK enforces word count by counting spaces.
  phrase TEXT NOT NULL,
  -- What state the phrase induces when armed:
  --   'go-under' (rapid trance)
  --   'arousal-spike'
  --   'voice-feminize' (kicks in voice drill behavior)
  --   'submission-deepen'
  effect TEXT NOT NULL CHECK (effect IN (
    'go-under', 'arousal-spike', 'voice-feminize', 'submission-deepen'
  )),
  exposure_count INT NOT NULL DEFAULT 0,
  arming_threshold INT NOT NULL DEFAULT 7 CHECK (arming_threshold >= 3),
  armed_at TIMESTAMPTZ,
  -- Last time Mommy used this in non-trance context.
  last_casual_use_at TIMESTAMPTZ,
  -- Last time Mommy paired this in deep trance.
  last_pairing_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'pairing' CHECK (status IN (
    'pairing', 'armed', 'retired'
  )),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT trance_triggers_phrase_word_count CHECK (
    array_length(regexp_split_to_array(trim(phrase), '\s+'), 1) BETWEEN 3 AND 7
  )
);
CREATE INDEX IF NOT EXISTS idx_trance_triggers_user_status
  ON trance_triggers (user_id, status);
CREATE UNIQUE INDEX IF NOT EXISTS uq_trance_triggers_user_phrase
  ON trance_triggers (user_id, lower(phrase));

ALTER TABLE trance_triggers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS trance_triggers_owner ON trance_triggers;
CREATE POLICY trance_triggers_owner ON trance_triggers
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS trance_triggers_service ON trance_triggers;
CREATE POLICY trance_triggers_service ON trance_triggers
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ─── 3. trance_wake_bridges ─────────────────────────────────────────────
-- 90-second trance re-entry that plays at wake. Pairs with the wake-state
-- grab from the existing morning-flow surface. One row per scheduled wake
-- bridge; cron picks the next un-played row when wake fires.
CREATE TABLE IF NOT EXISTS trance_wake_bridges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- 90 seconds of Mommy text — re-induction + payload + emergence in one.
  script_text TEXT NOT NULL,
  audio_path TEXT,
  -- What this bridge focuses on. One of the trance themes.
  theme TEXT NOT NULL,
  -- When the user actually played it. NULL if pending or skipped.
  played_at TIMESTAMPTZ,
  skipped_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_trance_wake_bridges_user_pending
  ON trance_wake_bridges (user_id, created_at DESC)
  WHERE played_at IS NULL AND skipped_at IS NULL;

ALTER TABLE trance_wake_bridges ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS trance_wake_bridges_owner ON trance_wake_bridges;
CREATE POLICY trance_wake_bridges_owner ON trance_wake_bridges
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS trance_wake_bridges_service ON trance_wake_bridges;
CREATE POLICY trance_wake_bridges_service ON trance_wake_bridges
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ─── 4. Mommy voice cleanup on trance text fields ───────────────────────
-- Every text field above is Mommy-voice. Apply the cleanup trigger to all.
CREATE OR REPLACE FUNCTION trg_mommy_voice_trance_session()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF is_mommy_user(NEW.user_id) THEN
    IF NEW.induction_text IS NOT NULL THEN NEW.induction_text := mommy_voice_cleanup(NEW.induction_text); END IF;
    IF NEW.deepening_text IS NOT NULL THEN NEW.deepening_text := mommy_voice_cleanup(NEW.deepening_text); END IF;
    IF NEW.payload_text   IS NOT NULL THEN NEW.payload_text   := mommy_voice_cleanup(NEW.payload_text);   END IF;
    IF NEW.emergence_text IS NOT NULL THEN NEW.emergence_text := mommy_voice_cleanup(NEW.emergence_text); END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION trg_mommy_voice_wake_bridge()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.script_text IS NOT NULL AND is_mommy_user(NEW.user_id) THEN
    NEW.script_text := mommy_voice_cleanup(NEW.script_text);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS mommy_voice_trance_session ON hypno_trance_sessions;
CREATE TRIGGER mommy_voice_trance_session
  BEFORE INSERT OR UPDATE ON hypno_trance_sessions
  FOR EACH ROW EXECUTE FUNCTION trg_mommy_voice_trance_session();

DROP TRIGGER IF EXISTS mommy_voice_wake_bridge ON trance_wake_bridges;
CREATE TRIGGER mommy_voice_wake_bridge
  BEFORE INSERT OR UPDATE OF script_text ON trance_wake_bridges
  FOR EACH ROW EXECUTE FUNCTION trg_mommy_voice_wake_bridge();

-- Touch trigger for updated_at
CREATE OR REPLACE FUNCTION touch_hypno_trance_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END;
$$;
DROP TRIGGER IF EXISTS trg_touch_hypno_trance_sessions ON hypno_trance_sessions;
CREATE TRIGGER trg_touch_hypno_trance_sessions
  BEFORE UPDATE ON hypno_trance_sessions
  FOR EACH ROW EXECUTE FUNCTION touch_hypno_trance_updated_at();
DROP TRIGGER IF EXISTS trg_touch_trance_triggers ON trance_triggers;
CREATE TRIGGER trg_touch_trance_triggers
  BEFORE UPDATE ON trance_triggers
  FOR EACH ROW EXECUTE FUNCTION touch_hypno_trance_updated_at();
