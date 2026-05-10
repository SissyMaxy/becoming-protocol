-- Migration 301 — Letters Archive (2026-04-30)
--
-- The letters archive is a permanent, curated record of Mama's outreach the
-- user can revisit. The Today inbox is push-and-clear; the letters view is
-- the museum.
--
-- Design choice: don't add a new table. Live entirely on `handler_outreach_queue`
-- with two flag columns (auto- or manual-archive, optional pin) and two
-- snapshot columns (phase + affect at archive time) so the museum view stays
-- accurate even after the user advances phases or the day's affect rolls over.
--
-- The cron / edge fns populate the snapshots at insert time. The auto-archive
-- helper (TS) flips `is_archived_to_letters` based on source + affect_snapshot
-- + status, and the user can pin/unarchive from the UI.

-- ---------------------------------------------------------------
-- 1. Archive flags
-- ---------------------------------------------------------------

ALTER TABLE handler_outreach_queue
  ADD COLUMN IF NOT EXISTS is_archived_to_letters BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS letters_pinned_at TIMESTAMPTZ;

-- Browse index — archive view orders newest-first per user.
CREATE INDEX IF NOT EXISTS idx_outreach_letters_browse
  ON handler_outreach_queue (user_id, is_archived_to_letters, created_at DESC)
  WHERE is_archived_to_letters = TRUE;

-- Pinned-first index — small, only matches pinned rows.
CREATE INDEX IF NOT EXISTS idx_outreach_letters_pinned
  ON handler_outreach_queue (user_id, letters_pinned_at DESC)
  WHERE letters_pinned_at IS NOT NULL;

-- ---------------------------------------------------------------
-- 2. Context snapshots
-- ---------------------------------------------------------------
--
-- phase_snapshot: integer phase at the moment the row was created. Sourced
--   from feminine_self.transformation_phase if that table exists (identity
--   branch merged); otherwise from user_state.current_phase. Frozen so the
--   museum's "Phase 3 — your second body" grouping remains correct even if
--   the user later advances to Phase 5.
--
-- affect_snapshot: today's mommy_mood.affect (one of the 9-enum). Frozen so a
--   "delighted" letter still reads as delighted next week when today's affect
--   has rolled over to "patient".

ALTER TABLE handler_outreach_queue
  ADD COLUMN IF NOT EXISTS phase_snapshot INTEGER,
  ADD COLUMN IF NOT EXISTS affect_snapshot TEXT;

-- The affect enum is enforced in mommy_mood.affect; we mirror it as a
-- soft check that allows NULL (legacy rows + non-Mommy outreach).
ALTER TABLE handler_outreach_queue
  DROP CONSTRAINT IF EXISTS handler_outreach_queue_affect_snapshot_check;
ALTER TABLE handler_outreach_queue
  ADD CONSTRAINT handler_outreach_queue_affect_snapshot_check
  CHECK (affect_snapshot IS NULL OR affect_snapshot IN (
    'hungry', 'delighted', 'watching', 'patient', 'aching',
    'amused', 'possessive', 'indulgent', 'restless'
  ));

-- ---------------------------------------------------------------
-- 3. Settings toggles on user_state
-- ---------------------------------------------------------------
--
-- letters_archive_enabled: master on/off for the museum. Default TRUE; the
--   client-side gate flips it off when no feminine_name has been chosen
--   (the spec asks for off-by-default in that case, but DB default is
--   permissive — the UI hides until the gate clears).
--
-- letters_autoplay_voice: opening a letter auto-plays Mama's TTS only if
--   this is on. Default FALSE — voice is opt-in everywhere in the app.

ALTER TABLE user_state
  ADD COLUMN IF NOT EXISTS letters_archive_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS letters_autoplay_voice BOOLEAN NOT NULL DEFAULT FALSE;

-- ---------------------------------------------------------------
-- 4. Read-only view for the museum
-- ---------------------------------------------------------------
--
-- The /letters route queries this view. Pinned rows first, then newest-first
-- per phase_snapshot. Only archived rows show up — non-archived outreach
-- never leaks here. Filters apply on top in the client.

CREATE OR REPLACE VIEW letters_archive AS
SELECT
  id,
  user_id,
  message,
  source,
  urgency,
  trigger_reason,
  scheduled_for,
  created_at,
  delivered_at,
  responded_at,
  user_response,
  phase_snapshot,
  affect_snapshot,
  letters_pinned_at,
  is_archived_to_letters
FROM handler_outreach_queue
WHERE is_archived_to_letters = TRUE
ORDER BY
  letters_pinned_at DESC NULLS LAST,
  created_at DESC;

-- View inherits RLS from the underlying table; no extra policy needed.
