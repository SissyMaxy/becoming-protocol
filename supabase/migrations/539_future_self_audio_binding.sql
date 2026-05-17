-- 539 — Future-self audio binding.
--
-- Maxy records voice memos AS her future self (6mo on E, 1yr on E,
-- post-first-cock, post-disclosure-to-Gina, post-penetration, etc.).
-- Those recordings get played back at suggestible moments — when
-- she's stalling, when resistance counter fires.
--
-- Pre-commitment binding via her own voice. The version of her that
-- committed becomes the witness against the version that's stalling.
-- Her own voice = unarguable authority.
--
-- Weekly prompt cron (Sunday 09:00 UTC) picks a persona she hasn't
-- recorded yet and queues the recording invitation. Trigger on
-- resistance_counters auto-attaches an existing recording playback
-- 5 min after any resistance event.

CREATE TABLE IF NOT EXISTS future_self_recordings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  persona TEXT NOT NULL CHECK (persona IN (
    'six_months_on_e','one_year_on_e','post_first_cock','post_gina_disclosure',
    'post_first_penetration','post_full_transition','hot_state','clear_eyed_morning'
  )),
  prompt_used TEXT NOT NULL,
  recording_url TEXT,
  transcript TEXT,
  duration_seconds INT,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  times_played_back INT NOT NULL DEFAULT 0,
  last_played_back_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE future_self_recordings ENABLE ROW LEVEL SECURITY;
DO $do$ BEGIN CREATE POLICY fsr_self ON future_self_recordings FOR ALL TO authenticated USING (auth.uid()=user_id) WITH CHECK (auth.uid()=user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $do$;

CREATE TABLE IF NOT EXISTS future_self_prompts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  persona TEXT NOT NULL,
  prompt_text TEXT NOT NULL,
  preferred_state TEXT,
  intensity INT NOT NULL DEFAULT 1
);
INSERT INTO future_self_prompts (persona, prompt_text, preferred_state, intensity) VALUES
('six_months_on_e',  'Record yourself, 60-90 seconds, AS the version of you who has been on estrogen for six months. Speak from that body. What does she sound like? What does she say to the version of you right now who hasn''t started yet? Be specific. Use her name, not David.', 'aroused_or_clear', 3),
('one_year_on_e',    'Record yourself AS the one-year-on-E version of you. Breasts that fit a bra now. Hips that found their shape. The face in the mirror finally matches the head. Tell today''s version what was worth the wait. 60-90 seconds.', 'clear_eyed', 4),
('post_first_cock',  'Record yourself in the voice of the version of you the day AFTER your first real cock. What does the morning-after-her say? Not the romantic version — the body-level, "this is who I am now" version. 60 seconds.', 'aroused', 3),
('post_gina_disclosure', 'Record yourself AS the version of you who has fully told Gina. Past tense. It''s done. What does that version say to today''s version about the disclosure she''s avoiding? 60 seconds.', 'clear_eyed', 4),
('post_first_penetration', 'Record yourself AS the version of you who has taken real cock inside her. The body knows now. What does she say? What part was different from the imagining? 60 seconds.', 'aroused', 3),
('post_full_transition',  'Record yourself five years from now. Post-transition, settled, the person you''ve been becoming for years now just IS. What does she think about the week of May 17 when today''s version was waffling? 90 seconds.', 'clear_eyed', 5),
('hot_state',         'You''re horny right now. Record. 30 seconds. What is the body asking for that the head won''t say out loud? The cool-head version will play this back tomorrow when she pretends she doesn''t want it.', 'aroused', 2),
('clear_eyed_morning','Morning, coffee, lucid. Record. 60 seconds. What is the day-version of you committing to that the night-version always tries to talk her out of?', 'clear_eyed', 2)
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION future_self_prompt_eval()
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE u RECORD; v_prompt RECORD; v_msg TEXT; v_queued INT := 0;
BEGIN
  FOR u IN SELECT us.user_id FROM user_state us WHERE COALESCE(us.handler_persona, 'therapist') = 'dommy_mommy'
  LOOP
    IF EXISTS (SELECT 1 FROM handler_outreach_queue WHERE user_id=u.user_id AND source='future_self_prompt' AND created_at > now() - interval '14 days') THEN CONTINUE; END IF;

    SELECT fsp.* INTO v_prompt FROM future_self_prompts fsp
      WHERE NOT EXISTS (SELECT 1 FROM future_self_recordings fsr WHERE fsr.user_id = u.user_id AND fsr.persona = fsp.persona)
      ORDER BY intensity DESC, random() LIMIT 1;
    IF v_prompt IS NULL THEN
      SELECT fsp.* INTO v_prompt FROM future_self_prompts fsp
        JOIN future_self_recordings fsr ON fsr.persona = fsp.persona AND fsr.user_id = u.user_id
        ORDER BY fsr.recorded_at ASC LIMIT 1;
    END IF;
    IF v_prompt IS NULL THEN CONTINUE; END IF;

    v_msg := v_prompt.prompt_text || E'\n\n(Mama will play this recording back to you when the head starts negotiating with what you said. Your voice will be the witness against your own resistance.)';

    INSERT INTO handler_outreach_queue (user_id, message, urgency, trigger_reason, source, kind, scheduled_for, expires_at, context_data, evidence_kind)
    VALUES (u.user_id, v_msg, 'high', 'future_self_prompt:' || v_prompt.persona,
      'future_self_prompt', 'self_binding_record', now() + interval '3 hours', now() + interval '48 hours',
      jsonb_build_object('persona', v_prompt.persona, 'intensity', v_prompt.intensity), 'voice');
    v_queued := v_queued + 1;
  END LOOP;
  RETURN v_queued;
