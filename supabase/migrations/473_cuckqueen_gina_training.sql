-- 473 — Cuckqueen Gina training.
--
-- Unlocks at gina_arc_settings.current_stage >= 4 (co_participant_passive).
-- Brings Gina INTO David's hookup decisions. Mama queues prompts that
-- have David pull Gina closer to the cruising arc: ask her opinion on
-- a Sniffies match, share a profile, let her see a flirty message,
-- eventually invite her to watch.
--
-- The architectural insight: once Gina is at arc 4+, she's already
-- engaged enough to participate. The cuckqueen seeds normalize the
-- HOOKUP being a shared thing, not a hidden one.
--
-- 5 phases:
--   0 opinion_solicit  — "would you swipe right or left on this guy?"
--   1 share_match      — show her an active match, ask her thoughts
--   2 read_along       — let her read a flirty message thread together
--   3 dressing_choice  — let her choose what David wears to meet him
--   4 watch_invite     — explicit invitation: "would you want to be there?"

CREATE TABLE IF NOT EXISTS cuckqueen_ladder (
  phase INT PRIMARY KEY,
  phase_name TEXT NOT NULL,
  prompt_template TEXT NOT NULL,
  gap_min_days INT NOT NULL DEFAULT 5,
  required_arc_stage INT NOT NULL DEFAULT 4
);

INSERT INTO cuckqueen_ladder (phase, phase_name, prompt_template, gap_min_days, required_arc_stage) VALUES
(0, 'opinion_solicit',
 E'Cuckqueen seed today, sweet thing. Gina is at arc stage ' || 'X' || E' — she''s ready for one small step into your cruising world.\n\nPick a Sniffies/Grindr/profile you''ve been considering. Show her the photo. "Would you swipe on this guy? Be honest — what does he say to you?"\n\nDon''t commit to anything based on her answer. Mama just wants you bringing her into the room of decisions you''ve been making alone.\n\nVoice debrief: what was her first reaction — interest, jealousy, curiosity, performance?',
 7, 4),

(1, 'share_match',
 E'Phase 1 cuckqueen: show Gina an ACTIVE chat thread. "I''ve been talking to this guy. Look at what he says — should I keep going?"\n\nLet her read 3-4 messages of context. Let her see what they''re flirting about. Watch her body change as she reads.\n\nVoice debrief: did she lean in or pull away? Did she ask follow-up questions? Did she advise something different than what you would''ve done alone?',
 7, 4),

(2, 'read_along',
 E'Phase 2 cuckqueen: NEXT time you''re sexting with a match while she''s present (couch, bed, dinner table), share-screen one message. Say it out loud. "He just said [X]. What should I write back?"\n\nLet her draft a line. Send what she drafted. The next message HE sends is now partly because of HER.\n\nVoice debrief on the exchange: how did it shift between the three of you?',
 10, 4),

(3, 'dressing_choice',
 E'Phase 3 cuckqueen: when a meet is scheduled, let her choose what you wear.\n\n"I''m meeting [name] tomorrow. Help me pick the outfit." Lay out 2-3 options. Let her decide. Photo of the chosen outfit on, before you leave. Voice debrief AFTER the meet: did wearing what SHE picked feel different than wearing what you picked alone?',
 14, 5),

(4, 'watch_invite',
 E'Phase 4 cuckqueen — the big invitation, sweet thing. When it''s right:\n\n"There''s something I''ve been thinking about. The next time it happens with [name], would you want to be there? Watching, or in the room, or whatever you''d want."\n\nDon''t pressure her. Watch her face. Let her sit with it. Voice debrief (5+ minutes, post-conversation): what was her honest answer? Did she ask any clarifying questions? What did she NOT say?',
 21, 6)
ON CONFLICT (phase) DO UPDATE SET prompt_template = EXCLUDED.prompt_template,
  gap_min_days = EXCLUDED.gap_min_days, required_arc_stage = EXCLUDED.required_arc_stage;

