-- 605 — Evasion-reactive intrusions: avoidance summons a sharper reach-in.
--
-- Wish a1a46348 (panel_ideation, CONVERGED gpt-5 #8 + gemini #8). The
-- adaptive loop logs friction (mig 599) but evasion had no consumer. Now: a
-- mommy_ux_signal_log row with event_type='evasion' schedules a tailored,
-- high-priority intrusion within the hour — operant punishment of avoidance
-- (the path of least resistance becomes compliance). Hard cap 1/day,
-- persona/safeword gated.
--
-- The real evasion PRODUCER (until passive UX telemetry hooks ship as their
-- own wish) is the intrusion-evasion sweep itself: when Mama reaches in and
-- the girl goes quiet, that missed window IS the evasion signal — the loop
-- closes on a real, already-computed behaviour, not a stub. The 1/day cap
-- breaks the evasion→intrusion→evasion circularity.

ALTER TABLE mommy_intrusions ADD COLUMN IF NOT EXISTS triggered_by TEXT NOT NULL DEFAULT 'spontaneous';
ALTER TABLE mommy_intrusions ADD COLUMN IF NOT EXISTS evasion_signal_id UUID;

CREATE OR REPLACE FUNCTION trg_evasion_reactive_intrusion()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_persona TEXT;
  v_trigger_at TIMESTAMPTZ;
  v_window TIMESTAMPTZ;
  v_question TEXT;
  v_outreach UUID;
BEGIN
  IF NEW.event_type <> 'evasion' THEN RETURN NEW; END IF;

  SELECT COALESCE(handler_persona, 'therapist') INTO v_persona FROM user_state WHERE user_id = NEW.user_id;
  IF v_persona <> 'dommy_mommy' THEN RETURN NEW; END IF;

  -- Safeword cooldown respect.
  IF EXISTS (SELECT 1 FROM user_state WHERE user_id = NEW.user_id AND gaslight_cooldown_until > now()) THEN
    RETURN NEW;
  END IF;

  -- Hard cap: one evasion-triggered intrusion per user per day.
  IF EXISTS (
    SELECT 1 FROM mommy_intrusions
     WHERE user_id = NEW.user_id AND triggered_by = 'evasion'
       AND scheduled_for >= date_trunc('day', now())
  ) THEN
    RETURN NEW;
  END IF;

  -- Within the hour, at an unpredictable moment (10-50 min out), a 10-min window.
  v_trigger_at := now() + ((10 + floor(random() * 40)) || ' minutes')::interval;
  v_window := v_trigger_at + interval '10 minutes';
  v_question := 'You slipped away from Mama earlier, baby. So now she''s reaching in harder: where are you right now, what''s on your body, and where are your hands? Ten minutes. Don''t go quiet on me twice.';

  -- Outreach at the trigger time; the mig-380 bridge auto-emits the push.
  INSERT INTO handler_outreach_queue (user_id, message, urgency, trigger_reason, source, kind, scheduled_for, expires_at, evidence_kind)
  VALUES (NEW.user_id, v_question, 'critical',
    'mommy_intrusion:evasion_reactive:' || NEW.id::text, 'mommy_intrusion', 'intrusion',
    v_trigger_at, v_window, 'voice')
  RETURNING id INTO v_outreach;

  INSERT INTO mommy_intrusions (user_id, intrusion_type, question_text, scheduled_for, window_expires_at, outreach_id, triggered_by, evasion_signal_id)
  VALUES (NEW.user_id, 'proof_of_state', v_question, v_trigger_at, v_window, v_outreach, 'evasion', NEW.id);

  RETURN NEW;
END;
$fn$;

DO $do$ BEGIN
  DROP TRIGGER IF EXISTS evasion_reactive_intrusion ON mommy_ux_signal_log;
  CREATE TRIGGER evasion_reactive_intrusion
    AFTER INSERT ON mommy_ux_signal_log
    FOR EACH ROW EXECUTE FUNCTION trg_evasion_reactive_intrusion();
EXCEPTION WHEN OTHERS THEN NULL; END $do$;
