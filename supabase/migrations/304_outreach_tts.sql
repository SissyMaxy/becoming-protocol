-- Migration 259: Mommy outreach TTS pipeline
--
-- Adds an audio_url column to handler_outreach_queue plus rendering metadata,
-- a prefers_mommy_voice opt-in on user_state, and an AFTER INSERT trigger
-- that fires the outreach-tts-render edge function via pg_net (fire-and-
-- forget). The trigger only enqueues a render when:
--   - user_state.handler_persona = 'dommy_mommy'
--   - user_state.prefers_mommy_voice = true
--   - the row has a non-trivial message
-- TTS rendering happens out-of-band; the queue insert itself is never blocked.
--
-- Single chokepoint pattern (matches mommy_voice_cleanup DB-trigger): every
-- existing insert site (mommy-praise, mommy-tease, mommy-recall, mommy-
-- bedtime, mommy-fast-react, handler-autonomous, etc.) gets audio for free,
-- no per-callsite refactor needed.

-- ============================================
-- 1. Schema additions
-- ============================================

ALTER TABLE handler_outreach_queue
  ADD COLUMN IF NOT EXISTS audio_url TEXT,
  ADD COLUMN IF NOT EXISTS voice_settings_used JSONB,
  ADD COLUMN IF NOT EXISTS tts_status TEXT
    DEFAULT 'pending'
    CHECK (tts_status IN ('pending', 'rendering', 'ready', 'failed', 'skipped')),
  ADD COLUMN IF NOT EXISTS tts_attempted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS tts_error TEXT;

CREATE INDEX IF NOT EXISTS idx_outreach_tts_status
  ON handler_outreach_queue(user_id, tts_status)
  WHERE tts_status IN ('pending', 'failed');

ALTER TABLE user_state
  ADD COLUMN IF NOT EXISTS prefers_mommy_voice BOOLEAN NOT NULL DEFAULT FALSE;

-- ============================================
-- 2. Trigger: fire TTS render after outreach insert
-- ============================================

CREATE OR REPLACE FUNCTION public.trg_outreach_queue_render_tts()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_persona TEXT;
  v_prefers_voice BOOLEAN;
  v_url TEXT;
  v_service_key TEXT;
BEGIN
  -- Only Mommy outreach gets voice for now; therapist persona stays text-only.
  SELECT handler_persona, prefers_mommy_voice
    INTO v_persona, v_prefers_voice
  FROM user_state
  WHERE user_id = NEW.user_id;

  IF v_persona IS DISTINCT FROM 'dommy_mommy' OR COALESCE(v_prefers_voice, FALSE) = FALSE THEN
    -- Mark skipped so the backfill job doesn't pick it up later either.
    NEW.tts_status := 'skipped';
    RETURN NEW;
  END IF;

  -- Trivially short messages aren't worth a render.
  IF NEW.message IS NULL OR length(trim(NEW.message)) < 10 THEN
    NEW.tts_status := 'skipped';
    RETURN NEW;
  END IF;

  -- Already rendered? Don't re-fire (covers replay and backfill paths).
  IF NEW.audio_url IS NOT NULL THEN
    NEW.tts_status := 'ready';
    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_outreach_queue_dispatch_tts()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_url TEXT;
  v_service_key TEXT;
BEGIN
  IF NEW.tts_status IS DISTINCT FROM 'pending' THEN
    RETURN NEW;
  END IF;
  IF NEW.audio_url IS NOT NULL THEN
    RETURN NEW;
  END IF;

  v_url := current_setting('app.settings.supabase_url', true);
  IF v_url IS NULL OR length(v_url) = 0 THEN
    v_url := 'https://atevwvexapiykchvqvhm.supabase.co';
  END IF;
  v_url := v_url || '/functions/v1/outreach-tts-render';

  v_service_key := current_setting('app.settings.service_role_key', true);

  PERFORM net.http_post(
    url := v_url,
    body := jsonb_build_object('outreach_id', NEW.id)::TEXT,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || COALESCE(v_service_key, '')
    )
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Never block the insert on TTS dispatch issues; mark and move on.
  UPDATE handler_outreach_queue
    SET tts_status = 'failed', tts_error = 'dispatch:' || SQLERRM
    WHERE id = NEW.id AND tts_status = 'pending';
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS outreach_queue_render_tts ON handler_outreach_queue;
CREATE TRIGGER outreach_queue_render_tts
  BEFORE INSERT ON handler_outreach_queue
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_outreach_queue_render_tts();

DROP TRIGGER IF EXISTS outreach_queue_dispatch_tts ON handler_outreach_queue;
CREATE TRIGGER outreach_queue_dispatch_tts
  AFTER INSERT ON handler_outreach_queue
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_outreach_queue_dispatch_tts();