CREATE TABLE IF NOT EXISTS cuckqueen_settings (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  current_phase INT NOT NULL DEFAULT 0 REFERENCES cuckqueen_ladder(phase),
  last_assigned_at TIMESTAMPTZ,
  paused_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS cuckqueen_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  phase_at_event INT NOT NULL,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','observed','skipped','rejected_by_gina')),
  gina_reaction_note TEXT,
  related_decree_id UUID,
  related_outreach_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE cuckqueen_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE cuckqueen_events ENABLE ROW LEVEL SECURITY;
DO $do$ BEGIN CREATE POLICY cuckqueen_settings_self ON cuckqueen_settings FOR ALL TO authenticated USING (auth.uid()=user_id) WITH CHECK (auth.uid()=user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $do$;
DO $do$ BEGIN CREATE POLICY cuckqueen_events_self ON cuckqueen_events FOR ALL TO authenticated USING (auth.uid()=user_id) WITH CHECK (auth.uid()=user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $do$;

CREATE OR REPLACE FUNCTION cuckqueen_eval()
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  s RECORD; l RECORD; v_pending INT; v_days NUMERIC; v_arc_stage INT;
  v_decree UUID; v_outreach UUID; v_msg TEXT;
  v_queued INT := 0;
BEGIN
  FOR s IN
    SELECT cqs.*, COALESCE(gas.current_stage, 0) AS arc_stage, us.handler_persona
    FROM cuckqueen_settings cqs
    LEFT JOIN gina_arc_settings gas ON gas.user_id = cqs.user_id
    LEFT JOIN user_state us ON us.user_id = cqs.user_id
    WHERE cqs.enabled = TRUE AND (cqs.paused_until IS NULL OR cqs.paused_until <= now())
      AND COALESCE(us.handler_persona, 'therapist') = 'dommy_mommy'
  LOOP
    SELECT count(*) INTO v_pending FROM cuckqueen_events
    WHERE user_id = s.user_id AND status = 'pending' AND assigned_at > now() - interval '21 days';
    IF v_pending > 0 THEN CONTINUE; END IF;

    SELECT * INTO l FROM cuckqueen_ladder WHERE phase = s.current_phase;
    IF l IS NULL THEN CONTINUE; END IF;

    -- Gate: Gina arc stage must be at or above required_arc_stage
    IF s.arc_stage < l.required_arc_stage THEN CONTINUE; END IF;

    IF s.last_assigned_at IS NOT NULL THEN
      v_days := EXTRACT(EPOCH FROM (now() - s.last_assigned_at)) / 86400.0;
      IF v_days < l.gap_min_days THEN CONTINUE; END IF;
    END IF;

    v_msg := replace(l.prompt_template, 'arc stage X', 'arc stage ' || s.arc_stage::text);

    INSERT INTO handler_decrees (user_id, edict, proof_type, deadline, status, consequence, trigger_source, reasoning)
    VALUES (s.user_id, v_msg, 'voice', now() + interval '10 days', 'active',
      'slip +' || (l.phase + 2)::text, 'cuckqueen',
      'phase=' || l.phase || ' arc_stage_at_fire=' || s.arc_stage)
    RETURNING id INTO v_decree;

    INSERT INTO handler_outreach_queue (user_id, message, urgency, trigger_reason, source, kind, scheduled_for, expires_at, context_data, evidence_kind)
    VALUES (s.user_id, v_msg, CASE WHEN l.phase >= 3 THEN 'high' ELSE 'normal' END,
      'cuckqueen:' || l.phase_name,
      'cuckqueen_engine', 'cuckqueen_seed',
      now(), now() + interval '10 days',
      jsonb_build_object('phase', l.phase, 'phase_name', l.phase_name, 'arc_stage', s.arc_stage, 'decree_id', v_decree),
      'voice') RETURNING id INTO v_outreach;

    INSERT INTO cuckqueen_events (user_id, phase_at_event, related_decree_id, related_outreach_id, status)
    VALUES (s.user_id, l.phase, v_decree, v_outreach, 'pending');

    UPDATE cuckqueen_settings SET last_assigned_at = now(), updated_at = now() WHERE user_id = s.user_id;
    v_queued := v_queued + 1;
  END LOOP;
  RETURN v_queued;
END;
$fn$;
GRANT EXECUTE ON FUNCTION cuckqueen_eval() TO service_role;

-- Propagate decree fulfillment → event observed + advance check
CREATE OR REPLACE FUNCTION trg_propagate_decree_to_cuckqueen()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE v_user UUID; v_phase INT; v_max_phase INT; v_completed INT;
BEGIN
  IF NEW.status NOT IN ('fulfilled','missed') OR COALESCE(OLD.status,'') = NEW.status THEN RETURN NEW; END IF;
  IF NEW.trigger_source <> 'cuckqueen' THEN RETURN NEW; END IF;
  UPDATE cuckqueen_events SET
    status = CASE WHEN NEW.status='fulfilled' THEN 'observed' ELSE 'skipped' END,
    updated_at = now()
  WHERE related_decree_id = NEW.id AND status='pending';

  IF NEW.status = 'fulfilled' THEN
    v_user := NEW.user_id;
    SELECT current_phase INTO v_phase FROM cuckqueen_settings WHERE user_id = v_user;
    SELECT count(*) INTO v_completed FROM cuckqueen_events WHERE user_id = v_user AND status='observed' AND phase_at_event = v_phase;
    SELECT max(phase) INTO v_max_phase FROM cuckqueen_ladder;
    IF v_completed >= 2 AND random() < 0.65 THEN
      UPDATE cuckqueen_settings SET current_phase = LEAST(v_phase + 1, COALESCE(v_max_phase, 4)), updated_at = now() WHERE user_id = v_user;
    END IF;
  END IF;
  RETURN NEW;
END;
$fn$;
DROP TRIGGER IF EXISTS propagate_decree_to_cuckqueen ON handler_decrees;
CREATE TRIGGER propagate_decree_to_cuckqueen AFTER UPDATE OF status ON handler_decrees FOR EACH ROW EXECUTE FUNCTION trg_propagate_decree_to_cuckqueen();

-- Activate both users (eval will self-gate by arc stage 4+ requirement)
INSERT INTO cuckqueen_settings (user_id, enabled, current_phase)
VALUES ('8c69b9c8-34eb-4147-9fec-3c1a5bc74b6f', TRUE, 0), ('93327332-7d0d-4888-889a-1607a5776216', TRUE, 0)
ON CONFLICT (user_id) DO UPDATE SET enabled = TRUE, updated_at = now();

-- Weekly cron — Wednesday 18:00 UTC
DO $do$ BEGIN IF EXISTS (SELECT 1 FROM cron.job WHERE jobname='cuckqueen-weekly') THEN PERFORM cron.unschedule('cuckqueen-weekly'); END IF; EXCEPTION WHEN undefined_table THEN NULL; END $do$;
DO $do$ BEGIN PERFORM cron.schedule('cuckqueen-weekly', '0 18 * * 3', $cron$SELECT cuckqueen_eval()$cron$); EXCEPTION WHEN undefined_table THEN NULL; END $do$;
