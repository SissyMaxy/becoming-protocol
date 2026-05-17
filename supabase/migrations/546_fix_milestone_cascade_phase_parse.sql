-- 546 — Validation-pass fix: mig 527 trg_milestone_cascade had dead
-- code parsing reasoning as `(NEW.reasoning::text)::int` BEFORE the
-- regex extraction. Format is 'phase=N', cast fails with "invalid
-- input syntax for type integer". Removed the dead first assignment,
-- kept only the regex variant.

CREATE OR REPLACE FUNCTION trg_milestone_cascade()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE v_phase INT; v_milestone_type TEXT; v_msg TEXT; v_extra_bumps INT := 0;
BEGIN
  IF NEW.status <> 'fulfilled' OR COALESCE(OLD.status,'') = 'fulfilled' THEN RETURN NEW; END IF;
  IF NEW.trigger_source NOT IN ('realcock_discovery','backside_training','cum_eating','dressing_room','pronoun_integration') THEN RETURN NEW; END IF;

  v_phase := NULLIF(substring(NEW.reasoning FROM 'phase=(\d+)'), '')::int;
  IF v_phase IS NULL THEN RETURN NEW; END IF;

  IF NEW.trigger_source = 'realcock_discovery' AND v_phase >= 2 THEN
    UPDATE user_state SET real_cock_encounters = real_cock_encounters + 1,
      first_real_cock_at = COALESCE(first_real_cock_at, now())
    WHERE user_id = NEW.user_id;
    v_milestone_type := 'real_cock_encounter'; v_extra_bumps := 2;
  END IF;
  IF NEW.trigger_source = 'cum_eating' AND v_phase >= 3 THEN
    UPDATE user_state SET first_swallow_at = COALESCE(first_swallow_at, now()) WHERE user_id = NEW.user_id;
    v_milestone_type := 'partner_swallow'; v_extra_bumps := 2;
  END IF;
  IF NEW.trigger_source = 'backside_training' AND v_phase >= 7 THEN
    UPDATE user_state SET first_penetration_at = COALESCE(first_penetration_at, now()) WHERE user_id = NEW.user_id;
    v_milestone_type := 'first_penetration'; v_extra_bumps := 3;
  END IF;
  IF NEW.trigger_source = 'dressing_room' AND v_phase >= 3 THEN
    UPDATE user_state SET first_fem_public_at = COALESCE(first_fem_public_at, now()) WHERE user_id = NEW.user_id;
    v_milestone_type := 'first_fem_public'; v_extra_bumps := 1;
  END IF;
  IF NEW.trigger_source = 'pronoun_integration' AND v_phase >= 5 THEN
    v_milestone_type := 'first_pronoun_irl_ask'; v_extra_bumps := 2;
  END IF;

  IF v_milestone_type IS NULL THEN RETURN NEW; END IF;

  FOR i IN 1..v_extra_bumps LOOP
    PERFORM gina_arc_bump_evidence(NEW.user_id, 'milestone:' || v_milestone_type);
  END LOOP;

  INSERT INTO mommy_authority_log (user_id, action_kind, source_system, action_summary, action_payload)
  VALUES (NEW.user_id, v_milestone_type, 'milestone_cascade',
    'milestone: ' || v_milestone_type || ' from ' || NEW.trigger_source,
    jsonb_build_object('trigger_source', NEW.trigger_source, 'phase', v_phase, 'decree_id', NEW.id, 'arc_bumps', v_extra_bumps));

  v_msg := CASE v_milestone_type
    WHEN 'real_cock_encounter' THEN E'You had real cock in person. Mama wants you to mark it — date, time, what you remember most. This is the before-and-after line. The next encounter starts from a different version of you.'
    WHEN 'partner_swallow' THEN E'You took his load. The body did the thing the head used to argue about. Mama wants the after-taste in a voice memo and Mama wants you to know — this is who you are now.'
    WHEN 'first_penetration' THEN E'You got fucked. Real cock, real entry. Mama is in pieces. The body knows now. Voice debrief — long one — Mama wants everything.'
    WHEN 'first_fem_public' THEN E'You were SEEN in fem. Public. Strangers. You survived. Mama wants you to know that the world didn''t end and you''re still here and you''re different.'
    WHEN 'first_pronoun_irl_ask' THEN E'You asked someone to use your name. Out loud. To a face. Voice debrief: was the worst-case actually as bad as the head said?'
    ELSE E'Milestone reached. Mama saw it. The protocol is doing what it''s built to do.'
  END;

  INSERT INTO handler_outreach_queue (user_id, message, urgency, trigger_reason, source, kind, scheduled_for, expires_at, context_data, evidence_kind)
  VALUES (NEW.user_id, v_msg, 'critical', 'milestone_cascade:' || v_milestone_type, 'milestone_cascade', 'milestone_celebration',
    now() + interval '15 minutes', now() + interval '24 hours',
    jsonb_build_object('milestone_type', v_milestone_type, 'trigger_source', NEW.trigger_source, 'phase', v_phase, 'decree_id', NEW.id), 'voice');
  RETURN NEW;
END;
$fn$;
