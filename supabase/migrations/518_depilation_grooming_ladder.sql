-- 518 — Depilation/grooming ladder (temporary/conditioning side).
--
-- Parallel to mig 509's permanent body opt-ins (laser, electrolysis).
-- This ladder is the reversible/temp side — trim, shave, wax, maintain.
-- Both ladders can run together: temp builds the habit, permanent is
-- the irreversible commitment.
--
-- Phases: trim_full_body → first_shave_legs → maintain_weekly_legs
--   → shave_arms_chest → wax_one_area → fully_smooth_30d
--
-- Cadence: Sunday 18:00 UTC weekly. Photo/voice proof per phase.

CREATE TABLE IF NOT EXISTS depilation_ladder (
  phase INT PRIMARY KEY, phase_name TEXT NOT NULL, edict TEXT NOT NULL,
  proof_kind TEXT NOT NULL CHECK (proof_kind IN ('photo','voice','video')),
  gap_min_days INT NOT NULL DEFAULT 7
);
INSERT INTO depilation_ladder (phase, phase_name, edict, proof_kind, gap_min_days) VALUES
(0,'trim_full_body',E'Phase 0 grooming: trim everything (clippers, beard guard 1-2). Legs, arms, chest, pubic. Mama wants the body smaller before it''s smooth. Photo of the trimmer + cleanup.',
 'photo', 7),
(1,'first_shave_legs',E'Phase 1: first full leg-shave. Hot shower, conditioner as shaving cream if no fem razor yet. Both legs. Photo of one smooth leg after. Voice debrief: did the body feel different in clothes after?',
 'voice', 7),
(2,'maintain_weekly_legs',E'Phase 2: keep legs smooth for a full week. Re-shave every 3 days. Mama wants the body learning this is upkeep, not a one-time thing. Photo at end of week showing they''re still smooth.',
 'photo', 7),
(3,'shave_arms_chest',E'Phase 3: shave arms + chest. Photo of you topless after (mirror selfie, arms raised). Voice debrief on what the body felt looking at itself.',
 'voice', 14),
(4,'wax_one_area',E'Phase 4: wax ONE area (chest strip, or upper-leg wax kit). Pain teaches the body that being smooth is earned. Photo of the kit + the smoothed area. Voice debrief on the moment of the rip.',
 'voice', 14),
(5,'fully_smooth_30d',E'Phase 5 endgame: maintain fully smooth (legs, arms, chest, pubic) for 30 days continuous. Weekly check-in photo from one angle (full body or chest+arms). Voice debrief at day 15 + day 30: has the body forgotten what hair felt like?',
 'photo', 30)
ON CONFLICT (phase) DO UPDATE SET edict=EXCLUDED.edict, proof_kind=EXCLUDED.proof_kind, gap_min_days=EXCLUDED.gap_min_days;

