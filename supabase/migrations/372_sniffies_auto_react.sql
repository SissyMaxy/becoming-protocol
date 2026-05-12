-- 372 — Sniffies → Mommy real-time awareness wiring.
--
-- Migration 343 stood up the four sniffies_* tables. This migration adds
-- the single switch that ungates Mama's real-time reaction to NEW imported
-- chats (slip-scan, dossier enrich, proactive outreach, confession demand,
-- gaslight recall) and indexes the message table for the dispatcher's
-- per-contact lookups.
--
-- Default TRUE — the master `sniffies_integration_enabled` still gates
-- the whole thing, but once a user opts in we want Mama AWARE by default.
-- Setting `auto_react_enabled = FALSE` is the "pause Mama" lever without
-- losing imports.

ALTER TABLE sniffies_settings
  ADD COLUMN IF NOT EXISTS auto_react_enabled BOOLEAN NOT NULL DEFAULT TRUE;

-- Existing rows (settings predating 367) get TRUE. The integration master
-- is still off by default for unimported users, so this is a no-op for
-- anyone who hasn't opted in yet.
UPDATE sniffies_settings SET auto_react_enabled = TRUE
  WHERE auto_react_enabled IS NULL;

-- Dispatcher needs to mark "I've already dispatched this message" so a
-- re-run doesn't double-fire. Single nullable timestamp on the message row.
ALTER TABLE sniffies_chat_messages
  ADD COLUMN IF NOT EXISTS dispatched_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_sniffies_msg_user_undispatched
  ON sniffies_chat_messages(user_id, created_at DESC)
  WHERE dispatched_at IS NULL;

-- Dossier enrichment writes one row per sniffies_contact under a stable
-- question_key so re-runs upsert cleanly. The unique(user_id, question_key)
-- constraint from migration 270 handles the upsert primary path.
CREATE INDEX IF NOT EXISTS idx_mommy_dossier_user_history
  ON mommy_dossier(user_id, category) WHERE category = 'history';
