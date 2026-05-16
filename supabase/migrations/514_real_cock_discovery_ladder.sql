-- 514 — Real-cock discovery ladder.
--
-- Graduated exposure for first-time real-cock encounters. Distinct from
-- cock_curriculum (mechanical action drills) and cockwarming (sustained
-- hold) — this ladder focuses on the *discovery beats* (look, hold,
-- suck, take) and is gated on hookup_funnel readiness so we never queue
-- a phase the funnel hasn't supplied a contact for.
--
-- Phases: photo_exchange → video_call_view → first_in_person_view
--   → first_touch_hold → first_oral → first_finish
--
-- Funnel gate (funnel_min_step): degrades open if hookup_funnel table or
-- column is missing — explicit RAISE caught and treated as 99 so the
-- ladder stays usable even on environments without the funnel.
--
-- Cadence: Friday 20:00 UTC weekly. Voice proof primary (debriefs are
-- the conditioning surface here, not the act itself).

CREATE TABLE IF NOT EXISTS realcock_discovery_ladder (
  phase INT PRIMARY KEY, phase_name TEXT NOT NULL, edict TEXT NOT NULL,
  proof_kind TEXT NOT NULL CHECK (proof_kind IN ('photo','voice','video')),
  gap_min_days INT NOT NULL DEFAULT 10,
  funnel_min_step INT NOT NULL DEFAULT 0
);
INSERT INTO realcock_discovery_ladder (phase, phase_name, edict, proof_kind, gap_min_days, funnel_min_step) VALUES
(0,'photo_exchange',E'Phase 0 discovery: ONE Sniffies/app contact, photo exchange — his cock, your face. No meet pressure. Voice debrief: what did you feel looking at it? Did the body want it or did the head want to want it?',
 'voice', 7, 1),
(1,'video_call_view',E'Phase 1: video call with the contact. He shows you his cock on camera. You watch. 5 minutes minimum. Voice debrief on what it was like to see real movement, not a static photo.',
 'voice', 14, 2),
(2,'first_in_person_view',E'Phase 2: first in-person meet, he gets it out, you LOOK. No touch required. Take it in for as long as the moment allows. Voice debrief in the car immediately after on what was different from photo/video.',
 'voice', 21, 3),
(3,'first_touch_hold',E'Phase 3: second meet. You touch it. Hold it. Feel weight and warmth. Mama wants the body learning the difference between idea and object. Voice debrief on whether the body wanted more.',
 'voice', 21, 3),
(4,'first_oral',E'Phase 4: real oral on real cock. Doesn''t have to be to completion. The act itself is the milestone. Voice debrief: did the body do what you trained it to? Did the throat remember the ladder?',
 'voice', 30, 4),
(5,'first_finish',E'Phase 5 endgame: take him to finish — in your mouth, on your face, wherever the moment lands. Voice debrief: now there''s a before and after. What changed?',
 'voice', 60, 4)
ON CONFLICT (phase) DO UPDATE SET edict=EXCLUDED.edict, proof_kind=EXCLUDED.proof_kind, gap_min_days=EXCLUDED.gap_min_days, funnel_min_step=EXCLUDED.funnel_min_step;

