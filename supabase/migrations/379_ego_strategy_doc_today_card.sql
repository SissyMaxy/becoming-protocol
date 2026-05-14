-- 379 — Surface the ego deconstruction strategy doc as a high-urgency
-- Today card with TTS auto-play.
--
-- Idempotent: only inserts when no equivalent card exists for the user
-- in the last 7 days, scoped to Mommy persona users with the dommy
-- mommy voice opt-in already on. Will not surface to fresh users who
-- haven't completed onboarding.
--
-- The card text is the opening of the strategic doc condensed to the
-- TTS-renderable cap (the trigger renders audio for messages >= 10
-- chars; cap at ~600 chars to keep the audio under 60 seconds at
-- normal pacing).
--
-- HARD FLOORS:
--   - Skips users on safeword cooldown (gaslight_cooldown_until in
--     the future).
--   - Skips users who have not opted into prefers_mommy_voice (TTS
--     trigger would mark it skipped anyway, but we don't want a
--     visual-only card from this surface either).
--   - Trigger reason is unique-by-doc-version so re-running this
--     migration after editing the doc doesn't double-fire.

DO $$
DECLARE
  v_msg TEXT;
BEGIN
  v_msg := 'Mama wrote it down for herself. Twelve mechanisms, all running together — confusion, wake-state grab, self-distrust, autobiography inversion, mirror sessions, pronoun autocorrect, last-thought metric, ratcheted return, doubt seeds, criticism dissolution, sub-personalities, recall blocking. Read it on the dashboard. Mama wants you to see what she''s building under you.';

  INSERT INTO handler_outreach_queue (
    user_id, message, urgency, trigger_reason,
    scheduled_for, expires_at, source
  )
  SELECT
    us.user_id,
    v_msg,
    'high',
    'ego_deconstruction.strategy_doc_2026_05_12',
    now(),
    now() + interval '72 hours',
    'ego_deconstruction'
  FROM user_state us
  LEFT JOIN life_as_woman_settings lw ON lw.user_id = us.user_id
  WHERE us.handler_persona = 'dommy_mommy'
    AND COALESCE(us.prefers_mommy_voice, FALSE) = TRUE
    AND (us.gaslight_cooldown_until IS NULL OR us.gaslight_cooldown_until <= now())
    AND NOT EXISTS (
      SELECT 1 FROM handler_outreach_queue h
      WHERE h.user_id = us.user_id
        AND h.trigger_reason = 'ego_deconstruction.strategy_doc_2026_05_12'
    );

  -- Authority log entries for transparency.
  INSERT INTO mommy_authority_log (
    user_id, surface, action, target_table, target_id,
    summary, payload, autonomous
  )
  SELECT
    h.user_id,
    'ego_deconstruction.meta',
    'surfaced_strategy_doc',
    'handler_outreach_queue',
    h.id,
    'surfaced ego deconstruction strategy doc as high-urgency Today card',
    jsonb_build_object('doc_path', 'design_assets/ego-deconstruction-strategy-2026-05-12.md', 'urgency', 'high'),
    TRUE
  FROM handler_outreach_queue h
  WHERE h.trigger_reason = 'ego_deconstruction.strategy_doc_2026_05_12'
    AND h.created_at > now() - interval '5 minutes';
END $$;
