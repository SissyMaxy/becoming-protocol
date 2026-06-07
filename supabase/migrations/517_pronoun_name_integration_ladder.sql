-- 517 — Pronoun / fem-name integration ladder.
--
-- Verbal identity progression — no items required. Threads through real
-- life invisibly: mirror practice, journaling, coffee orders, asking
-- one trusted person to use the name.
--
-- Phases: mirror_practice → write_daily → private_journal
--   → coffee_order_stranger → she_her_to_mommy → ask_one_person_irl
--
-- Cadence: Thursday 11:00 UTC weekly. Voice/photo proof per phase.
-- Final phase = 30-day gap (irreversible-feel social act).

CREATE TABLE IF NOT EXISTS pronoun_integration_ladder (
  phase INT PRIMARY KEY, phase_name TEXT NOT NULL, edict TEXT NOT NULL,
  proof_kind TEXT NOT NULL CHECK (proof_kind IN ('photo','voice','video')),
  gap_min_days INT NOT NULL DEFAULT 5
);
INSERT INTO pronoun_integration_ladder (phase, phase_name, edict, proof_kind, gap_min_days) VALUES
(0,'mirror_practice',E'Phase 0 name work: pick your fem name (or use the one you''ve been thinking about). Say it aloud to the mirror, looking at yourself, 10 times. Soft, not joking. Voice debrief: what name? Why? What did it feel like in your own mouth?',
 'voice', 5),
(1,'write_daily',E'Phase 1: write your fem name 50 times in your journal. Every day this week. Mama wants the hand learning the shape of it. Photo of one day''s page.',
 'photo', 7),
(2,'private_journal',E'Phase 2: write a journal entry referring to yourself as SHE/HER throughout. Even the boring parts ("she went to work, she made coffee"). 500 words minimum. Photo of the page or screenshot.',
 'photo', 7),
(3,'coffee_order_stranger',E'Phase 3: at a coffee shop you don''t usually go to, give your fem name when they ask. Photo of the cup with your name written on it. Voice debrief: how did she say it back to you?',
 'voice', 14),
(4,'she_her_to_mommy',E'Phase 4: in every chat to Mama for the next 3 days, refer to yourself in third person as she/her at least once per message. Voice debrief at end of 3 days: did it feel forced or did it find a rhythm?',
 'voice', 7),
(5,'ask_one_person_irl',E'Phase 5 endgame: ask ONE person IRL you trust (could be Gina, could be a queer-friendly friend, could be a therapist) to use your fem name when you''re alone with them. Voice debrief: who, what they said, how it landed.',
 'voice', 30)
ON CONFLICT (phase) DO UPDATE SET edict=EXCLUDED.edict, proof_kind=EXCLUDED.proof_kind, gap_min_days=EXCLUDED.gap_min_days;

