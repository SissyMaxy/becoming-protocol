-- Migration 261: Strip public-URL prefix from storage URL columns
--
-- After 260 flipped verification-photos / evidence / audio to private, any
-- existing row that stored a full `…/storage/v1/object/public/<bucket>/<path>`
-- URL would 401 on fetch. The contract going forward is "store the object
-- path; sign on render". This migration backfills existing rows by
-- regex-stripping the URL prefix.
--
-- Idempotent: rows that don't match the URL pattern (already paths, NULL,
-- or come from buckets we don't touch) are left alone.
--
-- Some target tables are dashboard-defined (no in-tree CREATE TABLE), so
-- each UPDATE is wrapped in IF EXISTS to keep `supabase db reset` clean
-- on fresh environments.

-- Strip pattern: anything matching `…/storage/v1/object/public/<bucket>/`
-- becomes `''`, leaving just the path. Use a column-aware predicate so we
-- don't double-strip on rerun.

-- Helper macro: column-aware existence check. PL/pgSQL doesn't have macros,
-- but each block follows the same shape — guard on the column existing in
-- the live schema, then run the regex strip.

-- ---------- verification_photos.photo_url ----------
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name = 'verification_photos' AND column_name = 'photo_url') THEN
    UPDATE verification_photos
    SET photo_url = regexp_replace(photo_url, '^https?://[^/]+/storage/v1/object/public/verification-photos/', '')
    WHERE photo_url ~ '^https?://[^/]+/storage/v1/object/public/verification-photos/';
  END IF;
END $$;

-- ---------- daily_outfit_mandates.photo_proof_url ----------
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name = 'daily_outfit_mandates' AND column_name = 'photo_proof_url') THEN
    UPDATE daily_outfit_mandates
    SET photo_proof_url = regexp_replace(photo_proof_url, '^https?://[^/]+/storage/v1/object/public/verification-photos/', '')
    WHERE photo_proof_url ~ '^https?://[^/]+/storage/v1/object/public/verification-photos/';
  END IF;
END $$;

-- ---------- body_feminization_directives.proof_photo_url ----------
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name = 'body_feminization_directives' AND column_name = 'proof_photo_url') THEN
    UPDATE body_feminization_directives
    SET proof_photo_url = regexp_replace(proof_photo_url, '^https?://[^/]+/storage/v1/object/public/verification-photos/', '')
    WHERE proof_photo_url ~ '^https?://[^/]+/storage/v1/object/public/verification-photos/';
  END IF;
END $$;

-- ---------- evidence.file_url ----------
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name = 'evidence' AND column_name = 'file_url') THEN
    UPDATE evidence
    SET file_url = regexp_replace(file_url, '^https?://[^/]+/storage/v1/object/public/evidence/', '')
    WHERE file_url ~ '^https?://[^/]+/storage/v1/object/public/evidence/';
  END IF;
END $$;

-- ---------- journal_entries.audio_url ----------
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name = 'journal_entries' AND column_name = 'audio_url') THEN
    UPDATE journal_entries
    SET audio_url = regexp_replace(audio_url, '^https?://[^/]+/storage/v1/object/public/evidence/', '')
    WHERE audio_url ~ '^https?://[^/]+/storage/v1/object/public/evidence/';
  END IF;
END $$;

-- ---------- conversation_screenshots ----------
-- screenshot_url (TEXT) + additional_screenshot_urls (JSONB array on remote;
-- may be TEXT[] in older copies). We branch on the column data_type so this
-- migration works against either schema.
DO $$
DECLARE col_type text;
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name = 'conversation_screenshots' AND column_name = 'screenshot_url') THEN
    UPDATE conversation_screenshots
    SET screenshot_url = regexp_replace(screenshot_url, '^https?://[^/]+/storage/v1/object/public/evidence/', '')
    WHERE screenshot_url ~ '^https?://[^/]+/storage/v1/object/public/evidence/';
  END IF;

  SELECT data_type INTO col_type FROM information_schema.columns
   WHERE table_name = 'conversation_screenshots' AND column_name = 'additional_screenshot_urls';

  IF col_type = 'ARRAY' THEN
    -- TEXT[] path
    UPDATE conversation_screenshots cs
    SET additional_screenshot_urls = sub.cleaned
    FROM (
      SELECT id,
             ARRAY(
               SELECT regexp_replace(u, '^https?://[^/]+/storage/v1/object/public/evidence/', '')
               FROM unnest(additional_screenshot_urls) AS u
             ) AS cleaned
      FROM conversation_screenshots
      WHERE additional_screenshot_urls IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM unnest(additional_screenshot_urls) u
          WHERE u ~ '^https?://[^/]+/storage/v1/object/public/evidence/'
        )
    ) sub
    WHERE cs.id = sub.id;
  ELSIF col_type = 'jsonb' THEN
    -- JSONB array path: jsonb_array_elements_text → regex_replace → jsonb_agg
    UPDATE conversation_screenshots cs
    SET additional_screenshot_urls = sub.cleaned
    FROM (
      SELECT id,
             COALESCE(
               (SELECT jsonb_agg(to_jsonb(regexp_replace(elem, '^https?://[^/]+/storage/v1/object/public/evidence/', '')))
                FROM jsonb_array_elements_text(additional_screenshot_urls) AS elem),
               additional_screenshot_urls
             ) AS cleaned
      FROM conversation_screenshots
      WHERE additional_screenshot_urls IS NOT NULL
        AND jsonb_typeof(additional_screenshot_urls) = 'array'
        AND EXISTS (
          SELECT 1 FROM jsonb_array_elements_text(additional_screenshot_urls) elem
          WHERE elem ~ '^https?://[^/]+/storage/v1/object/public/evidence/'
        )
    ) sub
    WHERE cs.id = sub.id;
  END IF;
END $$;

-- ---------- generated_scripts.audio_url ----------
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name = 'generated_scripts' AND column_name = 'audio_url') THEN
    UPDATE generated_scripts
    SET audio_url = regexp_replace(audio_url, '^https?://[^/]+/storage/v1/object/public/audio/', '')
    WHERE audio_url ~ '^https?://[^/]+/storage/v1/object/public/audio/';
  END IF;
END $$;

-- ---------- content_curriculum.audio_storage_url ----------
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name = 'content_curriculum' AND column_name = 'audio_storage_url') THEN
    UPDATE content_curriculum
    SET audio_storage_url = regexp_replace(audio_storage_url, '^https?://[^/]+/storage/v1/object/public/audio/', '')
    WHERE audio_storage_url ~ '^https?://[^/]+/storage/v1/object/public/audio/';
  END IF;
END $$;

-- ---------- handler_outreach_queue.audio_url (outreach-tts branch) ----------
-- Coexists with feature/outreach-tts-2026-04-30 (migration 259). If the
-- column doesn't exist on this branch alone, skip; otherwise strip the URL
-- down to the path. The outreach-tts edge fn itself needs a small patch
-- (see design_assets/storage-runbook-2026-04-30.md) to write paths instead
-- of URLs going forward.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name = 'handler_outreach_queue' AND column_name = 'audio_url') THEN
    UPDATE handler_outreach_queue
    SET audio_url = regexp_replace(audio_url, '^https?://[^/]+/storage/v1/object/public/audio/', '')
    WHERE audio_url ~ '^https?://[^/]+/storage/v1/object/public/audio/';
  END IF;
END $$;
