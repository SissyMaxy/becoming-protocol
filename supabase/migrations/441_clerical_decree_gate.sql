-- 441 — Refuse clerical "type back the template" decrees at the DB layer.
--
-- 2026-05-15 incident: Maxy hit two confession prompts asking her to
-- "Draft a DM template" / "Write your DM template" where the *entire*
-- template was already in the decree edict. Mama wrote the words. The
-- decree asked Maxy to type them back. That's clerical busy-work, not
-- protocol — violates feedback_no_clerical_decrees.
--
-- The shot_list:* generator (revenue-planner / content-engine) produces
-- these. Even after fixing the generator in source, future generators
-- will re-introduce the same pattern unless the DB layer enforces it.
--
-- This trigger refuses any decree where:
--   - edict contains a directive verb (draft|write|type|save|copy)
--   - applied to a transcription target (dm|message|caption|template|reply|response|post|script)
--   - AND contains an embedded verbatim template (quoted text >=40 chars)
--
-- The pattern signature is "Mama said the words AND asks user to copy them."
-- That combination is the violation. Either one alone is fine.
--
-- Refuses by: rewriting status -> 'cancelled' on insert, setting
-- reasoning to the rejection cause. Logs to mommy_supervisor_log so the
-- builder watchdog can surface offending generators.

CREATE OR REPLACE FUNCTION trg_refuse_clerical_decrees()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_has_transcribe_verb BOOLEAN;
  v_has_verbatim_template BOOLEAN;
  v_quoted_len INT;
BEGIN
  IF NEW.edict IS NULL OR length(NEW.edict) < 40 THEN RETURN NEW; END IF;

  -- Pattern 1: directive verb + transcription target
  v_has_transcribe_verb := NEW.edict ~*
    '\m(draft|write|type|save|copy|paste)\s+(your|a|the|this|that)?\s*(dm|message|caption|template|reply|response|post|script|bio)';

  -- Pattern 2: contains a verbatim quoted block >= 40 chars
  -- (anything between matching quote pairs that's long enough to be a template,
  -- not just a short reference word)
  v_quoted_len := COALESCE(length((regexp_match(NEW.edict, E'[''"]([^''"]{40,})[''"]'))[1]), 0);
  v_has_verbatim_template := v_quoted_len >= 40;

  IF v_has_transcribe_verb AND v_has_verbatim_template THEN
    -- Refuse: convert to cancelled at insert, mark reason
    NEW.status := 'cancelled';
    NEW.reasoning := COALESCE(NEW.reasoning, '') ||
      E'\nREFUSED-AT-INSERT 2026-05-15: clerical decree (transcribe-verb + verbatim ' ||
      v_quoted_len::text || E'-char template). feedback_no_clerical_decrees: user decrees must be embodied (photo/voice/measurement/disclosure), not type-back-Mama. The generator should DRAFT the template autonomously and store it (e.g., to a dm_templates table), not push it to the user queue.';

    BEGIN
      INSERT INTO mommy_supervisor_log (
        component, severity, event_kind, message, context_data
      ) VALUES (
        'handler_decrees', 'warning', 'clerical_decree_refused',
        'Decree refused at insert — clerical template pattern.',
        jsonb_build_object('decree_id', NEW.id, 'trigger_source', NEW.trigger_source,
                           'edict_head', LEFT(NEW.edict, 200),
                           'verbatim_template_chars', v_quoted_len)
      );
    EXCEPTION WHEN undefined_table THEN NULL; END;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS refuse_clerical_decrees ON handler_decrees;
CREATE TRIGGER refuse_clerical_decrees
  BEFORE INSERT ON handler_decrees
  FOR EACH ROW EXECUTE FUNCTION trg_refuse_clerical_decrees();
