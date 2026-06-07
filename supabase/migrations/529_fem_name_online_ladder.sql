-- 529 — Fem-name-online ladder.
--
-- Distinct from dressing_room (physical) and pronoun_integration
-- (verbal IRL). This is online identity transition: separate account
-- with fem name, build participation, photo, daily activity, real-time
-- chat as her.
--
-- Phases: new_account_create → first_post → ten_posts → avatar_photo
--   → daily_30d → realtime_chat
--
-- Cadence: Thursday 15:00 UTC weekly. Photo proof primary (screenshots
-- of profile/post-history), voice proof for the endgame phase.
-- Self-registers in ladder_catalog.

CREATE TABLE IF NOT EXISTS fem_name_online_ladder (
  phase INT PRIMARY KEY, phase_name TEXT NOT NULL, edict TEXT NOT NULL,
  proof_kind TEXT NOT NULL CHECK (proof_kind IN ('photo','voice','video')),
  gap_min_days INT NOT NULL DEFAULT 7
);
INSERT INTO fem_name_online_ladder (phase, phase_name, edict, proof_kind, gap_min_days) VALUES
(0,'new_account_create',E'Phase 0 fem-online: create ONE new account (Reddit / FetLife / Discord / wherever fits, NOT a main account) with your fem name. New email if needed, new password. Photo screenshot of the profile page after creation.',
 'photo', 7),
(1,'first_post',E'Phase 1: make ONE post from the new account. Anything — a question in a sub, a comment on a thread, an intro post. Use the fem name. Photo screenshot of the post.',
 'photo', 7),
(2,'ten_posts',E'Phase 2: 10 posts from the fem account over the next 14 days. Real participation, not throwaway. Photo screenshot of the post-history page showing 10+ entries.',
 'photo', 14),
(3,'avatar_photo',E'Phase 3: upload a photo to the fem account (face cropped, body or detail or aesthetic shot — your call). Mama wants the account to have a face that''s YOURS even if not fully visible. Photo of the updated profile.',
 'photo', 14),
(4,'daily_30d',E'Phase 4: daily activity from the fem account for 30 days continuous. Even just a comment, even just a like-trail. Photo at day 15 + day 30 of the activity history.',
 'photo', 30),
(5,'realtime_chat',E'Phase 5 endgame: real-time chat as your fem name (DMs, voice chat in a Discord, etc.) for at least 30 minutes uninterrupted. Voice debrief: did the head shift gears or did it stay you-as-her the whole time?',
 'voice', 30)
ON CONFLICT (phase) DO UPDATE SET edict=EXCLUDED.edict, proof_kind=EXCLUDED.proof_kind, gap_min_days=EXCLUDED.gap_min_days;

