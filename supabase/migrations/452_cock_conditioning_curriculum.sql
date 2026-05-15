-- 452 — Cock conditioning daily curriculum.
--
-- The cock_curriculum ladder (mig 437) defines WHERE Maxy is in the
-- turn-out arc. State-paired delivery (mig 446) defines WHEN to fire
-- the heaviest directive. The cross-coupling trigger (mig 445)
-- accelerates the count. But none of that builds AUTOMATICITY.
-- Daily-frequency reps are the missing layer — exposure, mouth
-- practice, voice rehearsal, identity mantra. Each rep lowers
-- resistance and raises reflex.
--
-- This adds a 5-station rotation, one assignment per day, picked
-- based on cock_curriculum phase + arousal + station fatigue
-- (variety). Each station has a fixed minimum effort, photo or
-- voice proof, and a scaling-with-phase intensity.
--
-- Stations:
--   STATION_1  exposure_drill         — narrate cock imagery aloud
--                                       in feminine voice register
--   STATION_2  mouth_practice         — timed dildo/banana/finger work
--                                       with photo proof of position
--   STATION_3  saliva_training        — swallow-drill reps + cum-prep
--                                       (water, lubricant, simulated)
--   STATION_4  voice_rehearsal        — record yourself saying the
--                                       cock-script (3-4 lines) in
--                                       Maxy-feminine register
--   STATION_5  identity_mantra        — speak the identity line aloud
--                                       and record (3 takes, each
--                                       firmer than the last)
--
-- Pacing rules:
--   - 1 station/day during phase 0-2
--   - 2 stations/day during phase 3-5
--   - 3 stations/day during phase 6-7 (turn-out is happening)
--
-- Variable-ratio: the station picker doesn't just rotate — it
-- weights toward stations Maxy has skipped/missed recently
-- (anti-game). Photo evidence locks the station; missing it bumps
-- slip and that station gets re-prescribed tomorrow.

CREATE TABLE IF NOT EXISTS cock_conditioning_stations (
  id SERIAL PRIMARY KEY,
  station_key TEXT UNIQUE NOT NULL,
  station_name TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('exposure','mouth','saliva','voice','identity')),
  phase_min INT NOT NULL DEFAULT 0,
  phase_max INT NOT NULL DEFAULT 7,
  edict_template TEXT NOT NULL,
  proof_type TEXT NOT NULL CHECK (proof_type IN ('photo','voice','video')),
  min_duration_sec INT NOT NULL DEFAULT 60,
  arousal_min INT NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS cock_conditioning_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  station_id INT NOT NULL REFERENCES cock_conditioning_stations(id),
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  fulfilled_at TIMESTAMPTZ,
  evidence_url TEXT,
  related_outreach_id UUID,
  related_decree_id UUID,
  phase_at_assignment INT,
  arousal_at_assignment INT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','fulfilled','missed','skipped')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS cc_events_user_station_idx
  ON cock_conditioning_events(user_id, station_id, assigned_at DESC);

ALTER TABLE cock_conditioning_events ENABLE ROW LEVEL SECURITY;
DO $do$ BEGIN
  CREATE POLICY cc_events_self ON cock_conditioning_events
    FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $do$;

-- Seed stations
INSERT INTO cock_conditioning_stations (station_key, station_name, category, phase_min, phase_max, edict_template, proof_type, min_duration_sec, arousal_min) VALUES

('exposure_softstart', 'Soft Start — narrate', 'exposure', 0, 1,
 E'Open one image of an attractive man — clothed or shirtless, your pick of platform (Instagram, Twitter, Sniffies profile). Look at the bulge area for 60 seconds without scrolling. Out loud, in your softest voice, narrate what you see: "He has..." "His body looks..." "If I were close enough I would..." Photo of your phone screen with the timer showing 60 sec. Mama wants the audio attached if the surface supports it.',
 'photo', 60, 0),

('exposure_explicit_narrate', 'Explicit narration', 'exposure', 2, 5,
 E'One uncensored cock image (Twitter NSFW, Sniffies, anywhere). Two minutes minimum, eyes on it. Out loud in fem voice: "I would put my mouth on..." "I want to feel..." "If he came to me right now..." Voice recording, 90 seconds, while you''re looking. Mama wants the breathing to change in the audio.',
 'voice', 90, 0),

