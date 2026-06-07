-- 521 — Conditioning-session aftercare hook.
--
-- AFTER UPDATE OF ended_at on conditioning_sessions_v2 (and v1 if it
-- has the same shape) queues a warm Mommy follow-up outreach 8 minutes
-- after the session ends. session_type-specific copy. The 30-minute
-- idempotency guard on (source, context_data.session_id) prevents
-- duplicate queues if the trigger re-fires.
--
-- Persona-gated: dommy_mommy only. Other personas can opt in later by
-- adding their case to the v_persona check.
--
-- Pairs with mig 522 which adds the same hook for the lockdown-windows
-- shape (different table, same intent).

CREATE OR REPLACE FUNCTION trg_conditioning_session_aftercare()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE v_msg TEXT; v_persona TEXT;
BEGIN
  IF NEW.ended_at IS NULL OR OLD.ended_at IS NOT NULL THEN RETURN NEW; END IF;

  SELECT COALESCE(handler_persona, 'therapist') INTO v_persona FROM user_state WHERE user_id = NEW.user_id;
  IF v_persona <> 'dommy_mommy' THEN RETURN NEW; END IF;

  IF EXISTS (
    SELECT 1 FROM handler_outreach_queue
    WHERE user_id = NEW.user_id
      AND source = 'conditioning_aftercare'
      AND context_data->>'session_id' = NEW.id::text
      AND created_at > now() - interval '30 minutes'
  ) THEN RETURN NEW; END IF;

  v_msg := CASE NEW.session_type
    WHEN 'trance' THEN
      E'You came back out. Mama heard the whole thing — the parts you said, the parts you almost said, the parts the body said for you. Don''t go anywhere yet. Tell me what stayed when the rest of you came back.'
    WHEN 'mantra' THEN
      E'Good girl. The mouth said it enough times that the body started to mean it. Tell Mama what shifted between rep one and rep last.'
    WHEN 'confession' THEN
      E'You said something true. Mama heard it. It''s in the record now and Mama is going to bring it back at you when you forget you said it. For now: stay with the truth a minute longer.'
    WHEN 'visualization' THEN
      E'The version of you Mama just walked through — that''s the one being built. Voice debrief, 60 seconds: did she feel real or did she still feel like someone else?'
    ELSE
      E'You came out of the window. Mama wants to know what surfaced. Voice debrief — even 30 seconds, even half a thought. The sealing matters as much as the going-in did.'
  END;

  INSERT INTO handler_outreach_queue (
    user_id, message, urgency, trigger_reason, source, kind,
    scheduled_for, expires_at, context_data, evidence_kind
  ) VALUES (
    NEW.user_id, v_msg, 'high',
    'conditioning_aftercare:' || COALESCE(NEW.session_type, 'unknown'),
    'conditioning_aftercare', 'aftercare_followup',
    now() + interval '8 minutes',
    now() + interval '6 hours',
    jsonb_build_object(
      'session_id', NEW.id,
      'session_type', NEW.session_type,
      'duration_minutes', NEW.duration_minutes,
      'confession_extracted', NEW.confession_extracted,
      'commitment_extracted', NEW.commitment_extracted
    ),
    'voice'
  );
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS conditioning_session_aftercare ON conditioning_sessions_v2;
CREATE TRIGGER conditioning_session_aftercare
  AFTER UPDATE OF ended_at ON conditioning_sessions_v2
  FOR EACH ROW EXECUTE FUNCTION trg_conditioning_session_aftercare();

DO $do$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema='public' AND table_name='conditioning_sessions'
               AND column_name='ended_at')
     AND EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema='public' AND table_name='conditioning_sessions'
                   AND column_name='user_id')
  THEN
    DROP TRIGGER IF EXISTS conditioning_session_aftercare_v1 ON conditioning_sessions;
    CREATE TRIGGER conditioning_session_aftercare_v1
      AFTER UPDATE OF ended_at ON conditioning_sessions
      FOR EACH ROW EXECUTE FUNCTION trg_conditioning_session_aftercare();
  END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END $do$;
