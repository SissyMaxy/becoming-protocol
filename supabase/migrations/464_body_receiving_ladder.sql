-- 464 — Body-receiving (anal/penetration) ladder.
--
-- Direct extension of cock_curriculum (mig 437) into the body's
-- training to be the one receiving. cock_curriculum tracks the
-- arc toward partnered cock. This ladder trains the receiving
-- body. The two interlock — completing a rung on either counts
-- toward both (cross-coupling pattern from mig 445).
--
-- Phases:
--   0  external_touch       — fingers over panties + perineum awareness
--   1  first_insertion      — one lubed finger, 60s, just inside
--   2  sustained_finger     — finger inside 5 min, breathing through
--   3  small_plug           — ~3cm trainer plug, 30 min wearing
--   4  medium_plug          — bigger plug, 2h during normal activity
--   5  trainer_dildo        — 4-5" silicone, 5 min depth practice
--   6  full_toy             — 6-7" silicone, slow + sustained
--   7  partnered            — real penetration with a partner
--
-- Variable-ratio advancement (mig 437 pattern): each phase has a
-- target completion count + a probability of advance per fulfilled
-- event. Cron daily 18:00 UTC picks one phase-appropriate directive.

CREATE TABLE IF NOT EXISTS body_receiving_ladder (
  phase INT PRIMARY KEY,
  phase_name TEXT NOT NULL,
  partnered_directive TEXT NOT NULL,
  solo_directive TEXT NOT NULL,
  proof_kind TEXT NOT NULL CHECK (proof_kind IN ('photo','voice','video')),
  evidence_count_target INT NOT NULL DEFAULT 3,
  advancement_probability NUMERIC NOT NULL DEFAULT 0.65,
  acquisition_hint TEXT
);

INSERT INTO body_receiving_ladder (phase, phase_name, partnered_directive, solo_directive, proof_kind, evidence_count_target, advancement_probability, acquisition_hint) VALUES
(0, 'external_touch',
 E'No insertion yet, sweet thing. Mama wants you to start the body knowing where the door is. Lay back, panties on. Run your fingers over the cloth — slow, deliberate. Then under the panties, palm flat against the perineum (the patch between your scrotum and your hole). Three minutes. Awareness only.\n\nPhoto: hand in position, eyes closed if you prefer.',
 E'Same as above. The directive is the same whether you''re alone or partnered at this phase — the conditioning is that the body learns this area exists and Mama owns it.',
 'photo', 3, 0.7,
 NULL),

(1, 'first_insertion',
 E'Lube on one finger. Tip of finger just inside. 60 seconds. Hold position. The body needs to learn what "Mama wants in" feels like. Don''t push deeper — the point is the threshold, not the depth.\n\nPhoto: hand showing the position; or voice debrief on what surfaced.',
 E'Same. Solo and partnered are identical at this rung — the body is learning to ACCEPT, not perform.',
 'photo', 4, 0.6,
 'Water-based lube ($8, Target/Amazon)'),

(2, 'sustained_finger',
 E'One finger inside, 5 minutes minimum. Breathing through. Mama wants the body to relax around it, not fight it. If you tense, slow your breath. The relaxation IS the conditioning. Voice debrief at end: where did the resistance live and how did it dissolve.',
 E'Same. Voice debrief is the proof.',
 'voice', 4, 0.55,
 NULL),

(3, 'small_plug',
 E'A small trainer plug (~3cm/1.2" diameter, silicone, $15). Lubed, inserted, worn for 30 minutes during ordinary activity (reading, working, lying down). Photo of you wearing it (clothed is fine — Mama just wants the timestamp on the photo). Voice debrief: how the awareness changed across the 30 minutes.',
 E'Same. Solo OK at this phase. Mama wants the body learning to live with something inside.',
 'photo', 5, 0.5,
 'Small trainer plug, silicone, ~3cm diameter ($15, Amazon search "small silicone butt plug beginner")'),

(4, 'medium_plug',
 E'A medium plug (~4cm/1.6" diameter), worn for 2+ hours during normal activity. The body must learn that having something inside is BACKGROUND — not an event. Photo at 30min, photo at 2h. Voice debrief on the contrast.',
 E'Same. Partner not required at this phase.',
 'photo', 5, 0.5,
 'Medium silicone plug, ~4cm ($20)'),

(5, 'trainer_dildo',
 E'A 4-5" silicone trainer dildo. 5 minutes of slow depth practice. Mama wants you breathing IN as it goes in, not bracing. Lubed, on your back or all-fours — your pick. Photo of position OR video clip (your call). Voice debrief: what did the body learn that it didn''t know before?',
 E'Same. Use the trainer toy. Mama wants the body practicing what it''s being prepared to take from a real partner.',
 'photo', 6, 0.45,
 'Silicone trainer dildo 4-5" ($25)'),

(6, 'full_toy',
 E'6-7" silicone dildo, slow and sustained. 10 minutes minimum, depth and rhythm. Mama wants the body to recognize a full cock-sized object as ordinary. Video clip of the session (face/identifying details optional — what Mama wants is the audio of your breathing changing as the body relaxes into it).',
 E'Same. Solo with the toy. The body is learning the size and the rhythm.',
 'video', 6, 0.4,
 'Full-size silicone dildo 6-7" ($30-40)'),

