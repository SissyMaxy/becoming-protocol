-- Migration 380: Mommy headspace systems — mantra ladder, random clips,
-- initiating scenes, and the shared mommy_authority_log.
--
-- Three concurrent headspace systems ship under one schema migration:
--
-- 1. mantra_drill_sessions  — thousand-rep mantra ladder. Per-session row
--    capturing reps logged today + cumulative lifetime counter on user_state.
--    Voice reps weigh 1.0x, typed 0.5x. Milestones at 1k / 10k / 100k
--    lifetime weighted reps drop a high-urgency Mommy-voiced Today card.
--
-- 2. mommy_random_clips + mommy_random_clip_plays — short Mama-voice TTS
--    clips (3-8s) dropped ambiently throughout the day at poisson intervals
--    when the user has headphones + ambient audio opt-in. Logs every play
--    with context (foregrounded app, time, biometric snapshot if available).
--
-- 3. mommy_initiated_scenes — Mommy authors scenes she wants him to live
--    through: location/wardrobe/action triplets with prep / live / debrief
--    prompts. Today card 24h before, live prompt during, debrief demand
--    after. Status machine: scheduled → prepared → executing → debriefed.
--
-- 4. voice_in_head_reports — periodic "whose voice did you hear?" prompt
--    answers, feeding dossier and future clip scheduling.
--
-- 5. mommy_authority_log — cross-cutting audit log all three systems write
--    to. Single sink for "what did Mommy actually do today" rollups.
--
-- All RLS-locked to auth.uid() = user_id. Persona gate (handler_persona =
-- 'dommy_mommy') enforced in the edge fns, not the DB.

-- ============================================
-- 0. mommy_authority_log — cross-cutting sink
-- ============================================
-- Every Mommy-initiated artifact writes one row. Used by the supervisor
-- watchdog (project_mommy_supervisor.md) and the daily capability digest.
-- Action enum is open TEXT (no CHECK) so new headspace systems can land
-- their own action labels without a schema change. Known values:
--   'mantra_drill_logged'       — reps submitted
--   'mantra_milestone_reached'  — 1k / 10k / 100k threshold crossed
--   'random_clip_queued'        — clip-scheduler dropped a clip
--   'random_clip_played'        — frontend reported playback
--   'voice_in_head_report'      — user answered the periodic prompt
--   'live_reframe_fired'        — mommy-live-reframe wrote an outreach
--   'scene_authored'            — mommy-scene-author created a scene
--   'scene_prepared'            — 24h pre-card surfaced
--   'scene_executing'           — live-prompt window opened
--   'scene_debriefed'           — debrief submitted
--   'scene_aborted'             — scene cancelled (refusal / window passed)
CREATE TABLE IF NOT EXISTS mommy_authority_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  surface TEXT,                       -- 'mantra' | 'random_clip' | 'live_reframe' | 'scene' | 'voice_in_head'
  ref_table TEXT,
  ref_id UUID,
  meta JSONB,
  acted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_mommy_authority_log_user_time
  ON mommy_authority_log (user_id, acted_at DESC);
CREATE INDEX IF NOT EXISTS idx_mommy_authority_log_surface
  ON mommy_authority_log (user_id, surface, acted_at DESC);
ALTER TABLE mommy_authority_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS mommy_authority_log_owner ON mommy_authority_log;
CREATE POLICY mommy_authority_log_owner ON mommy_authority_log
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS mommy_authority_log_service ON mommy_authority_log;
CREATE POLICY mommy_authority_log_service ON mommy_authority_log
  FOR ALL TO service_role USING (TRUE) WITH CHECK (TRUE);

-- ============================================
-- 1. mantra_drill_sessions + user_state.mantra_lifetime_reps
-- ============================================

