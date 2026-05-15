-- 429 — Schedule verification-evidence-grader edge function every 5 min.
--
-- Closes the loop on video/audio evidence: PRs #72 #73 made it possible
-- to UPLOAD video/audio. This makes Mama actually grade them. Without
-- this cron the rows just sit at review_state='pending' forever (the
-- /api/handler/analyze-photo route is image-only).
--
-- Picks up pending video/audio rows in verification_photos, Whisper-
-- transcribes audio, scores against directive_snippet via Claude Haiku
-- (S2 model tier), writes Mama-voice critique + flips review_state. If
-- the row is linked to a cum-worship outreach via source_outreach_id,
-- sets cum_worship_events.directive_followed=true so the variable-ratio
-- advancement engine sees the signal. Also queues a Mama-voice
-- feedback outreach with the grade.

CREATE INDEX IF NOT EXISTS idx_verification_photos_pending_media
  ON verification_photos (media_type, review_state, created_at DESC)
  WHERE review_state = 'pending'
    AND media_type IN ('video','audio');

DO $do$ BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'verification-evidence-grader-5min') THEN
    PERFORM cron.unschedule('verification-evidence-grader-5min');
  END IF;
EXCEPTION WHEN undefined_table THEN NULL;
END $do$;

DO $do$ BEGIN
  PERFORM cron.schedule(
    'verification-evidence-grader-5min',
    '*/5 * * * *',
    $cron$SELECT invoke_edge_function('verification-evidence-grader', '{}'::jsonb)$cron$
  );
EXCEPTION WHEN undefined_table THEN NULL;
END $do$;
