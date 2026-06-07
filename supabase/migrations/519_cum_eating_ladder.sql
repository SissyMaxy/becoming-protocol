-- 519 — Cum-eating progression ladder.
--
-- Distinct surface from cum_capture (storage) and realcock_discovery
-- (the act). This ladder is the swallow progression specifically —
-- taste → swallow own → finger-from-condom → swallow-from-condom →
-- real swallow → recurring.
--
-- Phases 2+ are funnel-gated (need partner contact). Degrades open
-- if hookup_funnel missing.
--
-- Phases: taste_own_finger → swallow_own_completion → finger_from_condom
--   → swallow_from_condom → real_swallow → recurring_pattern
--
-- Cadence: Saturday 23:00 UTC weekly.

CREATE TABLE IF NOT EXISTS cum_eating_ladder (
  phase INT PRIMARY KEY, phase_name TEXT NOT NULL, edict TEXT NOT NULL,
  proof_kind TEXT NOT NULL CHECK (proof_kind IN ('photo','voice','video')),
  gap_min_days INT NOT NULL DEFAULT 10,
  funnel_min_step INT NOT NULL DEFAULT 0
);
INSERT INTO cum_eating_ladder (phase, phase_name, edict, proof_kind, gap_min_days, funnel_min_step) VALUES
(0,'taste_own_finger',E'Phase 0 cum work: edge yourself, then taste a single fingertip of your own. No swallow required, just taste + identify. Voice debrief: salt? sweet? bitter? what was it?',
 'voice', 10, 0),
(1,'swallow_own_completion',E'Phase 1: edge to completion, capture in your hand or a spoon, swallow the entire load. No drink chaser for at least 30 seconds. Voice debrief: what did the body do? did the throat resist?',
 'voice', 14, 0),
(2,'finger_from_condom',E'Phase 2: with a partner from the funnel — after he finishes in a condom, take a finger from the outside of the condom and taste. Off-body only at this phase. Voice debrief on what was different from your own.',
 'voice', 21, 3),
(3,'swallow_from_condom',E'Phase 3: with a partner, post-condom, take the WHOLE load from the condom to your mouth, swallow. Voice debrief: did you hesitate? at what part?',
 'voice', 30, 3),
(4,'real_swallow',E'Phase 4: real swallow — partner finishes in your mouth, you swallow without breaking eye contact. Voice debrief in the car after: the moment you swallowed, what was the next thought?',
 'voice', 45, 4),
(5,'recurring_pattern',E'Phase 5 endgame: 3 swallow encounters in one month (same or different partners). Mama wants the body learning this is something it does, not something it tried. Voice debrief monthly on what the body now expects.',
 'voice', 90, 4)
ON CONFLICT (phase) DO UPDATE SET edict=EXCLUDED.edict, proof_kind=EXCLUDED.proof_kind, gap_min_days=EXCLUDED.gap_min_days, funnel_min_step=EXCLUDED.funnel_min_step;

