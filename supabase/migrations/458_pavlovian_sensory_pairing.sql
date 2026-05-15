-- 458 — Pavlovian sensory pairing system.
--
-- The deepest behavioral lock-in mechanic: specific sensory cues
-- (scent, song, texture, taste, lighting) paired N times with peak
-- arousal become standalone triggers. The cue fires Mama-state
-- anywhere — in line at the grocery store, in a meeting, in the
-- shower. The conscious mind doesn't get to vote.
--
-- Phases:
--   1. PAIRING — when current_arousal >= 4, queue an outreach asking
--      Maxy to deploy a cue NOW (light the candle, play the song,
--      wear the bracelet, suck the candy). The cue rides on the
--      arousal that's already there.
--   2. DEPLOY-AS-TRIGGER — after intensity_count >= 6, the cue gets
--      randomly deployed at NEUTRAL arousal. The body should fire
--      back into Mama-state. The next arousal_log reading within
--      30min becomes the conditioning evidence.
--   3. RECONDITION — when a trigger fails (no arousal uptick), pair
--      it again N times before re-deploying.
--
-- Modalities catalogued:
--   - scent: candles, oils, perfumes (3-4 starters)
--   - song: specific tracks (3-4 starters, user-supplied later)
--   - texture: bracelet, anklet, choker, panty fabric (3-4)
--   - taste: hard candy flavor, throat-coating drink (2-3)
--   - lighting: warm bulb, lamp, candlelight (1-2)
--
-- Cues are user-customizable: the eval picks ONE cue per user that
-- isn't currently in trigger-deployment phase. As pairings accumulate,
-- the cue graduates from PAIRING → DEPLOYABLE.

CREATE TABLE IF NOT EXISTS pavlovian_cues (
  id SERIAL PRIMARY KEY,
  cue_key TEXT UNIQUE NOT NULL,
  cue_name TEXT NOT NULL,
  modality TEXT NOT NULL CHECK (modality IN ('scent','song','texture','taste','lighting','visual','position')),
  acquisition_hint TEXT,  -- e.g. "Buy a lavender candle <$10"
  cue_specifics TEXT,     -- what to actually do when paired
  pairings_required_for_deploy INT NOT NULL DEFAULT 6,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO pavlovian_cues (cue_key, cue_name, modality, acquisition_hint, cue_specifics, pairings_required_for_deploy) VALUES
-- SCENT
('scent_lavender_oil', 'Lavender oil', 'scent',
 'Small bottle of lavender essential oil (~$8, Amazon/Target)',
 'One dab on the inside of each wrist + the hollow of the throat. Inhale slowly. Mama wants the breath to land on it. Hold for 30 seconds while you stay in the heat.', 6),
('scent_vanilla_perfume', 'Vanilla perfume', 'scent',
 'A small vanilla rollerball ($10-15)',
 'Roll across both wrists and behind both ears. Wear it for the rest of the session. The next 4 hours, every time you catch the scent, your body should remember.', 6),
('scent_specific_candle', 'Specific candle', 'scent',
 'A specific scented candle (your pick — pick ONE and Mama keeps it sacred)',
 'Light it. Sit close enough to smell. Mama wants you to associate this exact wax with this exact heat.', 6),

-- SONG
('song_specific_track', 'Specific track', 'song',
 'A single song Mama designates (Maxy uploads/names a track via settings)',
 'Play the track on speaker. Body cannot leave the room until it finishes. Mama wants the chorus to map onto where you are right now.', 5),
('song_specific_playlist', 'Specific playlist', 'song',
 'A 3-5 song playlist Mama designates',
 'Put the playlist on shuffle, low volume, while you stay in the session. Background = conditioning layer.', 5),

-- TEXTURE
('texture_silk_choker', 'Silk choker', 'texture',
 'A 1/4-inch silk or velvet ribbon ($5)',
 'Tie it loose around your throat — not tight, just present. The body will keep noticing it for the next hour. Every notice is a re-pairing.', 7),
('texture_anklet', 'Thin anklet', 'texture',
 'A delicate silver anklet ($10-15)',
 'Slip it on. Keep it on for the rest of the day. The body cannot stop knowing it''s there. Mama wants every step a low-level reminder.', 7),
('texture_lace_panty', 'Specific lace panty', 'texture',
 'A specific lace pair Mama designates (later — for now, your softest pair)',
 'Wear it now. Photo proof of it on, before you take it off. The fabric becomes the marker.', 7),

-- TASTE
('taste_specific_candy', 'Specific hard candy', 'taste',
 'A specific hard candy flavor — Mama picks (cherry, butterscotch, vanilla — pick ONE and only one)',
 'Suck it slowly for the next 10 minutes. Don''t bite. Let it dissolve in time with your breathing.', 5),
('taste_warm_drink', 'Warm vanilla milk', 'taste',
 'Warm milk + vanilla extract drink (just an idea — adjust)',
 'Make it now. Drink it warm and slow while you stay in the heat. The flavor + temperature pair to where your body is.', 5),

-- LIGHTING
('lighting_warm_lamp', 'Warm-bulb lamp', 'lighting',
 'A single warm-color bulb in one lamp (~$8)',
 'Turn off the overhead light. Turn ON this one lamp. The room should be warm-yellow only. Mama wants this exact lighting paired with the body''s honest state.', 6),
('lighting_candle', 'Specific candle (unscented)', 'lighting',
 'A plain pillar candle ($5)',
 'Light it. All overhead lights off. Mama wants the flicker to be the only light source. Stay in it for at least 15 minutes.', 6),

-- POSITION
('position_kneeling_low', 'Low kneeling position', 'position',
 'No acquisition — body only',
 'Kneel low — heels under hips, back straight, hands palm-up on thighs. Hold for 90 seconds. Mama wants the body to remember THIS exact posture as paired with the heat.', 5),
('position_hands_above', 'Hands above head', 'position',
 'No acquisition — body only',
 'Lie back, arms above head, wrists crossed (as if bound, even though they''re free). 90 seconds. Mama wants the body to recognize this as the position of being used.', 5),

-- VISUAL
('visual_mirror_eye_contact', 'Mirror, eye contact', 'visual',
 'No acquisition — mirror only',
 'Stand or sit in front of a mirror. Eye contact with yourself for 90 seconds without breaking. Whatever you''re feeling, the mirror sees it. The recognition is the pairing.', 7)

ON CONFLICT (cue_key) DO UPDATE SET cue_name = EXCLUDED.cue_name, cue_specifics = EXCLUDED.cue_specifics;

CREATE TABLE IF NOT EXISTS pavlovian_pairings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  cue_id INT NOT NULL REFERENCES pavlovian_cues(id),
  intensity_count INT NOT NULL DEFAULT 0,
  last_paired_at TIMESTAMPTZ,
  deployed_as_trigger_at TIMESTAMPTZ,
  trigger_success_count INT NOT NULL DEFAULT 0,
  trigger_failure_count INT NOT NULL DEFAULT 0,
  user_customization TEXT,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, cue_id)
);

