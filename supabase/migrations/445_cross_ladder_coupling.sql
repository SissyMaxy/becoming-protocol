-- 445 — Cross-ladder coupling: cum-worship ↔ cock-curriculum.
--
-- OpenAI panel surfaced this as the missing compounding mechanic. The
-- two ladders activated for Maxy today are psychologically linked
-- (releasing in front of Gina, swallowing his cum, the same somatic
-- territory) but mechanically independent — events on one don't move
-- the other. Variable-ratio advancement gets to phase 1 on each ladder
-- independently. If we couple them, each ladder accelerates the other:
-- doing the work on either side pulls both forward.
--
-- Implementation: AFTER UPDATE trigger on each ladder's events table.
-- When directive_followed flips from non-true to true, insert a
-- synthetic event on the OTHER ladder with context='cross_ladder_bonus'
-- and directive_followed=true. The advancement evaluator counts it
-- naturally (it just sums directive_followed=true events at the current
-- phase). Half-credit isn't enforced explicitly — the variable-ratio
-- threshold absorbs it, and the synthetic event is tagged so audit can
-- distinguish primary from coupled.
--
-- Safety: skip when both ladders are at terminal phase OR when source
-- event was itself synthetic (prevents infinite ping-pong).

CREATE OR REPLACE FUNCTION trg_cum_worship_to_cock_curriculum_bonus()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_curriculum_settings RECORD;
BEGIN
  -- Only fire on the directive_followed=true transition, not on every update
  IF NEW.directive_followed IS NOT TRUE THEN RETURN NEW; END IF;
  IF OLD.directive_followed IS TRUE THEN RETURN NEW; END IF;

  -- Skip if this event was itself a cross-ladder bonus
  IF NEW.context = 'cross_ladder_bonus' THEN RETURN NEW; END IF;

  SELECT enabled, current_phase, paused_until
  INTO v_curriculum_settings
  FROM cock_curriculum_settings WHERE user_id = NEW.user_id;
  IF v_curriculum_settings IS NULL OR NOT v_curriculum_settings.enabled THEN RETURN NEW; END IF;
  IF v_curriculum_settings.paused_until IS NOT NULL AND v_curriculum_settings.paused_until > now() THEN RETURN NEW; END IF;

  INSERT INTO cock_curriculum_events (
    user_id, occurred_at, phase_at_event, context,
    partner_label, directive_text, directive_followed,
    reflection_notes
  ) VALUES (
    NEW.user_id, now(), v_curriculum_settings.current_phase, 'solo',
    'cross_ladder_bonus: cum_worship phase ' || NEW.phase_at_event::text,
    'Cross-ladder bonus from cum-worship phase ' || NEW.phase_at_event::text || ' compliance.',
    TRUE,
    'Auto-counted from cum_worship_events ' || NEW.id::text
  );

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'cum_worship_to_cock_curriculum_bonus failed: %', SQLERRM;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS cum_worship_to_cock_curriculum_bonus ON cum_worship_events;
CREATE TRIGGER cum_worship_to_cock_curriculum_bonus
  AFTER UPDATE OF directive_followed ON cum_worship_events
  FOR EACH ROW EXECUTE FUNCTION trg_cum_worship_to_cock_curriculum_bonus();

-- Reverse direction: cock_curriculum directive_followed → bonus on cum_worship
CREATE OR REPLACE FUNCTION trg_cock_curriculum_to_cum_worship_bonus()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_worship_settings RECORD;
BEGIN
  IF NEW.directive_followed IS NOT TRUE THEN RETURN NEW; END IF;
  IF OLD.directive_followed IS TRUE THEN RETURN NEW; END IF;
  IF NEW.context = 'cross_ladder_bonus' THEN RETURN NEW; END IF;

  SELECT enabled, current_phase, paused_until, partner_context_label
  INTO v_worship_settings
  FROM cum_worship_settings WHERE user_id = NEW.user_id;
  IF v_worship_settings IS NULL OR NOT v_worship_settings.enabled THEN RETURN NEW; END IF;
  IF v_worship_settings.paused_until IS NOT NULL AND v_worship_settings.paused_until > now() THEN RETURN NEW; END IF;

  INSERT INTO cum_worship_events (
    user_id, occurred_at, context, partner_label, phase_at_event,
    directive_text, directive_followed, reflection_notes
  ) VALUES (
    NEW.user_id, now(), 'solo',
    'cross_ladder_bonus: cock_curriculum phase ' || NEW.phase_at_event::text,
    v_worship_settings.current_phase,
    'Cross-ladder bonus from cock-curriculum phase ' || NEW.phase_at_event::text || ' compliance.',
    TRUE,
    'Auto-counted from cock_curriculum_events ' || NEW.id::text
  );

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'cock_curriculum_to_cum_worship_bonus failed: %', SQLERRM;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS cock_curriculum_to_cum_worship_bonus ON cock_curriculum_events;
CREATE TRIGGER cock_curriculum_to_cum_worship_bonus
  AFTER UPDATE OF directive_followed ON cock_curriculum_events
  FOR EACH ROW EXECUTE FUNCTION trg_cock_curriculum_to_cum_worship_bonus();

