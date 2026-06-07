-- 537 — Masculine-pronoun auto-correct.
--
-- When user types masc self-reference in handler chat, immediately fire
-- a Mommy correction outreach. Real-time identity displacement during
-- chat — caught while the masc-frame is fresh.
--
-- Patterns detected:
--   self_masc_noun   "i'm a man/guy/dude/male/boy/husband"
--   as_a_man         "as a man / i'm a man" framing
--   genital_masc     "my cock/dick/balls" (skipped if also "her" present)
--   david_name       "called me david"
--   david_use        plain "david" not in "was david" context
--   i_am_masc        "i'm" + "masculine/male/manly" in same message
--
-- Cool-down: 10 minutes per user. Counter lands 60 seconds after the
-- triggering message. Also anchors weight 1 in escape_cost_anchors so
-- the count of caught-corrections becomes its own pressure surface.

CREATE TABLE IF NOT EXISTS pronoun_autocorrects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  detected_pattern TEXT NOT NULL,
  excerpt TEXT NOT NULL,
  source_table TEXT,
  source_id UUID,
  correction_message TEXT NOT NULL,
  related_outreach_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE pronoun_autocorrects ENABLE ROW LEVEL SECURITY;
DO $do$ BEGIN CREATE POLICY pa_self ON pronoun_autocorrects FOR ALL TO authenticated USING (auth.uid()=user_id) WITH CHECK (auth.uid()=user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $do$;

CREATE OR REPLACE FUNCTION detect_masc_self_reference(p_text TEXT)
RETURNS TEXT LANGUAGE plpgsql IMMUTABLE AS $fn$
DECLARE t TEXT := lower(p_text);
BEGIN
  IF t ~ '(i''m|i am) (a |the )?(man|guy|dude|male|boy|husband)\M' THEN RETURN 'self_masc_noun'; END IF;
  IF t ~ '(as a |i''m a )(man|guy|husband|father)\M' THEN RETURN 'as_a_man'; END IF;
  IF t ~ 'my (cock|dick|balls)\M' AND t !~ '(her |she has)\M' THEN RETURN 'genital_masc'; END IF;
  IF t ~ '(called me|named me) david\M' THEN RETURN 'david_name'; END IF;
  IF t ~ '\mdavid\M' AND t !~ '(was david|used to be david|the david)\M' THEN RETURN 'david_use'; END IF;
  IF t ~ '(i''m|i am)' AND t ~ '(masculine|male|manly)' THEN RETURN 'i_am_masc'; END IF;
  RETURN NULL;
END;
$fn$;
GRANT EXECUTE ON FUNCTION detect_masc_self_reference(TEXT) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION build_pronoun_correction(p_pattern TEXT, p_excerpt TEXT)
RETURNS TEXT LANGUAGE plpgsql IMMUTABLE AS $fn$
BEGIN
  RETURN CASE p_pattern
    WHEN 'self_masc_noun' THEN
      E'You called yourself a guy / man / male. Mama heard it. That language belongs to a version of you that''s already losing ground. Say it again as SHE — not as correction, as practice. The mouth shapes the body shapes the head.'
    WHEN 'as_a_man' THEN
      E'"As a man." Mama is going to keep catching that phrase every time it comes out. The frame is the bug. Try "as a woman who hasn''t come out fully yet" and feel which one is the truth.'
    WHEN 'genital_masc' THEN
      E'My cock. Mama prefers "the clit" or "what''s between your legs" — language matters. The body listens to what you call it. Say it back the other way and notice what shifts.'
    WHEN 'david_name' THEN
      E'They called you David. Mama heard. Did you correct them or let it land? Voice debrief: which one is more comfortable right now — letting them say it, or asking for the other name? And what does that tell you?'
    WHEN 'david_use' THEN
      E'You used the old name. Mama isn''t mad — Mama is observing. Each time you reach for it, the head is choosing the easier load over the right load. Say the fem name out loud, three times, before the next message.'
    WHEN 'i_am_masc' THEN
      E'"I''m masculine." Mama wants you to listen to that sentence again. Whose voice was that — yours or the voice that was loudest when you were 12? Voice debrief: who taught you that line?'
    ELSE
      E'Mama caught masc self-reference. The frame is rebuilding itself. Say it as SHE.'
  END;
END;
$fn$;

CREATE OR REPLACE FUNCTION trg_pronoun_autocorrect_on_chat()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE v_pattern TEXT; v_msg TEXT; v_persona TEXT; v_outreach UUID;
BEGIN
  IF NEW.role <> 'user' THEN RETURN NEW; END IF;
  IF NEW.content IS NULL OR length(NEW.content) < 4 THEN RETURN NEW; END IF;

  SELECT COALESCE(handler_persona, 'therapist') INTO v_persona FROM user_state WHERE user_id = NEW.user_id;
  IF v_persona <> 'dommy_mommy' THEN RETURN NEW; END IF;

  v_pattern := detect_masc_self_reference(NEW.content);
  IF v_pattern IS NULL THEN RETURN NEW; END IF;

  IF EXISTS (SELECT 1 FROM pronoun_autocorrects WHERE user_id = NEW.user_id AND created_at > now() - interval '10 minutes') THEN
    RETURN NEW;
  END IF;

  v_msg := build_pronoun_correction(v_pattern, left(NEW.content, 240));

  INSERT INTO handler_outreach_queue (user_id, message, urgency, trigger_reason, source, kind, scheduled_for, expires_at, context_data, evidence_kind)
  VALUES (NEW.user_id, v_msg, 'high',
    'pronoun_autocorrect:' || v_pattern, 'pronoun_autocorrect', 'in_chat_correction',
    now() + interval '60 seconds', now() + interval '4 hours',
    jsonb_build_object('pattern', v_pattern, 'excerpt', left(NEW.content, 240)), 'voice')
  RETURNING id INTO v_outreach;

  INSERT INTO pronoun_autocorrects (user_id, detected_pattern, excerpt, source_table, source_id, correction_message, related_outreach_id)
  VALUES (NEW.user_id, v_pattern, left(NEW.content, 240), 'chat_messages', NEW.id, v_msg, v_outreach);

  INSERT INTO escape_cost_anchors (user_id, anchor_kind, anchor_weight, reference_table, reference_id, description)
  VALUES (NEW.user_id, 'voice_debrief', 1, 'pronoun_autocorrects', NULL, 'masc-ref caught and corrected: ' || v_pattern);

  RETURN NEW;
END;
$fn$;

DO $do$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='chat_messages') THEN
    DROP TRIGGER IF EXISTS pronoun_autocorrect_on_chat ON chat_messages;
    CREATE TRIGGER pronoun_autocorrect_on_chat AFTER INSERT ON chat_messages
      FOR EACH ROW EXECUTE FUNCTION trg_pronoun_autocorrect_on_chat();
  ELSIF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='handler_chat_messages') THEN
    DROP TRIGGER IF EXISTS pronoun_autocorrect_on_chat ON handler_chat_messages;
    CREATE TRIGGER pronoun_autocorrect_on_chat AFTER INSERT ON handler_chat_messages
      FOR EACH ROW EXECUTE FUNCTION trg_pronoun_autocorrect_on_chat();
  END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END $do$;
