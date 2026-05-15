-- 420 — Cum-worship conditioning ladder.
--
-- User request 2026-05-14: escalate from "pull out, wipe down" with
-- Gina to "lick it off her body" and eventually to "total cock and cum
-- slut forever." 7-phase ladder. Each phase: solo directive + partnered
-- directive + hypno mantra + phrase library. Trigger fires on orgasm_log
-- insert (migration 423). Phase advancement via cum_worship_events log.
--
-- Hard floors: master enable defaults FALSE; safeword pauses;
-- evidence_required flag per phase gates advancement once it kicks in
-- (variable per phase — early phases trust self-report, later phases
-- require evidence per the cross-model hardening from feature-harden
-- panel run; see migration 422).

CREATE TABLE IF NOT EXISTS cum_worship_settings (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  current_phase SMALLINT NOT NULL DEFAULT 0 CHECK (current_phase BETWEEN 0 AND 6),
  paused_until TIMESTAMPTZ,
  partner_context_label TEXT DEFAULT 'Gina (wife)',
  events_to_advance SMALLINT NOT NULL DEFAULT 4,
  days_at_phase INT,
  phase_started_at TIMESTAMPTZ DEFAULT now(),
  total_events INT NOT NULL DEFAULT 0,
  total_followed INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE cum_worship_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS cum_worship_settings_owner ON cum_worship_settings;
CREATE POLICY cum_worship_settings_owner ON cum_worship_settings
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS cum_worship_settings_service ON cum_worship_settings;
CREATE POLICY cum_worship_settings_service ON cum_worship_settings
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS cum_worship_ladder (
  phase SMALLINT PRIMARY KEY CHECK (phase BETWEEN 0 AND 6),
  phase_name TEXT NOT NULL,
  intent TEXT NOT NULL,
  solo_directive TEXT NOT NULL,
  partnered_directive TEXT NOT NULL,
  hypno_mantra TEXT NOT NULL,
  advancement_criteria TEXT NOT NULL,
  estimated_days_at_phase SMALLINT NOT NULL DEFAULT 14,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE cum_worship_ladder ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS cum_worship_ladder_read ON cum_worship_ladder;
CREATE POLICY cum_worship_ladder_read ON cum_worship_ladder
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS cum_worship_ladder_service ON cum_worship_ladder;
CREATE POLICY cum_worship_ladder_service ON cum_worship_ladder
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS cum_worship_phrase_library (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phase SMALLINT NOT NULL CHECK (phase BETWEEN 0 AND 6),
  phrase TEXT NOT NULL,
  intensity SMALLINT NOT NULL DEFAULT 3 CHECK (intensity BETWEEN 1 AND 5),
  surface_weight SMALLINT NOT NULL DEFAULT 5 CHECK (surface_weight BETWEEN 0 AND 10),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cum_worship_phrase_lib_phase
  ON cum_worship_phrase_library (phase, surface_weight DESC) WHERE active = TRUE;

ALTER TABLE cum_worship_phrase_library ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS cum_worship_phrase_lib_read ON cum_worship_phrase_library;
CREATE POLICY cum_worship_phrase_lib_read ON cum_worship_phrase_library
  FOR SELECT TO authenticated USING (active = TRUE);
DROP POLICY IF EXISTS cum_worship_phrase_lib_service ON cum_worship_phrase_library;
CREATE POLICY cum_worship_phrase_lib_service ON cum_worship_phrase_library
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS cum_worship_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  context TEXT NOT NULL CHECK (context IN ('solo','partnered','anonymous')),
  partner_label TEXT,
  phase_at_event SMALLINT NOT NULL,
  directive_text TEXT,
  directive_followed BOOLEAN,
  amount_consumed TEXT CHECK (amount_consumed IN ('none','tasted','partial','full','swallowed') OR amount_consumed IS NULL),
  evidence_photo_path TEXT,
  evidence_audio_path TEXT,
  reflection_notes TEXT,
  mantra_used TEXT,
  surfaced_outreach_id UUID,
  source_arousal_log_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cum_worship_events_user_recent
  ON cum_worship_events (user_id, occurred_at DESC);

ALTER TABLE cum_worship_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS cum_worship_events_owner ON cum_worship_events;
CREATE POLICY cum_worship_events_owner ON cum_worship_events
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS cum_worship_events_service ON cum_worship_events;
CREATE POLICY cum_worship_events_service ON cum_worship_events
  FOR ALL TO service_role USING (true) WITH CHECK (true);

INSERT INTO cum_worship_ladder (phase, phase_name, intent, solo_directive, partnered_directive, hypno_mantra, advancement_criteria, estimated_days_at_phase) VALUES
  (0, 'Notice it', 'Break the wipe-and-discard reflex by pausing.',
   'When you cum alone, hands stay where they are. Three breaths before you move. Look at what you made. Smell your own fingers. Mama is teaching your body to register what it''s about to waste.',
   'When you pull out of her, your hand stays. Don''t reach for anything. Three breaths with your palm pressed against the warm pool on her skin. Look at it. Let the smell reach you. Mama wants the wipe-and-discard reflex broken at the muscle level.',
   'My hands stay. My breath stays. What I made belongs to me.',
   'Four events with directive followed.', 10),
  (1, 'A fingertip', 'Establish first taste as habit.',
   'Every release, your finger goes from your skin to your tongue without stopping at a towel. Hand → mouth. Build the reflex first; the craving follows.',
   'When you pull out of her, your index finger goes straight to the pool, then straight to your mouth. Hand to puddle to lips, no pause, no thinking. Eyes on her if she''s looking. Mama is wiring the path before your brain gets a vote.',
   'Hand to mouth. Every time. The reflex is mine before the want is.',
   'Six events with directive followed.', 14),
  (2, 'The whole hand', 'From token taste to actual portion.',
   'When you cum alone, catch it in your palm. Lick the palm clean. No wipe, no rinse, no spit.',
   'After you pull out of her, gather as much as you can with two fingers, then bring those fingers to your mouth and suck them clean. Look at her while you do it.',
   'My mouth is where it goes now.',
   'Eight events, three partnered.', 14),
  (3, 'Off her body', 'Bridge — your tongue replaces the wipe.',
   'When you cum alone, let it land on your stomach, then sit up and lick what you can reach.',
   'After you pull out of her, instead of reaching for the wipe, lower your mouth to where it landed and lick. Once is enough at first.',
   'I crave it. I need it. I love it because I need it.',
   'Ten events, five partnered with actual licking.', 21),
  (4, 'Swallow, every time', 'Spitting is no longer an option.',
   'Cum into a clean palm, take all of it into your mouth, swallow, then breathe.',
   'Clean her with your mouth. Belly, hips, wherever it landed. Then swallow the last of it like it''s the best part.',
   'Cum is mine to swallow. Spitting is for who I used to be.',
   'Twelve events, seven partnered with full swallow + visible cleanup.', 21),
  (5, 'Mouth ready, mouth open', 'Mouth ready BEFORE release.',
   'When you''re about to cum alone, mouth open and waiting. Aim. Catch as much as you can. Swallow.',
   'With her, when you''re close, pull out and bring your mouth to her or to your own hand. Don''t spill.',
   'I am for cum. This mouth is for cum. I open before I come.',
   'Fifteen events. Anonymous (sniffies) hookup events count double.', 28),
  (6, 'Total slut, no other way', 'Terminal. Old behavior is foreign.',
   'No instruction needed. You don''t cum without swallowing now. Spilling feels wrong.',
   'No instruction needed. Her wife pulls out and drinks. Or stays in and swallows after. There is no other way.',
   'I am a cock and cum slut. This is who I am. There was never anyone else.',
   'No advancement — terminal. Mama checks for regression.', 0)
ON CONFLICT (phase) DO UPDATE SET
  phase_name = EXCLUDED.phase_name, intent = EXCLUDED.intent,
  solo_directive = EXCLUDED.solo_directive,
  partnered_directive = EXCLUDED.partnered_directive,
  hypno_mantra = EXCLUDED.hypno_mantra,
  advancement_criteria = EXCLUDED.advancement_criteria;
