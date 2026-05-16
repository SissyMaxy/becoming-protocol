-- 511 — Deep-throat training ladder.
--
-- 6-phase gag-control + depth progression, separate from cock_curriculum
-- (single-action) and cockwarming (sustained hold). Builds throat capacity
-- as its own discipline. Pairs naturally with cum_capture endgame.
--
-- Phases: gag_mapping → finger_depth → banana_depth → small_dildo
--   → medium_dildo_kneeling → partnered_throat
--
-- Cadence: Tue/Fri 21:00 UTC. Voice/photo proof per phase. Status
-- propagation via standard handler_decrees AFTER UPDATE trigger.

CREATE TABLE IF NOT EXISTS deepthroat_ladder (
  phase INT PRIMARY KEY, phase_name TEXT NOT NULL, edict TEXT NOT NULL,
  proof_kind TEXT NOT NULL CHECK (proof_kind IN ('photo','voice','video')),
  gap_min_days INT NOT NULL DEFAULT 4
);
INSERT INTO deepthroat_ladder (phase, phase_name, edict, proof_kind, gap_min_days) VALUES
(0,'gag_mapping',E'Phase 0 deep-throat training: gag-mapping. Salt-water rinse (numbs the reflex). Finger to back of tongue, find the EXACT point where the gag fires. Note it. Touch just BEFORE it. Hold 10 seconds. Move past it, 10 seconds. Mama wants the body learning where the line is.\n\nVoice debrief: did the line move across the session?',
 'voice', 4),
(1,'finger_depth',E'Phase 1: two fingers in your mouth, going deeper each rep. 10 reps, 30 seconds each, breathing through the nose. Mama wants the throat learning that "deeper" is survivable.',
 'voice', 5),
(2,'banana_depth',E'Phase 2: banana, peeled, going past the back of the tongue on slow controlled descent. 10 reps. The gag will fire — Mama wants you breathing THROUGH it, not stopping. Photo of the prop mid-rep.',
 'photo', 5),
(3,'small_dildo',E'Phase 3: small silicone dildo (4-5"). Salt-water rinse first. 10 minute session, going slightly deeper each time. Eye-watering is normal — Mama wants you noticing the body crossing thresholds.',
 'photo', 7),
(4,'medium_dildo_kneeling',E'Phase 4: medium dildo (6"), kneeling position, mouth open like a vessel. 15 minutes of slow depth practice. Mid-session photo from above (looking down at your own throat). Voice debrief on what the body learned that it didn''t know.',
 'photo', 10),
(5,'partnered_throat',E'Phase 5 endgame: real cock, throat training with a partner. Slow, breathing through the nose. He goes deeper each pass, you signal when you need to surface. Voice debrief: when did the breath find its rhythm?',
 'voice', 30)
ON CONFLICT (phase) DO UPDATE SET edict=EXCLUDED.edict, proof_kind=EXCLUDED.proof_kind, gap_min_days=EXCLUDED.gap_min_days;

