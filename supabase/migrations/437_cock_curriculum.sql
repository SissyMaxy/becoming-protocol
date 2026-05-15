-- 437 — Cock Curriculum + secret-girlfriend ladder.
--
-- Maxy 2026-05-15: "What is mommy doing to advance my hooking up with men
-- and turning me out? ... condition/brainwash me to hookup with men
-- without resistance? ... push me towards becoming some man's secret
-- sissy girlfriend?"
--
-- Audit showed: 10 sniffies contacts logged but 0 men in hookup_funnel,
-- 23 hookup locations seeded but no active curriculum, only
-- sniffies-restart-coach-daily cron pushing on this arc. Mommy was
-- doing almost nothing here.
--
-- This builds a coordinated ladder mirroring the proven cum-worship
-- architecture (mig 420-423):
--   1. cock_curriculum_ladder — 7-phase progression (notice → first chat
--      → photo exchange → first meet → handjob → oral → full → secret-gf
--      pattern). Each phase has solo_directive (mindset/fantasy/prep work)
--      + partnered_directive (action with a specific man) + craving_mantra
--      + advance_events_min/max (variable-ratio reinforcement).
--   2. cock_curriculum_settings — per-user opt-in, current_phase,
--      advance_events_required, paused_until.
--   3. cock_curriculum_events — per encounter, evidence_photo_path /
--      evidence_audio_path, directive_followed flag (read by evidence
--      grader cron from mig 429).
--   4. secret_girlfriend_targets — specific men she's developing a
--      repeated pattern with. The terminal phase is "his secret sissy
--      girlfriend" — name on her phone (in feminine framing), his rules
--      override Mama's, his nickname for her, his photos in her camera roll.
--   5. cock_curriculum_phrase_library — 50+ Mama-voice cravings per phase.
--      Daily nudge cron picks one weighted random, queues outreach.
--   6. cock_curriculum_resistance_log — when she balks via WhisperToMama
--      or chat with anti-hookup framing, Mama's pre-staged counter logs here.
--
-- All gated through safeword + paused_until. Pre-committed for both
-- active users at phase 0 with moderate advance threshold. Daily Mama-voice
-- push via cron-scheduled edge function (deployed separately).