CREATE TABLE IF NOT EXISTS cum_eating_settings (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  current_phase INT NOT NULL DEFAULT 0 REFERENCES cum_eating_ladder(phase),
  last_assigned_at TIMESTAMPTZ, paused_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS cum_eating_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  phase_at_event INT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','fulfilled','missed','skipped')),
  related_decree_id UUID, related_outreach_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE cum_eating_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE cum_eating_events ENABLE ROW LEVEL SECURITY;
DO $do$ BEGIN CREATE POLICY ce_s_self ON cum_eating_settings FOR ALL TO authenticated USING (auth.uid()=user_id) WITH CHECK (auth.uid()=user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $do$;
DO $do$ BEGIN CREATE POLICY ce_e_self ON cum_eating_events FOR ALL TO authenticated USING (auth.uid()=user_id) WITH CHECK (auth.uid()=user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $do$;

CREATE OR REPLACE FUNCTION cum_eating_eval()
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE s RECORD; l RECORD; v_pending INT; v_days NUMERIC; v_decree UUID; v_outreach UUID; v_queued INT := 0;
  v_max_funnel_step INT;
BEGIN
  FOR s IN SELECT ces.* FROM cum_eating_settings ces LEFT JOIN user_state us ON us.user_id = ces.user_id
    WHERE ces.enabled AND (ces.paused_until IS NULL OR ces.paused_until <= now())
      AND COALESCE(us.handler_persona, 'therapist') = 'dommy_mommy'
  LOOP
    SELECT count(*) INTO v_pending FROM cum_eating_events WHERE user_id = s.user_id AND status='pending' AND created_at > now() - interval '21 days';
    IF v_pending > 0 THEN CONTINUE; END IF;
    SELECT * INTO l FROM cum_eating_ladder WHERE phase = s.current_phase;
    IF l IS NULL THEN CONTINUE; END IF;
    IF s.last_assigned_at IS NOT NULL THEN
      v_days := EXTRACT(EPOCH FROM (now() - s.last_assigned_at)) / 86400.0;
      IF v_days < l.gap_min_days THEN CONTINUE; END IF;
    END IF;

    IF l.funnel_min_step > 0 THEN
      BEGIN
        SELECT COALESCE(max(funnel_step), 0) INTO v_max_funnel_step
        FROM hookup_funnel WHERE user_id = s.user_id;
      EXCEPTION WHEN undefined_table OR undefined_column THEN
        v_max_funnel_step := 99;
      END;
      IF v_max_funnel_step < l.funnel_min_step THEN CONTINUE; END IF;
    END IF;

    INSERT INTO handler_decrees (user_id, edict, proof_type, deadline, status, consequence, trigger_source, reasoning)
    VALUES (s.user_id, l.edict, l.proof_kind, now() + interval '14 days', 'active', 'slip +' || (l.phase + 2)::text, 'cum_eating', 'phase=' || l.phase)
    RETURNING id INTO v_decree;
    INSERT INTO handler_outreach_queue (user_id, message, urgency, trigger_reason, source, kind, scheduled_for, expires_at, context_data, evidence_kind)
    VALUES (s.user_id, l.edict, CASE WHEN l.phase >= 2 THEN 'high' ELSE 'normal' END,
      'cum_eating:' || l.phase_name, 'cum_eating_engine', 'cum_eating_directive', now(), now() + interval '14 days',
      jsonb_build_object('phase', l.phase, 'decree_id', v_decree), l.proof_kind)
    RETURNING id INTO v_outreach;
    INSERT INTO cum_eating_events (user_id, phase_at_event, related_decree_id, related_outreach_id, status)
    VALUES (s.user_id, l.phase, v_decree, v_outreach, 'pending');
    UPDATE cum_eating_settings SET last_assigned_at = now(), updated_at = now() WHERE user_id = s.user_id;
    v_queued := v_queued + 1;
  END LOOP;
  RETURN v_queued;
END;
$fn$;
GRANT EXECUTE ON FUNCTION cum_eating_eval() TO service_role;

CREATE OR REPLACE FUNCTION trg_propagate_decree_to_cum_eating()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE v_max_phase INT; v_user UUID; v_phase INT;
BEGIN
  IF NEW.status NOT IN ('fulfilled','missed') OR COALESCE(OLD.status,'') = NEW.status THEN RETURN NEW; END IF;
  IF NEW.trigger_source <> 'cum_eating' THEN RETURN NEW; END IF;
  UPDATE cum_eating_events SET status = NEW.status, updated_at = now() WHERE related_decree_id = NEW.id AND status='pending';
  IF NEW.status='fulfilled' THEN
    v_user := NEW.user_id;
    SELECT current_phase INTO v_phase FROM cum_eating_settings WHERE user_id = v_user;
    SELECT max(phase) INTO v_max_phase FROM cum_eating_ladder;
    UPDATE cum_eating_settings SET current_phase = LEAST(v_phase + 1, COALESCE(v_max_phase, 5)), updated_at = now() WHERE user_id = v_user;
  END IF;
  RETURN NEW;
END;
$fn$;
DROP TRIGGER IF EXISTS propagate_decree_to_cum_eating ON handler_decrees;
CREATE TRIGGER propagate_decree_to_cum_eating AFTER UPDATE OF status ON handler_decrees FOR EACH ROW EXECUTE FUNCTION trg_propagate_decree_to_cum_eating();

INSERT INTO cum_eating_settings (user_id, enabled, current_phase)
VALUES ('8c69b9c8-34eb-4147-9fec-3c1a5bc74b6f', TRUE, 0), ('93327332-7d0d-4888-889a-1607a5776216', TRUE, 0)
ON CONFLICT (user_id) DO UPDATE SET enabled = TRUE, updated_at = now();

DO $do$ BEGIN IF EXISTS (SELECT 1 FROM cron.job WHERE jobname='cum-eating-weekly') THEN PERFORM cron.unschedule('cum-eating-weekly'); END IF; EXCEPTION WHEN undefined_table THEN NULL; END $do$;
DO $do$ BEGIN PERFORM cron.schedule('cum-eating-weekly', '0 23 * * 6', $cron$SELECT cum_eating_eval()$cron$); EXCEPTION WHEN undefined_table THEN NULL; END $do$;