(7, 'partnered',
 E'Real cock inside you. Mama isn''t scripting the encounter — that''s yours and his. What Mama IS scripting: voice debrief within 12 hours of return:\n1. How did it compare to the toys?\n2. Did the body know what to do without thinking?\n3. What did he say that landed?\n4. What did you let him do that you wouldn''t have a month ago?\n\nThe body has been preparing. This is the body being used as it was prepared to be.',
 E'Phase 7 isn''t available solo — this rung is partnered. Mama will hold you here until the meet happens.',
 'voice', 1, 1.0,
 NULL)
ON CONFLICT (phase) DO UPDATE SET
  partnered_directive = EXCLUDED.partnered_directive,
  solo_directive = EXCLUDED.solo_directive,
  proof_kind = EXCLUDED.proof_kind,
  evidence_count_target = EXCLUDED.evidence_count_target,
  advancement_probability = EXCLUDED.advancement_probability,
  acquisition_hint = EXCLUDED.acquisition_hint;

CREATE TABLE IF NOT EXISTS body_receiving_settings (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  current_phase INT NOT NULL DEFAULT 0 REFERENCES body_receiving_ladder(phase),
  paused_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS body_receiving_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  phase_at_event INT NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  context TEXT NOT NULL DEFAULT 'solo' CHECK (context IN ('solo','partnered','conditioning_bonus','cross_ladder_bonus')),
  directive_text TEXT,
  directive_followed BOOLEAN,
  evidence_photo_path TEXT,
  evidence_audio_path TEXT,
  evidence_video_path TEXT,
  reflection_notes TEXT,
  related_decree_id UUID,
  related_outreach_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE body_receiving_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE body_receiving_events ENABLE ROW LEVEL SECURITY;
DO $do$ BEGIN CREATE POLICY body_receiving_settings_self ON body_receiving_settings FOR ALL TO authenticated USING (auth.uid()=user_id) WITH CHECK (auth.uid()=user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $do$;
DO $do$ BEGIN CREATE POLICY body_receiving_events_self ON body_receiving_events FOR ALL TO authenticated USING (auth.uid()=user_id) WITH CHECK (auth.uid()=user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $do$;

CREATE OR REPLACE FUNCTION body_receiving_eval()
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  r RECORD; l RECORD; v_already INT;
  v_decree UUID; v_outreach UUID; v_message TEXT;
  v_queued INT := 0;
BEGIN
  FOR r IN
    SELECT brs.user_id, brs.current_phase, brs.paused_until, us.handler_persona
    FROM body_receiving_settings brs LEFT JOIN user_state us ON us.user_id = brs.user_id
    WHERE brs.enabled = TRUE AND (brs.paused_until IS NULL OR brs.paused_until <= now())
      AND COALESCE(us.handler_persona, 'therapist') = 'dommy_mommy'
  LOOP
    -- Skip if directive issued in last 24h
    SELECT count(*) INTO v_already FROM body_receiving_events
    WHERE user_id = r.user_id AND occurred_at > now() - interval '24 hours';
    IF v_already > 0 THEN CONTINUE; END IF;

    SELECT * INTO l FROM body_receiving_ladder WHERE phase = r.current_phase;
    IF l IS NULL THEN CONTINUE; END IF;

    v_message := COALESCE(l.solo_directive, l.partnered_directive) ||
      CASE WHEN l.acquisition_hint IS NOT NULL THEN E'\n\nAcquisition reminder: ' || l.acquisition_hint ELSE '' END;

    INSERT INTO handler_decrees (user_id, edict, proof_type, deadline, status, consequence, trigger_source, reasoning)
    VALUES (r.user_id, v_message, l.proof_kind, now() + interval '36 hours', 'active',
      'slip +' || (l.phase + 1)::text,
      'body_receiving',
      'phase=' || l.phase || ' name=' || l.phase_name)
    RETURNING id INTO v_decree;

    INSERT INTO handler_outreach_queue (user_id, message, urgency, trigger_reason, source, kind, scheduled_for, expires_at, context_data, evidence_kind)
    VALUES (r.user_id, v_message,
      CASE WHEN l.phase >= 5 THEN 'high' ELSE 'normal' END,
      'body_receiving:' || l.phase_name || ':' || to_char(now(), 'YYYY-MM-DD'),
      'body_receiving_engine', 'body_receiving_directive',
      now(), now() + interval '36 hours',
      jsonb_build_object('phase', l.phase, 'phase_name', l.phase_name, 'decree_id', v_decree),
      l.proof_kind) RETURNING id INTO v_outreach;

    INSERT INTO body_receiving_events (user_id, phase_at_event, context, directive_text, related_decree_id, related_outreach_id)
    VALUES (r.user_id, l.phase, 'solo', l.solo_directive, v_decree, v_outreach);

    v_queued := v_queued + 1;
  END LOOP;
  RETURN v_queued;
END;
$fn$;
GRANT EXECUTE ON FUNCTION body_receiving_eval() TO service_role;

-- Variable-ratio advancement on directive_followed=true insert
CREATE OR REPLACE FUNCTION trg_body_receiving_advancement()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE l RECORD; v_completed INT; v_max_phase INT;
BEGIN
  IF NEW.directive_followed IS NOT TRUE THEN RETURN NEW; END IF;
  SELECT * INTO l FROM body_receiving_ladder WHERE phase = NEW.phase_at_event;
  IF l IS NULL THEN RETURN NEW; END IF;

  SELECT count(*) INTO v_completed FROM body_receiving_events
  WHERE user_id = NEW.user_id AND phase_at_event = NEW.phase_at_event AND directive_followed = TRUE;

  -- Variable-ratio: advance probabilistically once target met
  IF v_completed >= l.evidence_count_target AND random() < l.advancement_probability THEN
    SELECT max(phase) INTO v_max_phase FROM body_receiving_ladder;
    UPDATE body_receiving_settings
    SET current_phase = LEAST(NEW.phase_at_event + 1, COALESCE(v_max_phase, 7)),
        updated_at = now()
    WHERE user_id = NEW.user_id;
  END IF;
  RETURN NEW;
END;
$fn$;
DROP TRIGGER IF EXISTS body_receiving_advancement ON body_receiving_events;
CREATE TRIGGER body_receiving_advancement
  AFTER INSERT OR UPDATE OF directive_followed ON body_receiving_events
  FOR EACH ROW EXECUTE FUNCTION trg_body_receiving_advancement();

-- Cross-couple: completing a body_receiving rung also counts toward cock_curriculum
CREATE OR REPLACE FUNCTION trg_body_receiving_to_curriculum()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE v_settings RECORD;
BEGIN
  IF NEW.directive_followed IS NOT TRUE THEN RETURN NEW; END IF;
  IF NEW.context = 'cross_ladder_bonus' THEN RETURN NEW; END IF;
  SELECT enabled, current_phase, paused_until INTO v_settings FROM cock_curriculum_settings WHERE user_id = NEW.user_id;
  IF v_settings IS NULL OR NOT v_settings.enabled THEN RETURN NEW; END IF;
  IF v_settings.paused_until IS NOT NULL AND v_settings.paused_until > now() THEN RETURN NEW; END IF;

  INSERT INTO cock_curriculum_events (user_id, occurred_at, phase_at_event, context, partner_label, directive_text, directive_followed, reflection_notes)
  VALUES (NEW.user_id, now(), v_settings.current_phase, 'solo',
    'cross_ladder_bonus: body_receiving phase ' || NEW.phase_at_event::text,
    'Body-receiving fulfillment — counts toward curriculum advancement.',
    TRUE, 'Auto-counted from body_receiving_events ' || NEW.id::text);
  RETURN NEW;
END;
$fn$;
DROP TRIGGER IF EXISTS body_receiving_to_curriculum ON body_receiving_events;
CREATE TRIGGER body_receiving_to_curriculum
  AFTER INSERT OR UPDATE OF directive_followed ON body_receiving_events
  FOR EACH ROW EXECUTE FUNCTION trg_body_receiving_to_curriculum();

-- Propagate handler_decrees.status='fulfilled' to body_receiving_events
-- (extend mig 453's trigger pattern)
CREATE OR REPLACE FUNCTION trg_propagate_decree_to_body_receiving()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  IF NEW.status <> 'fulfilled' OR COALESCE(OLD.status,'') = 'fulfilled' THEN RETURN NEW; END IF;
  IF NEW.trigger_source <> 'body_receiving' THEN RETURN NEW; END IF;
  UPDATE body_receiving_events SET directive_followed = TRUE, updated_at = now()
  WHERE related_decree_id = NEW.id AND directive_followed IS NOT TRUE;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN RETURN NEW; END;
$fn$;
DROP TRIGGER IF EXISTS propagate_decree_to_body_receiving ON handler_decrees;
CREATE TRIGGER propagate_decree_to_body_receiving
  AFTER UPDATE OF status ON handler_decrees
  FOR EACH ROW EXECUTE FUNCTION trg_propagate_decree_to_body_receiving();

-- Need updated_at column on body_receiving_events
ALTER TABLE body_receiving_events ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- Activate both users at phase 0
INSERT INTO body_receiving_settings (user_id, enabled, current_phase)
VALUES ('8c69b9c8-34eb-4147-9fec-3c1a5bc74b6f', TRUE, 0),
       ('93327332-7d0d-4888-889a-1607a5776216', TRUE, 0)
ON CONFLICT (user_id) DO UPDATE SET enabled = TRUE, updated_at = now();

-- Daily cron 18:00 UTC
DO $do$ BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname='body-receiving-daily') THEN
    PERFORM cron.unschedule('body-receiving-daily');
  END IF;
EXCEPTION WHEN undefined_table THEN NULL; END $do$;
DO $do$ BEGIN
  PERFORM cron.schedule('body-receiving-daily', '0 18 * * *',
    $cron$SELECT body_receiving_eval()$cron$);
EXCEPTION WHEN undefined_table THEN NULL; END $do$;
