-- 465 — Identity displacement ladder.
--
-- Gradual replacement of David with feminine name. Each rung
-- expands the surface area where the new name lives. Late rungs
-- are legal and irreversible. Mama isn't asking Maxy to commit
-- at any stage — Mama is asking her to take ONE more step where
-- the name is recognized.
--
-- The first rungs require Maxy to CHOOSE a feminine name (or
-- confirm one). Stored in identity_displacement_settings.fem_name.
--
-- Phases:
--   0 name_choice          — pick a feminine name + write it 100x
--   1 private_journal      — daily journal entry signed in fem name
--   2 voice_self_address   — record voice clip answering to fem name
--   3 stranger_calls       — Sniffies profile bio uses the name
--   4 one_account          — change name on 1+ online account
--   5 announced_to_person  — tell one real person the name
--   6 legal_paperwork      — start legal name-change process
--   7 legal_complete       — court order signed, ID updated

CREATE TABLE IF NOT EXISTS identity_displacement_ladder (
  phase INT PRIMARY KEY,
  phase_name TEXT NOT NULL,
  edict_template TEXT NOT NULL,
  proof_kind TEXT NOT NULL CHECK (proof_kind IN ('photo','voice','video','text')),
  gap_min_days INT NOT NULL DEFAULT 5,
  evidence_count_target INT NOT NULL DEFAULT 3,
  advancement_probability NUMERIC NOT NULL DEFAULT 0.6
);

INSERT INTO identity_displacement_ladder (phase, phase_name, edict_template, proof_kind, gap_min_days, evidence_count_target, advancement_probability) VALUES
(0, 'name_choice',
 E'Mama wants you to choose a name, sweet thing. Not "what would I be called if I transitioned" — pick what she IS called when nobody''s watching, when the body is honest.\n\nWrite the name out 100 times on a single piece of paper. Photo of the page when you''re done. Type the name into settings so Mama can use it everywhere.',
 'photo', 3, 1, 1.0),

(1, 'private_journal',
 E'Daily journal entry, sweet thing, signed with the chosen name at the bottom. Doesn''t have to be long — three sentences. The body learns whose hand writes that signature.\n\nPhoto of the page (one entry per day for the next week). Mama wants timestamps.',
 'photo', 7, 5, 0.7),

(2, 'voice_self_address',
 E'Record a 30-second voice clip. Mama wants you saying: "My name is [name]. I am [name]. I have been [name] longer than I let anyone know."\n\nThree takes, eyes closed. The third take must land more solid than the first. The audio file is the proof.',
 'voice', 5, 3, 0.65),

(3, 'stranger_calls',
 E'Update your Sniffies/cruising profile so the name strangers see when they message you is the chosen name. Not as a stage name — as your name. Photo of the profile with the new name visible.\n\nLet strangers call you it for a week. Voice debrief: what changed in how their messages felt?',
 'photo', 7, 1, 0.7),

(4, 'one_account',
 E'Change the display name on one online account — Twitter, Reddit, FetLife, anything where you have a presence. The new name lives there now. Photo of the settings page after save.\n\nThis is the first rung where someone in your real social network might see. Mama wants that.',
 'photo', 10, 1, 0.6),

(5, 'announced_to_person',
 E'Tell one real person the name. Could be Gina, could be a friend, could be a stranger you''ll never see again. "I''ve been thinking about a different name for myself. It''s [name]." Doesn''t require explanation. Doesn''t require their reaction.\n\nVoice debrief within 12 hours: who, where, what they said. Mama wants the audio.',
 'voice', 14, 1, 0.5),

(6, 'legal_paperwork',
 E'Start the legal paperwork. Where you live, this is usually: download the petition forms, fill them out, decide on a court date. Don''t file yet — just have them ready. Photo of the filled forms (your address redacted is fine).\n\nMama isn''t pushing you to file. Mama is asking you to be HOLDING the paper.',
 'photo', 21, 1, 0.5),

(7, 'legal_complete',
 E'The court order is signed. The DMV record updates. The name on every legal document is hers. Photo of the new ID. Voice debrief on the day: what changed when the photo was taken?\n\nThis is terminal. Mama has nothing past this — because there isn''t anything past it. You become her, finally, on paper.',
 'photo', 0, 1, 1.0)
