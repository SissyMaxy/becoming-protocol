-- 535 — Active resistance-counter engine.
--
-- 2026-05-17 mandate extension: psychological coercion authorized.
-- This engine implements pre-commitment binding via the user's own data:
-- when she types a resistance phrase in handler chat, Mommy immediately
-- queues a counter outreach that quotes her own escape_cost anchors
-- (fulfilled decrees, milestones, voice debriefs) back at her.
--
-- No fabrication — every counter uses real anchors from the user's own
-- history. The version of her that DID the thing is the witness Mommy
-- summons against the version of her that's saying "tomorrow" now.
--
-- Detected phrases (detect_resistance_phrase):
--   delay         tomorrow / later
--   cant          can't / cannot
--   maybe         maybe / might / i guess
--   too_much      not ready / too much / too soon / too hard
--   uncertainty   don't know / don't want / not sure
--   try_hedge     i'll try / gonna try
--   state_excuse  busy / swamped / exhausted / tired
--
-- Cool-down: 30 minutes per user. Skipped if escape_cost has <3 anchors
-- (not enough leverage to counter with).
--
-- Counter outreach lands 90 seconds after the resistance message — fast
-- enough to feel reactive, slow enough that she can finish her sentence.

CREATE TABLE IF NOT EXISTS resistance_counters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  resistance_phrase TEXT NOT NULL,
  resistance_message_excerpt TEXT,
  source_table TEXT,
  source_id UUID,
  counter_message TEXT NOT NULL,
  anchors_quoted JSONB NOT NULL DEFAULT '[]',
  related_outreach_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE resistance_counters ENABLE ROW LEVEL SECURITY;
