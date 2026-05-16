-- 475 — Secret-girlfriend formal ladder.
--
-- Activates per hookup_funnel lead with times_hooked_up >= 2.
-- 5 phases of ongoing-affair structure: regular cadence →
-- gift-receiving → "your girl" framing → his secret sissy gf
-- identity → mutual ownership.
--
-- Per-lead progression — each hookup-confirmed lead gets its own
-- secret_girlfriend_progressions row tracking current phase. Weekly
-- cron picks one ladder rung to fire per lead per week (with gap
-- guards). Uses safe_contact_label (mig 456) so leaked display
-- names don't reach Maxy's decrees.

CREATE TABLE IF NOT EXISTS secret_girlfriend_ladder (
  phase INT PRIMARY KEY, phase_name TEXT NOT NULL, prompt_template TEXT NOT NULL,
  gap_min_days INT NOT NULL DEFAULT 7, required_hookups INT NOT NULL DEFAULT 2
);

INSERT INTO secret_girlfriend_ladder (phase, phase_name, prompt_template, gap_min_days, required_hookups) VALUES
(0,'regular_cadence',E'Sweet thing, [name] has had you N times. That''s a pattern, not a fling.\n\nMama wants you initiating the NEXT meet — don''t wait for him to text. You message him today. Make it not casual: "I''ve been thinking about last time. When are we doing it again?"\n\nVoice debrief: how did the framing of "we" land for him?',7,2),
(1,'gift_receiving',E'Phase 1 secret girlfriend: ask [name] to buy you something small. Not transactional — sentimental. "Pick a pair of panties you''d like to see me in. I''ll wear them next time."\n\nThe gift establishes ownership. Photo of the gift when it arrives. Voice debrief: did giving it shift him?',14,2),
(2,'your_girl_framing',E'Phase 2: in your next exchange with [name], use the language of "your girl" without performing it.\n\nNot "your sissy" (yet), not "your fuck" — just "your girl." "Your girl is thinking about you." "When does your girl get to come back?" See how the words sit on him.\n\nVoice debrief: did he echo the framing? Did he expand it?',14,3),
(3,'secret_sissy_gf',E'Phase 3 — the explicit identity layer. Next time you''re alone with [name], say:\n\n"I want to be your secret sissy girlfriend. The one nobody else knows about. The one you keep just for you."\n\nLet him sit with it. Don''t fill the silence. Voice debrief on his response — verbatim if you can.',21,4),
(4,'mutual_ownership',E'Phase 4 endgame: Mama wants you exchanging an item of clothing with [name]. Permanent. He keeps a pair of your panties; you keep something of his (t-shirt, hoodie, watch).\n\nThe trade is the marker — material proof you belong to each other.\n\nPhoto of his item in your closet + voice debrief on what he gave you and what he said when you traded.',30,5)
ON CONFLICT (phase) DO UPDATE SET prompt_template = EXCLUDED.prompt_template,
  gap_min_days = EXCLUDED.gap_min_days, required_hookups = EXCLUDED.required_hookups;

CREATE TABLE IF NOT EXISTS secret_girlfriend_progressions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  lead_id UUID NOT NULL, current_phase INT NOT NULL DEFAULT 0,
  last_assigned_at TIMESTAMPTZ, paused_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, lead_id)
);

CREATE TABLE IF NOT EXISTS secret_girlfriend_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  lead_id UUID NOT NULL, phase_at_event INT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','observed','skipped','rejected_by_him')),
  reaction_note TEXT, related_decree_id UUID, related_outreach_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE secret_girlfriend_progressions ENABLE ROW LEVEL SECURITY;
