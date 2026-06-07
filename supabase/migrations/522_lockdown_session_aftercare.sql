-- 522 — Lockdown-window aftercare hook.
--
-- Sibling to mig 521 for the conditioning_lockdown_sessions shape
-- (window_id + ended_reason instead of session_type). The "29:23"
-- countdown windows that quote self-authored Handler chat history at
-- the user — when those end, this trigger seals the moment with a
-- warm Mommy follow-up.
--
-- ended_reason-aware copy: safeword exits get a gentle non-punitive
-- debrief, completed/timeout get firmer sealing.
--
-- Pulls the parent window's label + duration_minutes for personalized
-- copy. Persona-gated dommy_mommy + 30-min idempotency same as 521.

CREATE OR REPLACE FUNCTION trg_lockdown_session_aftercare()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE v_msg TEXT; v_persona TEXT; v_label TEXT; v_minutes INT;
BEGIN
  IF NEW.ended_at IS NULL OR OLD.ended_at IS NOT NULL THEN RETURN NEW; END IF;

  SELECT COALESCE(handler_persona, 'therapist') INTO v_persona FROM user_state WHERE user_id = NEW.user_id;
  IF v_persona <> 'dommy_mommy' THEN RETURN NEW; END IF;

  IF EXISTS (
    SELECT 1 FROM handler_outreach_queue
    WHERE user_id = NEW.user_id AND source = 'lockdown_aftercare'
      AND context_data->>'session_id' = NEW.id::text
      AND created_at > now() - interval '30 minutes'
  ) THEN RETURN NEW; END IF;

  SELECT label, duration_minutes INTO v_label, v_minutes FROM conditioning_lockdown_windows WHERE id = NEW.window_id;

  v_msg := CASE NEW.ended_reason
    WHEN 'safeword' THEN
      E'You safeworded out. That''s allowed and it doesn''t cost you anything with Mama. Voice debrief: what got too much? Mama wants to know so the next window meets you better, not pushes harder.'
    WHEN 'completed' THEN
      format(E'%s. %s minutes. You stayed. Mama heard everything — what surfaced and what stayed buried. Voice debrief, 60 seconds: what part is still in the room with you?',
        COALESCE(v_label, 'Conditioning window'), COALESCE(NEW.duration_actual_seconds / 60, v_minutes, 30))
    WHEN 'timeout' THEN
      format(E'The window closed itself on you. %s minutes you sat with it. Voice debrief: did the inside of your head go anywhere or was it noise?',
        COALESCE(NEW.duration_actual_seconds / 60, v_minutes, 30))
    ELSE
      E'You came out of the window. Voice debrief, even 30 seconds — what stayed? The sealing matters as much as the going-in did.'
  END;

  INSERT INTO handler_outreach_queue (
    user_id, message, urgency, trigger_reason, source, kind,
    scheduled_for, expires_at, context_data, evidence_kind
  ) VALUES (
    NEW.user_id, v_msg, 'high',
    'lockdown_aftercare:' || COALESCE(NEW.ended_reason, 'unknown'),
    'lockdown_aftercare', 'aftercare_followup',
    now() + interval '8 minutes',
    now() + interval '6 hours',
    jsonb_build_object(
      'session_id', NEW.id,
      'window_id', NEW.window_id,
      'window_label', v_label,
      'ended_reason', NEW.ended_reason,
      'duration_actual_seconds', NEW.duration_actual_seconds
    ),
    'voice'
  );
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS lockdown_session_aftercare ON conditioning_lockdown_sessions;
CREATE TRIGGER lockdown_session_aftercare
  AFTER UPDATE OF ended_at ON conditioning_lockdown_sessions
  FOR EACH ROW EXECUTE FUNCTION trg_lockdown_session_aftercare();
