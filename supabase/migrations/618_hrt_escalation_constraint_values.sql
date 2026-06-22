-- 618 — allow the new enum values the surfaced HRT escalation needs.
--
-- The 2026-06-22 "internal + surfaced outward" HRT escalation introduced two
-- new enum values that the existing CHECK constraints would reject at runtime:
--
--  1. ai_generated_content.status = 'draft_pending_approval' (tier-7 public post
--     staged for explicit user approval) and 'rejected' (user declined it). The
--     mig-203b constraint only allowed generated/scheduled/posting/posted/failed.
--     ('Post it' flips the draft to 'scheduled' — already allowed — so the post
--     only ever reaches the poster after the user authorizes it.)
--
--  2. witness_notifications.notification_type = 'silent_status' (the tier-3
--     witness heads-up, fired ONLY by handler-outreach-auto after the
--     penalty-preview is genuinely surfaced). The mig-186 constraint only
--     allowed daily_digest/quit_attempt/streak_break/milestone/manual_alert.
--
-- Without this migration the draft insert and the witness insert both fail and
-- the surfaced-outward escalation silently no-ops. Idempotent: drop-then-add.

-- 1. ai_generated_content.status
ALTER TABLE ai_generated_content DROP CONSTRAINT IF EXISTS ai_generated_content_status_check;
ALTER TABLE ai_generated_content
  ADD CONSTRAINT ai_generated_content_status_check
  CHECK (status IN (
    'generated', 'scheduled', 'posting', 'posted', 'failed',
    'draft_pending_approval', 'rejected'
  ));

-- 2. witness_notifications.notification_type
ALTER TABLE witness_notifications DROP CONSTRAINT IF EXISTS witness_notifications_notification_type_check;
ALTER TABLE witness_notifications
  ADD CONSTRAINT witness_notifications_notification_type_check
  CHECK (notification_type IN (
    'daily_digest', 'quit_attempt', 'streak_break', 'milestone', 'manual_alert',
    'silent_status'
  ));