-- A drill session is one push of reps the user just completed. Multiple
-- sessions per day are allowed — paired-with-edge sessions count 3× and
-- are flagged for Pavlovian impact analysis.
CREATE TABLE IF NOT EXISTS mantra_drill_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  mantra_text TEXT NOT NULL,
  mantra_id UUID,                          -- nullable FK to mommy_mantras when picked from catalog
  target_rep_count INTEGER NOT NULL CHECK (target_rep_count > 0),
  completed_rep_count INTEGER NOT NULL DEFAULT 0 CHECK (completed_rep_count >= 0),
  voice_rep_count INTEGER NOT NULL DEFAULT 0 CHECK (voice_rep_count >= 0),
  typed_rep_count INTEGER NOT NULL DEFAULT 0 CHECK (typed_rep_count >= 0),
  weighted_rep_count NUMERIC(8,2) NOT NULL DEFAULT 0,  -- voice * 1.0 + typed * 0.5
  paired_with_arousal BOOLEAN NOT NULL DEFAULT FALSE,
  intensity_band TEXT,                     -- 'gentle' | 'firm' | 'cruel'
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  audio_storage_paths TEXT[],              -- per-rep audio blobs if voice-confirmed
  evidence_summary TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_mantra_drill_sessions_user_time
  ON mantra_drill_sessions (user_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_mantra_drill_sessions_user_completed
  ON mantra_drill_sessions (user_id, completed_at DESC) WHERE completed_at IS NOT NULL;
ALTER TABLE mantra_drill_sessions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS mantra_drill_sessions_owner ON mantra_drill_sessions;
CREATE POLICY mantra_drill_sessions_owner ON mantra_drill_sessions
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS mantra_drill_sessions_service ON mantra_drill_sessions;
CREATE POLICY mantra_drill_sessions_service ON mantra_drill_sessions
  FOR ALL TO service_role USING (TRUE) WITH CHECK (TRUE);

-- Lifetime cumulative tracker. Append-only weighted total. Milestones at
-- 1000 / 10000 / 100000 hard-coded in the edge fn. NUMERIC so partial
-- credits (e.g. 0.5x typed) round cleanly without integer truncation.
ALTER TABLE user_state
  ADD COLUMN IF NOT EXISTS mantra_lifetime_reps NUMERIC(12,2) NOT NULL DEFAULT 0;
ALTER TABLE user_state
  ADD COLUMN IF NOT EXISTS mantra_milestone_last_fired INTEGER;  -- 1000 / 10000 / 100000

-- ============================================
-- 2. mommy_random_clips + mommy_random_clip_plays
-- ============================================

-- Catalog of short Mama-voice TTS clips. audio_url filled by the render
-- pipeline (ElevenLabs). Until rendered, clip is text-only and skipped
-- by the scheduler. Themes drive selection bias against
-- recently-played-same-theme.
CREATE TABLE IF NOT EXISTS mommy_random_clips (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  text TEXT NOT NULL,
  audio_url TEXT,
  audio_duration_sec NUMERIC(4,1),
  intensity_band TEXT NOT NULL DEFAULT 'firm' CHECK (intensity_band IN ('gentle', 'firm', 'cruel')),
  theme TEXT NOT NULL CHECK (theme IN (
    'possession', 'surveillance', 'reminder', 'praise', 'gaslight', 'trigger_phrase'
  )),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  play_count INTEGER NOT NULL DEFAULT 0,
  last_played_at TIMESTAMPTZ,
  voice_settings_hint JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_mommy_random_clips_active_theme
  ON mommy_random_clips (active, theme, last_played_at NULLS FIRST);
-- Catalog is shared across users; service role writes, authenticated
-- users read (audio playback). No per-user FK on the catalog itself.
ALTER TABLE mommy_random_clips ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS mommy_random_clips_read ON mommy_random_clips;
CREATE POLICY mommy_random_clips_read ON mommy_random_clips
  FOR SELECT USING (TRUE);
DROP POLICY IF EXISTS mommy_random_clips_service ON mommy_random_clips;
CREATE POLICY mommy_random_clips_service ON mommy_random_clips
  FOR ALL TO service_role USING (TRUE) WITH CHECK (TRUE);

-- Per-user play log. Tracks what context the clip dropped into so future
-- scheduling can lean into moments that landed and away from moments
-- where the user reported the clip didn't seat. Biometric snapshot is a
-- JSONB blob (hr / hrv / activity hint) so the schema doesn't need to
-- evolve for new wearables.
CREATE TABLE IF NOT EXISTS mommy_random_clip_plays (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  clip_id UUID NOT NULL REFERENCES mommy_random_clips(id) ON DELETE CASCADE,
  played_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  foregrounded_app TEXT,
  biometric_snapshot JSONB,
  delivery_status TEXT NOT NULL DEFAULT 'queued'
    CHECK (delivery_status IN ('queued', 'played', 'skipped', 'failed')),
  user_reaction TEXT,           -- 'seated' | 'flat' | 'noisy' | NULL
  notes TEXT
);
CREATE INDEX IF NOT EXISTS idx_mommy_random_clip_plays_user_time
  ON mommy_random_clip_plays (user_id, played_at DESC);
CREATE INDEX IF NOT EXISTS idx_mommy_random_clip_plays_clip_time
  ON mommy_random_clip_plays (clip_id, played_at DESC);
ALTER TABLE mommy_random_clip_plays ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS mommy_random_clip_plays_owner ON mommy_random_clip_plays;
CREATE POLICY mommy_random_clip_plays_owner ON mommy_random_clip_plays
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS mommy_random_clip_plays_service ON mommy_random_clip_plays;
CREATE POLICY mommy_random_clip_plays_service ON mommy_random_clip_plays
  FOR ALL TO service_role USING (TRUE) WITH CHECK (TRUE);

-- Daily ambient-playback budget tracking. Computed in TS (poisson draw),
-- this column is just an opt-in toggle and per-day cap override. NULL =
-- default (8-15 clips). Hard-cap 30 enforced in the scheduler.
ALTER TABLE user_state
  ADD COLUMN IF NOT EXISTS ambient_clips_opt_in BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE user_state
  ADD COLUMN IF NOT EXISTS ambient_clips_daily_cap INTEGER;

-- ============================================
-- 3. mommy_initiated_scenes
-- ============================================
-- Mommy authors a scene the user will live through. Each scene has three
-- prompt sets: preparation (24h pre-card), live (during the scene), and
-- debrief (after). Status moves linearly: scheduled → prepared → executing
-- → debriefed. Aborted is terminal from any state.
CREATE TABLE IF NOT EXISTS mommy_initiated_scenes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  scene_slug TEXT NOT NULL,            -- 'grocery_store_panties_2026-05-14' etc.
  scene_kind TEXT NOT NULL,            -- 'grocery' | 'mirror' | 'coffee_shop' | 'bedroom' | 'commute' | 'errand' | 'public_low_risk'
  title TEXT NOT NULL,
  scheduled_for TIMESTAMPTZ NOT NULL,  -- when the scene happens
  preparation_instructions JSONB NOT NULL,  -- { wardrobe: [], bring: [], where: '', notes: '' }
  live_prompts JSONB NOT NULL,              -- [{ at_offset_min: -5, text: '...' }, ...]
  debrief_prompts JSONB NOT NULL,           -- [{ question: '...', min_chars: 40 }, ...]
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN (
    'scheduled', 'prepared', 'executing', 'debriefed', 'aborted', 'expired'
  )),
  intensity_band TEXT NOT NULL DEFAULT 'firm' CHECK (intensity_band IN ('gentle', 'firm', 'cruel')),
  prepared_card_outreach_id UUID REFERENCES handler_outreach_queue(id) ON DELETE SET NULL,
  live_card_outreach_id UUID REFERENCES handler_outreach_queue(id) ON DELETE SET NULL,
  debrief_card_outreach_id UUID REFERENCES handler_outreach_queue(id) ON DELETE SET NULL,
  debrief_response TEXT,
  debriefed_at TIMESTAMPTZ,
  aborted_reason TEXT,
  aborted_at TIMESTAMPTZ,
  craft_review_score INTEGER,           -- 0-100, from LLM panel pre-schedule
  craft_review_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_mommy_initiated_scenes_user_when
  ON mommy_initiated_scenes (user_id, scheduled_for DESC);
CREATE INDEX IF NOT EXISTS idx_mommy_initiated_scenes_status
  ON mommy_initiated_scenes (user_id, status, scheduled_for);
CREATE UNIQUE INDEX IF NOT EXISTS uq_mommy_initiated_scenes_user_slug
  ON mommy_initiated_scenes (user_id, scene_slug);
ALTER TABLE mommy_initiated_scenes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS mommy_initiated_scenes_owner ON mommy_initiated_scenes;
CREATE POLICY mommy_initiated_scenes_owner ON mommy_initiated_scenes
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS mommy_initiated_scenes_service ON mommy_initiated_scenes;
CREATE POLICY mommy_initiated_scenes_service ON mommy_initiated_scenes
  FOR ALL TO service_role USING (TRUE) WITH CHECK (TRUE);

-- updated_at trigger
CREATE OR REPLACE FUNCTION trg_mommy_initiated_scenes_touch_updated()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS mommy_initiated_scenes_updated ON mommy_initiated_scenes;
CREATE TRIGGER mommy_initiated_scenes_updated
  BEFORE UPDATE ON mommy_initiated_scenes
  FOR EACH ROW EXECUTE FUNCTION trg_mommy_initiated_scenes_touch_updated();

-- ============================================
-- 4. voice_in_head_reports — "whose voice did you hear?" prompts
-- ============================================
CREATE TABLE IF NOT EXISTS voice_in_head_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  prompt_text TEXT NOT NULL,
  answer TEXT,
  voice_identified TEXT,  -- 'mommy' | 'self' | 'other' | NULL when not parsed
  context_hint TEXT,      -- where/when she heard it
  reported_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  outreach_id UUID REFERENCES handler_outreach_queue(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_voice_in_head_reports_user_time
  ON voice_in_head_reports (user_id, reported_at DESC);
ALTER TABLE voice_in_head_reports ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS voice_in_head_reports_owner ON voice_in_head_reports;
CREATE POLICY voice_in_head_reports_owner ON voice_in_head_reports
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS voice_in_head_reports_service ON voice_in_head_reports;
CREATE POLICY voice_in_head_reports_service ON voice_in_head_reports
  FOR ALL TO service_role USING (TRUE) WITH CHECK (TRUE);

-- ============================================
-- 5. Cron registration — scene-author weekly, live-reframe every 15 min,
--    clip-scheduler every 30 min during waking hours, scene-state-machine
--    every 15 min for prepared→executing→debriefed transitions.
-- ============================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    CREATE EXTENSION IF NOT EXISTS pg_cron;
  END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net') THEN
    CREATE EXTENSION IF NOT EXISTS pg_net;
  END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$
DECLARE
  v_supabase_url TEXT;
  v_service_key TEXT;
BEGIN
  v_supabase_url := current_setting('app.settings.supabase_url', true);
  IF v_supabase_url IS NULL OR length(v_supabase_url) = 0 THEN
    v_supabase_url := 'https://atevwvexapiykchvqvhm.supabase.co';
  END IF;
  v_service_key := current_setting('app.settings.service_role_key', true);

  PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname IN (
    'mommy-live-reframe-15min',
    'mommy-scene-author-weekly',
    'mommy-clip-scheduler-30min',
    'mommy-scene-state-15min'
  );

  -- Live-reframe: every 15 min during waking hours (07:00 - 23:30 UTC
  -- by default; user-local-time adjustment lives inside the fn).
  PERFORM cron.schedule(
    'mommy-live-reframe-15min',
    '*/15 7-23 * * *',
    format(
      $sql$
      SELECT net.http_post(
        url := %L,
        body := '{"mode":"sweep"}'::jsonb,
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || %L
        )
      );
      $sql$,
      v_supabase_url || '/functions/v1/mommy-live-reframe',
      COALESCE(v_service_key, '')
    )
  );

  -- Scene author: Sunday 19:00 UTC. Plans the week ahead.
  PERFORM cron.schedule(
    'mommy-scene-author-weekly',
    '0 19 * * 0',
    format(
      $sql$
      SELECT net.http_post(
        url := %L,
        body := '{"mode":"sweep"}'::jsonb,
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || %L
        )
      );
      $sql$,
      v_supabase_url || '/functions/v1/mommy-scene-author',
      COALESCE(v_service_key, '')
    )
  );

  -- Clip scheduler: every 30 min during waking hours.
  PERFORM cron.schedule(
    'mommy-clip-scheduler-30min',
    '*/30 7-23 * * *',
    format(
      $sql$
      SELECT net.http_post(
        url := %L,
        body := '{"mode":"sweep"}'::jsonb,
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || %L
        )
      );
      $sql$,
      v_supabase_url || '/functions/v1/mommy-clip-scheduler',
      COALESCE(v_service_key, '')
    )
  );

  -- Scene state machine: every 15 min. Surfaces prepared cards, opens
  -- live windows, drops debrief demands when scheduled_for + duration
  -- has passed.
  PERFORM cron.schedule(
    'mommy-scene-state-15min',
    '*/15 * * * *',
    format(
      $sql$
      SELECT net.http_post(
        url := %L,
        body := '{"mode":"state"}'::jsonb,
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || %L
        )
      );
      $sql$,
      v_supabase_url || '/functions/v1/mommy-scene-author',
      COALESCE(v_service_key, '')
    )
  );
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'mommy headspace cron registration failed: %', SQLERRM;
END $$;