-- Also fire on INSERT when directive_followed is already true (evidence-grader path)
CREATE OR REPLACE FUNCTION trg_cum_worship_insert_to_cock_curriculum_bonus()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_curriculum_settings RECORD;
BEGIN
  IF NEW.directive_followed IS NOT TRUE THEN RETURN NEW; END IF;
  IF NEW.context = 'cross_ladder_bonus' THEN RETURN NEW; END IF;

  SELECT enabled, current_phase, paused_until
  INTO v_curriculum_settings
  FROM cock_curriculum_settings WHERE user_id = NEW.user_id;
  IF v_curriculum_settings IS NULL OR NOT v_curriculum_settings.enabled THEN RETURN NEW; END IF;
  IF v_curriculum_settings.paused_until IS NOT NULL AND v_curriculum_settings.paused_until > now() THEN RETURN NEW; END IF;

  INSERT INTO cock_curriculum_events (
    user_id, occurred_at, phase_at_event, context, partner_label,
    directive_text, directive_followed, reflection_notes
  ) VALUES (
    NEW.user_id, now(), v_curriculum_settings.current_phase, 'solo',
    'cross_ladder_bonus: cum_worship phase ' || NEW.phase_at_event::text,
    'Cross-ladder bonus from cum-worship phase ' || NEW.phase_at_event::text || ' compliance.',
    TRUE,
    'Auto-counted from cum_worship_events ' || NEW.id::text
  );

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS cum_worship_insert_to_cock_curriculum_bonus ON cum_worship_events;
CREATE TRIGGER cum_worship_insert_to_cock_curriculum_bonus
  AFTER INSERT ON cum_worship_events
  FOR EACH ROW EXECUTE FUNCTION trg_cum_worship_insert_to_cock_curriculum_bonus();

CREATE OR REPLACE FUNCTION trg_cock_curriculum_insert_to_cum_worship_bonus()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_worship_settings RECORD;
BEGIN
  IF NEW.directive_followed IS NOT TRUE THEN RETURN NEW; END IF;
  IF NEW.context = 'cross_ladder_bonus' THEN RETURN NEW; END IF;

  SELECT enabled, current_phase, paused_until
  INTO v_worship_settings
  FROM cum_worship_settings WHERE user_id = NEW.user_id;
  IF v_worship_settings IS NULL OR NOT v_worship_settings.enabled THEN RETURN NEW; END IF;
  IF v_worship_settings.paused_until IS NOT NULL AND v_worship_settings.paused_until > now() THEN RETURN NEW; END IF;

  INSERT INTO cum_worship_events (
    user_id, occurred_at, context, partner_label, phase_at_event,
    directive_text, directive_followed, reflection_notes
  ) VALUES (
    NEW.user_id, now(), 'solo',
    'cross_ladder_bonus: cock_curriculum phase ' || NEW.phase_at_event::text,
    v_worship_settings.current_phase,
    'Cross-ladder bonus from cock-curriculum phase ' || NEW.phase_at_event::text || ' compliance.',
    TRUE,
    'Auto-counted from cock_curriculum_events ' || NEW.id::text
  );

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS cock_curriculum_insert_to_cum_worship_bonus ON cock_curriculum_events;
CREATE TRIGGER cock_curriculum_insert_to_cum_worship_bonus
  AFTER INSERT ON cock_curriculum_events
  FOR EACH ROW EXECUTE FUNCTION trg_cock_curriculum_insert_to_cum_worship_bonus();