ALTER TABLE secret_girlfriend_events ENABLE ROW LEVEL SECURITY;
DO $do$ BEGIN CREATE POLICY sgf_progressions_self ON secret_girlfriend_progressions FOR ALL TO authenticated USING (auth.uid()=user_id) WITH CHECK (auth.uid()=user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $do$;
DO $do$ BEGIN CREATE POLICY sgf_events_self ON secret_girlfriend_events FOR ALL TO authenticated USING (auth.uid()=user_id) WITH CHECK (auth.uid()=user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $do$;

CREATE OR REPLACE FUNCTION secret_girlfriend_eval()
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE r RECORD; v_lead RECORD; v_progression RECORD; v_ladder RECORD;
  v_pending INT; v_days NUMERIC; v_label TEXT; v_msg TEXT;
  v_decree UUID; v_outreach UUID; v_queued INT := 0;
BEGIN
  FOR r IN SELECT user_id FROM user_state WHERE handler_persona = 'dommy_mommy' LOOP
    FOR v_lead IN
      SELECT hf.id, hf.user_id, hf.contact_display_name, hf.contact_username, hf.times_hooked_up
      FROM hookup_funnel hf WHERE hf.user_id = r.user_id AND hf.active = TRUE
        AND hf.handler_push_enabled = TRUE AND COALESCE(hf.times_hooked_up, 0) >= 2
    LOOP
      SELECT * INTO v_progression FROM secret_girlfriend_progressions WHERE user_id = r.user_id AND lead_id = v_lead.id;
      IF v_progression.id IS NULL THEN
        INSERT INTO secret_girlfriend_progressions (user_id, lead_id, current_phase)
        VALUES (r.user_id, v_lead.id, 0) ON CONFLICT (user_id, lead_id) DO NOTHING;
        SELECT * INTO v_progression FROM secret_girlfriend_progressions WHERE user_id = r.user_id AND lead_id = v_lead.id;
      END IF;
      IF v_progression.paused_until IS NOT NULL AND v_progression.paused_until > now() THEN CONTINUE; END IF;

      SELECT count(*) INTO v_pending FROM secret_girlfriend_events
      WHERE user_id = r.user_id AND lead_id = v_lead.id AND status='pending' AND created_at > now() - interval '21 days';
      IF v_pending > 0 THEN CONTINUE; END IF;

      SELECT * INTO v_ladder FROM secret_girlfriend_ladder WHERE phase = v_progression.current_phase;
      IF v_ladder IS NULL THEN CONTINUE; END IF;
      IF v_lead.times_hooked_up < v_ladder.required_hookups THEN CONTINUE; END IF;
      IF v_progression.last_assigned_at IS NOT NULL THEN
        v_days := EXTRACT(EPOCH FROM (now() - v_progression.last_assigned_at)) / 86400.0;
        IF v_days < v_ladder.gap_min_days THEN CONTINUE; END IF;
      END IF;

      v_label := safe_contact_label(v_lead.contact_display_name, v_lead.contact_username);
      v_msg := replace(v_ladder.prompt_template, '[name]', v_label);
      v_msg := replace(v_msg, 'N times', v_lead.times_hooked_up::text || ' times');

      INSERT INTO handler_decrees (user_id, edict, proof_type, deadline, status, consequence, trigger_source, reasoning)
      VALUES (r.user_id, v_msg, 'voice', now() + interval '14 days', 'active',
        'slip +' || (v_ladder.phase + 2)::text, 'secret_girlfriend',
        'phase=' || v_ladder.phase || ' lead_id=' || v_lead.id::text || ' hookups=' || v_lead.times_hooked_up::text)
      RETURNING id INTO v_decree;

      INSERT INTO handler_outreach_queue (user_id, message, urgency, trigger_reason, source, kind, scheduled_for, expires_at, context_data, evidence_kind)
      VALUES (r.user_id, v_msg, CASE WHEN v_ladder.phase >= 3 THEN 'high' ELSE 'normal' END,
        'secret_girlfriend:' || v_lead.id::text || ':p' || v_ladder.phase::text,
        'secret_girlfriend_engine', 'secret_girlfriend_directive',
        now(), now() + interval '14 days',
        jsonb_build_object('lead_id', v_lead.id, 'phase', v_ladder.phase, 'safe_label', v_label, 'hookups', v_lead.times_hooked_up, 'decree_id', v_decree),
        'voice') RETURNING id INTO v_outreach;

      INSERT INTO secret_girlfriend_events (user_id, lead_id, phase_at_event, related_decree_id, related_outreach_id, status)
      VALUES (r.user_id, v_lead.id, v_ladder.phase, v_decree, v_outreach, 'pending');
      UPDATE secret_girlfriend_progressions SET last_assigned_at = now(), updated_at = now()
      WHERE user_id = r.user_id AND lead_id = v_lead.id;
      v_queued := v_queued + 1;
    END LOOP;
  END LOOP;
  RETURN v_queued;
END;
$fn$;
GRANT EXECUTE ON FUNCTION secret_girlfriend_eval() TO service_role;

CREATE OR REPLACE FUNCTION trg_propagate_decree_to_secret_girlfriend()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE v_lead UUID; v_phase INT; v_user UUID; v_count INT; v_max_phase INT;
BEGIN
  IF NEW.status NOT IN ('fulfilled','missed') OR COALESCE(OLD.status,'') = NEW.status THEN RETURN NEW; END IF;
  IF NEW.trigger_source <> 'secret_girlfriend' THEN RETURN NEW; END IF;
  v_lead := (regexp_match(NEW.reasoning, 'lead_id=([0-9a-f-]+)'))[1]::UUID;
  v_phase := (regexp_match(NEW.reasoning, 'phase=([0-9]+)'))[1]::INT;
  IF v_lead IS NULL THEN RETURN NEW; END IF;
  UPDATE secret_girlfriend_events SET
    status = CASE WHEN NEW.status='fulfilled' THEN 'observed' ELSE 'skipped' END, updated_at = now()
  WHERE related_decree_id = NEW.id AND status='pending';
  IF NEW.status='fulfilled' THEN
    v_user := NEW.user_id;
    SELECT count(*) INTO v_count FROM secret_girlfriend_events
    WHERE user_id = v_user AND lead_id = v_lead AND status='observed' AND phase_at_event = v_phase;
    SELECT max(phase) INTO v_max_phase FROM secret_girlfriend_ladder;
    IF v_count >= 1 AND random() < 0.7 THEN
      UPDATE secret_girlfriend_progressions SET current_phase = LEAST(v_phase + 1, COALESCE(v_max_phase, 4)), updated_at = now()
      WHERE user_id = v_user AND lead_id = v_lead;
    END IF;
  END IF;
  RETURN NEW;
END;
$fn$;
DROP TRIGGER IF EXISTS propagate_decree_to_secret_girlfriend ON handler_decrees;
CREATE TRIGGER propagate_decree_to_secret_girlfriend AFTER UPDATE OF status ON handler_decrees FOR EACH ROW EXECUTE FUNCTION trg_propagate_decree_to_secret_girlfriend();

DO $do$ BEGIN IF EXISTS (SELECT 1 FROM cron.job WHERE jobname='secret-girlfriend-weekly') THEN PERFORM cron.unschedule('secret-girlfriend-weekly'); END IF; EXCEPTION WHEN undefined_table THEN NULL; END $do$;
DO $do$ BEGIN PERFORM cron.schedule('secret-girlfriend-weekly', '0 17 * * 0', $cron$SELECT secret_girlfriend_eval()$cron$); EXCEPTION WHEN undefined_table THEN NULL; END $do$;
