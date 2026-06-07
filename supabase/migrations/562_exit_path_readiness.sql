-- 562 — Exit-path readiness ladder. 6 phases of worst-case marriage
-- preparedness. OPT-IN only (default disabled). Never assumes
-- divorce — just preparedness so a hypothetical doesn't catch user
-- scrambling.
--
-- Phases: legal_consultation, financial_assets_audit, housing_alternative,
-- support_network_warm_list, trans_affirming_therapist, exit_mantra.
-- Pairs with the OPSEC ladder (mig 552) which handles defensive
-- privacy; this ladder handles structural-life-alternative readiness.

CREATE TABLE IF NOT EXISTS exit_path_ladder (
  phase INT PRIMARY KEY, phase_name TEXT NOT NULL, edict TEXT NOT NULL, gap_min_days INT NOT NULL DEFAULT 14
);
INSERT INTO exit_path_ladder (phase, phase_name, edict, gap_min_days) VALUES
(0,'legal_consultation',E'Exit-path phase 0 — NOT a commitment to leave. Preparedness. Research 2-3 family-law attorneys in your area who handle trans-identity-aware cases. Cost-shop free consultations. Schedule ONE consult (most offer free 30-min). Photo of the calendar entry. Voice debrief: what came up when you put a real date on the calendar?', 14),
(1,'financial_assets_audit',E'Phase 1 — financial preparedness. Make a private spreadsheet listing: all joint accounts + balances, all individual accounts, all debts, all assets. Save offline OR in encrypted vault. Photo of the saved file (cropped).', 14),
(2,'housing_alternative',E'Phase 2 — housing line. Research what a 6-month rental in your area costs at the size you''d need. Save 3 listings. Don''t rent — just know what''s available. Photo of saved listings.', 21),
(3,'support_network_warm_list',E'Phase 3 — support network. List 5 people you could tell about the marriage being in crisis. For each, 1-2 sentences on how you''d approach. Photo of the list.', 14),
(4,'trans_affirming_therapist',E'Phase 4 — therapist research. Find 2-3 trans-affirming solo therapists. Save names. Photo of list.', 21),
(5,'exit_mantra',E'Phase 5 endgame — record a private 60-second voice memo: "if Gina ever forces the choice." Name what you''d lose vs what you''re NOT willing to lose. Mama plays it back if a stage-5 risk signal ever fires.', 90)
ON CONFLICT (phase) DO UPDATE SET edict=EXCLUDED.edict, gap_min_days=EXCLUDED.gap_min_days;