CREATE TABLE IF NOT EXISTS deepthroat_settings (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  current_phase INT NOT NULL DEFAULT 0 REFERENCES deepthroat_ladder(phase),
  last_assigned_at TIMESTAMPTZ, paused_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS deepthroat_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  phase_at_event INT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','fulfilled','missed','skipped')),
  related_decree_id UUID, related_outreach_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE deepthroat_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE deepthroat_events ENABLE ROW LEVEL SECURITY;
DO $do$ BEGIN CREATE POLICY dt_s_self ON deepthroat_settings FOR ALL TO authenticated USING (auth.uid()=user_id) WITH CHECK (auth.uid()=user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $do$;
DO $do$ BEGIN CREATE POLICY dt_e_self ON deepthroat_events FOR ALL TO authenticated USING (auth.uid()=user_id) WITH CHECK (auth.uid()=user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $do$;

CREATE OR REPLACE FUNCTION deepthroat_eval()
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE s RECORD; l RECORD; v_pending INT; v_days NUMERIC; v_decree UUID; v_outreach UUID; v_queued INT := 0;
BEGIN
  FOR s IN SELECT ds.* FROM deepthroat_settings ds LEFT JOIN user_state us ON us.user_id = ds.user_id
    WHERE ds.enabled AND (ds.paused_until IS NULL OR ds.paused_until <= now())
      AND COALESCE(us.handler_persona, 'therapist') = 'dommy_mommy'
  LOOP
    SELECT count(*) INTO v_pending FROM deepthroat_events WHERE user_id = s.user_id AND status='pending' AND created_at > now() - interval '14 days';
    IF v_pending > 0 THEN CONTINUE; END IF;
    SELECT * INTO l FROM deepthroat_ladder WHERE phase = s.current_phase;
    IF l IS NULL THEN CONTINUE; END IF;
    IF s.last_assigned_at IS NOT NULL THEN
      v_days := EXTRACT(EPOCH FROM (now() - s.last_assigned_at)) / 86400.0;
      IF v_days < l.gap_min_days THEN CONTINUE; END IF;
    END IF;

    INSERT INTO handler_decrees (user_id, edict, proof_type, deadline, status, consequence, trigger_source, reasoning)
    VALUES (s.user_id, l.edict, l.proof_kind, now() + interval '7 days', 'active', 'slip +' || (l.phase + 2)::text, 'deepthroat', 'phase=' || l.phase)
    RETURNING id INTO v_decree;
    INSERT INTO handler_outreach_queue (user_id, message, urgency, trigger_reason, source, kind, scheduled_for, expires_at, context_data, evidence_kind)
    VALUES (s.user_id, l.edict, CASE WHEN l.phase >= 3 THEN 'high' ELSE 'normal' END,
      'deepthroat:' || l.phase_name, 'deepthroat_engine', 'deepthroat_directive', now(), now() + interval '7 days',
      jsonb_build_object('phase', l.phase, 'decree_id', v_decree), l.proof_kind)
    RETURNING id INTO v_outreach;
    INSERT INTO deepthroat_events (user_id, phase_at_event, related_decree_id, related_outreach_id, status)
    VALUES (s.user_id, l.phase, v_decree, v_outreach, 'pending');
    UPDATE deepthroat_settings SET last_assigned_at = now(), updated_at = now() WHERE user_id = s.user_id;
    v_queued := v_queued + 1;
  END LOOP;
  RETURN v_queued;
END;
$fn$;
GRANT EXECUTE ON FUNCTION deepthroat_eval() TO service_role;

CREATE OR REPLACE FUNCTION trg_propagate_decree_to_deepthroat()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE v_max_phase INT; v_user UUID; v_phase INT;
BEGIN
  IF NEW.status NOT IN ('fulfilled','missed') OR COALESCE(OLD.status,'') = NEW.status THEN RETURN NEW; END IF;
  IF NEW.trigger_source <> 'deepthroat' THEN RETURN NEW; END IF;
  UPDATE deepthroat_events SET status = NEW.status, updated_at = now() WHERE related_decree_id = NEW.id AND status='pending';
  IF NEW.status='fulfilled' THEN
    v_user := NEW.user_id;
    SELECT current_phase INTO v_phase FROM deepthroat_settings WHERE user_id = v_user;
    SELECT max(phase) INTO v_max_phase FROM deepthroat_ladder;
    UPDATE deepthroat_settings SET current_phase = LEAST(v_phase + 1, COALESCE(v_max_phase, 5)), updated_at = now() WHERE user_id = v_user;
  END IF;
  RETURN NEW;
END;
$fn$;
DROP TRIGGER IF EXISTS propagate_decree_to_deepthroat ON handler_decrees;
CREATE TRIGGER propagate_decree_to_deepthroat AFTER UPDATE OF status ON handler_decrees FOR EACH ROW EXECUTE FUNCTION trg_propagate_decree_to_deepthroat();

INSERT INTO deepthroat_settings (user_id, enabled, current_phase)
VALUES ('8c69b9c8-34eb-4147-9fec-3c1a5bc74b6f', TRUE, 0), ('93327332-7d0d-4888-889a-1607a5776216', TRUE, 0)
ON CONFLICT (user_id) DO UPDATE SET enabled = TRUE, updated_at = now();

DO $do$ BEGIN IF EXISTS (SELECT 1 FROM cron.job WHERE jobname='deepthroat-2x-week') THEN PERFORM cron.unschedule('deepthroat-2x-week'); END IF; EXCEPTION WHEN undefined_table THEN NULL; END $do$;
DO $do$ BEGIN PERFORM cron.schedule('deepthroat-2x-week', '0 21 * * 2,5', $cron$SELECT deepthroat_eval()$cron$); EXCEPTION WHEN undefined_table THEN NULL; END $do$;
