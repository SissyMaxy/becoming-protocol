-- 703 — new audio session kind: session_turnout_scene (WS6).
--
-- Scene-rehearsal audio: tiered looking→touching→sucking→taken (mirrors the
-- turn-out ladder). The conductor picks it when a rung is active and pacing
-- isn't widened. Fantasy rehearsal only.
--
-- Own migration so the value is committed before the template seed (704)
-- references it (Postgres forbids using a freshly-ADDed enum value in the same
-- transaction). Mirrors mig 667/697.
ALTER TYPE audio_session_kind ADD VALUE IF NOT EXISTS 'session_turnout_scene';