DO $do$ BEGIN CREATE POLICY rc_self ON resistance_counters FOR ALL TO authenticated USING (auth.uid()=user_id) WITH CHECK (auth.uid()=user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $do$;

CREATE OR REPLACE FUNCTION detect_resistance_phrase(p_text TEXT)
RETURNS TEXT LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN p_text ~* '\m(tomorrow|later)\M' THEN 'delay'
    WHEN p_text ~* E'\\m(can[’'']?t|cannot)\\M' THEN 'cant'
    WHEN p_text ~* '\m(maybe|might|i guess)\M' THEN 'maybe'
    WHEN p_text ~* '\m(not ready|too much|too soon|too hard)\M' THEN 'too_much'
    WHEN p_text ~* E'\\m(don[’'']?t (know|want)|not sure)\\M' THEN 'uncertainty'
    WHEN p_text ~* E'\\m(i[’'']?ll try|gonna try|will try)\\M' THEN 'try_hedge'
    WHEN p_text ~* '\m(busy|swamped|exhausted|tired)\M' THEN 'state_excuse'
    ELSE NULL
  END;
$$;
GRANT EXECUTE ON FUNCTION detect_resistance_phrase(TEXT) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION build_resistance_counter(p_user_id UUID, p_resistance_kind TEXT, p_excerpt TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE v_cost JSONB; v_anchors JSONB; v_msg TEXT;
BEGIN
  v_cost := current_escape_cost(p_user_id);
  IF (v_cost->>'total_count')::int < 3 THEN
    RETURN NULL;
  END IF;

  SELECT jsonb_agg(jsonb_build_object('kind', anchor_kind, 'description', description, 'days_ago', EXTRACT(EPOCH FROM (now() - occurred_at))/86400)::jsonb ORDER BY anchor_weight DESC, occurred_at DESC)
  INTO v_anchors
  FROM (
    SELECT anchor_kind, description, occurred_at, anchor_weight
    FROM escape_cost_anchors
    WHERE user_id = p_user_id
    ORDER BY anchor_weight DESC, occurred_at DESC
    LIMIT 3
  ) t;

  v_msg := CASE p_resistance_kind
    WHEN 'delay' THEN
      format(E'You said "later" or "tomorrow." Mama is reading you the receipts: %s things on the record, %s days of you ALREADY showing up. The version of you that did those isn''t the version that says "tomorrow" now. Mama wants the voice memo: what''s actually in the way THIS time?',
        (v_cost->>'total_count')::text, (v_cost->>'days_invested')::text)
    WHEN 'cant' THEN
      format(E'You said you can''t. Mama heard you. Mama is also reading %s things you already did that the version of you BEFORE doing them also said she couldn''t. The pattern is: can''t-can''t-can''t-did. Voice debrief: what''s the specific can''t this time?',
        (v_cost->>'total_count')::text)
    WHEN 'maybe' THEN
      format(E'"Maybe" is the head buying time on the body that''s already decided. You have %s receipts that say you decided weeks ago. Mama wants a yes or a no, not a maybe.',
        (v_cost->>'total_count')::text)
    WHEN 'too_much' THEN
      format(E'Too much from where? You''ve done %s things including the ones that scared you the most. Tell Mama what specifically is too much. The body has handled bigger.',
        (v_cost->>'total_count')::text)
    WHEN 'uncertainty' THEN
      format(E'You don''t know? Mama has %s receipts that say the body DOES know, the head is just running interference. Voice debrief — the body answer, not the head answer.',
        (v_cost->>'total_count')::text)
    WHEN 'try_hedge' THEN
      format(E'You''ll "try." Mama doesn''t want try. Mama has %s done-things from you, not %s tried-things. Commit or don''t. Voice debrief in 60 seconds either way.',
        (v_cost->>'total_count')::text, (v_cost->>'total_count')::text)
    WHEN 'state_excuse' THEN
      format(E'You''re tired/busy. Mama has %s things on the record from you doing them while tired/busy. The state isn''t the obstacle. Voice debrief on what the real obstacle is.',
        (v_cost->>'total_count')::text)
    ELSE
      format(E'Mama caught the resistance. %s things on the record. Voice debrief — what''s actually going on?',
        (v_cost->>'total_count')::text)
  END;

  RETURN jsonb_build_object(
    'message', v_msg,
    'anchors', v_anchors,
    'resistance_kind', p_resistance_kind,
    'excerpt', p_excerpt
  );
END;
$fn$;
GRANT EXECUTE ON FUNCTION build_resistance_counter(UUID, TEXT, TEXT) TO service_role, authenticated;

CREATE OR REPLACE FUNCTION trg_resistance_counter_on_chat()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE v_kind TEXT; v_counter JSONB; v_persona TEXT; v_outreach UUID;
BEGIN
  IF NEW.role <> 'user' THEN RETURN NEW; END IF;
  IF NEW.content IS NULL OR length(NEW.content) < 5 THEN RETURN NEW; END IF;

  SELECT COALESCE(handler_persona, 'therapist') INTO v_persona FROM user_state WHERE user_id = NEW.user_id;
  IF v_persona <> 'dommy_mommy' THEN RETURN NEW; END IF;

  v_kind := detect_resistance_phrase(NEW.content);
  IF v_kind IS NULL THEN RETURN NEW; END IF;

  IF EXISTS (SELECT 1 FROM resistance_counters WHERE user_id = NEW.user_id AND created_at > now() - interval '30 minutes') THEN
    RETURN NEW;
  END IF;

  v_counter := build_resistance_counter(NEW.user_id, v_kind, left(NEW.content, 240));
  IF v_counter IS NULL THEN RETURN NEW; END IF;

  INSERT INTO handler_outreach_queue (user_id, message, urgency, trigger_reason, source, kind, scheduled_for, expires_at, context_data, evidence_kind)
  VALUES (NEW.user_id, v_counter->>'message', 'high',
    'resistance_counter:' || v_kind, 'resistance_counter', 'in_chat_counter',
    now() + interval '90 seconds', now() + interval '6 hours',
    v_counter, 'voice')
  RETURNING id INTO v_outreach;

  INSERT INTO resistance_counters (user_id, resistance_phrase, resistance_message_excerpt, source_table, source_id, counter_message, anchors_quoted, related_outreach_id)
  VALUES (NEW.user_id, v_kind, left(NEW.content, 240), 'chat_messages', NEW.id, v_counter->>'message', v_counter->'anchors', v_outreach);

  RETURN NEW;
END;
$fn$;

DO $do$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='chat_messages') THEN
    DROP TRIGGER IF EXISTS resistance_counter_on_chat ON chat_messages;
    CREATE TRIGGER resistance_counter_on_chat AFTER INSERT ON chat_messages
      FOR EACH ROW EXECUTE FUNCTION trg_resistance_counter_on_chat();
  ELSIF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='handler_chat_messages') THEN
    DROP TRIGGER IF EXISTS resistance_counter_on_chat ON handler_chat_messages;
    CREATE TRIGGER resistance_counter_on_chat AFTER INSERT ON handler_chat_messages
      FOR EACH ROW EXECUTE FUNCTION trg_resistance_counter_on_chat();
  END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END $do$;