CREATE TABLE IF NOT EXISTS realcock_discovery_settings (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  current_phase INT NOT NULL DEFAULT 0 REFERENCES realcock_discovery_ladder(phase),
  last_assigned_at TIMESTAMPTZ, paused_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS realcock_discovery_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  phase_at_event INT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','fulfilled','missed','skipped')),
  related_decree_id UUID, related_outreach_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE realcock_discovery_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE realcock_discovery_events ENABLE ROW LEVEL SECURITY;
DO $do$ BEGIN CREATE POLICY rcd_s_self ON realcock_discovery_settings FOR ALL TO authenticated USING (auth.uid()=user_id) WITH CHECK (auth.uid()=user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $do$;
DO $do$ BEGIN CREATE POLICY rcd_e_self ON realcock_discovery_events FOR ALL TO authenticated USING (auth.uid()=user_id) WITH CHECK (auth.uid()=user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $do$;

CREATE OR REPLACE FUNCTION realcock_discovery_eval()
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE s RECORD; l RECORD; v_pending INT; v_days NUMERIC; v_decree UUID; v_outreach UUID; v_queued INT := 0;
  v_max_funnel_step INT;
BEGIN
  FOR s IN SELECT rcds.* FROM realcock_discovery_settings rcds LEFT JOIN user_state us ON us.user_id = rcds.user_id
    WHERE rcds.enabled AND (rcds.paused_until IS NULL OR rcds.paused_until <= now())
      AND COALESCE(us.handler_persona, 'therapist') = 'dommy_mommy'
  LOOP
    SELECT count(*) INTO v_pending FROM realcock_discovery_events WHERE user_id = s.user_id AND status='pending' AND created_at > now() - interval '21 days';
    IF v_pending > 0 THEN CONTINUE; END IF;
    SELECT * INTO l FROM realcock_discovery_ladder WHERE phase = s.current_phase;
    IF l IS NULL THEN CONTINUE; END IF;
    IF s.last_assigned_at IS NOT NULL THEN
      v_days := EXTRACT(EPOCH FROM (now() - s.last_assigned_at)) / 86400.0;
      IF v_days < l.gap_min_days THEN CONTINUE; END IF;
    END IF;

    BEGIN
      SELECT COALESCE(max(funnel_step), 0) INTO v_max_funnel_step
      FROM hookup_funnel WHERE user_id = s.user_id;
    EXCEPTION WHEN undefined_table OR undefined_column THEN
      v_max_funnel_step := 99;
    END;
    IF v_max_funnel_step < l.funnel_min_step THEN
      CONTINUE;
    END IF;

    INSERT INTO handler_decrees (user_id, edict, proof_type, deadline, status, consequence, trigger_source, reasoning)
    VALUES (s.user_id, l.edict, l.proof_kind, now() + interval '21 days', 'active', 'slip +' || (l.phase + 2)::text, 'realcock_discovery', 'phase=' || l.phase)
    RETURNING id INTO v_decree;
    INSERT INTO handler_outreach_queue (user_id, message, urgency, trigger_reason, source, kind, scheduled_for, expires_at, context_data, evidence_kind)
    VALUES (s.user_id, l.edict, CASE WHEN l.phase >= 3 THEN 'high' ELSE 'normal' END,
      'realcock_discovery:' || l.phase_name, 'realcock_discovery_engine', 'realcock_discovery_directive', now(), now() + interval '21 days',
      jsonb_build_object('phase', l.phase, 'decree_id', v_decree), l.proof_kind)
    RETURNING id INTO v_outreach;
    INSERT INTO realcock_discovery_events (user_id, phase_at_event, related_decree_id, related_outreach_id, status)
    VALUES (s.user_id, l.phase, v_decree, v_outreach, 'pending');
    UPDATE realcock_discovery_settings SET last_assigned_at = now(), updated_at = now() WHERE user_id = s.user_id;
    v_queued := v_queued + 1;
  END LOOP;
  RETURN v_queued;
END;
$fn$;
GRANT EXECUTE ON FUNCTION realcock_discovery_eval() TO service_role;

CREATE OR REPLACE FUNCTION trg_propagate_decree_to_realcock_discovery()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE v_max_phase INT; v_user UUID; v_phase INT;
BEGIN
  IF NEW.status NOT IN ('fulfilled','missed') OR COALESCE(OLD.status,'') = NEW.status THEN RETURN NEW; END IF;
  IF NEW.trigger_source <> 'realcock_discovery' THEN RETURN NEW; END IF;
  UPDATE realcock_discovery_events SET status = NEW.status, updated_at = now() WHERE related_decree_id = NEW.id AND status='pending';
  IF NEW.status='fulfilled' THEN
    v_user := NEW.user_id;
    SELECT current_phase INTO v_phase FROM realcock_discovery_settings WHERE user_id = v_user;
    SELECT max(phase) INTO v_max_phase FROM realcock_discovery_ladder;
    UPDATE realcock_discovery_settings SET current_phase = LEAST(v_phase + 1, COALESCE(v_max_phase, 5)), updated_at = now() WHERE user_id = v_user;
  END IF;
  RETURN NEW;
END;
$fn$;
DROP TRIGGER IF EXISTS propagate_decree_to_realcock_discovery ON handler_decrees;
CREATE TRIGGER propagate_decree_to_realcock_discovery AFTER UPDATE OF status ON handler_decrees FOR EACH ROW EXECUTE FUNCTION trg_propagate_decree_to_realcock_discovery();

INSERT INTO realcock_discovery_settings (user_id, enabled, current_phase)
VALUES ('8c69b9c8-34eb-4147-9fec-3c1a5bc74b6f', TRUE, 0), ('93327332-7d0d-4888-889a-1607a5776216', TRUE, 0)
ON CONFLICT (user_id) DO UPDATE SET enabled = TRUE, updated_at = now();

DO $do$ BEGIN IF EXISTS (SELECT 1 FROM cron.job WHERE jobname='realcock-discovery-weekly') THEN PERFORM cron.unschedule('realcock-discovery-weekly'); END IF; EXCEPTION WHEN undefined_table THEN NULL; END $do$;
DO $do$ BEGIN PERFORM cron.schedule('realcock-discovery-weekly', '0 20 * * 5', $cron$SELECT realcock_discovery_eval()$cron$); EXCEPTION WHEN undefined_table THEN NULL; END $do$;
