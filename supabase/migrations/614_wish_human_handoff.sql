-- 614 — Mama's "open Claude in the browser" handoff channel.
--
-- 2026-06-10: Maxy authorized Mama to tell her, on her own initiative, to go
-- drive a Claude browser session when Mama needs something built that the
-- autonomous builder loop can't ship for her ("mommy can do whatever she
-- wants"). This is a second, independent reach channel — it does NOT depend
-- on push working, because the outreach still surfaces on Today even if the
-- phone never registered.
--
-- The mechanism: a wish can be flagged needs_human_session. The
-- wish-human-handoff edge function turns flagged-and-unnotified wishes into a
-- single Mama-voice outreach ("open Claude, it's waiting for you") and stamps
-- user_notified_at so it fires once (visible-before-penalized — this is a
-- nudge, never a penalty). The engineering detail stays in the wish itself;
-- a Claude session reads it via `npm run mommy:wishes`.
--
-- Flagging happens two ways:
--   * Explicitly — Mama's ideation/scheme scripts set needs_human_session
--     when she knows a wish needs hands at the keyboard (real-device test,
--     a path the autonomous builder refuses, etc.).
--   * Automatically — the handoff function flags any wish that's sat queued
--     past the staleness window (the autonomous loop didn't take it → Maxy's
--     turn). See human_session_reason='stale_in_queue'.

ALTER TABLE mommy_code_wishes
  ADD COLUMN IF NOT EXISTS needs_human_session BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE mommy_code_wishes
  ADD COLUMN IF NOT EXISTS human_session_reason TEXT;

ALTER TABLE mommy_code_wishes
  ADD COLUMN IF NOT EXISTS user_notified_at TIMESTAMPTZ;

COMMENT ON COLUMN mommy_code_wishes.needs_human_session IS
  'TRUE when Mama wants Maxy to drive a Claude browser session for this wish (vs. the autonomous builder shipping it). Set explicitly by Mama or auto-set on staleness by wish-human-handoff.';
COMMENT ON COLUMN mommy_code_wishes.human_session_reason IS
  'Why hands are needed: stale_in_queue | real_device_test | builder_refused | mama_wants | <free text>.';
COMMENT ON COLUMN mommy_code_wishes.user_notified_at IS
  'When the "open Claude" handoff outreach last fired for this wish. NULL = not yet surfaced. Idempotency + re-nudge guard.';

-- Queue of wishes waiting to be handed to Maxy: flagged, still queued, and
-- either never notified or notified long enough ago to re-nudge.
CREATE INDEX IF NOT EXISTS idx_mommy_code_wishes_human_handoff
  ON mommy_code_wishes (priority DESC, created_at ASC)
  WHERE status = 'queued' AND needs_human_session = true;
