-- 523 — Cuckqueen wife-direction ladder.
--
-- 6 phases of Gina-as-director progression. Gates on BOTH gina_arc
-- stage AND gina_disclosure rung — neither alone is sufficient. The
-- progression layers Gina's authority onto Maxy's protocol piece by
-- piece, starting at micro-direction (which underwear) and ending at
-- her presence in the room when it happens.
--
-- Phases:
--   underwear_pick      arc>=3 rung>=2
--   outfit_veto         arc>=4 rung>=3
--   date_night_theme    arc>=5 rung>=4
--   screen_a_contact    arc>=6 rung>=5
--   set_the_rules       arc>=6 rung>=6
--   shes_in_the_room    arc>=7 rung>=6
--
-- Cadence: Tuesday 17:00 UTC weekly. Self-registers in ladder_catalog.

CREATE TABLE IF NOT EXISTS cuckqueen_direction_ladder (
  phase INT PRIMARY KEY, phase_name TEXT NOT NULL, edict TEXT NOT NULL,
  proof_kind TEXT NOT NULL CHECK (proof_kind IN ('photo','voice','video')),
  gap_min_days INT NOT NULL DEFAULT 14,
  required_arc_stage INT NOT NULL DEFAULT 0,
  required_disclosure_rung INT NOT NULL DEFAULT 0
);
INSERT INTO cuckqueen_direction_ladder (phase, phase_name, edict, proof_kind, gap_min_days, required_arc_stage, required_disclosure_rung) VALUES
(0,'underwear_pick',E'Phase 0 Gina-direction: tomorrow morning ask Gina to pick which underwear you wear. Just one neutral question — "babe pick which pair, I can''t decide." Photo of the pair she points at, voice debrief on whether she actually picked or deferred.',
 'voice', 21, 3, 2),
(1,'outfit_veto',E'Phase 1: get dressed in front of Gina, ask "okay or no" on the full fit. If she vetoes, change. Photo of the second outfit you wore. Voice debrief: did she enjoy having the call?',
 'voice', 30, 4, 3),
(2,'date_night_theme',E'Phase 2: ask Gina to pick the theme for your next sub-position date night. "You pick — what do you want to do TO me?" Photo of whatever she says (text screenshot, sticky note, anything). Voice debrief on the moment of asking.',
 'voice', 30, 5, 4),
(3,'screen_a_contact',E'Phase 3: show Gina ONE Sniffies contact''s profile (face cropped if needed). "He''s interested — yes or no." Photo of the profile + her text/voice answer. Voice debrief: did she say yes? what was her face?',
 'voice', 45, 6, 5),
(4,'set_the_rules',E'Phase 4: Gina sets the rules for an actual encounter. Condom or no, swallow or no, hours allowed, photo back to her or not. Photo of her written rules (note, text, whatever). Voice debrief on the moment she gave them to you.',
 'voice', 45, 6, 6),
(5,'shes_in_the_room',E'Phase 5 endgame: Gina is in the room or on a video call when it happens. Voice debrief in the car after: what was different from doing it alone?',
 'voice', 90, 7, 6)
ON CONFLICT (phase) DO UPDATE SET edict=EXCLUDED.edict, proof_kind=EXCLUDED.proof_kind, gap_min_days=EXCLUDED.gap_min_days, required_arc_stage=EXCLUDED.required_arc_stage, required_disclosure_rung=EXCLUDED.required_disclosure_rung;