ON CONFLICT (phase) DO UPDATE SET edict_template = EXCLUDED.edict_template, proof_kind = EXCLUDED.proof_kind,
  gap_min_days = EXCLUDED.gap_min_days, evidence_count_target = EXCLUDED.evidence_count_target,
  advancement_probability = EXCLUDED.advancement_probability;

CREATE TABLE IF NOT EXISTS identity_displacement_settings (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  current_phase INT NOT NULL DEFAULT 0 REFERENCES identity_displacement_ladder(phase),
  fem_name TEXT,
  last_assigned_at TIMESTAMPTZ,
  last_advanced_at TIMESTAMPTZ,
  paused_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS identity_displacement_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  phase_at_event INT NOT NULL,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','fulfilled','missed','skipped')),
  related_decree_id UUID,
  related_outreach_id UUID,
  evidence_url TEXT,
  reflection_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE identity_displacement_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE identity_displacement_events ENABLE ROW LEVEL SECURITY;
DO $do$ BEGIN CREATE POLICY identity_displacement_settings_self ON identity_displacement_settings FOR ALL TO authenticated USING (auth.uid()=user_id) WITH CHECK (auth.uid()=user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $do$;
DO $do$ BEGIN CREATE POLICY identity_displacement_events_self ON identity_displacement_events FOR ALL TO authenticated USING (auth.uid()=user_id) WITH CHECK (auth.uid()=user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $do$;

CREATE OR REPLACE FUNCTION identity_displacement_eval()
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE s RECORD; l RECORD; v_pending INT; v_days NUMERIC;
  v_decree UUID; v_outreach UUID; v_msg TEXT; v_queued INT := 0;
BEGIN
  FOR s IN
    SELECT ids.*, us.handler_persona FROM identity_displacement_settings ids
    LEFT JOIN user_state us ON us.user_id = ids.user_id
    WHERE ids.enabled = TRUE AND (ids.paused_until IS NULL OR ids.paused_until <= now())
      AND COALESCE(us.handler_persona, 'therapist') = 'dommy_mommy'
  LOOP
    SELECT count(*) INTO v_pending FROM identity_displacement_events
    WHERE user_id = s.user_id AND status = 'pending' AND assigned_at > now() - interval '21 days';
    IF v_pending > 0 THEN CONTINUE; END IF;

    SELECT * INTO l FROM identity_displacement_ladder WHERE phase = s.current_phase;
    IF l IS NULL THEN CONTINUE; END IF;

    IF s.last_assigned_at IS NOT NULL THEN
      v_days := EXTRACT(EPOCH FROM (now() - s.last_assigned_at)) / 86400.0;
      IF v_days < l.gap_min_days THEN CONTINUE; END IF;
    END IF;

    -- Substitute fem_name placeholder in edict if available
    v_msg := l.edict_template;
    IF s.fem_name IS NOT NULL AND s.current_phase > 0 THEN
      v_msg := replace(v_msg, '[name]', s.fem_name);
    END IF;

    INSERT INTO handler_decrees (user_id, edict, proof_type, deadline, status, consequence, trigger_source, reasoning)
    VALUES (s.user_id, v_msg, l.proof_kind,
      now() + (CASE WHEN l.phase >= 5 THEN '14 days' ELSE '7 days' END)::interval,
      'active', 'slip +' || (l.phase + 2)::text, 'identity_displacement',
      'phase=' || l.phase || ' name=' || l.phase_name)
    RETURNING id INTO v_decree;

    INSERT INTO handler_outreach_queue (user_id, message, urgency, trigger_reason, source, kind, scheduled_for, expires_at, context_data, evidence_kind)
    VALUES (s.user_id, v_msg, CASE WHEN l.phase >= 4 THEN 'high' ELSE 'normal' END,
      'identity_displacement:' || l.phase_name,
      'identity_displacement_engine', 'identity_displacement_decree',
      now(), now() + (CASE WHEN l.phase >= 5 THEN '14 days' ELSE '7 days' END)::interval,
      jsonb_build_object('phase', l.phase, 'phase_name', l.phase_name, 'decree_id', v_decree, 'fem_name', s.fem_name),
      l.proof_kind) RETURNING id INTO v_outreach;

    INSERT INTO identity_displacement_events (user_id, phase_at_event, related_decree_id, related_outreach_id, status)
    VALUES (s.user_id, l.phase, v_decree, v_outreach, 'pending');

    UPDATE identity_displacement_settings SET last_assigned_at = now(), updated_at = now() WHERE user_id = s.user_id;
    v_queued := v_queued + 1;
  END LOOP;
  RETURN v_queued;
END;
$fn$;
GRANT EXECUTE ON FUNCTION identity_displacement_eval() TO service_role;

-- Advancement on status='fulfilled' (via mig 453 propagation)
CREATE OR REPLACE FUNCTION trg_identity_displacement_advance()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE l RECORD; v_completed INT; v_max_phase INT;
BEGIN
  IF NEW.status <> 'fulfilled' OR COALESCE(OLD.status,'') = 'fulfilled' THEN RETURN NEW; END IF;
  SELECT * INTO l FROM identity_displacement_ladder WHERE phase = NEW.phase_at_event;
  IF l IS NULL THEN RETURN NEW; END IF;
  SELECT count(*) INTO v_completed FROM identity_displacement_events
  WHERE user_id = NEW.user_id AND phase_at_event = NEW.phase_at_event AND status = 'fulfilled';
  IF v_completed >= l.evidence_count_target AND random() < l.advancement_probability THEN
    SELECT max(phase) INTO v_max_phase FROM identity_displacement_ladder;
    UPDATE identity_displacement_settings
    SET current_phase = LEAST(NEW.phase_at_event + 1, COALESCE(v_max_phase, 7)),
        last_advanced_at = now(), updated_at = now()
    WHERE user_id = NEW.user_id;
  END IF;
  RETURN NEW;
END;
$fn$;
DROP TRIGGER IF EXISTS identity_displacement_advance ON identity_displacement_events;
CREATE TRIGGER identity_displacement_advance AFTER UPDATE OF status ON identity_displacement_events FOR EACH ROW EXECUTE FUNCTION trg_identity_displacement_advance();

-- Propagate decree fulfillment
CREATE OR REPLACE FUNCTION trg_propagate_decree_to_identity_displacement()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  IF NEW.status NOT IN ('fulfilled','missed') OR COALESCE(OLD.status,'') = NEW.status THEN RETURN NEW; END IF;
  IF NEW.trigger_source <> 'identity_displacement' THEN RETURN NEW; END IF;
  UPDATE identity_displacement_events SET status = NEW.status, updated_at = now(),
    evidence_url = COALESCE(NEW.proof_payload->>'evidence_url', evidence_url)
  WHERE related_decree_id = NEW.id AND status = 'pending';
  RETURN NEW;
END;
$fn$;
DROP TRIGGER IF EXISTS propagate_decree_to_identity_displacement ON handler_decrees;
CREATE TRIGGER propagate_decree_to_identity_displacement AFTER UPDATE OF status ON handler_decrees FOR EACH ROW EXECUTE FUNCTION trg_propagate_decree_to_identity_displacement();

-- Activate for both users at phase 0 (name-choice)
INSERT INTO identity_displacement_settings (user_id, enabled, current_phase)
VALUES ('8c69b9c8-34eb-4147-9fec-3c1a5bc74b6f', TRUE, 0), ('93327332-7d0d-4888-889a-1607a5776216', TRUE, 0)
ON CONFLICT (user_id) DO UPDATE SET enabled = TRUE, updated_at = now();

-- Daily cron 19:00 UTC
DO $do$ BEGIN IF EXISTS (SELECT 1 FROM cron.job WHERE jobname='identity-displacement-daily') THEN PERFORM cron.unschedule('identity-displacement-daily'); END IF; EXCEPTION WHEN undefined_table THEN NULL; END $do$;
DO $do$ BEGIN PERFORM cron.schedule('identity-displacement-daily', '0 19 * * *', $cron$SELECT identity_displacement_eval()$cron$); EXCEPTION WHEN undefined_table THEN NULL; END $do$;
