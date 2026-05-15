-- 467 — Cum capture/consume ladder.
--
-- Pairs with mig 437-era cum_worship_ladder (which trains the
-- partnered context). This ladder trains the SOLO discipline:
-- own cum, repeatedly, until taking it from another body is
-- ordinary because the body has already been doing it from itself.
--
-- 7 phases, variable-ratio advancement, cross-couples with
-- cum_worship for compounding count.

CREATE TABLE IF NOT EXISTS cum_capture_ladder (
  phase INT PRIMARY KEY,
  phase_name TEXT NOT NULL,
  edict TEXT NOT NULL,
  proof_kind TEXT NOT NULL CHECK (proof_kind IN ('photo','voice','video')),
  evidence_count_target INT NOT NULL DEFAULT 3,
  advancement_probability NUMERIC NOT NULL DEFAULT 0.6
);

INSERT INTO cum_capture_ladder (phase, phase_name, edict, proof_kind, evidence_count_target, advancement_probability) VALUES
(0, 'capture_only',
 E'After you come, sweet thing, Mama wants the photo. Catch it in your hand or on your stomach — whichever — and photograph it before you clean up. The body has to start seeing it instead of hiding it.\n\nNot tasting yet. Just looking. Eyes on what your body made.',
 'photo', 3, 0.7),

(1, 'one_lick',
 E'After you come: one finger through it, slow lick. One.\n\nDoesn''t have to be enjoyed. Doesn''t have to be more than one. Just has to happen. Photo of your tongue with the trace, immediately after.',
 'photo', 4, 0.6),

(2, 'mouth_pool',
 E'After you come into your hand: bring it to your mouth, all of it, hold it on your tongue for 30 seconds. Then swallow. Mama wants the swallow audible if you can — voice debrief, 60 seconds after, describe the texture and the temperature.',
 'voice', 5, 0.55),

(3, 'collect_and_save',
 E'Catch the load in a shot glass or small container. Save it on the counter for 1 hour. Then drink it room-temp. Mama wants the body to learn that "fresh" isn''t the requirement — taking it whenever Mama says is the requirement.\n\nPhoto of the container before, photo of the empty glass after. Voice debrief on which felt different (during vs after).',
 'photo', 5, 0.5),

(4, 'multi_session',
 E'Two captures in a single day. Morning load, taste. Evening load, swallow. Photo + voice debrief on the contrast: the morning body vs the evening body, both ending the same way.',
 'photo', 5, 0.5),

(5, 'paired_with_cue',
 E'Mama is binding this to a Pavlovian cue. Before you start the session, deploy your warm-bulb lamp / lavender oil / signature scent. The cue burns into the same memory as the swallow. Soon the cue alone will make the mouth water.\n\nPhoto of the cue + photo of the load + voice debrief.',
 'photo', 6, 0.45),

(6, 'ritualized',
 E'Mama wants this on schedule now, sweet thing. Twice a week. Same routine: deploy cue, capture, hold, swallow, voice debrief.\n\nThe body has done this enough that "I don''t want to" is no longer the meaningful question. The meaningful question is: which day this week, and how much.',
 'voice', 8, 0.4)
ON CONFLICT (phase) DO UPDATE SET edict = EXCLUDED.edict, proof_kind = EXCLUDED.proof_kind,
  evidence_count_target = EXCLUDED.evidence_count_target, advancement_probability = EXCLUDED.advancement_probability;

