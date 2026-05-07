-- Migration 260: Storage privacy fix (security)
--
-- The storage audit (design_assets/storage-audit-2026-04-30.md) found that
-- three buckets are configured PUBLIC and read via getPublicUrl(), which
-- bypasses storage.objects RLS. Anyone with a URL can fetch the binary.
--
-- This migration:
--   1. Backfills bucket DEFINITIONS for `evidence` and `audio` (dashboard-
--      defined, not in any prior migration), so a fresh `supabase db reset`
--      reproduces production storage config.
--   2. Flips `verification-photos`, `evidence`, and `audio` to private.
--   3. Ensures storage.objects has folder-prefix RLS for SELECT on each
--      flipped bucket so the user's own JWT can sign URLs after the flip.
--
-- The audio bucket's path schema is `<prefix>/<userid>/<file>` (conditioning,
-- mommy-outreach), so its SELECT policy checks foldername[2] in addition to
-- foldername[1]. That covers both `<userid>/...` and `<prefix>/<userid>/...`
-- layouts without forcing every existing path to migrate.
--
-- After this migration:
--   - getPublicUrl() against these buckets still returns a string, but the
--     URL 401s on fetch. Read sites must call createSignedUrl() — see the
--     `getSignedAssetUrl` helper added in this branch.
--   - Migration 261 backfills existing rows that stored full public URLs,
--     stripping them down to object paths so the helper can re-sign.

-- ============================================
-- 1. Bucket definitions (idempotent upserts)
-- ============================================

-- evidence — mirror selfies, conversation screenshots, voice journal blobs
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'evidence',
  'evidence',
  false,
  52428800, -- 50 MB; voice journal webm + mirror selfies + screenshots
  ARRAY[
    'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif',
    'audio/webm', 'audio/mp3', 'audio/mpeg', 'audio/ogg', 'audio/wav',
    'video/mp4', 'video/webm', 'video/quicktime'
  ]
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- audio — Mommy/Serafina TTS, conditioning scripts, outreach voice
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'audio',
  'audio',
  false,
  52428800, -- 50 MB; outreach + conditioning mp3
  ARRAY['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/ogg', 'audio/webm']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- verification-photos — already defined in 175 with the right MIME / size,
-- just flip the public flag.
UPDATE storage.buckets SET public = false WHERE id = 'verification-photos';

-- ============================================
-- 2. RLS policies on storage.objects
-- ============================================
--
-- For each flipped bucket, ensure the owner can SELECT (so client-side
-- createSignedUrl works under the user's JWT) and INSERT/DELETE per the
-- existing folder-prefix convention. Idempotent: drop-if-exists then create.

-- ---------- evidence ----------

DROP POLICY IF EXISTS "Users can upload their own evidence" ON storage.objects;
DROP POLICY IF EXISTS "Users can view their own evidence" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their own evidence" ON storage.objects;

CREATE POLICY "Users can upload their own evidence"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'evidence'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Users can view their own evidence"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'evidence'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Users can delete their own evidence"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'evidence'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- ---------- audio ----------
--
-- Two path layouts in production:
--   conditioning/<userid>/<ts>_phaseN.mp3       (api/conditioning)
--   mommy-outreach/<userid>/<id>.mp3            (outreach-tts edge fn)
-- The OR covers both.

DROP POLICY IF EXISTS "Users can view their own audio" ON storage.objects;
DROP POLICY IF EXISTS "Service role can write audio" ON storage.objects;

CREATE POLICY "Users can view their own audio"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'audio'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR (storage.foldername(name))[2] = auth.uid()::text
    )
  );

-- Audio is rendered server-side by the conditioning API and the
-- outreach-tts edge function. Both run with the service-role key, which
-- bypasses RLS — but document the intent here so a future "client uploads
-- audio" flow doesn't accidentally inherit the service-role bypass.
-- (No INSERT policy: clients cannot insert into the audio bucket.)

-- ---------- verification-photos ----------
--
-- 175 already created the three policies. Re-create them defensively in
-- case the live db drifted — the predicates match 175 exactly.

DROP POLICY IF EXISTS "Users can upload their own verification photos" ON storage.objects;
DROP POLICY IF EXISTS "Users can view their own verification photos" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their own verification photos" ON storage.objects;

CREATE POLICY "Users can upload their own verification photos"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'verification-photos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Users can view their own verification photos"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'verification-photos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Users can delete their own verification photos"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'verification-photos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
