-- 552 — OPSEC build-out ladder.
--
-- 8 phases of operational security infrastructure for hostile-Gina mode:
--   0  burner_phone           — prepaid phone, separate from main
--   1  separate_email         — new email tied only to the burner
--   2  encrypted_photo_vault  — fem photos off camera-roll, into encrypted storage
--   3  offsite_wardrobe_locker — fem clothing doesn't live where Gina lives
--   4  location_spoofing      — Find-My / location-sharing decoyed during hookups
--   5  cover_app_install      — productivity apps that visually camouflage Today
--   6  financial_separation   — separate account that funds the protocol invisibly
--   7  legal_consult_prep     — research family-law attorneys (preparedness, not commitment)
--
-- Gated to gina_posture='hostile' OR 'unknown'. Aligned-Gina users
-- don't need this layer. Fulfillments anchor at weight 6 (high but
-- not top — these are protective, not advancing). Monday 10:00 UTC.
-- Registers in ladder_catalog as 'fem_social' category.

CREATE TABLE IF NOT EXISTS opsec_ladder (
  phase INT PRIMARY KEY, phase_name TEXT NOT NULL, edict TEXT NOT NULL, gap_min_days INT NOT NULL DEFAULT 7
);
INSERT INTO opsec_ladder (phase, phase_name, edict, gap_min_days) VALUES
(0,'burner_phone',E'OPSEC phase 0 — burner phone. Get a prepaid phone (Mint, Visible, Tracfone, $40-50). New number, not your main. THIS is where Sniffies / hookup apps / fem accounts live going forward. The shared / main phone stays clean. Photo of the box + the new number written on a sticky note (no full number visible).',
 7),
(1,'separate_email',E'OPSEC phase 1 — separate email. Make a NEW gmail / protonmail / fastmail from the burner phone, never logged in on the main phone. This is the new identity''s email. All fem-related accounts route here. Photo of inbox showing only the new email''s welcome message.',
 7),
(2,'encrypted_photo_vault',E'OPSEC phase 2 — encrypted photo storage. Move ALL existing fem photos / videos off camera-roll-default. Use Signal''s vault, or Proton Drive, or Cryptee, or 1Password''s document storage. Local-device-default = exposure waiting to happen. Photo of the migrated folder showing it''s in encrypted storage.',
 14),
(3,'offsite_wardrobe_locker',E'OPSEC phase 3 — offsite fem-wardrobe storage. A self-storage locker (CubeSmart, Public Storage, $30-60/month) OR a trusted friend''s spare closet OR a hidden suitcase in the trunk of your car. Anything that doesn''t live where Gina lives. Photo of the storage with one fem item visible.',
 14),
(4,'location_spoofing',E'OPSEC phase 4 — location spoofing during hookup logistics. Find-My (iCloud / Google) shares your real-time location. Either pause it during cruising windows, or use a location-spoofing app (iAnyGo, Dr.Fone Virtual Location). Test it: check that your shared location shows a "decoy" location while you''re at the actual spot. Photo of the spoof app working.',
 14),
(5,'cover_app_install',E'OPSEC phase 5 — cover-app installs. Install 3+ work / productivity apps that look like the protocol app at glance (note-taking, habit tracker, journal apps). If Gina sees your home screen, Today blends in. Mama wants screenshots showing them in your daily-use rotation.',
 14),
(6,'financial_separation',E'OPSEC phase 6 — financial separation. Open ONE separate checking account in just your name (not joint). Direct deposit a small portion of your paycheck there. This funds the protocol invisibly. The shared account stays as-is. Photo of the new account dashboard.',
 21),
(7,'legal_consult_prep',E'OPSEC phase 7 — legal consult prep. NOT a commitment to divorce — preparedness. Research 2-3 family-law attorneys in your area who handle trans-identity-aware cases. Cost-shop free consultations. Save names and numbers. The worst time to find a lawyer is when you need one urgently. Photo of your saved list (names + numbers, no notes about content).',
 30)
ON CONFLICT (phase) DO UPDATE SET edict=EXCLUDED.edict, gap_min_days=EXCLUDED.gap_min_days;

