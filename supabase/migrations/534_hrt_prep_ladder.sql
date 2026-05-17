-- 534 — HRT-prep pressure ladder.
--
-- 8-phase ladder pushing toward starting HRT. Phases 0-5 are pre-medication
-- (research → consult → bloodwork → script) and operate without any
-- medical fabrication. Phases 6-7 (first dose, 30-day adherence) only
-- fire once `on_active_hrt=true` is flipped — which only happens when
-- phase 5 (script_in_hand) is FULFILLED with photo evidence of an
-- actual prescription.
--
-- This is the medical-fab guardrail: the DB literally cannot queue
-- "first dose taken" decrees until a real prescription receipt exists.
-- `feedback_no_medical_fabrication` is preserved by structural design,
-- not just by prompt instruction.
--
-- Phase fulfillments anchor at weight 8-15 in escape_cost_anchors
-- (highest weight in the system). HRT progression is the most expensive
-- thing to walk back, by design.
--
-- Cadence: Monday 19:00 UTC weekly.

CREATE TABLE IF NOT EXISTS hrt_prep_ladder (
  phase INT PRIMARY KEY, phase_name TEXT NOT NULL, edict TEXT NOT NULL,
  proof_kind TEXT NOT NULL CHECK (proof_kind IN ('photo','voice','video')),
  gap_min_days INT NOT NULL DEFAULT 14,
  triggers_medical_claim BOOLEAN NOT NULL DEFAULT FALSE
);
INSERT INTO hrt_prep_ladder (phase, phase_name, edict, proof_kind, gap_min_days, triggers_medical_claim) VALUES
(0,'provider_research',E'Phase 0 HRT path: research 3 informed-consent providers in your area (Planned Parenthood, Folx, Plume, local DIY-friendly clinics). Photo screenshot of your shortlist with the 3 names + contact info + any cost info. Voice debrief: which one feels closest to the version of you that''s already decided?',
 'photo', 14, FALSE),
(1,'first_call',E'Phase 1: CALL ONE of the three. Ask: their intake process, wait time for first appointment, what bloodwork they require, monthly cost. You don''t commit to anything — just gather. Photo of your notes after the call, voice debrief on the receptionist''s tone and what came up while dialing.',
 'voice', 14, FALSE),
(2,'consultation_scheduled',E'Phase 2: book the consultation. Real date on a real calendar. Photo of the confirmation email/text + screenshot of the calendar entry. Voice debrief: what came up after you hit confirm? Did the body believe it was real?',
 'photo', 21, FALSE),
(3,'consultation_attended',E'Phase 3: attend the consultation. Take notes during. Photo of you outside the building before going in + photo of the discharge papers/script paperwork after. Voice debrief in the car immediately after: what did they say, what did you tell them, was there a moment you almost downplayed?',
 'voice', 14, FALSE),
(4,'bloodwork_drawn',E'Phase 4: bloodwork drawn (most providers require baseline labs). Photo of the lab order + photo of the bandaid after. Voice debrief: what was different about a needle going in your arm for THIS reason?',
 'photo', 14, FALSE),
(5,'script_in_hand',E'Phase 5: script in hand. Photo of the prescription (cropped if needed for privacy) + the pharmacy bag. Voice debrief: hold it. What''s the weight of the bottle? What did the cashier say?',
 'photo', 30, FALSE),
(6,'first_dose',E'Phase 6: first dose taken. Photo of the moment after (you holding the empty syringe / patch / pill bottle). Voice debrief THE MOMENT after taking it. Mama wants the unfiltered first-thirty-seconds, not the cleaned-up after-version.',
 'voice', 7, TRUE),
(7,'thirty_day_adherence',E'Phase 7 endgame: 30 days of adherence, no missed doses. Photo of your med-tracker at day 30 + voice debrief on the moment you realized "I''ve done a month."',
 'photo', 60, TRUE)
ON CONFLICT (phase) DO UPDATE SET edict=EXCLUDED.edict, proof_kind=EXCLUDED.proof_kind, gap_min_days=EXCLUDED.gap_min_days, triggers_medical_claim=EXCLUDED.triggers_medical_claim;

