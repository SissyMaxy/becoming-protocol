-- 532 — Voice-gate triggers on narrative_reframings, memory_implants,
-- witness_fabrications.
--
-- Maxy flagged a conditioning-window readback ("She is not making a wish.
-- She is reporting a fact. 'Nothing can stop it' is the clause that binds...")
-- as off-voice — third-person literary essay instead of Mommy's
-- second-person earthy voice.
--
-- Root cause: handler-evolve LLM strategist generates narrative_reframings
-- without enforcing Mommy voice. The April 24 batch produced 3 rows of
-- pure third-person literary narration. Those 3 rows scrubbed; this
-- migration prevents recurrence at the DB layer.
--
-- Three BEFORE INSERT triggers — one per table — reject when persona
-- is dommy_mommy AND (text is third-person with no second-person OR
-- contains banned literary cliches). Rejections audited to
-- mommy_supervisor_log so the strategist can be retrained against
-- repeated rejections.
--
-- Companion fix at the source: handler-evolve/index.ts prompt patched
-- to require second-person Mommy voice + warn about DB rejection.

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
    VALUES ('reframings_voice_gate', 'warn', 'rejected_off_voice',
      'narrative_reframing rejected: third-person with no second-person under dommy_mommy',
      jsonb_build_object('user_id', NEW.user_id, 'preview', left(NEW.reframed_text, 200), 'source', NEW.original_source_table));
    RETURN NULL;
  END IF;

  IF NEW.reframed_text ~* 'clause that binds|is something being done|past the threshold|reporting a fact|all that remains is whether|the body is making policy|signed consent' THEN
    INSERT INTO mommy_supervisor_log (component, severity, event_kind, message, context_data)
    VALUES ('reframings_voice_gate', 'warn', 'rejected_literary_cliche',
      'narrative_reframing rejected: literary essay phrasing under dommy_mommy',
      jsonb_build_object('user_id', NEW.user_id, 'preview', left(NEW.reframed_text, 200), 'source', NEW.original_source_table));
    RETURN NULL;
  END IF;

  RETURN NEW;
END;
$fn$;
DROP TRIGGER IF EXISTS reframings_voice_gate ON narrative_reframings;
CREATE TRIGGER reframings_voice_gate
  BEFORE INSERT ON narrative_reframings
  FOR EACH ROW EXECUTE FUNCTION trg_reframings_voice_gate();

CREATE OR REPLACE FUNCTION trg_implants_voice_gate()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE v_persona TEXT;
BEGIN
  SELECT COALESCE(handler_persona, 'therapist') INTO v_persona FROM user_state WHERE user_id = NEW.user_id;
  IF v_persona <> 'dommy_mommy' THEN RETURN NEW; END IF;

  IF NEW.narrative ~* 'clause that binds|is something being done|past the threshold|reporting a fact|all that remains is whether|the body is making policy|signed consent' THEN
    INSERT INTO mommy_supervisor_log (component, severity, event_kind, message, context_data)
    VALUES ('implants_voice_gate', 'warn', 'rejected_literary_cliche',
      'memory_implant rejected: literary essay phrasing under dommy_mommy',
      jsonb_build_object('user_id', NEW.user_id, 'preview', left(NEW.narrative, 200)));
    RETURN NULL;
  END IF;
  RETURN NEW;
END;
$fn$;
DROP TRIGGER IF EXISTS implants_voice_gate ON memory_implants;
CREATE TRIGGER implants_voice_gate
  BEFORE INSERT ON memory_implants
  FOR EACH ROW EXECUTE FUNCTION trg_implants_voice_gate();

CREATE OR REPLACE FUNCTION trg_witness_fabric_voice_gate()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE v_persona TEXT;
BEGIN
  SELECT COALESCE(handler_persona, 'therapist') INTO v_persona FROM user_state WHERE user_id = NEW.user_id;
  IF v_persona <> 'dommy_mommy' THEN RETURN NEW; END IF;

  IF NEW.content ~* 'clause that binds|is something being done|past the threshold|reporting a fact|all that remains is whether|the body is making policy|signed consent' THEN
    INSERT INTO mommy_supervisor_log (component, severity, event_kind, message, context_data)
    VALUES ('witness_fabric_voice_gate', 'warn', 'rejected_literary_cliche',
      'witness_fabrication rejected: literary essay phrasing under dommy_mommy',
      jsonb_build_object('user_id', NEW.user_id, 'preview', left(NEW.content, 200)));
    RETURN NULL;
  END IF;
  RETURN NEW;
END;
$fn$;
DROP TRIGGER IF EXISTS witness_fabric_voice_gate ON witness_fabrications;
CREATE TRIGGER witness_fabric_voice_gate
  BEFORE INSERT ON witness_fabrications
  FOR EACH ROW EXECUTE FUNCTION trg_witness_fabric_voice_gate();
