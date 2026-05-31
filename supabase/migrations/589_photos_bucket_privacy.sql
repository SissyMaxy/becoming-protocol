-- Migration 589: photos bucket privacy (security — audit #15)
--
-- The signed-URL storage migration (audit #15) converts every read site off
-- getPublicUrl onto freshly-signed URLs. For that to be a real security win the
-- bucket must actually be private — otherwise the old public URL still works.
--
-- The `photos` bucket (measurement progress photos, written by
-- MeasurementForm.tsx) was created via the dashboard as PUBLIC. This migration:
--   1. Backfills its bucket DEFINITION so a fresh `supabase db reset`
--      reproduces production storage config.
--   2. Flips it to private.
--   3. Ensures storage.objects has folder-prefix RLS so the owner's JWT can
--      sign URLs after the flip.
--
-- Path layout in production:
--   measurements/<userid>/<measurementId>_<slot>.<ext>   (MeasurementForm)
-- The user id sits at foldername[2] for that layout, so the SELECT/INSERT
-- policies check both [1] and [2] (same dual-layout pattern as the `audio`
-- bucket in migration 301) — this covers a plain `<userid>/...` layout too,
-- without forcing existing paths to migrate.
--
-- After this migration: getPublicUrl() against `photos` still returns a string,
-- but the URL 401s on fetch. Read sites must sign — see getSignedAssetUrl /
-- SignedMedia (audit #15). Idempotent: ON CONFLICT upsert + DROP/CREATE policies.

-- ============================================
-- 1. Bucket definition (idempotent upsert) + flip to private
-- ============================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'photos',
  'photos',
  false,
  52428800, -- 50 MB; measurement progress photos
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Belt-and-suspenders: flip the flag even if the row already existed with a
-- different shape and the upsert above somehow no-ops.
UPDATE storage.buckets SET public = false WHERE id = 'photos';

-- ============================================
-- 2. RLS policies on storage.objects
-- ============================================
--
-- Owner-only SELECT/INSERT/DELETE keyed on the folder prefix. The OR covers
-- both `<userid>/...` and `measurements/<userid>/...` layouts.

DROP POLICY IF EXISTS "Users can upload their own photos" ON storage.objects;
DROP POLICY IF EXISTS "Users can view their own photos" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their own photos" ON storage.objects;

CREATE POLICY "Users can upload their own photos"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'photos'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR (storage.foldername(name))[2] = auth.uid()::text
    )
  );

CREATE POLICY "Users can view their own photos"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'photos'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR (storage.foldername(name))[2] = auth.uid()::text
    )
  );

CREATE POLICY "Users can delete their own photos"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'photos'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR (storage.foldername(name))[2] = auth.uid()::text
    )
  );
