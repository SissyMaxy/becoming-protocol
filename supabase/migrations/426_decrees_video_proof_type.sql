-- 426 — Allow proof_type='video' on handler_decrees.
--
-- The 235 CHECK was photo/audio/text/journal_entry/voice_pitch_sample/
-- device_state/none. Video was missing — when Mama queues a decree
-- demanding "record yourself doing X", there was no proof_type value
-- to represent that, so the decree had to use 'photo' and the user
-- got a photo-only widget that refused video uploads (2026-05-15
-- incident).
--
-- Pairs with the media-aware PhotoUploadWidget. The card now opens
-- the upload widget for proof_type IN ('photo','video','audio') and
-- threads the right mediaKind.

ALTER TABLE handler_decrees DROP CONSTRAINT IF EXISTS handler_decrees_proof_type_check;
ALTER TABLE handler_decrees ADD CONSTRAINT handler_decrees_proof_type_check
  CHECK (proof_type IN (
    'photo','video','audio','text','journal_entry','voice_pitch_sample','device_state','none'
  ));
