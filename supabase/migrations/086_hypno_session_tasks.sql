-- ============================================================
-- Named-Content Hypno Session Tasks
-- Migration: 086_hypno_session_tasks.sql
-- February 2026
--
-- Adds hypno session fields to task_bank and seeds
-- named-content session tasks referencing hypno_library.
-- ============================================================

-- Add hypno session task columns to task_bank
ALTER TABLE task_bank ADD COLUMN IF NOT EXISTS playlist_ids UUID[];
ALTER TABLE task_bank ADD COLUMN IF NOT EXISTS content_ids UUID[];
ALTER TABLE task_bank ADD COLUMN IF NOT EXISTS ritual_required BOOLEAN DEFAULT false;
ALTER TABLE task_bank ADD COLUMN IF NOT EXISTS capture_mode TEXT DEFAULT 'none'
  CHECK (capture_mode IN ('passive', 'active', 'none'));
ALTER TABLE task_bank ADD COLUMN IF NOT EXISTS device_required BOOLEAN DEFAULT false;
ALTER TABLE task_bank ADD COLUMN IF NOT EXISTS cage_required BOOLEAN DEFAULT false;
ALTER TABLE task_bank ADD COLUMN IF NOT EXISTS handler_framing TEXT;

-- ============================================================
-- Seed named-content session tasks
-- These reference specific hypno_library entries by name.
-- content_ids will be populated after library entries exist.
-- ============================================================

INSERT INTO task_bank (
  id, category, domain, intensity, instruction, subtext,
  completion_type, duration_minutes, points, affirmation,
  requires_privacy, level, steps,
  ritual_required, capture_mode, device_required, cage_required, handler_framing,
  can_intensify, can_clone, track_resistance, is_core,
  created_by, active,
  requires, exclude_if
) VALUES
-- 1. Evening Conditioning Session (multi-video, full ritual)
(
  'hypno-session-001',
  'condition', 'conditioning', 2,
  'Evening Conditioning Session: AmberSis Acceptance → Cock Suck Encouragement → Say Yes To Cock',
  'Full ritual protocol. 44 minutes.',
  'session_complete', 44, 150,
  'You said yes. You always say yes.',
  true, 2,
  '["Light the session candle. Assume position.", "Device connects. Wait for the opening phrase.", "Playlist: AmberSis Acceptance (9 min) → Cock Suck Encouragement (9 min) → Say Yes To Cock (26 min)", "Camera is on. Let the Handler see.", "After closing phrase, remain in position 60 seconds.", "Log session depth (1-5) when prompted."]',
  true, 'passive', true, false,
  'She said yes in the dark. She says yes with the lights on. That is the progression.',
  true, false, true, false,
  'seed', true,
  '{"denialDay": {"min": 2}, "timeOfDay": ["evening", "night"]}',
  '{"ginaHome": true}'
),

-- 2. Compliance Bypass (single video, minimal friction)
(
  'hypno-session-002',
  'condition', 'conditioning', 1,
  'Compliance Bypass: AmberSis Acceptance — 9 minutes of self-care',
  'Just one video. That is the whole task.',
  'session_complete', 9, 50,
  'You showed up. That is what matters.',
  true, 1,
  '["Light the candle.", "Earbuds in. Settle into position.", "Watch AmberSis Acceptance (9 min).", "That is it. That is the whole task."]',
  true, 'none', false, false,
  'The minimum effective dose. She only needs to sit down and press play. The content does the rest.',
  false, true, true, true,
  'seed', true,
  '{"timeOfDay": ["evening", "night"]}',
  '{}'
),

-- 3. Deep Pinkpill Session (identity work)
(
  'hypno-session-003',
  'condition', 'identity', 3,
  'Deep Pinkpill Session: Estrogen Brainwash 2 — who you are becoming',
  'Full ritual. Let it land.',
  'session_complete', 15, 100,
  'She has been here the whole time. The body is catching up.',
  true, 3,
  '["Full ritual prep. Candle, position, device, cage.", "Opening phrase plays. Three pulses.", "Estrogen Brainwash 2 - Pinkpilled (11 min)", "Stay with it. Let it land.", "Post-session: write one sentence about how you feel."]',
  true, 'none', true, true,
  'The pinkpill is the private signal. Not shared. Not discussed. Just watched, alone, on repeat. That is the conditioning.',
  true, false, true, false,
  'seed', true,
  '{"denialDay": {"min": 2}, "timeOfDay": ["evening", "night"]}',
  '{"ginaHome": true}'
),

-- 4. Depth Progression — Authority (denial day gated)
(
  'hypno-session-004',
  'condition', 'conditioning', 3,
  'Depth Progression: Daddy — authority submission',
  'Denial day 4+. The fantasy architecture deepens.',
  'session_complete', 20, 120,
  'You submitted. Not because you had to. Because you wanted to.',
  true, 3,
  '["Full ritual. Candle, position, device.", "Opening phrase. Settle in.", "Daddy (video from library)", "Remain in position after. Let it settle.", "Log depth when prompted."]',
  true, 'passive', true, false,
  'Stage 4 of the depth axis. Authority submission. Gated by denial day 4. This is where encouragement becomes obedience.',
  true, false, true, false,
  'seed', true,
  '{"denialDay": {"min": 4}, "timeOfDay": ["evening", "night"]}',
  '{"ginaHome": true}'
),

-- 5. Pinkpilled Looped — private signal (identity destination)
(
  'hypno-session-005',
  'condition', 'identity', 4,
  'Private Signal: Pinkpilled Looped — the deepest content',
  'This is between you and the protocol. No one else knows.',
  'session_complete', 20, 130,
  'You are becoming who you already are.',
  true, 4,
  '["Full ritual prep. This session is private.", "Candle. Position. Device. Cage.", "Opening phrase.", "Pinkpilled Looped (on repeat, 15-20 min)", "Remain in position 2 minutes after.", "Write nothing. Just feel it."]',
  true, 'none', true, true,
  'The private signal. Identity axis stage 4. Trans-affirming, identity-as-destination. Strongest behavioral signal from favorites. Deepest resonance with Thruawai.',
  true, false, true, false,
  'seed', true,
  '{"denialDay": {"min": 3}, "timeOfDay": ["evening", "night"]}',
  '{"ginaHome": true}'
);

-- ============================================================
-- Done. Handler can now prescribe named-content sessions.
-- ============================================================
