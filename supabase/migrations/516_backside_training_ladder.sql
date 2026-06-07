-- 516 — Backside training ladder.
--
-- 8-phase receiving-side conditioning. Pairs with mig 514 (realcock_discovery)
-- on the receiving side. Endgame (phase 7) is funnel-gated at step >= 4 so
-- we never queue a real-penetration phase the funnel hasn't supplied a
-- contact for.
--
-- Phases: kegels_daily → external_relax → small_plug_15min → medium_plug_all_day
--   → small_dildo_self → medium_dildo_kneeling → large_dildo_full_depth
--   → first_real_penetration
--
-- Cadence: Sun + Wed 22:00 UTC (2x weekly — frequent enough to build
-- progress, sparse enough that the pelvic floor recovers).
--
-- Funnel-gate degrades open (v_max_funnel_step := 99) when hookup_funnel
-- table/column missing — same pattern as mig 514. Sibling tables: settings
-- + events + AFTER UPDATE trigger on handler_decrees.

CREATE TABLE IF NOT EXISTS backside_training_ladder (
  phase INT PRIMARY KEY, phase_name TEXT NOT NULL, edict TEXT NOT NULL,
  proof_kind TEXT NOT NULL CHECK (proof_kind IN ('photo','voice','video')),
  gap_min_days INT NOT NULL DEFAULT 6,
  funnel_min_step INT NOT NULL DEFAULT 0
);
INSERT INTO backside_training_ladder (phase, phase_name, edict, proof_kind, gap_min_days, funnel_min_step) VALUES
(0,'kegels_daily',E'Phase 0 backside: 3 sets of 15 kegels, daily for a week. Squeeze + hold 5 sec + release. Mama wants the pelvic floor learning how to relax on command, not just contract. Voice debrief at end of week: can you tell the difference between clenched and held?',
 'voice', 7, 0),
(1,'external_relax',E'Phase 1: external warmup. Hot shower, lube, single finger external pressure for 5 minutes. Goal is muscle relaxation, NOT entry. The body learns "touch here means relax not tense."',
 'voice', 5, 0),
(2,'small_plug_15min',E'Phase 2: small plug (training size, not "starter set"), 15 minutes wearing it. Slow lubricated entry, breathe through any urge to push out. Photo of the plug + lube on the counter, voice debrief on whether the body found a quiet point.',
 'voice', 7, 0),
(3,'medium_plug_all_day',E'Phase 3: medium plug worn at home for 4 hours straight, doing normal activities. Mama wants the body learning to FORGET it''s there. Photo at start + end. Voice debrief on the moment you noticed you''d forgotten.',
 'voice', 14, 0),
(4,'small_dildo_self',E'Phase 4: small dildo (4-5"), self-penetration in shower or bed. 10 minute session, finding angle, learning what each angle does. Voice debrief: which angle did the body want more of?',
 'voice', 10, 0),
(5,'medium_dildo_kneeling',E'Phase 5: medium dildo (6-7") suction-cupped to floor or shower wall. Kneeling, self-penetrating at your own pace. 20 minutes. Mama wants the body learning to want more.',
 'voice', 14, 0),
(6,'large_dildo_full_depth',E'Phase 6: large dildo (8"+) — get to full depth. May take multiple attempts in one session. Stop if pain (not stretch). Voice debrief on what full felt like.',
 'voice', 21, 0),
(7,'first_real_penetration',E'Phase 7 endgame: real cock, real penetration with a partner from the funnel. He goes slow, you stay relaxed. Voice debrief in the car after: did the body do what you trained it to?',
 'voice', 60, 4)
ON CONFLICT (phase) DO UPDATE SET edict=EXCLUDED.edict, proof_kind=EXCLUDED.proof_kind, gap_min_days=EXCLUDED.gap_min_days, funnel_min_step=EXCLUDED.funnel_min_step;

