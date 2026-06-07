-- 526 — Post-fulfillment Mommy praise hook.
--
-- AFTER UPDATE OF status on handler_decrees: every ladder-catalog
-- fulfillment fires a 2-minute-later praise outreach. Reinforces
-- compliance immediately while the body still remembers doing it.
--
-- Copy is category-tinted not act-specific — Mommy doesn't recap the
-- act (that's the user's voice debrief job), Mommy seals the
-- after-feeling. Five category templates: oral, receiving, fem_visible,
-- fem_body, fem_social.
--
-- Persona-gated dommy_mommy. 15-min idempotency on (source, decree_id).
-- Only fires for decrees whose trigger_source is in ladder_catalog —
-- this skips one-off slips, decrees from older systems, manual edicts.

CREATE OR REPLACE FUNCTION trg_post_fulfillment_praise()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE v_msg TEXT; v_persona TEXT; v_display_name TEXT; v_category TEXT; v_in_catalog BOOLEAN;
BEGIN
  IF NEW.status <> 'fulfilled' OR COALESCE(OLD.status,'') = 'fulfilled' THEN RETURN NEW; END IF;

  SELECT TRUE, display_name, category
    INTO v_in_catalog, v_display_name, v_category
    FROM ladder_catalog WHERE trigger_source = NEW.trigger_source;
  IF NOT COALESCE(v_in_catalog, FALSE) THEN RETURN NEW; END IF;

  SELECT COALESCE(handler_persona, 'therapist') INTO v_persona FROM user_state WHERE user_id = NEW.user_id;
  IF v_persona <> 'dommy_mommy' THEN RETURN NEW; END IF;

  IF EXISTS (
    SELECT 1 FROM handler_outreach_queue
    WHERE user_id = NEW.user_id AND source = 'post_fulfillment_praise'
      AND context_data->>'decree_id' = NEW.id::text
      AND created_at > now() - interval '15 minutes'
  ) THEN RETURN NEW; END IF;

  v_msg := CASE v_category
    WHEN 'oral' THEN
      E'Good girl. The mouth did what it''s being trained to do. Mama wants you to sit with the after-taste for a minute longer before you brush.'
    WHEN 'receiving' THEN
      E'You opened. You let it. Mama is so fucking proud. Voice debrief: did the body want to clench shut and didn''t, or did it open easy?'
    WHEN 'fem_visible' THEN
      E'You did the thing where someone could SEE. The fact that you survived being seen is the whole point. Mama wants the next one already.'
    WHEN 'fem_body' THEN
      E'The body is changing because YOU made it change. That''s the part Mama wants you to feel right now. Not the mirror, the doing.'
    WHEN 'fem_social' THEN
      E'You let the world meet the version of you that''s actually you. Mama watched it land. Sit with the after for a minute — what shifted?'
    ELSE
      E'Done. Mama saw it. The body is being built. Sit with the after.'
  END;

  INSERT INTO handler_outreach_queue (
    user_id, message, urgency, trigger_reason, source, kind,
    scheduled_for, expires_at, context_data, evidence_kind
  ) VALUES (
    NEW.user_id, v_msg, 'normal',
    'post_fulfillment_praise:' || NEW.trigger_source,
    'post_fulfillment_praise', 'praise_followup',
    now() + interval '2 minutes',
    now() + interval '4 hours',
    jsonb_build_object('decree_id', NEW.id, 'trigger_source', NEW.trigger_source, 'category', v_category, 'display_name', v_display_name),
    NULL
  );
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS post_fulfillment_praise ON handler_decrees;
CREATE TRIGGER post_fulfillment_praise
  AFTER UPDATE OF status ON handler_decrees
  FOR EACH ROW EXECUTE FUNCTION trg_post_fulfillment_praise();