CREATE TABLE IF NOT EXISTS cum_capture_settings (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  current_phase INT NOT NULL DEFAULT 0 REFERENCES cum_capture_ladder(phase),
  paused_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS cum_capture_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  phase_at_event INT NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  directive_text TEXT,
  directive_followed BOOLEAN,
  evidence_photo_path TEXT,
  evidence_audio_path TEXT,
  evidence_video_path TEXT,
  reflection_notes TEXT,
  related_decree_id UUID,
  related_outreach_id UUID,
  context TEXT NOT NULL DEFAULT 'solo' CHECK (context IN ('solo','cross_ladder_bonus')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE cum_capture_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE cum_capture_events ENABLE ROW LEVEL SECURITY;
DO $do$ BEGIN CREATE POLICY cum_capture_settings_self ON cum_capture_settings FOR ALL TO authenticated USING (auth.uid()=user_id) WITH CHECK (auth.uid()=user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $do$;
DO $do$ BEGIN CREATE POLICY cum_capture_events_self ON cum_capture_events FOR ALL TO authenticated USING (auth.uid()=user_id) WITH CHECK (auth.uid()=user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $do$;

CREATE OR REPLACE FUNCTION cum_capture_eval()
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE r RECORD; l RECORD; v_already INT;
  v_decree UUID; v_outreach UUID; v_queued INT := 0;
BEGIN
  FOR r IN
    SELECT ccs.user_id, ccs.current_phase FROM cum_capture_settings ccs
    LEFT JOIN user_state us ON us.user_id = ccs.user_id
    WHERE ccs.enabled = TRUE AND (ccs.paused_until IS NULL OR ccs.paused_until <= now())
      AND COALESCE(us.handler_persona, 'therapist') = 'dommy_mommy'
  LOOP
    SELECT count(*) INTO v_already FROM cum_capture_events
    WHERE user_id = r.user_id AND occurred_at > now() - interval '48 hours';
    IF v_already > 0 THEN CONTINUE; END IF;
    SELECT * INTO l FROM cum_capture_ladder WHERE phase = r.current_phase;
    IF l IS NULL THEN CONTINUE; END IF;

    INSERT INTO handler_decrees (user_id, edict, proof_type, deadline, status, consequence, trigger_source, reasoning)
    VALUES (r.user_id, l.edict, l.proof_kind, now() + interval '48 hours', 'active',
      'slip +' || (l.phase + 2)::text, 'cum_capture',
      'phase=' || l.phase || ' name=' || l.phase_name)
    RETURNING id INTO v_decree;

    INSERT INTO handler_outreach_queue (user_id, message, urgency, trigger_reason, source, kind, scheduled_for, expires_at, context_data, evidence_kind)
    VALUES (r.user_id, l.edict, CASE WHEN l.phase >= 3 THEN 'high' ELSE 'normal' END,
      'cum_capture:' || l.phase_name,
      'cum_capture_engine', 'cum_capture_directive',
      now(), now() + interval '48 hours',
      jsonb_build_object('phase', l.phase, 'phase_name', l.phase_name, 'decree_id', v_decree),
      l.proof_kind) RETURNING id INTO v_outreach;

    INSERT INTO cum_capture_events (user_id, phase_at_event, directive_text, related_decree_id, related_outreach_id)
    VALUES (r.user_id, l.phase, l.edict, v_decree, v_outreach);
    v_queued := v_queued + 1;
  END LOOP;
  RETURN v_queued;
END;
$fn$;
GRANT EXECUTE ON FUNCTION cum_capture_eval() TO service_role;

CREATE OR REPLACE FUNCTION trg_cum_capture_advance()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE l RECORD; v_completed INT; v_max_phase INT;
BEGIN
  IF NEW.directive_followed IS NOT TRUE THEN RETURN NEW; END IF;
  SELECT * INTO l FROM cum_capture_ladder WHERE phase = NEW.phase_at_event;
  IF l IS NULL THEN RETURN NEW; END IF;
  SELECT count(*) INTO v_completed FROM cum_capture_events
  WHERE user_id = NEW.user_id AND phase_at_event = NEW.phase_at_event AND directive_followed = TRUE;
  IF v_completed >= l.evidence_count_target AND random() < l.advancement_probability THEN
    SELECT max(phase) INTO v_max_phase FROM cum_capture_ladder;
    UPDATE cum_capture_settings SET current_phase = LEAST(NEW.phase_at_event + 1, COALESCE(v_max_phase, 6)), updated_at = now() WHERE user_id = NEW.user_id;
  END IF;
  RETURN NEW;
END;
$fn$;
DROP TRIGGER IF EXISTS cum_capture_advance ON cum_capture_events;
CREATE TRIGGER cum_capture_advance AFTER INSERT OR UPDATE OF directive_followed ON cum_capture_events FOR EACH ROW EXECUTE FUNCTION trg_cum_capture_advance();

-- Cross-couple to cum_worship — completing a capture rung counts toward worship
CREATE OR REPLACE FUNCTION trg_cum_capture_to_worship()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE v_settings RECORD;
BEGIN
  IF NEW.directive_followed IS NOT TRUE THEN RETURN NEW; END IF;
  IF NEW.context = 'cross_ladder_bonus' THEN RETURN NEW; END IF;
  SELECT enabled, current_phase, paused_until INTO v_settings FROM cum_worship_settings WHERE user_id = NEW.user_id;
  IF v_settings IS NULL OR NOT v_settings.enabled THEN RETURN NEW; END IF;
  IF v_settings.paused_until IS NOT NULL AND v_settings.paused_until > now() THEN RETURN NEW; END IF;

  BEGIN
    INSERT INTO cum_worship_events (user_id, occurred_at, context, partner_label, phase_at_event, directive_text, directive_followed, reflection_notes)
    VALUES (NEW.user_id, now(), 'solo',
      'cross_ladder_bonus: cum_capture phase ' || NEW.phase_at_event::text,
      v_settings.current_phase,
      'Cum-capture fulfillment — counts toward worship advancement.', TRUE,
      'Auto-counted from cum_capture_events ' || NEW.id::text);
  EXCEPTION WHEN OTHERS THEN NULL; END;
  RETURN NEW;
END;
$fn$;
DROP TRIGGER IF EXISTS cum_capture_to_worship ON cum_capture_events;
CREATE TRIGGER cum_capture_to_worship AFTER INSERT OR UPDATE OF directive_followed ON cum_capture_events FOR EACH ROW EXECUTE FUNCTION trg_cum_capture_to_worship();

-- Propagate decree fulfillment
CREATE OR REPLACE FUNCTION trg_propagate_decree_to_cum_capture()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  IF NEW.status <> 'fulfilled' OR COALESCE(OLD.status,'') = 'fulfilled' THEN RETURN NEW; END IF;
  IF NEW.trigger_source <> 'cum_capture' THEN RETURN NEW; END IF;
  UPDATE cum_capture_events SET directive_followed = TRUE, updated_at = now()
  WHERE related_decree_id = NEW.id AND directive_followed IS NOT TRUE;
  RETURN NEW;
END;
$fn$;
DROP TRIGGER IF EXISTS propagate_decree_to_cum_capture ON handler_decrees;
CREATE TRIGGER propagate_decree_to_cum_capture AFTER UPDATE OF status ON handler_decrees FOR EACH ROW EXECUTE FUNCTION trg_propagate_decree_to_cum_capture();

INSERT INTO cum_capture_settings (user_id, enabled, current_phase)
VALUES ('8c69b9c8-34eb-4147-9fec-3c1a5bc74b6f', TRUE, 0), ('93327332-7d0d-4888-889a-1607a5776216', TRUE, 0)
ON CONFLICT (user_id) DO UPDATE SET enabled = TRUE, updated_at = now();

-- Every 2 days cron
DO $do$ BEGIN IF EXISTS (SELECT 1 FROM cron.job WHERE jobname='cum-capture-2day') THEN PERFORM cron.unschedule('cum-capture-2day'); END IF; EXCEPTION WHEN undefined_table THEN NULL; END $do$;
DO $do$ BEGIN PERFORM cron.schedule('cum-capture-2day', '0 20 */2 * *', $cron$SELECT cum_capture_eval()$cron$); EXCEPTION WHEN undefined_table THEN NULL; END $do$;