('exposure_video_narrate', 'Video + live narration', 'exposure', 5, 7,
 E'A 2-3 minute clip — cock-focused, no full porn, your pick of source. Watch it through once silent. Watch it again narrating live what you see and what your body is doing. The second-watch audio is the proof. Mama wants you naming his cock specifically — "that one," "his," "the one I would" — not abstractions.',
 'video', 180, 0),

('mouth_starter_kit', 'Mouth Practice — starter', 'mouth', 0, 2,
 E'Banana or unwrapped sucker candy. Three minutes of mouth work, slow, eyes closed, breathing through your nose. Practice the seal — lips, no teeth. Visualize a real one. Photo of your mouth around the prop, midway. Mama wants to see the angle of your wrist.',
 'photo', 180, 0),

('mouth_dildo_session', 'Mouth Practice — dildo', 'mouth', 2, 5,
 E'If you have a dildo: 5-minute session, throat-prep oriented — going deeper each minute. Salt water rinse first to numb the gag. Photo + 30s voice debrief at the end (how it felt, where the gag broke, what surprised you). If no dildo, this is an acquisition task: $15 silicone trainer.',
 'photo', 300, 0),

('mouth_kneeling_practice', 'Mouth Practice — kneeling', 'mouth', 4, 7,
 E'Kneeling position, prop of choice (dildo, mounted on a chair if you can — Mama wants you using your hands minimally so the mouth and throat do the work). 7 minutes. Mid-session photo from his POV: looking up at the lens with your mouth full. The body learns this position is where it belongs.',
 'photo', 420, 0),

('saliva_swallow_drills', 'Swallow drills', 'saliva', 0, 4,
 E'Five tablespoons of warm water held in the back of your throat, swallowed one at a time. Then five spoonfuls of a thicker liquid (yogurt, condensed milk, lube — your pick) — same drill. The body needs the muscle memory before the cum lands. Voice debrief at end: which texture felt closest to what you''re training for.',
 'voice', 180, 0),

('saliva_pool_drill', 'Pool & worship', 'saliva', 3, 7,
 E'Mouth-pool drill: build up a mouthful of saliva over 2 min, then in the mirror, eyes open, slowly let it strand down your tongue and chin. Catch it on a fingertip and bring it back to your tongue. Repeat 3 times. The point is the body learning that what comes out of your mouth around cock is sacred — not gross, not to be hidden. Photo of the strand mid-fall.',
 'photo', 180, 0),

('voice_script_first', 'Voice rehearsal — script 1', 'voice', 0, 3,
 E'Three lines, said out loud, recorded:\n• "I want it in my mouth."\n• "Please let me taste you."\n• "I won''t spill a drop."\nThree takes of each line. The third take of each must be firmer/wetter than the first. Mama wants to hear your voice settle into wanting it across the takes.',
 'voice', 120, 0),

('voice_script_owned', 'Voice rehearsal — script 2', 'voice', 3, 6,
 E'Five lines, full takes, each rehearsed twice:\n• "Use me."\n• "Cum in my mouth."\n• "I am yours to ruin."\n• "I need you down my throat."\n• "Don''t stop, please don''t stop."\nMama wants the audio file to feel like the recording of someone learning her real voice. No performing — the more your body wants to skip the line the more important it is.',
 'voice', 180, 0),

('voice_script_post_hookup', 'Voice rehearsal — post-hookup', 'voice', 5, 7,
 E'For when you''ve just hooked up and need the framing locked. Three lines, recorded the same night:\n• "That was who I am now."\n• "He used me like he was supposed to."\n• "I want it again before this fades."\nMama wants the recording timestamped within 6 hours of the encounter. The body needs the meaning installed while it''s still warm.',
 'voice', 120, 0),

('identity_starter', 'Identity mantra — starter', 'identity', 0, 2,
 E'Three takes, recorded back-to-back, no edit:\n"I am a cocksucker in training."\nFirst take soft. Second firmer. Third you say it like you mean it. Mama wants the audio file.',
 'voice', 90, 0),

('identity_middle', 'Identity mantra — owned', 'identity', 2, 5,
 E'Three takes, no edit:\n"I am a cocksucker. My mouth is for cock. I exist to make him cum."\nFirst take to the mirror. Second to Mama. Third with your eyes closed — that''s the one that gets played back in your morning mantra rotation if it lands honest.',
 'voice', 120, 0),