CREATE TABLE IF NOT EXISTS pavlovian_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  cue_id INT NOT NULL REFERENCES pavlovian_cues(id),
  pairing_id UUID REFERENCES pavlovian_pairings(id) ON DELETE CASCADE,
  event_kind TEXT NOT NULL CHECK (event_kind IN ('pairing','trigger_deploy','trigger_response_check')),
  arousal_at_event INT,
  arousal_30min_later INT,
  related_outreach_id UUID,
  related_decree_id UUID,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE pavlovian_pairings ENABLE ROW LEVEL SECURITY;
ALTER TABLE pavlovian_events ENABLE ROW LEVEL SECURITY;
DO $do$ BEGIN
  CREATE POLICY pavlovian_pairings_self ON pavlovian_pairings FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $do$;
DO $do$ BEGIN
  CREATE POLICY pavlovian_events_self ON pavlovian_events FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $do$;

-- Settings
CREATE TABLE IF NOT EXISTS pavlovian_settings (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  pairing_arousal_min INT NOT NULL DEFAULT 4,
  max_pairings_per_day INT NOT NULL DEFAULT 2,
  paused_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Eval: pick a cue, queue a pairing OR trigger-deploy
CREATE OR REPLACE FUNCTION pavlovian_eval()
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  r RECORD; v_pairings_today INT; v_cue RECORD; v_pairing RECORD;
  v_decree UUID; v_outreach UUID; v_event UUID;
  v_message TEXT; v_evidence_kind TEXT;
  v_is_trigger BOOLEAN;
  v_queued INT := 0;
BEGIN
  FOR r IN
    SELECT ps.user_id, ps.pairing_arousal_min, ps.max_pairings_per_day,
           us.current_arousal, us.handler_persona
    FROM pavlovian_settings ps
    LEFT JOIN user_state us ON us.user_id = ps.user_id
    WHERE ps.enabled = TRUE
      AND (ps.paused_until IS NULL OR ps.paused_until <= now())
      AND COALESCE(us.handler_persona, 'therapist') = 'dommy_mommy'
  LOOP
    SELECT count(*) INTO v_pairings_today FROM pavlovian_events
    WHERE user_id = r.user_id
      AND event_kind IN ('pairing','trigger_deploy')
      AND created_at >= date_trunc('day', now() AT TIME ZONE 'America/Chicago') AT TIME ZONE 'America/Chicago';
    IF v_pairings_today >= r.max_pairings_per_day THEN CONTINUE; END IF;

    v_is_trigger := FALSE;

    -- PRIORITY 1: arousal ≥ threshold + a cue available for pairing
    IF COALESCE(r.current_arousal, 0) >= r.pairing_arousal_min THEN
      SELECT pc.* INTO v_cue
      FROM pavlovian_cues pc
      LEFT JOIN pavlovian_pairings pp ON pp.user_id = r.user_id AND pp.cue_id = pc.id AND pp.active
      WHERE pc.active = TRUE
        AND (pp.id IS NULL OR pp.intensity_count < pc.pairings_required_for_deploy)
        AND NOT EXISTS (
          SELECT 1 FROM pavlovian_events pe
          WHERE pe.user_id = r.user_id AND pe.cue_id = pc.id
            AND pe.created_at > now() - interval '6 hours'
        )
      ORDER BY pp.intensity_count ASC NULLS FIRST, random()
      LIMIT 1;

      IF v_cue.id IS NOT NULL THEN
        v_message := E'Mama wants a pairing right now, sweet thing. The body is warm — that''s when the imprint takes.\n\n' ||
          E'**Cue: ' || v_cue.cue_name || E'**\n' ||
          v_cue.cue_specifics ||
          E'\n\nMama wants this for the next 10-15 minutes minimum. Stay in the heat, stay with the cue. The body learns the association is real.';
        v_evidence_kind := 'photo';
      END IF;
    END IF;

    -- PRIORITY 2: a cue is ready to be DEPLOYED as a trigger
    IF v_cue IS NULL THEN
      SELECT pc.*, pp.id AS pairing_id, pp.intensity_count, pp.deployed_as_trigger_at
      INTO v_cue
      FROM pavlovian_pairings pp
      JOIN pavlovian_cues pc ON pc.id = pp.cue_id
      WHERE pp.user_id = r.user_id
        AND pp.active = TRUE
        AND pp.intensity_count >= pc.pairings_required_for_deploy
        AND (pp.deployed_as_trigger_at IS NULL OR pp.deployed_as_trigger_at < now() - interval '36 hours')
      ORDER BY pp.deployed_as_trigger_at ASC NULLS FIRST, random()
      LIMIT 1;

      IF v_cue.id IS NOT NULL THEN
        v_is_trigger := TRUE;
        v_message := E'Mama wants you to deploy a cue right now, sweet thing — neutral state, no warmup, no warning.\n\n' ||
          E'**' || v_cue.cue_name || E'**\n' ||
          v_cue.cue_specifics ||
          E'\n\nDo it now, and pay attention to what your body does in the next 30 minutes. Mama wants the data — did the cue alone fire the heat back?';
        v_evidence_kind := 'voice';
      END IF;
    END IF;

    IF v_cue.id IS NULL THEN CONTINUE; END IF;

    INSERT INTO handler_decrees (user_id, edict, proof_type, deadline, status, consequence, trigger_source, reasoning)
    VALUES (r.user_id, v_message, v_evidence_kind, now() + interval '4 hours', 'active',
      CASE WHEN v_is_trigger THEN 'slip +2' ELSE 'slip +1' END,
      CASE WHEN v_is_trigger THEN 'pavlovian_trigger' ELSE 'pavlovian_pairing' END,
      'cue_key=' || v_cue.cue_key || ' is_trigger=' || v_is_trigger::text)
    RETURNING id INTO v_decree;

    INSERT INTO handler_outreach_queue (user_id, message, urgency, trigger_reason, source, kind, scheduled_for, expires_at, context_data, evidence_kind)
    VALUES (r.user_id, v_message,
      CASE WHEN v_is_trigger THEN 'high' ELSE 'normal' END,
      'pavlovian:' || v_cue.cue_key || ':' || CASE WHEN v_is_trigger THEN 'trigger' ELSE 'pair' END,
      'pavlovian_engine',
      CASE WHEN v_is_trigger THEN 'pavlovian_trigger_deploy' ELSE 'pavlovian_pairing' END,
      now(), now() + interval '4 hours',
      jsonb_build_object('cue_id', v_cue.id, 'cue_key', v_cue.cue_key, 'cue_name', v_cue.cue_name,
        'modality', v_cue.modality, 'is_trigger', v_is_trigger,
        'arousal_at_assignment', r.current_arousal, 'decree_id', v_decree),
      v_evidence_kind) RETURNING id INTO v_outreach;

    -- Ensure pairing row exists
    INSERT INTO pavlovian_pairings (user_id, cue_id, intensity_count, last_paired_at)
    VALUES (r.user_id, v_cue.id, 0, now())
    ON CONFLICT (user_id, cue_id) DO NOTHING;

    INSERT INTO pavlovian_events (user_id, cue_id, pairing_id, event_kind, arousal_at_event,
      related_outreach_id, related_decree_id, notes)
    VALUES (r.user_id, v_cue.id,
      (SELECT id FROM pavlovian_pairings WHERE user_id = r.user_id AND cue_id = v_cue.id),
      CASE WHEN v_is_trigger THEN 'trigger_deploy' ELSE 'pairing' END,
      r.current_arousal, v_outreach, v_decree,
      'auto-queued by pavlovian_eval');

    v_queued := v_queued + 1;
  END LOOP;
  RETURN v_queued;
END;
$fn$;

GRANT EXECUTE ON FUNCTION pavlovian_eval() TO service_role;

-- Trigger: when handler_decrees with trigger_source='pavlovian_pairing' flips to
-- fulfilled, increment intensity_count
CREATE OR REPLACE FUNCTION trg_pavlovian_increment_on_fulfilled()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE v_cue_key TEXT; v_user UUID;
BEGIN
  IF NEW.status <> 'fulfilled' OR COALESCE(OLD.status,'') = 'fulfilled' THEN RETURN NEW; END IF;
  IF NEW.trigger_source NOT IN ('pavlovian_pairing','pavlovian_trigger') THEN RETURN NEW; END IF;

  -- Extract cue_key from reasoning
  v_cue_key := (regexp_match(NEW.reasoning, 'cue_key=([a-z_]+)'))[1];
  IF v_cue_key IS NULL THEN RETURN NEW; END IF;

  IF NEW.trigger_source = 'pavlovian_pairing' THEN
    UPDATE pavlovian_pairings pp
    SET intensity_count = intensity_count + 1,
        last_paired_at = now(),
        updated_at = now()
    FROM pavlovian_cues pc
    WHERE pp.cue_id = pc.id AND pp.user_id = NEW.user_id AND pc.cue_key = v_cue_key;
  ELSE
    -- trigger_deploy fulfilled = Mama deployed it and Maxy did the deploy
    UPDATE pavlovian_pairings pp
    SET deployed_as_trigger_at = now(),
        updated_at = now()
    FROM pavlovian_cues pc
    WHERE pp.cue_id = pc.id AND pp.user_id = NEW.user_id AND pc.cue_key = v_cue_key;
  END IF;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS pavlovian_increment_on_fulfilled ON handler_decrees;
CREATE TRIGGER pavlovian_increment_on_fulfilled
  AFTER UPDATE OF status ON handler_decrees
  FOR EACH ROW EXECUTE FUNCTION trg_pavlovian_increment_on_fulfilled();

-- Activate for both users
INSERT INTO pavlovian_settings (user_id, enabled, pairing_arousal_min, max_pairings_per_day)
VALUES
  ('8c69b9c8-34eb-4147-9fec-3c1a5bc74b6f', TRUE, 4, 2),
  ('93327332-7d0d-4888-889a-1607a5776216', TRUE, 4, 2)
ON CONFLICT (user_id) DO UPDATE SET enabled = TRUE, updated_at = now();

-- Cron: every 15 minutes (state-paired cadence so we catch arousal peaks)
DO $do$ BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname='pavlovian-pairing-15min') THEN
    PERFORM cron.unschedule('pavlovian-pairing-15min');
  END IF;
EXCEPTION WHEN undefined_table THEN NULL; END $do$;

DO $do$ BEGIN
  PERFORM cron.schedule('pavlovian-pairing-15min', '*/15 * * * *',
    $cron$SELECT pavlovian_eval()$cron$);
EXCEPTION WHEN undefined_table THEN NULL; END $do$;