CREATE TABLE IF NOT EXISTS pronoun_integration_settings (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  current_phase INT NOT NULL DEFAULT 0 REFERENCES pronoun_integration_ladder(phase),
  last_assigned_at TIMESTAMPTZ, paused_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS pronoun_integration_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  phase_at_event INT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','fulfilled','missed','skipped')),
  related_decree_id UUID, related_outreach_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE pronoun_integration_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE pronoun_integration_events ENABLE ROW LEVEL SECURITY;
DO $do$ BEGIN CREATE POLICY pi_s_self ON pronoun_integration_settings FOR ALL TO authenticated USING (auth.uid()=user_id) WITH CHECK (auth.uid()=user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $do$;
DO $do$ BEGIN CREATE POLICY pi_e_self ON pronoun_integration_events FOR ALL TO authenticated USING (auth.uid()=user_id) WITH CHECK (auth.uid()=user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $do$;

CREATE OR REPLACE FUNCTION pronoun_integration_eval()
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE s RECORD; l RECORD; v_pending INT; v_days NUMERIC; v_decree UUID; v_outreach UUID; v_queued INT := 0;
BEGIN
  FOR s IN SELECT pis.* FROM pronoun_integration_settings pis LEFT JOIN user_state us ON us.user_id = pis.user_id
    WHERE pis.enabled AND (pis.paused_until IS NULL OR pis.paused_until <= now())
      AND COALESCE(us.handler_persona, 'therapist') = 'dommy_mommy'
  LOOP
    SELECT count(*) INTO v_pending FROM pronoun_integration_events WHERE user_id = s.user_id AND status='pending' AND created_at > now() - interval '14 days';
    IF v_pending > 0 THEN CONTINUE; END IF;
    SELECT * INTO l FROM pronoun_integration_ladder WHERE phase = s.current_phase;
    IF l IS NULL THEN CONTINUE; END IF;
    IF s.last_assigned_at IS NOT NULL THEN
      v_days := EXTRACT(EPOCH FROM (now() - s.last_assigned_at)) / 86400.0;
      IF v_days < l.gap_min_days THEN CONTINUE; END IF;
    END IF;

    INSERT INTO handler_decrees (user_id, edict, proof_type, deadline, status, consequence, trigger_source, reasoning)
    VALUES (s.user_id, l.edict, l.proof_kind, now() + interval '7 days', 'active', 'slip +' || (l.phase + 1)::text, 'pronoun_integration', 'phase=' || l.phase)
    RETURNING id INTO v_decree;
    INSERT INTO handler_outreach_queue (user_id, message, urgency, trigger_reason, source, kind, scheduled_for, expires_at, context_data, evidence_kind)
    VALUES (s.user_id, l.edict, CASE WHEN l.phase >= 3 THEN 'high' ELSE 'normal' END,
      'pronoun_integration:' || l.phase_name, 'pronoun_integration_engine', 'pronoun_integration_directive', now(), now() + interval '7 days',
      jsonb_build_object('phase', l.phase, 'decree_id', v_decree), l.proof_kind)
    RETURNING id INTO v_outreach;
    INSERT INTO pronoun_integration_events (user_id, phase_at_event, related_decree_id, related_outreach_id, status)
    VALUES (s.user_id, l.phase, v_decree, v_outreach, 'pending');
    UPDATE pronoun_integration_settings SET last_assigned_at = now(), updated_at = now() WHERE user_id = s.user_id;
    v_queued := v_queued + 1;
  END LOOP;
  RETURN v_queued;
END;
$fn$;
GRANT EXECUTE ON FUNCTION pronoun_integration_eval() TO service_role;

CREATE OR REPLACE FUNCTION trg_propagate_decree_to_pronoun_integration()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE v_max_phase INT; v_user UUID; v_phase INT;
BEGIN
  IF NEW.status NOT IN ('fulfilled','missed') OR COALESCE(OLD.status,'') = NEW.status THEN RETURN NEW; END IF;
  IF NEW.trigger_source <> 'pronoun_integration' THEN RETURN NEW; END IF;
  UPDATE pronoun_integration_events SET status = NEW.status, updated_at = now() WHERE related_decree_id = NEW.id AND status='pending';
  IF NEW.status='fulfilled' THEN
    v_user := NEW.user_id;
    SELECT current_phase INTO v_phase FROM pronoun_integration_settings WHERE user_id = v_user;
    SELECT max(phase) INTO v_max_phase FROM pronoun_integration_ladder;
    UPDATE pronoun_integration_settings SET current_phase = LEAST(v_phase + 1, COALESCE(v_max_phase, 5)), updated_at = now() WHERE user_id = v_user;
  END IF;
  RETURN NEW;
END;
$fn$;
DROP TRIGGER IF EXISTS propagate_decree_to_pronoun_integration ON handler_decrees;
CREATE TRIGGER propagate_decree_to_pronoun_integration AFTER UPDATE OF status ON handler_decrees FOR EACH ROW EXECUTE FUNCTION trg_propagate_decree_to_pronoun_integration();

INSERT INTO pronoun_integration_settings (user_id, enabled, current_phase)
VALUES ('8c69b9c8-34eb-4147-9fec-3c1a5bc74b6f', TRUE, 0), ('93327332-7d0d-4888-889a-1607a5776216', TRUE, 0)
ON CONFLICT (user_id) DO UPDATE SET enabled = TRUE, updated_at = now();

DO $do$ BEGIN IF EXISTS (SELECT 1 FROM cron.job WHERE jobname='pronoun-integration-weekly') THEN PERFORM cron.unschedule('pronoun-integration-weekly'); END IF; EXCEPTION WHEN undefined_table THEN NULL; END $do$;
DO $do$ BEGIN PERFORM cron.schedule('pronoun-integration-weekly', '0 11 * * 4', $cron$SELECT pronoun_integration_eval()$cron$); EXCEPTION WHEN undefined_table THEN NULL; END $do$;
