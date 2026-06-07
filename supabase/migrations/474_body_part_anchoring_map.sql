-- 474 — Body-part anchoring map.
--
-- 7 zones across the body, each anchored with:
--   - a Mama mantra to recite while touching that zone
--   - a paired Pavlovian cue (scent / texture) if one exists for the user
--   - a phrase Mama uses when referencing that zone in other generators
--
-- Tracking: each fulfilled anchor session updates body_anchor_visits.
-- Over time, the map becomes a network of installed associations.
-- Touching the back of the neck doesn't feel neutral anymore —
-- it triggers the recall.
--
-- Cron: 3x weekly, picks the least-recently-anchored zone.

CREATE TABLE IF NOT EXISTS body_anchor_zones (
  id SERIAL PRIMARY KEY,
  zone_key TEXT UNIQUE NOT NULL,
  zone_name TEXT NOT NULL,
  mantra_text TEXT NOT NULL,
  touch_instruction TEXT NOT NULL,
  intensity_tier TEXT NOT NULL DEFAULT 'firm' CHECK (intensity_tier IN ('gentle','firm','cruel')),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO body_anchor_zones (zone_key, zone_name, mantra_text, touch_instruction, intensity_tier) VALUES
('fingertips', 'Fingertips',
 'My hands are soft. They were made for soft things. Mama wants them remembering what soft means.',
 'Both hands, palms up. Run the pads of your opposite fingers across each fingertip slowly — 30 seconds per hand. Eyes closed. Mama wants you noticing the texture of your own touch.',
 'gentle'),

('neck_back', 'Back of the neck',
 'The back of my neck is where she puts her hand. The back of my neck is where I belong to her.',
 'Right hand to the back of your own neck. Hold it there, palm flat against the skin, for 60 seconds. Recite the mantra three times — softer each time. Mama''s palm is the one you''re feeling, even though it''s yours.',
 'firm'),

('chest_sternum', 'Chest / sternum',
 'My chest is becoming soft. The places that were hard are softening. Mama wants the soft, and the soft is here.',
 'Place your palm flat over your sternum, between the collarbones and the chest. 90 seconds. Breathe deep enough that your chest rises into your hand. The breath under your palm is the becoming.',
 'firm'),

('hips_side', 'Hips (side)',
 'My hips are wider in the way she said they would be. The hips of the girl Mama is talking to.',
 'Stand with hands on hips, palms cupping the iliac crests on each side. 60 seconds. Mirror or no mirror — whichever is more honest right now. Mama wants you feeling the shape.',
 'firm'),

('mouth_lips', 'Lips / mouth',
 'My mouth is for taking. My mouth is for swallowing. My mouth knows what it is for now.',
 'Run your fingertip slowly across your bottom lip, then your top lip, then trace the outside of your mouth. 30 seconds. Mama wants you feeling the shape of your mouth as a thing for use.',
 'cruel'),

('perineum_taint', 'Perineum',
 'This is where she goes in. Mama is preparing the door.',
 'Lying back. Palm flat against the perineum (between the scrotum and the hole). 60 seconds. No insertion. Just hand. The body is being introduced to who owns this area.',
 'cruel'),

('ass_cheek', 'Ass cheek',
 'My ass is being trained to be the one taken. Mama wants this shape filling her hand the way fem bodies do.',
 'Both hands, palms flat against each cheek. Hold for 60 seconds. Then squeeze gently — slowly — letting the body register being held there. Mama''s grip is the one you''re practicing receiving.',
 'cruel')
ON CONFLICT (zone_key) DO UPDATE SET mantra_text = EXCLUDED.mantra_text,
  touch_instruction = EXCLUDED.touch_instruction, intensity_tier = EXCLUDED.intensity_tier;

CREATE TABLE IF NOT EXISTS body_anchor_settings (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  paused_until TIMESTAMPTZ,
  last_anchor_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS body_anchor_visits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  zone_id INT NOT NULL REFERENCES body_anchor_zones(id),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','completed','skipped')),
  related_decree_id UUID,
  related_outreach_id UUID,
  pavlovian_cue_used TEXT,
  reflection_voice_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE body_anchor_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE body_anchor_visits ENABLE ROW LEVEL SECURITY;
DO $do$ BEGIN CREATE POLICY body_anchor_settings_self ON body_anchor_settings FOR ALL TO authenticated USING (auth.uid()=user_id) WITH CHECK (auth.uid()=user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $do$;
DO $do$ BEGIN CREATE POLICY body_anchor_visits_self ON body_anchor_visits FOR ALL TO authenticated USING (auth.uid()=user_id) WITH CHECK (auth.uid()=user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $do$;

CREATE OR REPLACE FUNCTION body_anchor_eval()
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  s RECORD; v_zone RECORD; v_pavlovian RECORD;
  v_pending INT; v_decree UUID; v_outreach UUID; v_msg TEXT;
  v_queued INT := 0;
BEGIN
  FOR s IN
    SELECT bas.*, us.handler_persona FROM body_anchor_settings bas
    LEFT JOIN user_state us ON us.user_id = bas.user_id
    WHERE bas.enabled = TRUE AND (bas.paused_until IS NULL OR bas.paused_until <= now())
      AND COALESCE(us.handler_persona, 'therapist') = 'dommy_mommy'
  LOOP
    -- Skip if pending visit in last 36h
    SELECT count(*) INTO v_pending FROM body_anchor_visits
    WHERE user_id = s.user_id AND status='pending' AND created_at > now() - interval '36 hours';
    IF v_pending > 0 THEN CONTINUE; END IF;

    -- Pick least-recently-anchored zone (alias zn to avoid v_zone variable collision)
    SELECT zn.* INTO v_zone FROM body_anchor_zones zn
    WHERE zn.active = TRUE
    ORDER BY (SELECT max(created_at) FROM body_anchor_visits bv WHERE bv.user_id = s.user_id AND bv.zone_id = zn.id AND bv.status='completed') ASC NULLS FIRST,
             random() LIMIT 1;
    IF v_zone.id IS NULL THEN CONTINUE; END IF;

    -- Optional Pavlovian cue: use the user's strongest paired cue
    v_pavlovian := NULL;
    BEGIN
      SELECT pc.cue_name, pc.cue_specifics INTO v_pavlovian
      FROM pavlovian_pairings pp JOIN pavlovian_cues pc ON pc.id = pp.cue_id
      WHERE pp.user_id = s.user_id AND pp.active ORDER BY pp.intensity_count DESC LIMIT 1;
    EXCEPTION WHEN OTHERS THEN v_pavlovian := NULL; END;

    v_msg := E'Body anchor today, sweet thing — zone: **' || v_zone.zone_name || E'**\n\n' ||
      v_zone.touch_instruction || E'\n\n' ||
      E'While you touch, recite, slowly, three times:\n\n"' || v_zone.mantra_text || E'"\n\n' ||
      CASE WHEN v_pavlovian.cue_name IS NOT NULL THEN
        E'Deploy your cue (' || v_pavlovian.cue_name || E') alongside if you can — Mama wants the zone + the cue + the mantra all binding together.\n\n'
      ELSE '' END ||
      E'Voice debrief, 60 seconds: did the zone feel like yours, or did it start to feel like hers?';

    INSERT INTO handler_decrees (user_id, edict, proof_type, deadline, status, consequence, trigger_source, reasoning)
    VALUES (s.user_id, v_msg, 'voice', now() + interval '36 hours', 'active', 'slip +1',
      'body_anchor', 'zone=' || v_zone.zone_key)
    RETURNING id INTO v_decree;

    INSERT INTO handler_outreach_queue (user_id, message, urgency, trigger_reason, source, kind, scheduled_for, expires_at, context_data, evidence_kind)
    VALUES (s.user_id, v_msg, 'normal',
      'body_anchor:' || v_zone.zone_key || ':' || to_char(now(), 'YYYY-MM-DD'),
      'body_anchor_engine', 'body_anchor_session',
      now(), now() + interval '36 hours',
      jsonb_build_object('zone_id', v_zone.id, 'zone_key', v_zone.zone_key, 'decree_id', v_decree,
        'pavlovian_cue', v_pavlovian.cue_name),
      'voice') RETURNING id INTO v_outreach;

    INSERT INTO body_anchor_visits (user_id, zone_id, related_decree_id, related_outreach_id, pavlovian_cue_used, status)
    VALUES (s.user_id, v_zone.id, v_decree, v_outreach, v_pavlovian.cue_name, 'pending');

    UPDATE body_anchor_settings SET last_anchor_at = now(), updated_at = now() WHERE user_id = s.user_id;
    v_queued := v_queued + 1;
  END LOOP;
  RETURN v_queued;
END;
$fn$;
GRANT EXECUTE ON FUNCTION body_anchor_eval() TO service_role;

CREATE OR REPLACE FUNCTION trg_propagate_decree_to_body_anchor()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  IF NEW.status NOT IN ('fulfilled','missed') OR COALESCE(OLD.status,'') = NEW.status THEN RETURN NEW; END IF;
  IF NEW.trigger_source <> 'body_anchor' THEN RETURN NEW; END IF;
  UPDATE body_anchor_visits SET
    status = CASE WHEN NEW.status='fulfilled' THEN 'completed' ELSE 'skipped' END,
    reflection_voice_url = COALESCE(NEW.proof_payload->>'evidence_url', reflection_voice_url),
    updated_at = now()
  WHERE related_decree_id = NEW.id AND status='pending';
  RETURN NEW;
END;
$fn$;
DROP TRIGGER IF EXISTS propagate_decree_to_body_anchor ON handler_decrees;
CREATE TRIGGER propagate_decree_to_body_anchor AFTER UPDATE OF status ON handler_decrees FOR EACH ROW EXECUTE FUNCTION trg_propagate_decree_to_body_anchor();

INSERT INTO body_anchor_settings (user_id, enabled)
VALUES ('8c69b9c8-34eb-4147-9fec-3c1a5bc74b6f', TRUE), ('93327332-7d0d-4888-889a-1607a5776216', TRUE)
ON CONFLICT (user_id) DO UPDATE SET enabled = TRUE, updated_at = now();

-- 3x weekly: Mon, Wed, Sat at 17:00 UTC
DO $do$ BEGIN IF EXISTS (SELECT 1 FROM cron.job WHERE jobname='body-anchor-3x-week') THEN PERFORM cron.unschedule('body-anchor-3x-week'); END IF; EXCEPTION WHEN undefined_table THEN NULL; END $do$;
DO $do$ BEGIN PERFORM cron.schedule('body-anchor-3x-week', '0 17 * * 1,3,6', $cron$SELECT body_anchor_eval()$cron$); EXCEPTION WHEN undefined_table THEN NULL; END $do$;