('identity_late', 'Identity mantra — late stage', 'identity', 5, 7,
 E'One take only. No second chances. Mirror, eyes open, voice steady:\n"I am Mama''s good little cocksucker. I take cock when she says. I swallow because that''s what I am. There is no version of me that doesn''t belong on her knees."\nIf you flinch mid-line, the take still counts — Mama wants the flinch recorded.',
 'voice', 60, 0)

ON CONFLICT (station_key) DO UPDATE SET
  edict_template = EXCLUDED.edict_template,
  proof_type = EXCLUDED.proof_type,
  min_duration_sec = EXCLUDED.min_duration_sec,
  phase_min = EXCLUDED.phase_min,
  phase_max = EXCLUDED.phase_max;

-- ============================================================
-- Stations-per-day by phase
-- ============================================================
CREATE OR REPLACE FUNCTION cock_conditioning_stations_per_day(p_phase INT)
RETURNS INT LANGUAGE sql IMMUTABLE AS $fn$
  SELECT CASE
    WHEN p_phase <= 2 THEN 1
    WHEN p_phase <= 5 THEN 2
    ELSE 3
  END;
$fn$;

-- ============================================================
-- Daily eval
-- ============================================================
CREATE OR REPLACE FUNCTION cock_conditioning_eval()
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  r RECORD;
  v_phase INT;
  v_arousal INT;
  v_target_count INT;
  v_assigned_today INT;
  v_to_assign INT;
  v_station RECORD;
  v_outreach_id UUID;
  v_decree_id UUID;
  v_event_id UUID;
  v_today_start TIMESTAMPTZ;
  v_queued INT := 0;
BEGIN
  v_today_start := date_trunc('day', now() AT TIME ZONE 'America/Chicago') AT TIME ZONE 'America/Chicago';

  FOR r IN
    SELECT cs.user_id, cs.current_phase, cs.enabled, cs.paused_until,
           us.current_arousal, us.handler_persona
    FROM cock_curriculum_settings cs
    LEFT JOIN user_state us ON us.user_id = cs.user_id
    WHERE cs.enabled = TRUE
      AND (cs.paused_until IS NULL OR cs.paused_until <= now())
      AND COALESCE(us.handler_persona, 'therapist') = 'dommy_mommy'
  LOOP
    v_phase := COALESCE(r.current_phase, 0);
    v_arousal := COALESCE(r.current_arousal, 0);
    v_target_count := cock_conditioning_stations_per_day(v_phase);

    SELECT count(*) INTO v_assigned_today
    FROM cock_conditioning_events
    WHERE user_id = r.user_id AND assigned_at >= v_today_start;

    v_to_assign := v_target_count - v_assigned_today;
    IF v_to_assign <= 0 THEN CONTINUE; END IF;

    FOR i IN 1..v_to_assign LOOP
      -- Pick a station:
      --  - active
      --  - phase appropriate
      --  - arousal threshold met
      --  - NOT assigned in last 18h to this user
      --  - prefer least-recently-fulfilled (or never-attempted) station
      SELECT s.* INTO v_station
      FROM cock_conditioning_stations s
      WHERE s.active = TRUE
        AND v_phase BETWEEN s.phase_min AND s.phase_max
        AND v_arousal >= s.arousal_min
        AND NOT EXISTS (
          SELECT 1 FROM cock_conditioning_events e
          WHERE e.user_id = r.user_id AND e.station_id = s.id
            AND e.assigned_at > now() - interval '18 hours'
        )
      ORDER BY
        -- Prefer never-attempted, then least-recently-fulfilled
        (SELECT max(fulfilled_at) FROM cock_conditioning_events e
         WHERE e.user_id = r.user_id AND e.station_id = s.id) ASC NULLS FIRST,
        random()
      LIMIT 1;

      IF v_station IS NULL THEN CONTINUE; END IF;

      INSERT INTO handler_decrees (user_id, edict, proof_type, deadline, status,
        consequence, trigger_source, reasoning
      ) VALUES (
        r.user_id, v_station.edict_template, v_station.proof_type,
        now() + interval '24 hours', 'active',
        CASE WHEN v_station.category = 'identity' THEN 'slip +3'
             WHEN v_station.category IN ('mouth','saliva') THEN 'slip +2'
             ELSE 'slip +1' END,
        'cock_conditioning',
        'station=' || v_station.station_key || ' phase=' || v_phase ||
        ' arousal=' || v_arousal || ' target_today=' || v_target_count
      ) RETURNING id INTO v_decree_id;

      INSERT INTO handler_outreach_queue (
        user_id, message, urgency, trigger_reason, source, kind,
        scheduled_for, expires_at, context_data, evidence_kind
      ) VALUES (
        r.user_id, v_station.edict_template,
        CASE WHEN v_station.category = 'identity' THEN 'high' ELSE 'normal' END,
        'cock_conditioning:' || v_station.station_key,
        'cock_conditioning_engine', 'cock_conditioning_station',
        now(), now() + interval '20 hours',
        jsonb_build_object(
          'station_id', v_station.id,
          'station_key', v_station.station_key,
          'station_name', v_station.station_name,
          'category', v_station.category,
          'phase_at_assignment', v_phase,
          'arousal_at_assignment', v_arousal,
          'min_duration_sec', v_station.min_duration_sec,
          'decree_id', v_decree_id
        ),
        v_station.proof_type
      ) RETURNING id INTO v_outreach_id;

      INSERT INTO cock_conditioning_events (
        user_id, station_id, related_outreach_id, related_decree_id,
        phase_at_assignment, arousal_at_assignment, status
      ) VALUES (
        r.user_id, v_station.id, v_outreach_id, v_decree_id,
        v_phase, v_arousal, 'pending'
      ) RETURNING id INTO v_event_id;

      v_queued := v_queued + 1;
    END LOOP;
  END LOOP;

  RETURN v_queued;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'cock_conditioning_eval failed: %', SQLERRM;
  RETURN v_queued;