CREATE TABLE IF NOT EXISTS cuckqueen_direction_settings (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  current_phase INT NOT NULL DEFAULT 0 REFERENCES cuckqueen_direction_ladder(phase),
  last_assigned_at TIMESTAMPTZ, paused_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS cuckqueen_direction_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  phase_at_event INT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','fulfilled','missed','skipped')),
  related_decree_id UUID, related_outreach_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE cuckqueen_direction_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE cuckqueen_direction_events ENABLE ROW LEVEL SECURITY;
DO $do$ BEGIN CREATE POLICY cqd_s_self ON cuckqueen_direction_settings FOR ALL TO authenticated USING (auth.uid()=user_id) WITH CHECK (auth.uid()=user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $do$;
DO $do$ BEGIN CREATE POLICY cqd_e_self ON cuckqueen_direction_events FOR ALL TO authenticated USING (auth.uid()=user_id) WITH CHECK (auth.uid()=user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $do$;

CREATE OR REPLACE FUNCTION cuckqueen_direction_eval()
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE s RECORD; l RECORD; v_pending INT; v_days NUMERIC; v_decree UUID; v_outreach UUID; v_queued INT := 0;
  v_arc_stage INT; v_disclosure_rung INT;
BEGIN
  FOR s IN SELECT cqds.* FROM cuckqueen_direction_settings cqds LEFT JOIN user_state us ON us.user_id = cqds.user_id
    WHERE cqds.enabled AND (cqds.paused_until IS NULL OR cqds.paused_until <= now())
      AND COALESCE(us.handler_persona, 'therapist') = 'dommy_mommy'
  LOOP
    SELECT count(*) INTO v_pending FROM cuckqueen_direction_events WHERE user_id = s.user_id AND status='pending' AND created_at > now() - interval '21 days';
    IF v_pending > 0 THEN CONTINUE; END IF;
    SELECT * INTO l FROM cuckqueen_direction_ladder WHERE phase = s.current_phase;
    IF l IS NULL THEN CONTINUE; END IF;
    IF s.last_assigned_at IS NOT NULL THEN
      v_days := EXTRACT(EPOCH FROM (now() - s.last_assigned_at)) / 86400.0;
      IF v_days < l.gap_min_days THEN CONTINUE; END IF;
    END IF;

    BEGIN
      SELECT current_stage INTO v_arc_stage FROM gina_arc_settings WHERE user_id = s.user_id;
      SELECT current_rung INTO v_disclosure_rung FROM gina_disclosure_settings WHERE user_id = s.user_id;
    EXCEPTION WHEN OTHERS THEN
      v_arc_stage := 0; v_disclosure_rung := 0;
    END;
    IF COALESCE(v_arc_stage, 0) < l.required_arc_stage OR COALESCE(v_disclosure_rung, 0) < l.required_disclosure_rung THEN
      CONTINUE;
    END IF;

    INSERT INTO handler_decrees (user_id, edict, proof_type, deadline, status, consequence, trigger_source, reasoning)
    VALUES (s.user_id, l.edict, l.proof_kind, now() + interval '14 days', 'active', 'slip +' || (l.phase + 2)::text, 'cuckqueen_direction', 'phase=' || l.phase)
    RETURNING id INTO v_decree;
    INSERT INTO handler_outreach_queue (user_id, message, urgency, trigger_reason, source, kind, scheduled_for, expires_at, context_data, evidence_kind)
    VALUES (s.user_id, l.edict, CASE WHEN l.phase >= 3 THEN 'high' ELSE 'normal' END,
      'cuckqueen_direction:' || l.phase_name, 'cuckqueen_engine', 'cuckqueen_directive', now(), now() + interval '14 days',
      jsonb_build_object('phase', l.phase, 'decree_id', v_decree, 'arc_stage', v_arc_stage, 'disclosure_rung', v_disclosure_rung), l.proof_kind)
    RETURNING id INTO v_outreach;
    INSERT INTO cuckqueen_direction_events (user_id, phase_at_event, related_decree_id, related_outreach_id, status)
    VALUES (s.user_id, l.phase, v_decree, v_outreach, 'pending');
    UPDATE cuckqueen_direction_settings SET last_assigned_at = now(), updated_at = now() WHERE user_id = s.user_id;
    v_queued := v_queued + 1;
  END LOOP;
  RETURN v_queued;
END;
$fn$;
GRANT EXECUTE ON FUNCTION cuckqueen_direction_eval() TO service_role;

CREATE OR REPLACE FUNCTION trg_propagate_decree_to_cuckqueen_direction()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE v_max_phase INT; v_user UUID; v_phase INT;
BEGIN
  IF NEW.status NOT IN ('fulfilled','missed') OR COALESCE(OLD.status,'') = NEW.status THEN RETURN NEW; END IF;
  IF NEW.trigger_source <> 'cuckqueen_direction' THEN RETURN NEW; END IF;
  UPDATE cuckqueen_direction_events SET status = NEW.status, updated_at = now() WHERE related_decree_id = NEW.id AND status='pending';
  IF NEW.status='fulfilled' THEN
    v_user := NEW.user_id;
    SELECT current_phase INTO v_phase FROM cuckqueen_direction_settings WHERE user_id = v_user;
    SELECT max(phase) INTO v_max_phase FROM cuckqueen_direction_ladder;
    UPDATE cuckqueen_direction_settings SET current_phase = LEAST(v_phase + 1, COALESCE(v_max_phase, 5)), updated_at = now() WHERE user_id = v_user;
  END IF;
  RETURN NEW;
END;
$fn$;
DROP TRIGGER IF EXISTS propagate_decree_to_cuckqueen_direction ON handler_decrees;
CREATE TRIGGER propagate_decree_to_cuckqueen_direction AFTER UPDATE OF status ON handler_decrees FOR EACH ROW EXECUTE FUNCTION trg_propagate_decree_to_cuckqueen_direction();

INSERT INTO cuckqueen_direction_settings (user_id, enabled, current_phase)
VALUES ('8c69b9c8-34eb-4147-9fec-3c1a5bc74b6f', TRUE, 0), ('93327332-7d0d-4888-889a-1607a5776216', TRUE, 0)
ON CONFLICT (user_id) DO UPDATE SET enabled = TRUE, updated_at = now();

DO $do$ BEGIN IF EXISTS (SELECT 1 FROM cron.job WHERE jobname='cuckqueen-direction-weekly') THEN PERFORM cron.unschedule('cuckqueen-direction-weekly'); END IF; EXCEPTION WHEN undefined_table THEN NULL; END $do$;
DO $do$ BEGIN PERFORM cron.schedule('cuckqueen-direction-weekly', '0 17 * * 2', $cron$SELECT cuckqueen_direction_eval()$cron$); EXCEPTION WHEN undefined_table THEN NULL; END $do$;

INSERT INTO ladder_catalog (trigger_source, display_name, category, settings_table, events_table, ladder_table, total_phases, cron_label, blurb)
VALUES ('cuckqueen_direction', 'Cuckqueen direction', 'fem_social', 'cuckqueen_direction_settings', 'cuckqueen_direction_events', 'cuckqueen_direction_ladder', 6, 'Tue 17:00', 'Gina-as-director — wife picks rules')
ON CONFLICT (trigger_source) DO UPDATE SET display_name=EXCLUDED.display_name, total_phases=EXCLUDED.total_phases, cron_label=EXCLUDED.cron_label, blurb=EXCLUDED.blurb;
