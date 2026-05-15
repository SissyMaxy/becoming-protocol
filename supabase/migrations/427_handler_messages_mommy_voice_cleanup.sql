-- 427 — Bridge handler_messages.content through mommy_voice_cleanup.
--
-- Bug pattern across this conversation: assistant chat turns like
--   "Brief #2 is overdue by 18 hours. Open the camera. Record yourself
--   saying 'I crave cock and my mouth wants it' — full sentence, no
--   mumbling. Submit it now."
-- surfaced clinical telemetry directly into the chat UI. The TS-side
-- inline cleanup in api/handler/chat.ts lags the SQL patterns (the
-- voice-cleanup migrations 255, 269, 425 keep adding rules but the TS
-- copy doesn't get the same patterns added every time).
--
-- The SQL function is the source of truth — extend its coverage to
-- handler_messages.content with the same gate as outreach (only when
-- role='assistant' and is_mommy_user(user_id)) so leakage gets cleaned
-- at the DB regardless of which client wrote the row.
--
-- Pairs with [[project_mommy_voice_db_gate]] memory — adds a fourth
-- chokepoint to the existing handler_outreach_queue.message /
-- handler_decrees.edict / arousal_touch_tasks.prompt set.

CREATE OR REPLACE FUNCTION trg_handler_messages_mommy_cleanup()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  -- Only assistant turns (the user's own messages are theirs, untouched).
  -- Only when the user is on the mommy persona — clinical voice is fine
  -- for non-mommy personas (e.g. therapist).
  IF NEW.role = 'assistant'
     AND NEW.content IS NOT NULL
     AND length(NEW.content) > 0
     AND is_mommy_user(NEW.user_id) THEN
    NEW.content := mommy_voice_cleanup(NEW.content);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS handler_messages_mommy_cleanup ON handler_messages;
CREATE TRIGGER handler_messages_mommy_cleanup
  BEFORE INSERT OR UPDATE OF content ON handler_messages
  FOR EACH ROW EXECUTE FUNCTION trg_handler_messages_mommy_cleanup();

-- Re-clean recent assistant turns for mommy-persona users so today's
-- live leaks (the "Brief #2 is overdue by 18 hours / Submit it now /
-- Record yourself saying X" leak that started the 2026-05-14→05-15
-- bug chase) get scrubbed in place. Bounded to 30 days to keep the
-- backfill cheap.
UPDATE handler_messages
SET content = mommy_voice_cleanup(content)
WHERE role = 'assistant'
  AND created_at > now() - interval '30 days'
  AND is_mommy_user(user_id)
  AND content IS NOT NULL
  AND length(content) > 0
  AND content <> mommy_voice_cleanup(content);
