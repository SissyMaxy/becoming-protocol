-- 423 — Cum-worship release-event trigger.
--
-- When orgasm_log INSERT lands AND the user has cum_worship enabled and
-- isn't safeword-paused, queue a Mama-voice outreach pairing the
-- current phase's directive with a random hypno phrase from the
-- library. Push bridge (380) fires it to her phone. Also stamps
-- last_event_at on settings — drives the regression sweep.
--
-- Also creates an optimistic cum_worship_events row so she can fill in
-- directive_followed + evidence after the fact.

CREATE OR REPLACE FUNCTION trg_cum_worship_on_release()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_settings RECORD;
  v_phase_def RECORD;
  v_phrase TEXT;
  v_partner_context TEXT;
  v_directive TEXT;
  v_message TEXT;
BEGIN
  SELECT enabled, current_phase, partner_context_label, paused_until
  INTO v_settings FROM cum_worship_settings WHERE user_id = NEW.user_id;
  IF v_settings IS NULL OR NOT v_settings.enabled THEN RETURN NEW; END IF;
  IF v_settings.paused_until IS NOT NULL AND v_settings.paused_until > now() THEN RETURN NEW; END IF;

  UPDATE cum_worship_settings
  SET last_event_at = now(), updated_at = now()
  WHERE user_id = NEW.user_id;

  SELECT phase, phase_name, solo_directive, partnered_directive, hypno_mantra
  INTO v_phase_def FROM cum_worship_ladder WHERE phase = v_settings.current_phase;
  IF v_phase_def IS NULL THEN RETURN NEW; END IF;

  SELECT phrase INTO v_phrase
  FROM cum_worship_phrase_library
  WHERE phase = v_settings.current_phase AND active = TRUE
  ORDER BY surface_weight DESC, random() LIMIT 1;

  v_partner_context := COALESCE(NEW.context, 'solo');
  IF v_partner_context ILIKE '%gina%' OR v_partner_context ILIKE '%wife%'
     OR v_partner_context ILIKE '%partner%' OR v_partner_context = 'partnered' THEN
    v_directive := v_phase_def.partnered_directive;
  ELSIF v_partner_context ILIKE '%sniffies%' OR v_partner_context ILIKE '%anon%' THEN
    v_directive := v_phase_def.partnered_directive;
  ELSE
    v_directive := v_phase_def.solo_directive;
  END IF;

  v_message := v_directive || E'\n\n' || COALESCE(v_phrase, v_phase_def.hypno_mantra);

  INSERT INTO handler_outreach_queue (
    user_id, message, urgency, trigger_reason, source, kind,
    scheduled_for, expires_at, context_data
  ) VALUES (
    NEW.user_id, v_message, 'high',
    'cum_worship_release:' || NEW.id::text,
    'cum_worship', 'cum_worship_directive',
    now(), now() + interval '6 hours',
    jsonb_build_object('orgasm_log_id', NEW.id, 'phase', v_settings.current_phase,
      'phase_name', v_phase_def.phase_name, 'release_type', NEW.release_type,
      'context', v_partner_context)
  );

  INSERT INTO cum_worship_events (
    user_id, occurred_at, context, partner_label, phase_at_event,
    directive_text, mantra_used, source_arousal_log_id
  ) VALUES (
    NEW.user_id, now(),
    CASE WHEN v_partner_context = 'solo' THEN 'solo'
         WHEN v_partner_context ILIKE '%sniffies%' OR v_partner_context ILIKE '%anon%' THEN 'anonymous'
         ELSE 'partnered' END,
    CASE WHEN v_partner_context IN ('solo','partnered') THEN v_settings.partner_context_label ELSE v_partner_context END,
    v_settings.current_phase, v_directive, v_phrase, NEW.id
  );

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS cum_worship_on_release ON orgasm_log;
CREATE TRIGGER cum_worship_on_release
  AFTER INSERT ON orgasm_log
  FOR EACH ROW EXECUTE FUNCTION trg_cum_worship_on_release();
