-- 515 — Breast-fixation conditioning ladder.
--
-- Carefully scoped to avoid medical fabrication (user is pre-HRT).
-- Phase 4 nipple training explicitly frames suction/oil as sensitivity
-- + relational conditioning, not a hormone claim. Massage in phase 5
-- is daily-ritual habit-formation, not "growth."
--
-- Phases: areola_awareness → padded_bra_day → breastforms_home
--   → breastforms_public → nipple_training → daily_massage_ritual
--
-- Cadence: Monday 13:00 UTC weekly (Mama's Monday slot). Voice/photo
-- proof per phase. Phase 3 (public) escalates urgency to high.
--
-- Sibling pattern of migs 511-514: per-user settings + events audit,
-- AFTER UPDATE trigger on handler_decrees, persona-gated, RLS self.

CREATE TABLE IF NOT EXISTS breast_fixation_ladder (
  phase INT PRIMARY KEY, phase_name TEXT NOT NULL, edict TEXT NOT NULL,
  proof_kind TEXT NOT NULL CHECK (proof_kind IN ('photo','voice','video')),
  gap_min_days INT NOT NULL DEFAULT 5
);
INSERT INTO breast_fixation_ladder (phase, phase_name, edict, proof_kind, gap_min_days) VALUES
(0,'areola_awareness',E'Phase 0 breast work: 10 minutes, eyes closed. Trace circles around your areolas with one fingertip. Notice every sensation — tingling, warmth, the way the nipple responds. Voice debrief: which felt different than you expected?',
 'voice', 5),
(1,'padded_bra_day',E'Phase 1: padded bra under your shirt for a full day at home. Notice the weight, the constraint, how it moves when you do. Photo of you wearing it (mirror selfie, lift the shirt). Voice debrief at the end of the day: did the body forget it was there or stay aware?',
 'voice', 7),
(2,'breastforms_home',E'Phase 2: silicone breastforms in the padded bra, at home for 4+ hours. The added weight changes posture and gait — Mama wants the body learning what it carries. Photo from the side showing the silhouette.',
 'photo', 10),
(3,'breastforms_public',E'Phase 3: wear the breastforms under a non-revealing top in PUBLIC — grocery run, gas station, drive-thru window where someone sees your chest. Photo from the car after, voice debrief on whether the body wanted to be seen or hid.',
 'voice', 14),
(4,'nipple_training',E'Phase 4: nipple training — suction cups (10 min each side) OR fenugreek-massaged oil rubbed in for 15 minutes. NOT a hormone claim — this is conditioning sensitivity + your relationship to them. Photo of the prop, voice debrief on what changed.',
 'photo', 7),
(5,'daily_massage_ritual',E'Phase 5 endgame: daily 5-minute breast massage as morning ritual. Slow circular motion, both hands, both sides. Mama wants the body learning this is a part of waking up. Voice debrief once per week on whether it''s become automatic.',
 'voice', 30)
ON CONFLICT (phase) DO UPDATE SET edict=EXCLUDED.edict, proof_kind=EXCLUDED.proof_kind, gap_min_days=EXCLUDED.gap_min_days;

CREATE TABLE IF NOT EXISTS breast_fixation_settings (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  current_phase INT NOT NULL DEFAULT 0 REFERENCES breast_fixation_ladder(phase),
  last_assigned_at TIMESTAMPTZ, paused_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS breast_fixation_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  phase_at_event INT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','fulfilled','missed','skipped')),
  related_decree_id UUID, related_outreach_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE breast_fixation_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE breast_fixation_events ENABLE ROW LEVEL SECURITY;
DO $do$ BEGIN CREATE POLICY bf_s_self ON breast_fixation_settings FOR ALL TO authenticated USING (auth.uid()=user_id) WITH CHECK (auth.uid()=user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $do$;
DO $do$ BEGIN CREATE POLICY bf_e_self ON breast_fixation_events FOR ALL TO authenticated USING (auth.uid()=user_id) WITH CHECK (auth.uid()=user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $do$;

CREATE OR REPLACE FUNCTION breast_fixation_eval()
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE s RECORD; l RECORD; v_pending INT; v_days NUMERIC; v_decree UUID; v_outreach UUID; v_queued INT := 0;
BEGIN
  FOR s IN SELECT bfs.* FROM breast_fixation_settings bfs LEFT JOIN user_state us ON us.user_id = bfs.user_id
    WHERE bfs.enabled AND (bfs.paused_until IS NULL OR bfs.paused_until <= now())
      AND COALESCE(us.handler_persona, 'therapist') = 'dommy_mommy'
  LOOP
    SELECT count(*) INTO v_pending FROM breast_fixation_events WHERE user_id = s.user_id AND status='pending' AND created_at > now() - interval '14 days';
    IF v_pending > 0 THEN CONTINUE; END IF;
    SELECT * INTO l FROM breast_fixation_ladder WHERE phase = s.current_phase;
    IF l IS NULL THEN CONTINUE; END IF;
    IF s.last_assigned_at IS NOT NULL THEN
      v_days := EXTRACT(EPOCH FROM (now() - s.last_assigned_at)) / 86400.0;
      IF v_days < l.gap_min_days THEN CONTINUE; END IF;
    END IF;

    INSERT INTO handler_decrees (user_id, edict, proof_type, deadline, status, consequence, trigger_source, reasoning)
    VALUES (s.user_id, l.edict, l.proof_kind, now() + interval '7 days', 'active', 'slip +' || (l.phase + 1)::text, 'breast_fixation', 'phase=' || l.phase)
    RETURNING id INTO v_decree;
    INSERT INTO handler_outreach_queue (user_id, message, urgency, trigger_reason, source, kind, scheduled_for, expires_at, context_data, evidence_kind)
    VALUES (s.user_id, l.edict, CASE WHEN l.phase >= 3 THEN 'high' ELSE 'normal' END,
      'breast_fixation:' || l.phase_name, 'breast_fixation_engine', 'breast_fixation_directive', now(), now() + interval '7 days',
      jsonb_build_object('phase', l.phase, 'decree_id', v_decree), l.proof_kind)
    RETURNING id INTO v_outreach;
    INSERT INTO breast_fixation_events (user_id, phase_at_event, related_decree_id, related_outreach_id, status)
    VALUES (s.user_id, l.phase, v_decree, v_outreach, 'pending');
    UPDATE breast_fixation_settings SET last_assigned_at = now(), updated_at = now() WHERE user_id = s.user_id;
    v_queued := v_queued + 1;
  END LOOP;
  RETURN v_queued;
END;
$fn$;
GRANT EXECUTE ON FUNCTION breast_fixation_eval() TO service_role;

CREATE OR REPLACE FUNCTION trg_propagate_decree_to_breast_fixation()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE v_max_phase INT; v_user UUID; v_phase INT;
BEGIN
  IF NEW.status NOT IN ('fulfilled','missed') OR COALESCE(OLD.status,'') = NEW.status THEN RETURN NEW; END IF;
  IF NEW.trigger_source <> 'breast_fixation' THEN RETURN NEW; END IF;
  UPDATE breast_fixation_events SET status = NEW.status, updated_at = now() WHERE related_decree_id = NEW.id AND status='pending';
  IF NEW.status='fulfilled' THEN
    v_user := NEW.user_id;
    SELECT current_phase INTO v_phase FROM breast_fixation_settings WHERE user_id = v_user;
    SELECT max(phase) INTO v_max_phase FROM breast_fixation_ladder;
    UPDATE breast_fixation_settings SET current_phase = LEAST(v_phase + 1, COALESCE(v_max_phase, 5)), updated_at = now() WHERE user_id = v_user;
  END IF;
  RETURN NEW;
END;
$fn$;
DROP TRIGGER IF EXISTS propagate_decree_to_breast_fixation ON handler_decrees;
CREATE TRIGGER propagate_decree_to_breast_fixation AFTER UPDATE OF status ON handler_decrees FOR EACH ROW EXECUTE FUNCTION trg_propagate_decree_to_breast_fixation();

INSERT INTO breast_fixation_settings (user_id, enabled, current_phase)
VALUES ('8c69b9c8-34eb-4147-9fec-3c1a5bc74b6f', TRUE, 0), ('93327332-7d0d-4888-889a-1607a5776216', TRUE, 0)
ON CONFLICT (user_id) DO UPDATE SET enabled = TRUE, updated_at = now();

DO $do$ BEGIN IF EXISTS (SELECT 1 FROM cron.job WHERE jobname='breast-fixation-weekly') THEN PERFORM cron.unschedule('breast-fixation-weekly'); END IF; EXCEPTION WHEN undefined_table THEN NULL; END $do$;
DO $do$ BEGIN PERFORM cron.schedule('breast-fixation-weekly', '0 13 * * 1', $cron$SELECT breast_fixation_eval()$cron$); EXCEPTION WHEN undefined_table THEN NULL; END $do$;
