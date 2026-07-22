-- 693 — legalize the workout-proof verification taxonomy.
--
-- The train-day arc (migs 690-692) added two verification types
-- (progress_shot, workout_proof → task_type 'workout') but the live
-- verification_photos CHECKs predate them: verification_type allowed only the
-- original six, task_type had progress_photo but not workout. The baseline
-- mirror-shot upload failed on verification_photos_verification_type_check —
-- surfaced in the widget as "[object Object]" (fixed client-side alongside).
--
-- DROP+ADD only WIDENS the allowed sets — cannot violate existing rows,
-- safe to re-run.

ALTER TABLE verification_photos DROP CONSTRAINT IF EXISTS verification_photos_verification_type_check;
ALTER TABLE verification_photos ADD CONSTRAINT verification_photos_verification_type_check
  CHECK (verification_type IS NULL OR verification_type IN (
    'wardrobe_acquisition','posture_check','mirror_affirmation',
    'mantra_recitation','pose_hold','freeform',
    'progress_shot','workout_proof'
  ));

ALTER TABLE verification_photos DROP CONSTRAINT IF EXISTS verification_photos_task_type_check;
ALTER TABLE verification_photos ADD CONSTRAINT verification_photos_task_type_check
  CHECK (task_type IN (
    'outfit','mirror_check','pose','makeup','nails','general',
    'daily_mirror_selfie','progress_photo','gina_text','wardrobe',
    'public_dare','cum_worship','voice_evidence','video_evidence',
    'disclosure_rehearsal','live_photo_ping',
    'workout'
  ));
