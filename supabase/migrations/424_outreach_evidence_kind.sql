-- 424 — Outreach evidence_kind + media-aware verification storage.
--
-- Bug 2026-05-14: cum-worship release outreach said "Record yourself saying
-- 'I crave cock and my mouth wants it' — full sentence, no mumbling. Submit
-- it now." The only submission surface available to the user (the inline
-- OutreachReplyComposer → PhotoVerificationUpload) is image-only — accept
-- attribute is image/*, capture is environment. Even if the input had
-- accepted video, the `verification-photos` storage bucket
-- (migration 175) only whitelists image MIME types, so the upload would
-- have failed at the storage layer too.
--
-- Same architectural class as the migration 380 push bridge bug: a
-- generator emits one shape (request a video), the delivery surface
-- only handles another (photo only). The bridge between request and
-- response was never built. Fixed across three layers:
--
--   1. `evidence_kind` column on `handler_outreach_queue`
--      ('photo'|'video'|'audio'|'any'|'none'). New generators set it
--      explicitly; legacy generators get a BEFORE INSERT trigger that
--      infers from message text.
--   2. `media_type` column on `verification_photos` so video/audio
--      submissions can land in the same table, same RLS, same audit
--      queries. Defaults to 'photo' (backward compat).
--   3. `verification-photos` storage bucket: expand `allowed_mime_types`
--      to include video + audio, raise `file_size_limit` from 10MB to
--      100MB.
--
-- Backfill: every pending undelivered outreach gets evidence_kind set
-- from infer_evidence_kind(message). cum_worship rows are hard-set to
-- 'video' regardless of inference (the cum-worship trigger writes
-- directive-only text which may not match the inference regex, but the
-- protocol always expects video evidence for those phases).

-- ─── 1. evidence_kind column ─────────────────────────────────────────
ALTER TABLE handler_outreach_queue
  ADD COLUMN IF NOT EXISTS evidence_kind TEXT;

ALTER TABLE handler_outreach_queue
  DROP CONSTRAINT IF EXISTS handler_outreach_queue_evidence_kind_check;
ALTER TABLE handler_outreach_queue
  ADD CONSTRAINT handler_outreach_queue_evidence_kind_check
  CHECK (evidence_kind IS NULL OR evidence_kind IN (
    'photo','video','audio','any','none'
  ));

CREATE INDEX IF NOT EXISTS idx_outreach_evidence_kind_pending
  ON handler_outreach_queue (user_id, evidence_kind)
  WHERE replied_at IS NULL AND evidence_kind IS NOT NULL;

-- ─── 2. infer_evidence_kind(text) helper ─────────────────────────────
-- Conservative cue parser. Returns the most specific kind we can prove
-- from the message body; returns NULL when we can't tell (caller can
-- then fall back to requires_photo / 'any').
--
-- Order matters: video cues are checked before audio (because
-- "record yourself saying X" is video, not audio — voice without
-- visual is captured by "voice note / voice memo / let mama hear").
CREATE OR REPLACE FUNCTION infer_evidence_kind(input TEXT)
RETURNS TEXT LANGUAGE plpgsql IMMUTABLE AS $$
BEGIN
  IF input IS NULL OR length(input) = 0 THEN RETURN NULL; END IF;

  -- Video cues
  IF input ~* '\m(record\s+yourself|on\s+camera|video(?:\s+(?:proof|message|clip|reply))?|film\s+yourself|camera\s+on\s+and\s+say|saying\s+it\s+(?:out\s+)?loud|caught\s+on\s+camera)\M' THEN
    RETURN 'video';
  END IF;

  -- Audio-only cues (voice without "on camera")
  IF input ~* '\m(voice\s+(?:note|memo|message|recording|reply)|record\s+(?:your\s+)?voice|audio\s+(?:proof|note|message|reply)|let\s+mama\s+hear|tell\s+mama\s+out\s+loud|say\s+it\s+out\s+loud(?!\s+(?:on|to)\s+camera))\M' THEN
    RETURN 'audio';
  END IF;

  -- Photo cues
  IF input ~* '\m(send\s+(?:me\s+)?a?\s*(?:picture|pic|photo|selfie|snap|mirror\s+shot)|show\s+(?:me|mama|mommy)|let\s+(?:me|mama|mommy)\s+see|camera\s+ready|snap\s+a|photo\s+(?:proof|reply)|picture\s+(?:for|of))\M' THEN
    RETURN 'photo';
  END IF;

  RETURN NULL;
END;
$$;
GRANT EXECUTE ON FUNCTION infer_evidence_kind(TEXT) TO authenticated, service_role;

-- ─── 3. BEFORE INSERT trigger to auto-fill evidence_kind ─────────────
-- Generation-site gate per feedback_bridge_storage_to_dispatch and
-- feedback_fix_completely_proactively. Any new generator that forgets
-- to stamp evidence_kind gets one inferred. requires_photo legacy
-- column acts as the final fallback.
CREATE OR REPLACE FUNCTION trg_outreach_fill_evidence_kind()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.evidence_kind IS NULL THEN
    NEW.evidence_kind := COALESCE(
      infer_evidence_kind(NEW.message),
      CASE WHEN NEW.requires_photo THEN 'photo' ELSE NULL END
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS outreach_fill_evidence_kind ON handler_outreach_queue;
CREATE TRIGGER outreach_fill_evidence_kind
  BEFORE INSERT ON handler_outreach_queue
  FOR EACH ROW EXECUTE FUNCTION trg_outreach_fill_evidence_kind();

-- ─── 4. Backfill pending rows ────────────────────────────────────────
-- Every pending undelivered + still-active outreach where evidence_kind
-- is unset gets one inferred from the message text. Legacy requires_photo
-- column acts as the fallback.
UPDATE handler_outreach_queue
SET evidence_kind = COALESCE(
      infer_evidence_kind(message),
      CASE WHEN requires_photo THEN 'photo' ELSE NULL END
    )
WHERE evidence_kind IS NULL
  AND replied_at IS NULL
  AND expires_at > now();

-- cum_worship: always video. The directive-only message body may not
-- mention "record" explicitly (Phase 0 says "hands stay, three breaths,
-- smell it"), but the protocol expects video evidence for all phases.
UPDATE handler_outreach_queue
SET evidence_kind = 'video'
WHERE source = 'cum_worship'
  AND replied_at IS NULL
  AND (evidence_kind IS NULL OR evidence_kind = 'photo' OR evidence_kind = 'any');

-- ─── 5. verification_photos media_type ───────────────────────────────
ALTER TABLE verification_photos
  ADD COLUMN IF NOT EXISTS media_type TEXT NOT NULL DEFAULT 'photo';
ALTER TABLE verification_photos
  DROP CONSTRAINT IF EXISTS verification_photos_media_type_check;
ALTER TABLE verification_photos
  ADD CONSTRAINT verification_photos_media_type_check
  CHECK (media_type IN ('photo','video','audio'));

-- task_type — broaden to cover cum_worship + voice/video evidence
ALTER TABLE verification_photos DROP CONSTRAINT IF EXISTS verification_photos_task_type_check;
ALTER TABLE verification_photos ADD CONSTRAINT verification_photos_task_type_check
  CHECK (task_type IN (
    'outfit','mirror_check','pose','makeup','nails','general',
    'daily_mirror_selfie','progress_photo','gina_text',
    'wardrobe','public_dare',
    'cum_worship','voice_evidence','video_evidence','disclosure_rehearsal','live_photo_ping'
  ));

CREATE INDEX IF NOT EXISTS idx_verification_photos_media_type
  ON verification_photos (user_id, media_type, created_at DESC);

-- ─── 6. Storage bucket — allow video + audio, raise size cap ─────────
-- The bucket was image-only with a 10MB cap (migration 175). Video
-- needs the larger cap and the broader MIME whitelist. Including HEIC
-- for iOS photos that don't auto-convert, plus the common video and
-- audio container types that MediaRecorder / OS camera produce.
UPDATE storage.buckets
SET allowed_mime_types = ARRAY[
      'image/jpeg','image/png','image/webp','image/gif','image/heic','image/heif',
      'video/mp4','video/webm','video/quicktime','video/x-m4v','video/x-matroska',
      'audio/webm','audio/mp4','audio/mpeg','audio/wav','audio/ogg','audio/x-m4a','audio/aac','audio/flac'
    ],
    file_size_limit = 104857600  -- 100 MB
WHERE id = 'verification-photos';