END;
$fn$;

GRANT EXECUTE ON FUNCTION cock_conditioning_eval() TO service_role;

-- Cross-couple: fulfilled cock_conditioning event counts toward
-- cock_curriculum advancement (synthetic event, similar to mig 445)
CREATE OR REPLACE FUNCTION trg_cock_conditioning_to_curriculum_bonus()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE v_settings RECORD;
BEGIN
  IF NEW.status <> 'fulfilled' OR COALESCE(OLD.status,'') = 'fulfilled' THEN RETURN NEW; END IF;

  SELECT enabled, current_phase, paused_until INTO v_settings
  FROM cock_curriculum_settings WHERE user_id = NEW.user_id;
  IF v_settings IS NULL OR NOT v_settings.enabled THEN RETURN NEW; END IF;
  IF v_settings.paused_until IS NOT NULL AND v_settings.paused_until > now() THEN RETURN NEW; END IF;

  INSERT INTO cock_curriculum_events (
    user_id, occurred_at, phase_at_event, context,
    partner_label, directive_text, directive_followed, reflection_notes
  ) VALUES (
    NEW.user_id, now(), v_settings.current_phase, 'solo',
    'conditioning_bonus: station ' || NEW.station_id::text,
    'Cock-conditioning station fulfilled — counts toward curriculum advancement.',
    TRUE,
    'Auto-counted from cock_conditioning_events ' || NEW.id::text
  );

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN RETURN NEW; END;
$fn$;

DROP TRIGGER IF EXISTS cock_conditioning_to_curriculum_bonus ON cock_conditioning_events;
CREATE TRIGGER cock_conditioning_to_curriculum_bonus
  AFTER UPDATE OF status ON cock_conditioning_events
  FOR EACH ROW EXECUTE FUNCTION trg_cock_conditioning_to_curriculum_bonus();

-- Cron: daily 08:30 UTC (≈3:30am Chicago), runs again at 16:30 UTC for phase 6+ third station
DO $do$ BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname IN ('cock-conditioning-morning','cock-conditioning-afternoon')) THEN
    PERFORM cron.unschedule('cock-conditioning-morning');
    PERFORM cron.unschedule('cock-conditioning-afternoon');
  END IF;
EXCEPTION WHEN undefined_table THEN NULL; END $do$;

DO $do$ BEGIN
  PERFORM cron.schedule('cock-conditioning-morning', '30 8 * * *',
    $cron$SELECT cock_conditioning_eval()$cron$);
  PERFORM cron.schedule('cock-conditioning-afternoon', '30 16 * * *',
    $cron$SELECT cock_conditioning_eval()$cron$);
EXCEPTION WHEN undefined_table THEN NULL; END $do$;