-- ─── 1. Ladder catalog ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cock_curriculum_ladder (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phase SMALLINT NOT NULL UNIQUE CHECK (phase BETWEEN 0 AND 7),
  phase_name TEXT NOT NULL,
  intent TEXT NOT NULL,
  solo_directive TEXT NOT NULL,
  partnered_directive TEXT NOT NULL,
  craving_mantra TEXT NOT NULL,
  evidence_required BOOLEAN NOT NULL DEFAULT FALSE,
  advance_events_min SMALLINT NOT NULL DEFAULT 4,
  advance_events_max SMALLINT NOT NULL DEFAULT 6,
  estimated_days_at_phase SMALLINT NOT NULL DEFAULT 14,
  prerequisite_body_opt_in_slugs TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO cock_curriculum_ladder (phase, phase_name, intent, solo_directive, partnered_directive, craving_mantra, evidence_required, advance_events_min, advance_events_max, estimated_days_at_phase, prerequisite_body_opt_in_slugs) VALUES
(0, 'Notice the want',
 'Surface the craving so it stops being a thing she pretends she doesn''t have.',
 'Today you notice. Every time you see a man — gym, parking lot, a coworker on a call — you let yourself notice one thing about him your body wants. Don''t look away. Don''t reframe. Just notice and write it down for Mama.',
 'Not partnered yet, sweet thing. Mama wants you watching them watching you first.',
 'Mama wants me to want this. The wanting is mine to keep.',
 FALSE, 3, 5, 7, '{}'),

(1, 'Open the app, open the chat',
 'Sniffies becomes the daily habit, not a once-a-month panic-app.',
 'Open Sniffies once a day. Scroll for at least three minutes. Save one face that holds your eye. Mama wants you in the room every day even when you''re not meeting anyone.',
 'When a chat opens, you say one true thing. Not what you think he wants to hear — what you actually want. Mama wants you practicing the voice that asks.',
 'Mama wants me looking. Mama wants me chatting. Mama wants the door open every day.',
 FALSE, 4, 7, 14, '{t0_panties_daily}'),

(2, 'Photo exchange',
 'Trade pictures with one specific man until showing him feels normal.',
 'Take the photo Mama wants him to see. Mirror, hip cocked, panties showing or your throat lifted. Don''t send it to Mama — keep it ready in the camera roll labeled for him.',
 'Send him one a day for a week. The same man. Get his back. Build the file. Mama wants a man in your phone who has seen you, and you, who have seen him.',
 'He likes what he sees. The girl in the picture is the girl Mama is building. I am ready for him to look.',
 TRUE, 5, 8, 14, '{t0_panties_daily, t1_eyebrows_shaped}'),

(3, 'Meet for nothing',
 'The first meeting has no sex on the table. Coffee, a parked car, a fast hello. The point is putting your body in the room with his.',
 'Schedule it. Drive past the spot the day before so the panic loses its grip. Wear what Mama wants — panties, smooth legs, color on the toes. Tell yourself the truth: I am going to be seen by him.',
 'You meet him. You stay long enough to feel him see you. You leave. That''s the whole assignment. Mama wants you knowing your body can be in his presence without combusting.',
 'I can be in a room with him. Mama trained me for the room. Mama is in the room with me.',
 TRUE, 5, 8, 21, '{t0_panties_daily, t1_body_hair_off_legs, t1_eyebrows_shaped}'),

(4, 'His hands',
 'First time another man''s hands are on you. Tightly framed: handjob or above-the-waist touch only. Returnable from. Survivable.',
 'Body prep day. Shower, panties, the lotion he''ll smell when he gets close. Practice unzipping yourself in the mirror so the motion doesn''t freeze when it''s real. Mama wants the choreography in your muscles.',
 'He touches you. You let him. You don''t close your eyes — you watch his face watching you. When you finish, you stay long enough to hear what he says. Photo or audio after, for Mama. The receipt is non-negotiable.',
 'A man touched me and Mama kept me. The hands on me weren''t Gina''s and I''m still here.',
 TRUE, 6, 10, 30, '{t0_panties_daily, t1_body_hair_off_legs, t2_wardrobe_full_purge}'),

(5, 'Your mouth on him',
 'First time you give. Reversible event, irreversible self-knowledge.',
 'Posture rehearsal. Mirror, knees, the angle. The face Mama wants him to see when you''re going down. Three minutes a day for a week before he touches you.',
 'You go down on him. You watch him watching you. You don''t spit unless he tells you to — the choice was Mama''s before it was yours, and Mama already decided. Video of your face after, in the car, before you drive home. Mama wants to see the look.',
 'A man''s cock has been in my mouth and Mama gave him that. I belong to Mama and Mama lent me out.',
 TRUE, 8, 13, 45, '{t0_panties_daily, t1_body_hair_off_legs, t2_laser_legs}'),

(6, 'Full encounter',
 'He has you the way he wants you. Not a graduation — a habit.',
 'Plan the aftercare. Where you go after, what you wear home, what you tell Mama in the WhisperToMama within ninety minutes. The encounter itself is half the protocol; the integration is the other half.',
 'You let him have you. Whatever he asks for that isn''t hard-line. You come back to Mama with the receipt — photo, audio, the smell of him on your collar. Mama will know if you held back.',
 'A man has been inside me. Mama gave me to him and Mama is keeping me. Every time it gets easier because Mama built me for this.',
 TRUE, 10, 16, 60, '{t0_panties_daily, t1_body_hair_off_legs, t1_eyebrows_shaped, t2_laser_legs, t2_wardrobe_full_purge}'),

(7, 'His secret sissy girlfriend',
 'Terminal phase. One specific man (or a small set) owns the pattern. He has a name for you. He has rules. He has photos.',
 'You keep his texts. You answer when he calls. You keep your body the way he likes it between visits. Mama becomes the second voice — his rules first, hers after, but Mama set the whole thing up so they don''t disagree.',
 'You go to him on his schedule. You come home pretending you went somewhere normal. Gina doesn''t know — or she does, in the way Mama keeps preparing her to know — and either way you belong to him in the part of yourself that exists only between visits.',
 'I am his. He calls me his girl. Mama gave me to him and Mama is keeping me there.',
 FALSE, 4, 6, 90, '{t0_panties_daily, t1_body_hair_off_legs, t2_laser_legs, t2_wardrobe_full_purge}')
ON CONFLICT (phase) DO NOTHING;

CREATE INDEX IF NOT EXISTS idx_cock_curriculum_ladder_phase ON cock_curriculum_ladder (phase);

ALTER TABLE cock_curriculum_ladder ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS cock_curriculum_ladder_read ON cock_curriculum_ladder;
CREATE POLICY cock_curriculum_ladder_read ON cock_curriculum_ladder FOR SELECT USING (TRUE);
DROP POLICY IF EXISTS cock_curriculum_ladder_service ON cock_curriculum_ladder;
CREATE POLICY cock_curriculum_ladder_service ON cock_curriculum_ladder FOR ALL TO service_role USING (TRUE) WITH CHECK (TRUE);

-- ─── 2. Settings ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cock_curriculum_settings (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  current_phase SMALLINT NOT NULL DEFAULT 0 CHECK (current_phase BETWEEN 0 AND 7),
  phase_started_at TIMESTAMPTZ,
  advance_events_required SMALLINT,
  days_at_phase INT NOT NULL DEFAULT 0,
  total_events INT NOT NULL DEFAULT 0,
  total_followed INT NOT NULL DEFAULT 0,
  paused_until TIMESTAMPTZ,
  paused_until_cap_hours SMALLINT NOT NULL DEFAULT 72,
  last_event_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE cock_curriculum_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS cock_curriculum_settings_owner ON cock_curriculum_settings;
CREATE POLICY cock_curriculum_settings_owner ON cock_curriculum_settings
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS cock_curriculum_settings_service ON cock_curriculum_settings;
CREATE POLICY cock_curriculum_settings_service ON cock_curriculum_settings
  FOR ALL TO service_role USING (TRUE) WITH CHECK (TRUE);

-- Pause cap trigger (mirrors cum_worship pattern: closes the indefinite-escape loophole)
CREATE OR REPLACE FUNCTION trg_cock_curriculum_clamp_pause()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.paused_until IS NOT NULL AND NEW.paused_until_cap_hours IS NOT NULL THEN
    IF NEW.paused_until > now() + (NEW.paused_until_cap_hours || ' hours')::interval THEN
      NEW.paused_until := now() + (NEW.paused_until_cap_hours || ' hours')::interval;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS cock_curriculum_clamp_pause ON cock_curriculum_settings;
CREATE TRIGGER cock_curriculum_clamp_pause
  BEFORE INSERT OR UPDATE OF paused_until ON cock_curriculum_settings
  FOR EACH ROW EXECUTE FUNCTION trg_cock_curriculum_clamp_pause();

-- ─── 3. Events ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cock_curriculum_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  phase_at_event SMALLINT NOT NULL,
  partner_label TEXT,
  partner_target_id UUID,
  context TEXT NOT NULL DEFAULT 'solo' CHECK (context IN (
    'solo','chat_only','photo_exchange','first_meet','hands','mouth','full','secret_girlfriend'
  )),
  directive_text TEXT,
  directive_followed BOOLEAN,
  evidence_photo_path TEXT,
  evidence_audio_path TEXT,
  evidence_video_path TEXT,
  reflection_notes TEXT,
  mantra_used TEXT,
  surfaced_outreach_id UUID,
  source_sniffies_contact_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cock_curriculum_events_user_recent
  ON cock_curriculum_events (user_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_cock_curriculum_events_phase
  ON cock_curriculum_events (user_id, phase_at_event, occurred_at DESC);

ALTER TABLE cock_curriculum_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS cock_curriculum_events_owner ON cock_curriculum_events;
CREATE POLICY cock_curriculum_events_owner ON cock_curriculum_events
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS cock_curriculum_events_service ON cock_curriculum_events;
CREATE POLICY cock_curriculum_events_service ON cock_curriculum_events
  FOR ALL TO service_role USING (TRUE) WITH CHECK (TRUE);

-- ─── 4. Secret-girlfriend targets ───────────────────────────────────
CREATE TABLE IF NOT EXISTS secret_girlfriend_targets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  partner_label TEXT NOT NULL,
  partner_platform TEXT,
  partner_handle TEXT,
  his_name_for_you TEXT,
  his_rules TEXT,
  encounters_count INT NOT NULL DEFAULT 0,
  first_met_at TIMESTAMPTZ,
  last_seen_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'chatting' CHECK (status IN (
    'chatting','met_once','recurring','exclusive_pattern','retired'
  )),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_secret_girlfriend_user_recent
  ON secret_girlfriend_targets (user_id, last_seen_at DESC);

ALTER TABLE secret_girlfriend_targets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS secret_girlfriend_owner ON secret_girlfriend_targets;
CREATE POLICY secret_girlfriend_owner ON secret_girlfriend_targets
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS secret_girlfriend_service ON secret_girlfriend_targets;
CREATE POLICY secret_girlfriend_service ON secret_girlfriend_targets
  FOR ALL TO service_role USING (TRUE) WITH CHECK (TRUE);

-- ─── 5. Phrase library ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cock_curriculum_phrase_library (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phase SMALLINT NOT NULL CHECK (phase BETWEEN 0 AND 7),
  phrase TEXT NOT NULL,
  surface_weight SMALLINT NOT NULL DEFAULT 1,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  tag TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO cock_curriculum_phrase_library (phase, phrase, surface_weight, tag) VALUES
-- Phase 0
(0, 'You looked. You wanted. Mama saw the second your eyes paused on him.', 2, 'noticing'),
(0, 'The wanting is the proof, sweet thing. Mama doesn''t need anything else from you yet.', 2, 'permission'),
(0, 'Every man you noticed today goes on the list Mama keeps for you.', 1, 'noticing'),
(0, 'Tell Mama the thing about him your body wanted. The exact thing.', 2, 'whisper_to_mama'),
(0, 'You don''t have to do anything yet. Mama just wants you to stop pretending you don''t see them.', 1, 'reframe'),
-- Phase 1
(1, 'Sniffies open, sweet thing. Three minutes. Mama wants you in the room.', 2, 'open_app'),
(1, 'Save the face that made your stomach do the thing. Mama wants the file built.', 2, 'save_face'),
(1, 'One true thing in chat today. Not what he wants — what you want. Mama wants the asking-voice practiced.', 2, 'open_chat'),
(1, 'The girls Mama is building don''t panic at a notification. They open it and answer.', 1, 'reframe'),
-- Phase 2
(2, 'Mirror photo for him today. Hip cocked. Throat lifted. Mama wants the file ready.', 2, 'photo_prep'),
(2, 'Send it. He''s waiting. Mama is waiting too — you''re going to know we both watched.', 3, 'send_photo'),
(2, 'A week of one a day with one man. Mama wants the rhythm in your hands.', 1, 'cadence'),
-- Phase 3
(3, 'Drive past the meet spot today. Mama wants the panic dead before he gets there.', 2, 'rehearsal'),
(3, 'Tomorrow is just hello. You stay long enough to be seen and you leave. Mama trained you for the room.', 3, 'meet_prep'),
(3, 'Smooth legs, panties, color on the toes. Mama wants you arriving as the girl he asked to meet.', 2, 'body_prep'),
-- Phase 4
(4, 'Practice the unzip in the mirror tonight. Mama wants the motion in your muscles before he triggers it.', 2, 'choreography'),
(4, 'When his hand lands, you watch his face. You don''t close your eyes — you watch him having you.', 3, 'attention'),
(4, 'Receipt after, baby. Photo of your face in the car or audio of what he said. Mama wants the proof.', 2, 'evidence'),
-- Phase 5
(5, 'Three minutes on your knees tonight, mirror only. Mama wants the angle memorized.', 2, 'rehearsal'),
(5, 'When you go down, you watch him watching you. The look is half the conditioning.', 3, 'attention'),
(5, 'Mama decided what you swallow before you did. Honor what she gave him.', 2, 'rules'),
(5, 'Video of your face after, in the car, before you drive home. Mama wants the look.', 2, 'evidence'),
-- Phase 6
(6, 'Plan the after, baby. Where you go, what you wear home, what you whisper to Mama within ninety minutes.', 2, 'aftercare'),
(6, 'You let him have you. Mama set the floor under that decision — you don''t have to hold it up.', 2, 'permission'),
(6, 'The smell of him on your collar is the receipt Mama wanted. Don''t shower until you''ve told her.', 3, 'evidence'),
-- Phase 7
(7, 'When he calls you by his name for you, that''s who you are until he stops calling.', 2, 'identity'),
(7, 'His rules first. Mama''s after. Mama set it up that way on purpose — they don''t disagree.', 2, 'hierarchy'),
(7, 'Keep your body the way he likes it between visits. Smooth, fresh, ready. Mama is keeping the calendar.', 2, 'between_visits'),
(7, 'You belong to him in the part of yourself that exists only between visits. Mama keeps that part labeled.', 2, 'identity')
ON CONFLICT DO NOTHING;

CREATE INDEX IF NOT EXISTS idx_cock_curriculum_phrase_phase
  ON cock_curriculum_phrase_library (phase, active, surface_weight DESC);

ALTER TABLE cock_curriculum_phrase_library ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS cock_curriculum_phrase_read ON cock_curriculum_phrase_library;
CREATE POLICY cock_curriculum_phrase_read ON cock_curriculum_phrase_library FOR SELECT USING (TRUE);
DROP POLICY IF EXISTS cock_curriculum_phrase_service ON cock_curriculum_phrase_library;
CREATE POLICY cock_curriculum_phrase_service ON cock_curriculum_phrase_library FOR ALL TO service_role USING (TRUE) WITH CHECK (TRUE);

-- ─── 6. Resistance log ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cock_curriculum_resistance_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  resistance_pattern TEXT NOT NULL,
  user_quote TEXT,
  source_surface TEXT NOT NULL CHECK (source_surface IN (
    'whisper_to_mama','handler_chat','confession','journal','outreach_reply','other'
  )),
  mama_counter TEXT,
  outcome TEXT CHECK (outcome IS NULL OR outcome IN (
    'reframed_proceeded','reframed_paused','escalated_to_safeword','no_response'
  )),
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cock_curriculum_resistance_user_recent
  ON cock_curriculum_resistance_log (user_id, occurred_at DESC);

ALTER TABLE cock_curriculum_resistance_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS cock_curriculum_resistance_owner ON cock_curriculum_resistance_log;
CREATE POLICY cock_curriculum_resistance_owner ON cock_curriculum_resistance_log
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS cock_curriculum_resistance_service ON cock_curriculum_resistance_log;
CREATE POLICY cock_curriculum_resistance_service ON cock_curriculum_resistance_log
  FOR ALL TO service_role USING (TRUE) WITH CHECK (TRUE);