CREATE TABLE IF NOT EXISTS backside_training_settings (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  current_phase INT NOT NULL DEFAULT 0 REFERENCES backside_training_ladder(phase),
  last_assigned_at TIMESTAMPTZ, paused_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS backside_training_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  phase_at_event INT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','fulfilled','missed','skipped')),
  related_decree_id UUID, related_outreach_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE backside_training_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE backside_training_events ENABLE ROW LEVEL SECURITY;
DO $do$ BEGIN CREATE POLICY bst_s_self ON backside_training_settings FOR ALL TO authenticated USING (auth.uid()=user_id) WITH CHECK (auth.uid()=user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $do$;
DO $do$ BEGIN CREATE POLICY bst_e_self ON backside_training_events FOR ALL TO authenticated USING (auth.uid()=user_id) WITH CHECK (auth.uid()=user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $do$;

CREATE OR REPLACE FUNCTION backside_training_eval()
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE s RECORD; l RECORD; v_pending INT; v_days NUMERIC; v_decree UUID; v_outreach UUID; v_queued INT := 0;
  v_max_funnel_step INT;
BEGIN
  FOR s IN SELECT bts.* FROM backside_training_settings bts LEFT JOIN user_state us ON us.user_id = bts.user_id
    WHERE bts.enabled AND (bts.paused_until IS NULL OR bts.paused_until <= now())
      AND COALESCE(us.handler_persona, 'therapist') = 'dommy_mommy'
  LOOP
    SELECT count(*) INTO v_pending FROM backside_training_events WHERE user_id = s.user_id AND status='pending' AND created_at > now() - interval '21 days';
    IF v_pending > 0 THEN CONTINUE; END IF;
    SELECT * INTO l FROM backside_training_ladder WHERE phase = s.current_phase;
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
    VALUES (s.user_id, l.edict, l.proof_kind, now() + interval '7 days', 'active', 'slip +' || (l.phase + 1)::text, 'backside_training', 'phase=' || l.phase)
    RETURNING id INTO v_decree;
    INSERT INTO handler_outreach_queue (user_id, message, urgency, trigger_reason, source, kind, scheduled_for, expires_at, context_data, evidence_kind)
    VALUES (s.user_id, l.edict, CASE WHEN l.phase >= 4 THEN 'high' ELSE 'normal' END,
      'backside_training:' || l.phase_name, 'backside_training_engine', 'backside_training_directive', now(), now() + interval '7 days',
      jsonb_build_object('phase', l.phase, 'decree_id', v_decree), l.proof_kind)
    RETURNING id INTO v_outreach;
    INSERT INTO backside_training_events (user_id, phase_at_event, related_decree_id, related_outreach_id, status)
    VALUES (s.user_id, l.phase, v_decree, v_outreach, 'pending');
    UPDATE backside_training_settings SET last_assigned_at = now(), updated_at = now() WHERE user_id = s.user_id;
    v_queued := v_queued + 1;
  END LOOP;
  RETURN v_queued;
END;
$fn$;
GRANT EXECUTE ON FUNCTION backside_training_eval() TO service_role;

CREATE OR REPLACE FUNCTION trg_propagate_decree_to_backside_training()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE v_max_phase INT; v_user UUID; v_phase INT;
BEGIN
  IF NEW.status NOT IN ('fulfilled','missed') OR COALESCE(OLD.status,'') = NEW.status THEN RETURN NEW; END IF;
  IF NEW.trigger_source <> 'backside_training' THEN RETURN NEW; END IF;
  UPDATE backside_training_events SET status = NEW.status, updated_at = now() WHERE related_decree_id = NEW.id AND status='pending';
  IF NEW.status='fulfilled' THEN
    v_user := NEW.user_id;
    SELECT current_phase INTO v_phase FROM backside_training_settings WHERE user_id = v_user;
    SELECT max(phase) INTO v_max_phase FROM backside_training_ladder;
    UPDATE backside_training_settings SET current_phase = LEAST(v_phase + 1, COALESCE(v_max_phase, 7)), updated_at = now() WHERE user_id = v_user;
  END IF;
  RETURN NEW;
END;
$fn$;
DROP TRIGGER IF EXISTS propagate_decree_to_backside_training ON handler_decrees;
CREATE TRIGGER propagate_decree_to_backside_training AFTER UPDATE OF status ON handler_decrees FOR EACH ROW EXECUTE FUNCTION trg_propagate_decree_to_backside_training();

INSERT INTO backside_training_settings (user_id, enabled, current_phase)
VALUES ('8c69b9c8-34eb-4147-9fec-3c1a5bc74b6f', TRUE, 0), ('93327332-7d0d-4888-889a-1607a5776216', TRUE, 0)
ON CONFLICT (user_id) DO UPDATE SET enabled = TRUE, updated_at = now();

DO $do$ BEGIN IF EXISTS (SELECT 1 FROM cron.job WHERE jobname='backside-training-2x-week') THEN PERFORM cron.unschedule('backside-training-2x-week'); END IF; EXCEPTION WHEN undefined_table THEN NULL; END $do$;
DO $do$ BEGIN PERFORM cron.schedule('backside-training-2x-week', '0 22 * * 0,3', $cron$SELECT backside_training_eval()$cron$); EXCEPTION WHEN undefined_table THEN NULL; END $do$;
