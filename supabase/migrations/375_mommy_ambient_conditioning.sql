-- Migration 375 — Mommy ambient + sleep-audio conditioning (2026-05-11)
--
-- System 1 of headspace-capture build. Long-form ambient audio (worktime,
-- commute, sleep, morning, gym) authored by Mommy and rendered to TTS so
-- the user can have her in his ear for hours, not minutes. Time-in-frame.
--
-- Storage: ambient renders live in the existing `audio` bucket under
-- `mommy-ambient/<user_id>/<track_id>.mp3`. Bucket-level RLS already
-- gates by folder owner (mig 301).
--
-- Notes:
--   - `audio_session_kind` enum (mig 314) is short-form session focused;
--     ambient is conceptually separate (multi-minute / loopable / sparse)
--     so we don't extend that enum. New table owns its own `kind` column.
--   - Post-hypnotic triggers are short phrases the LLM is REQUIRED to weave
--     into ambient scripts; later surfaces (chat TTS, outreach) reference
--     them so the conditioned recall fires outside the audio context.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------------------------------------------------------------
-- 1. mommy_ambient_tracks — Mommy's long-form audio payloads
-- ---------------------------------------------------------------

CREATE TABLE IF NOT EXISTS mommy_ambient_tracks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  slug TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN (
    'worktime', 'commute', 'sleep', 'morning_immersion', 'gym_session'
  )),
  intensity_band TEXT NOT NULL DEFAULT 'gentle' CHECK (intensity_band IN (
    'gentle', 'firm', 'cruel'
  )),
  -- Full script with section markers (induction / deepening / payload /
  -- post-hypnotic seeds / emergence). Renderer splits on `[[section: ...]]`.
  script_text TEXT NOT NULL,
  -- Target playback duration. Renderer aims for it; player loops shorter
  -- audio with quiet padding to fill the kind's expected envelope
  -- (e.g. sleep ~4h, worktime ~4h, morning ~5min).
  duration_seconds INTEGER NOT NULL CHECK (duration_seconds > 0),
  -- Audio bucket path once rendered. NULL until mommy-ambient-render runs.
  audio_url TEXT,
  -- Voice settings used at render time (mirrors audio_session_renders).
  voice_settings_used JSONB,
  -- Post-hypnotic trigger phrases this track plants (references
  -- mommy_post_hypnotic_triggers.phrase). Used by chat/outreach to recall.
  post_hypnotic_triggers JSONB NOT NULL DEFAULT '[]'::jsonb,
  render_status TEXT NOT NULL DEFAULT 'pending' CHECK (render_status IN (
    'pending', 'rendering', 'ready', 'failed'
  )),
  render_error TEXT,
  -- Daily auto-schedule. NULL = user-triggered only. Used by sleep tracks
  -- so the 10pm cron auto-queues a fresh sleep track per user.
  auto_schedule_at_local TIME,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  -- Resume cursor — last second the user stopped at, so the player can
  -- continue across sessions. Updated by the client on pause.
  last_played_position_seconds INTEGER NOT NULL DEFAULT 0,
  last_played_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_mommy_ambient_tracks_by_kind
  ON mommy_ambient_tracks (user_id, kind, active, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_mommy_ambient_tracks_render_queue
  ON mommy_ambient_tracks (created_at)
  WHERE render_status = 'pending';

ALTER TABLE mommy_ambient_tracks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS mommy_ambient_tracks_owner ON mommy_ambient_tracks;
CREATE POLICY mommy_ambient_tracks_owner ON mommy_ambient_tracks
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ---------------------------------------------------------------
-- 2. mommy_post_hypnotic_triggers — short phrases that fire later
-- ---------------------------------------------------------------
--
-- Phrases seeded once per user. Plant via ambient script. Later: chat TTS
-- and outreach generators reference them so the conditioned response
-- fires outside the original audio context. Body-response + identity
-- displacement are the two main response classes.

CREATE TABLE IF NOT EXISTS mommy_post_hypnotic_triggers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  phrase TEXT NOT NULL,
  -- What the phrase is conditioned to evoke. Free text — used by the LLM
  -- when composing surfaces that should fire the trigger.
  intended_response TEXT NOT NULL,
  response_class TEXT NOT NULL CHECK (response_class IN (
    'body_response',   -- breath, posture, jaw, throat
    'identity_recall', -- displacement, "she" reference, name recall
    'arousal_anchor',  -- arousal swell, wetness recall
    'submission_drop'  -- compliance posture, eyes-down
  )),
  -- How many ambient sessions have used it; rotate sparingly.
  plant_count INTEGER NOT NULL DEFAULT 0,
  last_planted_at TIMESTAMPTZ,
  -- How many times non-audio surfaces have recalled it.
  recall_count INTEGER NOT NULL DEFAULT 0,
  last_recalled_at TIMESTAMPTZ,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, phrase)
);

CREATE INDEX IF NOT EXISTS idx_mommy_post_hypnotic_triggers_active
  ON mommy_post_hypnotic_triggers (user_id, active, plant_count);

ALTER TABLE mommy_post_hypnotic_triggers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS mommy_post_hypnotic_triggers_owner ON mommy_post_hypnotic_triggers;
CREATE POLICY mommy_post_hypnotic_triggers_owner ON mommy_post_hypnotic_triggers
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ---------------------------------------------------------------
-- 3. Ambient playback log — drives surveillance + dossier enrichment
-- ---------------------------------------------------------------

CREATE TABLE IF NOT EXISTS mommy_ambient_playback_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  track_id UUID NOT NULL REFERENCES mommy_ambient_tracks(id) ON DELETE CASCADE,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at TIMESTAMPTZ,
  duration_played_seconds INTEGER,
  -- 'completed' = ended on its own; 'paused' = user paused; 'interrupted'
  -- = nav away. Sleep tracks default 'completed' if no explicit end.
  end_reason TEXT CHECK (end_reason IN ('completed', 'paused', 'interrupted'))
);

CREATE INDEX IF NOT EXISTS idx_mommy_ambient_playback_log_user
  ON mommy_ambient_playback_log (user_id, started_at DESC);

ALTER TABLE mommy_ambient_playback_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS mommy_ambient_playback_log_owner ON mommy_ambient_playback_log;
CREATE POLICY mommy_ambient_playback_log_owner ON mommy_ambient_playback_log
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ---------------------------------------------------------------
-- 4. updated_at trigger
-- ---------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.trg_mommy_ambient_tracks_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS mommy_ambient_tracks_updated_at ON mommy_ambient_tracks;
CREATE TRIGGER mommy_ambient_tracks_updated_at
  BEFORE UPDATE ON mommy_ambient_tracks
  FOR EACH ROW EXECUTE FUNCTION public.trg_mommy_ambient_tracks_updated_at();