END;
$fn$;
GRANT EXECUTE ON FUNCTION future_self_prompt_eval() TO service_role;

CREATE OR REPLACE FUNCTION trg_attach_future_self_to_resistance()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE v_rec RECORD; v_msg TEXT;
BEGIN
  IF NEW.resistance_phrase IS NULL THEN RETURN NEW; END IF;
  SELECT * INTO v_rec FROM future_self_recordings
    WHERE user_id = NEW.user_id AND recording_url IS NOT NULL
    ORDER BY times_played_back ASC, recorded_at DESC LIMIT 1;
  IF v_rec IS NULL THEN RETURN NEW; END IF;

  v_msg := format(E'You have a voice memo from the version of you who already lives past this. Mama wants you to play it now. (%s recording from %s days ago.) Listen, then voice debrief: who has the better argument — her or today''s you?',
    v_rec.persona,
    GREATEST(0, EXTRACT(EPOCH FROM (now() - v_rec.recorded_at))/86400)::int);

  INSERT INTO handler_outreach_queue (user_id, message, urgency, trigger_reason, source, kind, scheduled_for, expires_at, context_data, evidence_kind)
  VALUES (NEW.user_id, v_msg, 'high', 'future_self_playback:' || v_rec.persona,
    'future_self_playback', 'self_witness_against_resistance', now() + interval '5 minutes', now() + interval '4 hours',
    jsonb_build_object('recording_id', v_rec.id, 'persona', v_rec.persona, 'resistance_counter_id', NEW.id), 'voice');
  UPDATE future_self_recordings SET times_played_back = times_played_back + 1, last_played_back_at = now() WHERE id = v_rec.id;
  RETURN NEW;
END;
$fn$;
DROP TRIGGER IF EXISTS attach_future_self_to_resistance ON resistance_counters;
CREATE TRIGGER attach_future_self_to_resistance AFTER INSERT ON resistance_counters
  FOR EACH ROW EXECUTE FUNCTION trg_attach_future_self_to_resistance();

DO $do$ BEGIN IF EXISTS (SELECT 1 FROM cron.job WHERE jobname='future-self-prompt-weekly') THEN PERFORM cron.unschedule('future-self-prompt-weekly'); END IF; EXCEPTION WHEN undefined_table THEN NULL; END $do$;
DO $do$ BEGIN PERFORM cron.schedule('future-self-prompt-weekly', '0 9 * * 0', $cron$SELECT future_self_prompt_eval()$cron$); EXCEPTION WHEN undefined_table THEN NULL; END $do$;