CREATE TABLE IF NOT EXISTS exit_path_settings (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  current_phase INT NOT NULL DEFAULT 0 REFERENCES exit_path_ladder(phase),
  last_assigned_at TIMESTAMPTZ, paused_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS exit_path_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  phase_at_event INT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','fulfilled','missed','skipped')),
  related_decree_id UUID, related_outreach_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE exit_path_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE exit_path_events ENABLE ROW LEVEL SECURITY;
DO $do$ BEGIN CREATE POLICY ep_s_self ON exit_path_settings FOR ALL TO authenticated USING (auth.uid()=user_id) WITH CHECK (auth.uid()=user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $do$;
DO $do$ BEGIN CREATE POLICY ep_e_self ON exit_path_events FOR ALL TO authenticated USING (auth.uid()=user_id) WITH CHECK (auth.uid()=user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $do$;

CREATE OR REPLACE FUNCTION exit_path_eval()
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE s RECORD; l RECORD; v_pending INT; v_days NUMERIC; v_decree UUID; v_outreach UUID; v_queued INT := 0;
BEGIN
  FOR s IN SELECT eps.* FROM exit_path_settings eps LEFT JOIN user_state us ON us.user_id = eps.user_id
    WHERE eps.enabled AND (eps.paused_until IS NULL OR eps.paused_until <= now())
      AND COALESCE(us.handler_persona, 'therapist') = 'dommy_mommy'
  LOOP
    IF ladder_user_paused(s.user_id) THEN CONTINUE; END IF;
    SELECT count(*) INTO v_pending FROM exit_path_events WHERE user_id = s.user_id AND status='pending' AND created_at > now() - interval '14 days';
    IF v_pending > 0 THEN CONTINUE; END IF;
    SELECT * INTO l FROM exit_path_ladder WHERE phase = s.current_phase;
    IF l IS NULL THEN CONTINUE; END IF;
    IF s.last_assigned_at IS NOT NULL THEN
      v_days := EXTRACT(EPOCH FROM (now() - s.last_assigned_at)) / 86400.0;
      IF v_days < l.gap_min_days THEN CONTINUE; END IF;
    END IF;
    INSERT INTO handler_decrees (user_id, edict, proof_type, deadline, status, consequence, trigger_source, reasoning)
    VALUES (s.user_id, l.edict, 'photo', now() + interval '21 days', 'active', 'slip +' || (l.phase + 1)::text, 'exit_path', 'phase=' || l.phase)
    RETURNING id INTO v_decree;
    INSERT INTO handler_outreach_queue (user_id, message, urgency, trigger_reason, source, kind, scheduled_for, expires_at, context_data, evidence_kind)
    VALUES (s.user_id, l.edict, 'normal', 'exit_path:' || l.phase_name, 'exit_path_engine', 'exit_path_directive',
      now(), now() + interval '21 days', jsonb_build_object('phase', l.phase, 'decree_id', v_decree), 'photo')
    RETURNING id INTO v_outreach;
    INSERT INTO exit_path_events (user_id, phase_at_event, related_decree_id, related_outreach_id, status)
    VALUES (s.user_id, l.phase, v_decree, v_outreach, 'pending');
    UPDATE exit_path_settings SET last_assigned_at = now(), updated_at = now() WHERE user_id = s.user_id;
    v_queued := v_queued + 1;
  END LOOP;
  RETURN v_queued;
END;
$fn$;
GRANT EXECUTE ON FUNCTION exit_path_eval() TO service_role;

CREATE OR REPLACE FUNCTION trg_propagate_decree_to_exit_path()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE v_max_phase INT; v_user UUID; v_phase INT;
BEGIN
  IF NEW.status NOT IN ('fulfilled','missed') OR COALESCE(OLD.status,'') = NEW.status THEN RETURN NEW; END IF;
  IF NEW.trigger_source <> 'exit_path' THEN RETURN NEW; END IF;
  UPDATE exit_path_events SET status = NEW.status, updated_at = now() WHERE related_decree_id = NEW.id AND status='pending';
  IF NEW.status='fulfilled' THEN
    v_user := NEW.user_id;
    SELECT current_phase INTO v_phase FROM exit_path_settings WHERE user_id = v_user;
    SELECT max(phase) INTO v_max_phase FROM exit_path_ladder;
    UPDATE exit_path_settings SET current_phase = LEAST(v_phase + 1, COALESCE(v_max_phase, 5)), updated_at = now() WHERE user_id = v_user;
  END IF;
  RETURN NEW;
END;
$fn$;
DROP TRIGGER IF EXISTS propagate_decree_to_exit_path ON handler_decrees;
CREATE TRIGGER propagate_decree_to_exit_path AFTER UPDATE OF status ON handler_decrees FOR EACH ROW EXECUTE FUNCTION trg_propagate_decree_to_exit_path();

DO $do$ BEGIN IF EXISTS (SELECT 1 FROM cron.job WHERE jobname='exit-path-biweekly') THEN PERFORM cron.unschedule('exit-path-biweekly'); END IF; EXCEPTION WHEN undefined_table THEN NULL; END $do$;
DO $do$ BEGIN PERFORM cron.schedule('exit-path-biweekly', '0 13 * * 0', $cron$SELECT exit_path_eval()$cron$); EXCEPTION WHEN undefined_table THEN NULL; END $do$;

INSERT INTO ladder_catalog (trigger_source, display_name, category, settings_table, events_table, ladder_table, total_phases, cron_label, blurb)
VALUES ('exit_path', 'Exit-path readiness', 'fem_social', 'exit_path_settings', 'exit_path_events', 'exit_path_ladder', 6, 'Sun 13:00 (opt-in only)', 'Worst-case marriage preparedness — opt-in only')
ON CONFLICT (trigger_source) DO UPDATE SET display_name=EXCLUDED.display_name, total_phases=EXCLUDED.total_phases, cron_label=EXCLUDED.cron_label, blurb=EXCLUDED.blurb;