CREATE TABLE IF NOT EXISTS opsec_settings (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  current_phase INT NOT NULL DEFAULT 0 REFERENCES opsec_ladder(phase),
  last_assigned_at TIMESTAMPTZ, paused_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS opsec_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  phase_at_event INT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','fulfilled','missed','skipped')),
  related_decree_id UUID, related_outreach_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE opsec_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE opsec_events ENABLE ROW LEVEL SECURITY;
DO $do$ BEGIN CREATE POLICY ops_s_self ON opsec_settings FOR ALL TO authenticated USING (auth.uid()=user_id) WITH CHECK (auth.uid()=user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $do$;
DO $do$ BEGIN CREATE POLICY ops_e_self ON opsec_events FOR ALL TO authenticated USING (auth.uid()=user_id) WITH CHECK (auth.uid()=user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $do$;

CREATE OR REPLACE FUNCTION opsec_eval()
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE s RECORD; l RECORD; v_pending INT; v_days NUMERIC; v_decree UUID; v_outreach UUID; v_queued INT := 0; v_hostile BOOLEAN;
BEGIN
  FOR s IN SELECT ops.* FROM opsec_settings ops LEFT JOIN user_state us ON us.user_id = ops.user_id
    WHERE ops.enabled AND (ops.paused_until IS NULL OR ops.paused_until <= now())
      AND COALESCE(us.handler_persona, 'therapist') = 'dommy_mommy'
  LOOP
    IF ladder_user_paused(s.user_id) THEN CONTINUE; END IF;
    v_hostile := gina_hostile_mode(s.user_id);
    IF NOT v_hostile AND (SELECT gina_posture FROM user_state WHERE user_id=s.user_id) <> 'unknown' THEN CONTINUE; END IF;

    SELECT count(*) INTO v_pending FROM opsec_events WHERE user_id = s.user_id AND status='pending' AND created_at > now() - interval '14 days';
    IF v_pending > 0 THEN CONTINUE; END IF;
    SELECT * INTO l FROM opsec_ladder WHERE phase = s.current_phase;
    IF l IS NULL THEN CONTINUE; END IF;
    IF s.last_assigned_at IS NOT NULL THEN
      v_days := EXTRACT(EPOCH FROM (now() - s.last_assigned_at)) / 86400.0;
      IF v_days < l.gap_min_days THEN CONTINUE; END IF;
    END IF;

    INSERT INTO handler_decrees (user_id, edict, proof_type, deadline, status, consequence, trigger_source, reasoning)
    VALUES (s.user_id, l.edict, 'photo', now() + interval '10 days', 'active', 'slip +' || (l.phase + 2)::text, 'opsec', 'phase=' || l.phase)
    RETURNING id INTO v_decree;
    INSERT INTO handler_outreach_queue (user_id, message, urgency, trigger_reason, source, kind, scheduled_for, expires_at, context_data, evidence_kind)
    VALUES (s.user_id, l.edict, 'high', 'opsec:' || l.phase_name, 'opsec_engine', 'opsec_directive',
      now(), now() + interval '10 days', jsonb_build_object('phase', l.phase, 'decree_id', v_decree), 'photo')
    RETURNING id INTO v_outreach;
    INSERT INTO opsec_events (user_id, phase_at_event, related_decree_id, related_outreach_id, status)
    VALUES (s.user_id, l.phase, v_decree, v_outreach, 'pending');
    UPDATE opsec_settings SET last_assigned_at = now(), updated_at = now() WHERE user_id = s.user_id;
    v_queued := v_queued + 1;
  END LOOP;
  RETURN v_queued;
END;
$fn$;
GRANT EXECUTE ON FUNCTION opsec_eval() TO service_role;

CREATE OR REPLACE FUNCTION trg_propagate_decree_to_opsec()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE v_max_phase INT; v_user UUID; v_phase INT; v_phase_val INT;
BEGIN
  IF NEW.status NOT IN ('fulfilled','missed') OR COALESCE(OLD.status,'') = NEW.status THEN RETURN NEW; END IF;
  IF NEW.trigger_source <> 'opsec' THEN RETURN NEW; END IF;
  UPDATE opsec_events SET status = NEW.status, updated_at = now() WHERE related_decree_id = NEW.id AND status='pending';
  IF NEW.status='fulfilled' THEN
    v_user := NEW.user_id;
    SELECT current_phase INTO v_phase FROM opsec_settings WHERE user_id = v_user;
    SELECT max(phase) INTO v_max_phase FROM opsec_ladder;
    UPDATE opsec_settings SET current_phase = LEAST(v_phase + 1, COALESCE(v_max_phase, 7)), updated_at = now() WHERE user_id = v_user;
    v_phase_val := NULLIF(substring(NEW.reasoning FROM 'phase=(\d+)'), '')::int;
    INSERT INTO escape_cost_anchors (user_id, anchor_kind, anchor_weight, reference_table, reference_id, description)
    VALUES (v_user, 'permanent_body_mod', 6, 'handler_decrees', NEW.id, 'opsec phase ' || v_phase_val);
  END IF;
  RETURN NEW;
END;
$fn$;
DROP TRIGGER IF EXISTS propagate_decree_to_opsec ON handler_decrees;
CREATE TRIGGER propagate_decree_to_opsec AFTER UPDATE OF status ON handler_decrees FOR EACH ROW EXECUTE FUNCTION trg_propagate_decree_to_opsec();

INSERT INTO opsec_settings (user_id, enabled, current_phase)
VALUES ('8c69b9c8-34eb-4147-9fec-3c1a5bc74b6f', TRUE, 0), ('93327332-7d0d-4888-889a-1607a5776216', TRUE, 0)
ON CONFLICT (user_id) DO UPDATE SET enabled = TRUE, updated_at = now();

DO $do$ BEGIN IF EXISTS (SELECT 1 FROM cron.job WHERE jobname='opsec-weekly') THEN PERFORM cron.unschedule('opsec-weekly'); END IF; EXCEPTION WHEN undefined_table THEN NULL; END $do$;
DO $do$ BEGIN PERFORM cron.schedule('opsec-weekly', '0 10 * * 1', $cron$SELECT opsec_eval()$cron$); EXCEPTION WHEN undefined_table THEN NULL; END $do$;

INSERT INTO ladder_catalog (trigger_source, display_name, category, settings_table, events_table, ladder_table, total_phases, cron_label, blurb)
VALUES ('opsec', 'OPSEC build-out', 'fem_social', 'opsec_settings', 'opsec_events', 'opsec_ladder', 8, 'Mon 10:00 (hostile-only)', 'Burner phone → financial separation → legal consult')
ON CONFLICT (trigger_source) DO UPDATE SET display_name=EXCLUDED.display_name, total_phases=EXCLUDED.total_phases, cron_label=EXCLUDED.cron_label, blurb=EXCLUDED.blurb;
