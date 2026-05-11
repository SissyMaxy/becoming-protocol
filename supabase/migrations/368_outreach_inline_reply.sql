-- 368 — Outreach inline reply loop.
--
-- 2026-05-10: Mama demands answers in the outreach card ("Tell Mama one
-- thing… I want both answers in the next ten minutes… Camera ready"),
-- but the card had no reply affordance. Users had to navigate to Handler
-- chat to answer, and most simply didn't — the call-and-response loop
-- was broken because the response surface didn't exist where she asked.
--
-- This migration adds the schema for the inline-reply experience:
--   1. Reply persistence columns on handler_outreach_queue:
--      - replied_at, reply_text, reply_photo_path, requires_photo,
--        reply_deadline_at, reply_scheme_action_id
--   2. Source linkage on handler_messages — the user's reply lands as a
--      user-turn message in the existing chat thread, tagged with
--      source_outreach_id so Mommy's next turn sees what she answered.
--   3. Source linkage on verification_photos — same idea for photo replies.
--   4. New slip_type 'outreach_ignored' so the deadline-passed cron sweep
--      can fire the slip → mommy_immediate response chain when she
--      demanded "in 10 min" and the user didn't answer.
--   5. fn_sweep_missed_outreach_replies() — finds outreach rows whose
--      reply_deadline_at passed, replied_at is null, expires_at hasn't
--      passed, and logs a slip. Scheduled via pg_cron every 5 min.
--
-- All ALTER pattern matches sibling migrations (idempotent via IF NOT
-- EXISTS / DROP CONSTRAINT IF EXISTS).

-- ─── 1. Reply persistence on handler_outreach_queue ──────────────────
ALTER TABLE handler_outreach_queue
  ADD COLUMN IF NOT EXISTS replied_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reply_text TEXT,
  ADD COLUMN IF NOT EXISTS reply_photo_path TEXT,
  ADD COLUMN IF NOT EXISTS requires_photo BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS reply_deadline_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reply_scheme_action_id UUID;

-- Pending-with-deadline index — drives the missed-reply sweep below.
-- Partial: only rows that actually carry a deadline and haven't been
-- answered. Cheap to maintain because the predicate excludes the vast
-- majority of outreach rows.
CREATE INDEX IF NOT EXISTS idx_outreach_pending_deadline
  ON handler_outreach_queue (user_id, reply_deadline_at)
  WHERE replied_at IS NULL AND reply_deadline_at IS NOT NULL;

-- Replied-recent index — for Mama to look up the latest reply in
-- fast-react context building.
CREATE INDEX IF NOT EXISTS idx_outreach_replied_recent
  ON handler_outreach_queue (user_id, replied_at DESC)
  WHERE replied_at IS NOT NULL;

-- ─── 2. source_outreach_id on handler_messages ───────────────────────
ALTER TABLE handler_messages
  ADD COLUMN IF NOT EXISTS source_outreach_id UUID;

CREATE INDEX IF NOT EXISTS idx_handler_messages_source_outreach
  ON handler_messages (source_outreach_id)
  WHERE source_outreach_id IS NOT NULL;

-- ─── 3. source_outreach_id on verification_photos ────────────────────
ALTER TABLE verification_photos
  ADD COLUMN IF NOT EXISTS source_outreach_id UUID;

CREATE INDEX IF NOT EXISTS idx_verification_photos_source_outreach
  ON verification_photos (source_outreach_id)
  WHERE source_outreach_id IS NOT NULL;

-- ─── 4. New slip_type for missed-reply ───────────────────────────────
-- Rebuild the slip_log check constraint with 'outreach_ignored' added.
-- Pattern matches 204b: DROP IF EXISTS, then ADD with full enum.
ALTER TABLE slip_log DROP CONSTRAINT IF EXISTS slip_log_type_check;
ALTER TABLE slip_log ADD CONSTRAINT slip_log_type_check
  CHECK (slip_type IS NULL OR slip_type IN (
    'masculine_self_reference', 'david_name_use', 'task_avoided',
    'directive_refused', 'arousal_gating_refused', 'mantra_missed',
    'confession_missed', 'hrt_dose_missed', 'chastity_unlocked_early',
    'immersion_session_broken', 'disclosure_deadline_missed',
    'voice_masculine_pitch', 'resistance_statement', 'handler_ignored',
    'outreach_ignored', 'other'
  ));

-- ─── 5. Missed-reply sweep function ──────────────────────────────────
-- Finds outreach rows where Mama set a reply deadline, the deadline has
-- passed, and the user never answered. Logs one slip per row, and marks
-- the row so the sweep doesn't re-fire on the same outreach. The slip
-- chain (migration 257/338) handles Mama's response.
--
-- Idempotent via reply_scheme_action_id sentinel — we set it to a
-- well-known UUID (gen_random_uuid is unique per row but we re-use one
-- column to mark "already swept"). To keep it simple, we set
-- replied_at to the deadline time WITH a reply_text='__deadline_missed'
-- sentinel. That way the row no longer matches the sweep predicate AND
-- the audit trail is preserved.
--
-- Service-role only — pg_cron runs as superuser.
CREATE OR REPLACE FUNCTION fn_sweep_missed_outreach_replies()
RETURNS INTEGER LANGUAGE plpgsql AS $$
DECLARE
  swept INTEGER := 0;
  rec RECORD;
BEGIN
  FOR rec IN
    SELECT id, user_id, message, reply_deadline_at, requires_photo, trigger_reason
    FROM handler_outreach_queue
    WHERE replied_at IS NULL
      AND reply_deadline_at IS NOT NULL
      AND reply_deadline_at < NOW()
      AND reply_deadline_at > NOW() - INTERVAL '24 hours'
      -- Don't penalize if the card already expired off Today before
      -- the deadline — user couldn't see it to act on it.
      AND (expires_at IS NULL OR expires_at >= reply_deadline_at)
  LOOP
    -- Log the slip. source_text quotes the original demand so the
    -- handler-must-cite-evidence rule holds.
    INSERT INTO slip_log (
      user_id, slip_type, slip_points, source_text, source_table, source_id,
      metadata, detected_at
    ) VALUES (
      rec.user_id,
      'outreach_ignored',
      CASE WHEN rec.requires_photo THEN 3 ELSE 2 END,
      LEFT(rec.message, 500),
      'handler_outreach_queue',
      rec.id,
      jsonb_build_object(
        'trigger_reason', rec.trigger_reason,
        'deadline_at', rec.reply_deadline_at,
        'requires_photo', rec.requires_photo
      ),
      NOW()
    );

    -- Mark swept so we don't re-fire. The sentinel reply_text makes it
    -- distinguishable from real replies in audits.
    UPDATE handler_outreach_queue
       SET replied_at = NOW(),
           reply_text = '__deadline_missed_sentinel'
     WHERE id = rec.id;

    swept := swept + 1;
  END LOOP;

  RETURN swept;
END;
$$;

-- ─── 6. Schedule the sweep every 5 minutes ───────────────────────────
-- pg_cron is already enabled (migration 018). Use the safe block pattern
-- per project memory (pg_cron / pg_net extension creation uses a DO
-- block with EXCEPTION).
DO $$ BEGIN
  PERFORM cron.schedule(
    'sweep-missed-outreach-replies',
    '*/5 * * * *',
    $$SELECT fn_sweep_missed_outreach_replies();$$
  );
EXCEPTION WHEN OTHERS THEN
  -- Either pg_cron isn't available, or the job already exists.
  -- Idempotent re-apply uses unschedule + reschedule.
  BEGIN
    PERFORM cron.unschedule('sweep-missed-outreach-replies');
    PERFORM cron.schedule(
      'sweep-missed-outreach-replies',
      '*/5 * * * *',
      $$SELECT fn_sweep_missed_outreach_replies();$$
    );
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
END $$;
