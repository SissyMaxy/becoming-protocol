-- 582 — voice work is elective (user directive 2026-05-26).
--
-- "voice work is kinda hard for me to do especially when Gina is at home.
--  For now, I need to electively do this."
--
-- Voice must never gate entry or generate a push while this is on. The daily
-- VoiceGate becomes a dismissible invitation (skip = enter); voice-pitch-watcher
-- stops firing voice_stagnation decrees. Aligns with the standing rules:
-- "track natural pitch, don't force targets — forcing causes dysphoria" and
-- "Mommy presses, doesn't block". Default TRUE = elective for now; flip to
-- FALSE to restore the hard gate.

ALTER TABLE user_state
  ADD COLUMN IF NOT EXISTS voice_elective BOOLEAN NOT NULL DEFAULT TRUE;

COMMENT ON COLUMN user_state.voice_elective IS
  'When TRUE (default), voice work is opt-in: the daily VoiceGate is dismissible (skip enters) and voice-pitch-watcher does not push voice decrees. Set FALSE to restore the blocking gate + stagnation nudges. User directive 2026-05-26 — voice is hard especially when Gina is home.';