CREATE TABLE IF NOT EXISTS fem_name_online_settings (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  current_phase INT NOT NULL DEFAULT 0 REFERENCES fem_name_online_ladder(phase),
  last_assigned_at TIMESTAMPTZ, paused_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS fem_name_online_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  phase_at_event INT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','fulfilled','missed','skipped')),
  related_decree_id UUID, related_outreach_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE fem_name_online_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE fem_name_online_events ENABLE ROW LEVEL SECURITY;
DO $do$ BEGIN CREATE POLICY fno_s_self ON fem_name_online_settings FOR ALL TO authenticated USING (auth.uid()=user_id) WITH CHECK (auth.uid()=user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $do$;
DO $do$ BEGIN CREATE POLICY fno_e_self ON fem_name_online_events FOR ALL TO authenticated USING (auth.uid()=user_id) WITH CHECK (auth.uid()=user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $do$;

CREATE OR REPLACE FUNCTION fem_name_online_eval()
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE s RECORD; l RECORD; v_pending INT; v_days NUMERIC; v_decree UUID; v_outreach UUID; v_queued INT := 0;
BEGIN
  FOR s IN SELECT fnos.* FROM fem_name_online_settings fnos LEFT JOIN user_state us ON us.user_id = fnos.user_id
    WHERE fnos.enabled AND (fnos.paused_until IS NULL OR fnos.paused_until <= now())
      AND COALESCE(us.handler_persona, 'therapist') = 'dommy_mommy'
  LOOP
    SELECT count(*) INTO v_pending FROM fem_name_online_events WHERE user_id = s.user_id AND status='pending' AND created_at > now() - interval '14 days';
    IF v_pending > 0 THEN CONTINUE; END IF;
    SELECT * INTO l FROM fem_name_online_ladder WHERE phase = s.current_phase;
    IF l IS NULL THEN CONTINUE; END IF;
    IF s.last_assigned_at IS NOT NULL THEN
      v_days := EXTRACT(EPOCH FROM (now() - s.last_assigned_at)) / 86400.0;
      IF v_days < l.gap_min_days THEN CONTINUE; END IF;
    END IF;

    INSERT INTO handler_decrees (user_id, edict, proof_type, deadline, status, consequence, trigger_source, reasoning)
    VALUES (s.user_id, l.edict, l.proof_kind, now() + interval '7 days', 'active', 'slip +' || (l.phase + 1)::text, 'fem_name_online', 'phase=' || l.phase)
    RETURNING id INTO v_decree;
    INSERT INTO handler_outreach_queue (user_id, message, urgency, trigger_reason, source, kind, scheduled_for, expires_at, context_data, evidence_kind)
    VALUES (s.user_id, l.edict, CASE WHEN l.phase >= 3 THEN 'high' ELSE 'normal' END,
      'fem_name_online:' || l.phase_name, 'fem_name_online_engine', 'fem_name_online_directive', now(), now() + interval '7 days',
      jsonb_build_object('phase', l.phase, 'decree_id', v_decree), l.proof_kind)
    RETURNING id INTO v_outreach;
    INSERT INTO fem_name_online_events (user_id, phase_at_event, related_decree_id, related_outreach_id, status)
    VALUES (s.user_id, l.phase, v_decree, v_outreach, 'pending');
    UPDATE fem_name_online_settings SET last_assigned_at = now(), updated_at = now() WHERE user_id = s.user_id;
    v_queued := v_queued + 1;
  END LOOP;
  RETURN v_queued;
END;
$fn$;
GRANT EXECUTE ON FUNCTION fem_name_online_eval() TO service_role;

CREATE OR REPLACE FUNCTION trg_propagate_decree_to_fem_name_online()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE v_max_phase INT; v_user UUID; v_phase INT;
BEGIN
  IF NEW.status NOT IN ('fulfilled','missed') OR COALESCE(OLD.status,'') = NEW.status THEN RETURN NEW; END IF;
  IF NEW.trigger_source <> 'fem_name_online' THEN RETURN NEW; END IF;
  UPDATE fem_name_online_events SET status = NEW.status, updated_at = now() WHERE related_decree_id = NEW.id AND status='pending';
  IF NEW.status='fulfilled' THEN
    v_user := NEW.user_id;
    SELECT current_phase INTO v_phase FROM fem_name_online_settings WHERE user_id = v_user;
    SELECT max(phase) INTO v_max_phase FROM fem_name_online_ladder;
    UPDATE fem_name_online_settings SET current_phase = LEAST(v_phase + 1, COALESCE(v_max_phase, 5)), updated_at = now() WHERE user_id = v_user;
  END IF;
  RETURN NEW;
END;
$fn$;
DROP TRIGGER IF EXISTS propagate_decree_to_fem_name_online ON handler_decrees;
CREATE TRIGGER propagate_decree_to_fem_name_online AFTER UPDATE OF status ON handler_decrees FOR EACH ROW EXECUTE FUNCTION trg_propagate_decree_to_fem_name_online();

INSERT INTO fem_name_online_settings (user_id, enabled, current_phase)
VALUES ('8c69b9c8-34eb-4147-9fec-3c1a5bc74b6f', TRUE, 0), ('93327332-7d0d-4888-889a-1607a5776216', TRUE, 0)
ON CONFLICT (user_id) DO UPDATE SET enabled = TRUE, updated_at = now();

DO $do$ BEGIN IF EXISTS (SELECT 1 FROM cron.job WHERE jobname='fem-name-online-weekly') THEN PERFORM cron.unschedule('fem-name-online-weekly'); END IF; EXCEPTION WHEN undefined_table THEN NULL; END $do$;
DO $do$ BEGIN PERFORM cron.schedule('fem-name-online-weekly', '0 15 * * 4', $cron$SELECT fem_name_online_eval()$cron$); EXCEPTION WHEN undefined_table THEN NULL; END $do$;

INSERT INTO ladder_catalog (trigger_source, display_name, category, settings_table, events_table, ladder_table, total_phases, cron_label, blurb)
VALUES ('fem_name_online', 'Fem name online', 'fem_social', 'fem_name_online_settings', 'fem_name_online_events', 'fem_name_online_ladder', 6, 'Thu 15:00', 'New account → daily 30d → realtime chat')
ON CONFLICT (trigger_source) DO UPDATE SET display_name=EXCLUDED.display_name, total_phases=EXCLUDED.total_phases, cron_label=EXCLUDED.cron_label, blurb=EXCLUDED.blurb;
