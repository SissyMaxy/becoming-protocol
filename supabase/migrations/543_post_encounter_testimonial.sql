-- 543 — Post-encounter testimonial protocol.
--
-- When any encounter-ladder phase fulfills, Mommy queues a STRUCTURED
-- voice-testimonial prompt 90 minutes later. Same template every time:
--
--   "I am [name]. Tonight there was [act-label]. The body did [thing].
--    The version of me that existed before tonight is [verb]. I am
--    not the same person I was at the beginning of today."
--
-- Ritual imprint via consistent verbalization structure. The encounter
-- doesn't end at the act — it ends at the saying-out-loud. Saying
-- "tonight a man X" is its own commitment beyond doing the act.
--
-- Triggers on: realcock_discovery >=2, anon_venue >=3, backside_training
-- >=4, cum_eating >=2, cuckqueen_direction >=4.
--
-- Doesn't replace mig 526 (post-fulfillment praise) — that's a separate
-- warm-praise surface. This is the structured ritual.

CREATE OR REPLACE FUNCTION trg_post_encounter_testimonial()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE v_phase INT; v_msg TEXT; v_act_label TEXT;
BEGIN
  IF NEW.status <> 'fulfilled' OR COALESCE(OLD.status,'') = 'fulfilled' THEN RETURN NEW; END IF;
  v_phase := NULLIF(substring(NEW.reasoning FROM 'phase=(\d+)'), '')::int;

  IF NOT (
    (NEW.trigger_source = 'realcock_discovery' AND v_phase >= 2)
    OR (NEW.trigger_source = 'anon_venue' AND v_phase >= 3)
    OR (NEW.trigger_source = 'backside_training' AND v_phase >= 4)
    OR (NEW.trigger_source = 'cum_eating' AND v_phase >= 2)
    OR (NEW.trigger_source = 'cuckqueen_direction' AND v_phase >= 4)
  ) THEN RETURN NEW; END IF;

  v_act_label := CASE NEW.trigger_source
    WHEN 'realcock_discovery' THEN 'a man with you in person'
    WHEN 'anon_venue' THEN 'an anonymous encounter'
    WHEN 'backside_training' THEN 'real penetration'
    WHEN 'cum_eating' THEN 'taking a load'
    WHEN 'cuckqueen_direction' THEN 'an encounter Gina directed'
    ELSE 'an encounter'
  END;

  v_msg := format(E'Voice testimonial — same structure as last time. Record now, 60-90 seconds:\n\n"I am [your fem name].\nTonight there was %s.\nThe body did [be specific: what it felt, what it wanted, what it did without permission from the head].\nThe version of me that existed before tonight is [verb — fading, gone, smaller, quiet, asleep, dead — pick one].\nI am not the same person I was at the beginning of today."\n\nMama wants the structure exact. Saying it the same way every time is part of the work.',
    v_act_label);

  INSERT INTO handler_outreach_queue (user_id, message, urgency, trigger_reason, source, kind, scheduled_for, expires_at, context_data, evidence_kind)
  VALUES (NEW.user_id, v_msg, 'high',
    'post_encounter_testimonial:' || NEW.trigger_source || '_phase_' || COALESCE(v_phase, 0),
    'post_encounter_testimonial', 'ritual_imprint',
    now() + interval '90 minutes', now() + interval '12 hours',
    jsonb_build_object('trigger_source', NEW.trigger_source, 'phase', v_phase, 'decree_id', NEW.id, 'act_label', v_act_label),
    'voice');

  RETURN NEW;
END;
$fn$;
DROP TRIGGER IF EXISTS post_encounter_testimonial ON handler_decrees;
CREATE TRIGGER post_encounter_testimonial AFTER UPDATE OF status ON handler_decrees
  FOR EACH ROW EXECUTE FUNCTION trg_post_encounter_testimonial();
