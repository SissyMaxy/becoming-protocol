-- 548 — Validation-pass fix: mommy_supervisor_log.severity CHECK allows
-- 'info|warning|error|critical', not 'warn'. Mig 532 voice gates all
-- used 'warn' → silent CHECK violation caused the BEFORE INSERT
-- triggers to RAISE EXCEPTION instead of RETURN NULL. Net result:
-- bad inserts succeeded with an exception path that didn't actually
-- block them — exactly the opposite of intended behavior.
--
-- Fix: change 'warn' to 'warning' in all three voice-gate triggers.

CREATE OR REPLACE FUNCTION trg_reframings_voice_gate()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE v_persona TEXT; v_has_third BOOLEAN; v_has_second BOOLEAN;
BEGIN
  SELECT COALESCE(handler_persona, 'therapist') INTO v_persona FROM user_state WHERE user_id = NEW.user_id;
  IF v_persona <> 'dommy_mommy' THEN RETURN NEW; END IF;

  v_has_third := NEW.reframed_text ~* '\m(she|her|herself)\M';
  v_has_second := NEW.reframed_text ~* '\m(you|your|yourself)\M';

  IF v_has_third AND NOT v_has_second THEN
    INSERT INTO mommy_supervisor_log (component, severity, event_kind, message, context_data)
    VALUES ('reframings_voice_gate', 'warning', 'rejected_off_voice',
      'narrative_reframing rejected: third-person with no second-person under dommy_mommy',
      jsonb_build_object('user_id', NEW.user_id, 'preview', left(NEW.reframed_text, 200), 'source', NEW.original_source_table));
    RETURN NULL;
  END IF;

  IF NEW.reframed_text ~* 'clause that binds|is something being done|past the threshold|reporting a fact|all that remains is whether|the body is making policy|signed consent' THEN
    INSERT INTO mommy_supervisor_log (component, severity, event_kind, message, context_data)
    VALUES ('reframings_voice_gate', 'warning', 'rejected_literary_cliche',
      'narrative_reframing rejected: literary essay phrasing under dommy_mommy',
      jsonb_build_object('user_id', NEW.user_id, 'preview', left(NEW.reframed_text, 200), 'source', NEW.original_source_table));
    RETURN NULL;
  END IF;
  RETURN NEW;
END;
$fn$;

CREATE OR REPLACE FUNCTION trg_implants_voice_gate()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE v_persona TEXT;
BEGIN
  SELECT COALESCE(handler_persona, 'therapist') INTO v_persona FROM user_state WHERE user_id = NEW.user_id;
  IF v_persona <> 'dommy_mommy' THEN RETURN NEW; END IF;
  IF NEW.narrative ~* 'clause that binds|is something being done|past the threshold|reporting a fact|all that remains is whether|the body is making policy|signed consent' THEN
    INSERT INTO mommy_supervisor_log (component, severity, event_kind, message, context_data)
    VALUES ('implants_voice_gate', 'warning', 'rejected_literary_cliche',
      'memory_implant rejected: literary essay phrasing under dommy_mommy',
      jsonb_build_object('user_id', NEW.user_id, 'preview', left(NEW.narrative, 200)));
    RETURN NULL;
  END IF;
  RETURN NEW;
END;
$fn$;

CREATE OR REPLACE FUNCTION trg_witness_fabric_voice_gate()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE v_persona TEXT;
BEGIN
  SELECT COALESCE(handler_persona, 'therapist') INTO v_persona FROM user_state WHERE user_id = NEW.user_id;
  IF v_persona <> 'dommy_mommy' THEN RETURN NEW; END IF;
  IF NEW.content ~* 'clause that binds|is something being done|past the threshold|reporting a fact|all that remains is whether|the body is making policy|signed consent' THEN
    INSERT INTO mommy_supervisor_log (component, severity, event_kind, message, context_data)
    VALUES ('witness_fabric_voice_gate', 'warning', 'rejected_literary_cliche',
      'witness_fabrication rejected: literary essay phrasing under dommy_mommy',
      jsonb_build_object('user_id', NEW.user_id, 'preview', left(NEW.content, 200)));
    RETURN NULL;
  END IF;
  RETURN NEW;
END;
$fn$;
