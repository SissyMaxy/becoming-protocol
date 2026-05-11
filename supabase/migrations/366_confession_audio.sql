-- Migration 314: confession_audio
--
-- Audio confessions. Adds storage-path / duration / Whisper-transcript
-- columns to confession_queue, plus a side column on handler_outreach_queue
-- so mommy-recall / mommy-tease can flag an outreach as carrying an audio
-- implant (her own voice played back at her, not Mama's TTS).
--
-- Audio physical layout:
--   bucket=audio  path=confessions/<user_id>/<confession_id>.webm
-- The audio bucket is private (mig 301) and its SELECT policy already
-- covers `<prefix>/<userid>/...` paths via foldername[2] = auth.uid().
-- Service role writes; the user reads via signed URLs.
--
-- Transcription pipeline:
--   1. Client records, posts blob to /api/voice/confession-upload
--   2. Server uploads to storage, sets audio_storage_path,
--      transcription_status='pending'
--   3. Same request tries inline Whisper (8s budget). On success → writes
--      transcribed_text + transcription_status='done'. On timeout/error →
--      leaves status='pending'.
--   4. transcribe-pending-confessions edge fn (cron every 1 min) picks up
--      stuck rows and retries up to 3 times before marking 'failed'.
--
-- Recall surface (audio implant):
--   handler_outreach_queue.recall_confession_id references confession_queue.
--   Renderer detects this column, fetches the confession's audio_storage_path,
--   signs it, and shows a Play button next to Mama's commentary.
--   IMPORTANT: distortion layer NEVER touches audio. Quoting the user's
--   real voice back at her is a different consent shape than rewriting
--   her own words. Text quotes can still distort if gaslight is on.

-- ============================================
-- 1. confession_queue audio columns
-- ============================================

ALTER TABLE confession_queue
  ADD COLUMN IF NOT EXISTS audio_storage_path TEXT,
  ADD COLUMN IF NOT EXISTS audio_duration_sec INTEGER,
  ADD COLUMN IF NOT EXISTS audio_mime_type TEXT,
  ADD COLUMN IF NOT EXISTS audio_uploaded_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS transcription_status TEXT
    CHECK (transcription_status IN ('pending', 'done', 'failed')),
  ADD COLUMN IF NOT EXISTS transcription_attempt_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS transcribed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS transcribed_text TEXT,
  ADD COLUMN IF NOT EXISTS voice_pitch_features JSONB;

-- Pending-transcription work index for the backstop cron.
CREATE INDEX IF NOT EXISTS idx_confession_queue_pending_transcription
  ON confession_queue (created_at)
  WHERE audio_storage_path IS NOT NULL
    AND transcription_status = 'pending';

-- Cleanup trigger — when a confession_queue row is deleted, drop its
-- audio object too. Without this the storage row would orphan the
-- moment hard-reset / emergency-wipe runs (which deletes DB rows but
-- leaves storage). Service-role here so it can reach across schemas.
CREATE OR REPLACE FUNCTION public.trg_confession_queue_purge_audio()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF OLD.audio_storage_path IS NOT NULL THEN
    -- Best-effort delete; never block the parent delete on storage.
    BEGIN
      DELETE FROM storage.objects
       WHERE bucket_id = 'audio'
         AND name = OLD.audio_storage_path;
    EXCEPTION WHEN OTHERS THEN
      -- Log via raise notice; ignored in tests.
      RAISE NOTICE 'confession audio purge failed: %', SQLERRM;
    END;
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS confession_queue_purge_audio ON confession_queue;
CREATE TRIGGER confession_queue_purge_audio
  BEFORE DELETE ON confession_queue
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_confession_queue_purge_audio();

-- ============================================
-- 2. handler_outreach_queue audio-implant link
-- ============================================
-- recall_confession_id: when set, the outreach is an audio-implant
-- playback of the referenced confession. Renderer signs the audio
-- and shows a Play button alongside Mama's commentary.
--
-- This sits alongside the existing audio_url column (mig 304), which
-- holds Mommy's *TTS-rendered* voice. The two are independent:
--   audio_url             — Mama saying the message in TTS
--   recall_confession_id  — the user's own past voice played back
-- An outreach can carry both, neither, or one.

ALTER TABLE handler_outreach_queue
  ADD COLUMN IF NOT EXISTS recall_confession_id UUID
    REFERENCES confession_queue(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_outreach_recall_confession
  ON handler_outreach_queue(recall_confession_id)
  WHERE recall_confession_id IS NOT NULL;

-- ============================================
-- 3. memory_implant_quote_log surface enum extension
-- ============================================
-- The existing log lets recall code log every quote-back. Extend the
-- surface column to accept the new audio-implant variants without
-- breaking older clients (textual fallback). The column is plain TEXT
-- (no CHECK), so this is documentation-only; included here for traceability:
--   surface = 'mommy_recall'        — text-only quote-back (existing)
--   surface = 'mommy_recall_audio'  — confession audio played back
--   surface = 'mommy_tease_audio'   — same, via tease pipeline

-- ============================================
-- 4. Backstop cron — transcribe stuck rows
-- ============================================
-- Edge fn `transcribe-confession-backstop` is shipped alongside this
-- migration. Cron registration pattern matches mig 313 (auto-healer).

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

  -- Unschedule any prior copy idempotently
  PERFORM cron.unschedule(jobid)
    FROM cron.job
   WHERE jobname = 'transcribe-confession-backstop';

  PERFORM cron.schedule(
    'transcribe-confession-backstop',
    '* * * * *', -- every minute
    format(
      $sql$
      SELECT net.http_post(
        url := %L,
        body := '{}'::jsonb,
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || %L
        )
      );
      $sql$,
      v_supabase_url || '/functions/v1/transcribe-confession-backstop',
      COALESCE(v_service_key, '')
    )
  );
EXCEPTION WHEN OTHERS THEN
  -- pg_cron extension or function may be missing in some envs; never
  -- block the migration on it. The inline transcription path still
  -- works without the backstop.
  RAISE NOTICE 'transcribe-confession-backstop cron register failed: %', SQLERRM;
END $$;