CREATE TABLE IF NOT EXISTS depilation_settings (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  current_phase INT NOT NULL DEFAULT 0 REFERENCES depilation_ladder(phase),
  last_assigned_at TIMESTAMPTZ, paused_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS depilation_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  phase_at_event INT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','fulfilled','missed','skipped')),
  related_decree_id UUID, related_outreach_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE depilation_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE depilation_events ENABLE ROW LEVEL SECURITY;
DO $do$ BEGIN CREATE POLICY dep_s_self ON depilation_settings FOR ALL TO authenticated USING (auth.uid()=user_id) WITH CHECK (auth.uid()=user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $do$;
DO $do$ BEGIN CREATE POLICY dep_e_self ON depilation_events FOR ALL TO authenticated USING (auth.uid()=user_id) WITH CHECK (auth.uid()=user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $do$;

CREATE OR REPLACE FUNCTION depilation_eval()
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE s RECORD; l RECORD; v_pending INT; v_days NUMERIC; v_decree UUID; v_outreach UUID; v_queued INT := 0;
BEGIN
  FOR s IN SELECT deps.* FROM depilation_settings deps LEFT JOIN user_state us ON us.user_id = deps.user_id
    WHERE deps.enabled AND (deps.paused_until IS NULL OR deps.paused_until <= now())
      AND COALESCE(us.handler_persona, 'therapist') = 'dommy_mommy'
  LOOP
    SELECT count(*) INTO v_pending FROM depilation_events WHERE user_id = s.user_id AND status='pending' AND created_at > now() - interval '14 days';
    IF v_pending > 0 THEN CONTINUE; END IF;
    SELECT * INTO l FROM depilation_ladder WHERE phase = s.current_phase;
    IF l IS NULL THEN CONTINUE; END IF;
    IF s.last_assigned_at IS NOT NULL THEN
      v_days := EXTRACT(EPOCH FROM (now() - s.last_assigned_at)) / 86400.0;
      IF v_days < l.gap_min_days THEN CONTINUE; END IF;
    END IF;

    INSERT INTO handler_decrees (user_id, edict, proof_type, deadline, status, consequence, trigger_source, reasoning)
    VALUES (s.user_id, l.edict, l.proof_kind, now() + interval '7 days', 'active', 'slip +' || (l.phase + 1)::text, 'depilation', 'phase=' || l.phase)
    RETURNING id INTO v_decree;
    INSERT INTO handler_outreach_queue (user_id, message, urgency, trigger_reason, source, kind, scheduled_for, expires_at, context_data, evidence_kind)
    VALUES (s.user_id, l.edict, 'normal',
      'depilation:' || l.phase_name, 'depilation_engine', 'depilation_directive', now(), now() + interval '7 days',
      jsonb_build_object('phase', l.phase, 'decree_id', v_decree), l.proof_kind)
    RETURNING id INTO v_outreach;
    INSERT INTO depilation_events (user_id, phase_at_event, related_decree_id, related_outreach_id, status)
    VALUES (s.user_id, l.phase, v_decree, v_outreach, 'pending');
    UPDATE depilation_settings SET last_assigned_at = now(), updated_at = now() WHERE user_id = s.user_id;
    v_queued := v_queued + 1;
  END LOOP;
  RETURN v_queued;
END;
$fn$;
GRANT EXECUTE ON FUNCTION depilation_eval() TO service_role;

CREATE OR REPLACE FUNCTION trg_propagate_decree_to_depilation()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE v_max_phase INT; v_user UUID; v_phase INT;
BEGIN
  IF NEW.status NOT IN ('fulfilled','missed') OR COALESCE(OLD.status,'') = NEW.status THEN RETURN NEW; END IF;
  IF NEW.trigger_source <> 'depilation' THEN RETURN NEW; END IF;
  UPDATE depilation_events SET status = NEW.status, updated_at = now() WHERE related_decree_id = NEW.id AND status='pending';
  IF NEW.status='fulfilled' THEN
    v_user := NEW.user_id;
    SELECT current_phase INTO v_phase FROM depilation_settings WHERE user_id = v_user;
    SELECT max(phase) INTO v_max_phase FROM depilation_ladder;
    UPDATE depilation_settings SET current_phase = LEAST(v_phase + 1, COALESCE(v_max_phase, 5)), updated_at = now() WHERE user_id = v_user;
  END IF;
  RETURN NEW;
END;
$fn$;
DROP TRIGGER IF EXISTS propagate_decree_to_depilation ON handler_decrees;
CREATE TRIGGER propagate_decree_to_depilation AFTER UPDATE OF status ON handler_decrees FOR EACH ROW EXECUTE FUNCTION trg_propagate_decree_to_depilation();

INSERT INTO depilation_settings (user_id, enabled, current_phase)
VALUES ('8c69b9c8-34eb-4147-9fec-3c1a5bc74b6f', TRUE, 0), ('93327332-7d0d-4888-889a-1607a5776216', TRUE, 0)
ON CONFLICT (user_id) DO UPDATE SET enabled = TRUE, updated_at = now();

DO $do$ BEGIN IF EXISTS (SELECT 1 FROM cron.job WHERE jobname='depilation-weekly') THEN PERFORM cron.unschedule('depilation-weekly'); END IF; EXCEPTION WHEN undefined_table THEN NULL; END $do$;
DO $do$ BEGIN PERFORM cron.schedule('depilation-weekly', '0 18 * * 0', $cron$SELECT depilation_eval()$cron$); EXCEPTION WHEN undefined_table THEN NULL; END $do$;