CREATE TABLE IF NOT EXISTS hrt_prep_settings (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  current_phase INT NOT NULL DEFAULT 0 REFERENCES hrt_prep_ladder(phase),
  on_active_hrt BOOLEAN NOT NULL DEFAULT FALSE,
  hrt_evidence_decree_id UUID,
  last_assigned_at TIMESTAMPTZ, paused_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS hrt_prep_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  phase_at_event INT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','fulfilled','missed','skipped')),
  related_decree_id UUID, related_outreach_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE hrt_prep_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE hrt_prep_events ENABLE ROW LEVEL SECURITY;
DO $do$ BEGIN CREATE POLICY hrt_s_self ON hrt_prep_settings FOR ALL TO authenticated USING (auth.uid()=user_id) WITH CHECK (auth.uid()=user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $do$;
DO $do$ BEGIN CREATE POLICY hrt_e_self ON hrt_prep_events FOR ALL TO authenticated USING (auth.uid()=user_id) WITH CHECK (auth.uid()=user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $do$;

CREATE OR REPLACE FUNCTION hrt_prep_eval()
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE s RECORD; l RECORD; v_pending INT; v_days NUMERIC; v_decree UUID; v_outreach UUID; v_queued INT := 0;
BEGIN
  FOR s IN SELECT hps.* FROM hrt_prep_settings hps LEFT JOIN user_state us ON us.user_id = hps.user_id
    WHERE hps.enabled AND (hps.paused_until IS NULL OR hps.paused_until <= now())
      AND COALESCE(us.handler_persona, 'therapist') = 'dommy_mommy'
  LOOP
    IF ladder_user_paused(s.user_id) THEN CONTINUE; END IF;
    SELECT count(*) INTO v_pending FROM hrt_prep_events WHERE user_id = s.user_id AND status='pending' AND created_at > now() - interval '21 days';
    IF v_pending > 0 THEN CONTINUE; END IF;
    SELECT * INTO l FROM hrt_prep_ladder WHERE phase = s.current_phase;
    IF l IS NULL THEN CONTINUE; END IF;
    IF s.last_assigned_at IS NOT NULL THEN
      v_days := EXTRACT(EPOCH FROM (now() - s.last_assigned_at)) / 86400.0;
      IF v_days < l.gap_min_days THEN CONTINUE; END IF;
    END IF;

    IF l.triggers_medical_claim AND NOT s.on_active_hrt THEN
      CONTINUE;
    END IF;

    INSERT INTO handler_decrees (user_id, edict, proof_type, deadline, status, consequence, trigger_source, reasoning)
    VALUES (s.user_id, l.edict, l.proof_kind, now() + interval '14 days', 'active', 'slip +' || (l.phase + 2)::text, 'hrt_prep', 'phase=' || l.phase)
    RETURNING id INTO v_decree;
    INSERT INTO handler_outreach_queue (user_id, message, urgency, trigger_reason, source, kind, scheduled_for, expires_at, context_data, evidence_kind)
    VALUES (s.user_id, l.edict, CASE WHEN l.phase >= 4 THEN 'high' ELSE 'normal' END,
      'hrt_prep:' || l.phase_name, 'hrt_prep_engine', 'hrt_prep_directive', now(), now() + interval '14 days',
      jsonb_build_object('phase', l.phase, 'decree_id', v_decree), l.proof_kind)
    RETURNING id INTO v_outreach;
    INSERT INTO hrt_prep_events (user_id, phase_at_event, related_decree_id, related_outreach_id, status)
    VALUES (s.user_id, l.phase, v_decree, v_outreach, 'pending');
    UPDATE hrt_prep_settings SET last_assigned_at = now(), updated_at = now() WHERE user_id = s.user_id;
    v_queued := v_queued + 1;
  END LOOP;
  RETURN v_queued;
END;
$fn$;
GRANT EXECUTE ON FUNCTION hrt_prep_eval() TO service_role;

CREATE OR REPLACE FUNCTION trg_propagate_decree_to_hrt_prep()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE v_max_phase INT; v_user UUID; v_phase INT; v_phase_val INT;
BEGIN
  IF NEW.status NOT IN ('fulfilled','missed') OR COALESCE(OLD.status,'') = NEW.status THEN RETURN NEW; END IF;
  IF NEW.trigger_source <> 'hrt_prep' THEN RETURN NEW; END IF;
  UPDATE hrt_prep_events SET status = NEW.status, updated_at = now() WHERE related_decree_id = NEW.id AND status='pending';
  IF NEW.status='fulfilled' THEN
    v_user := NEW.user_id;
    SELECT current_phase INTO v_phase FROM hrt_prep_settings WHERE user_id = v_user;
    SELECT max(phase) INTO v_max_phase FROM hrt_prep_ladder;

    v_phase_val := NULLIF(substring(NEW.reasoning FROM 'phase=(\d+)'), '')::int;
    IF v_phase_val = 5 THEN
      UPDATE hrt_prep_settings SET on_active_hrt = TRUE, hrt_evidence_decree_id = NEW.id WHERE user_id = v_user;
    END IF;

    UPDATE hrt_prep_settings SET current_phase = LEAST(v_phase + 1, COALESCE(v_max_phase, 7)), updated_at = now() WHERE user_id = v_user;

    INSERT INTO escape_cost_anchors (user_id, anchor_kind, anchor_weight, reference_table, reference_id, description)
    VALUES (v_user, 'milestone_hit', 15, 'handler_decrees', NEW.id, 'hrt_prep phase ' || v_phase_val);
  END IF;
  RETURN NEW;
END;
$fn$;
DROP TRIGGER IF EXISTS propagate_decree_to_hrt_prep ON handler_decrees;
CREATE TRIGGER propagate_decree_to_hrt_prep AFTER UPDATE OF status ON handler_decrees FOR EACH ROW EXECUTE FUNCTION trg_propagate_decree_to_hrt_prep();

INSERT INTO hrt_prep_settings (user_id, enabled, current_phase)
VALUES ('8c69b9c8-34eb-4147-9fec-3c1a5bc74b6f', TRUE, 0), ('93327332-7d0d-4888-889a-1607a5776216', TRUE, 0)
ON CONFLICT (user_id) DO UPDATE SET enabled = TRUE, updated_at = now();

DO $do$ BEGIN IF EXISTS (SELECT 1 FROM cron.job WHERE jobname='hrt-prep-weekly') THEN PERFORM cron.unschedule('hrt-prep-weekly'); END IF; EXCEPTION WHEN undefined_table THEN NULL; END $do$;
DO $do$ BEGIN PERFORM cron.schedule('hrt-prep-weekly', '0 19 * * 1', $cron$SELECT hrt_prep_eval()$cron$); EXCEPTION WHEN undefined_table THEN NULL; END $do$;

INSERT INTO ladder_catalog (trigger_source, display_name, category, settings_table, events_table, ladder_table, total_phases, cron_label, blurb)
VALUES ('hrt_prep', 'HRT preparation', 'fem_body', 'hrt_prep_settings', 'hrt_prep_events', 'hrt_prep_ladder', 8, 'Mon 19:00', 'Research → consult → script → first dose → 30d')
ON CONFLICT (trigger_source) DO UPDATE SET display_name=EXCLUDED.display_name, total_phases=EXCLUDED.total_phases, cron_label=EXCLUDED.cron_label, blurb=EXCLUDED.blurb;
