-- Migration 197: Voice corpus triggers + distilled voice profile
-- Extends 196 (user_voice_corpus) with:
--   1. SQL-native signal scoring
--   2. Auto-ingest triggers on handler_messages, journal_entries, paid_conversations
--   3. user_voice_profile snapshot (cadence stats, signature phrases, refresh fn)

-- ============================================
-- 1. SIGNAL SCORING FUNCTION
-- ============================================

CREATE OR REPLACE FUNCTION score_voice_signal(t TEXT, src TEXT)
RETURNS INTEGER
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  trimmed TEXT;
  len INT;
  score INT := 0;
BEGIN
  trimmed := btrim(COALESCE(t, ''));
  len := char_length(trimmed);
  IF len < 4 THEN RETURN 0; END IF;
  IF trimmed ~ '^[/\\!]' THEN RETURN 0; END IF;
  IF trimmed ~* '^(y|yes|n|no|ok|okay|k|kk|sure|thx|thanks)[.!?]*$' THEN RETURN 0; END IF;

  IF len > 20 THEN score := score + 1; END IF;
  IF len > 80 THEN score := score + 2; END IF;
  IF len > 200 THEN score := score + 2; END IF;
  IF trimmed ~ '[!?]' THEN score := score + 1; END IF;
  IF trimmed ~* '\m(i|i''m|im|my|me|mine)\M' THEN score := score + 1; END IF;
  IF trimmed ~* '\m(fuck|shit|god|holy|christ)\M' THEN score := score + 1; END IF;

  IF src = 'ai_edit_correction' THEN score := score + 10;
  ELSIF src = 'manual_sample' THEN score := score + 5;
  END IF;

  RETURN score;
END;
$$;

-- ============================================
-- 2. AUTO-INGEST HELPERS
-- ============================================

-- Safe insert: skips if score is 0 or text is empty
CREATE OR REPLACE FUNCTION ingest_voice_sample(
  p_user_id UUID,
  p_text TEXT,
  p_source TEXT,
  p_context JSONB DEFAULT '{}'::jsonb
)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  s INT;
  trimmed TEXT;
BEGIN
  trimmed := btrim(COALESCE(p_text, ''));
  IF char_length(trimmed) < 4 THEN RETURN; END IF;
  s := score_voice_signal(trimmed, p_source);
  IF s = 0 THEN RETURN; END IF;

  INSERT INTO user_voice_corpus (user_id, text, source, source_context, length, signal_score)
  VALUES (p_user_id, left(trimmed, 2000), p_source, p_context, char_length(trimmed), s);
END;
$$;

-- ============================================
-- 3. TRIGGERS: handler_messages (user role only)
-- ============================================

CREATE OR REPLACE FUNCTION trg_handler_messages_to_voice()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.role = 'user' THEN
    PERFORM ingest_voice_sample(
      NEW.user_id,
      NEW.content,
      'handler_dm',
      jsonb_build_object('conversation_id', NEW.conversation_id, 'message_id', NEW.id)
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS handler_messages_voice_ingest ON handler_messages;
CREATE TRIGGER handler_messages_voice_ingest
  AFTER INSERT ON handler_messages
  FOR EACH ROW EXECUTE FUNCTION trg_handler_messages_to_voice();

-- ============================================
-- 4. TRIGGERS: journal_entries (flatten JSONB text fields)
-- ============================================

CREATE OR REPLACE FUNCTION trg_journal_entries_to_voice()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  kv RECORD;
  val TEXT;
BEGIN
  IF NEW.content IS NULL THEN RETURN NEW; END IF;
  -- Walk every string value in the JSONB blob
  FOR kv IN SELECT * FROM jsonb_each(NEW.content) LOOP
    IF jsonb_typeof(kv.value) = 'string' THEN
      val := kv.value #>> '{}';
      PERFORM ingest_voice_sample(
        NEW.user_id,
        val,
        'journal',
        jsonb_build_object('journal_id', NEW.id, 'field', kv.key, 'date', NEW.date)
      );
    END IF;
  END LOOP;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS journal_entries_voice_ingest ON journal_entries;
CREATE TRIGGER journal_entries_voice_ingest
  AFTER INSERT OR UPDATE ON journal_entries
  FOR EACH ROW EXECUTE FUNCTION trg_journal_entries_to_voice();

-- ============================================
-- 5. TRIGGERS: paid_conversations (outbound = Maxy's voice)
-- ============================================

CREATE OR REPLACE FUNCTION trg_paid_conv_to_voice()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- Only outbound messages are Maxy's voice; message_direction may or may not exist
  -- Fall back to "has handler_response" as the outbound signal.
  IF COALESCE(NEW.handler_response, '') <> '' THEN
    PERFORM ingest_voice_sample(
      NEW.user_id,
      NEW.handler_response,
      'platform_dm',
      jsonb_build_object(
        'platform', NEW.platform,
        'subscriber_id', NEW.subscriber_id,
        'paid_conversation_id', NEW.id
      )
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS paid_conversations_voice_ingest ON paid_conversations;
CREATE TRIGGER paid_conversations_voice_ingest
  AFTER INSERT ON paid_conversations
  FOR EACH ROW EXECUTE FUNCTION trg_paid_conv_to_voice();

-- ============================================
-- 6. BACKFILL existing data (one-time on migration apply)
-- ============================================

-- Backfill handler_messages (user role, last 90 days)
INSERT INTO user_voice_corpus (user_id, text, source, source_context, length, signal_score)
SELECT
  user_id,
  left(btrim(content), 2000),
  'handler_dm',
  jsonb_build_object('conversation_id', conversation_id, 'message_id', id, 'backfill', true),
  char_length(btrim(content)),
  score_voice_signal(content, 'handler_dm')
FROM handler_messages
WHERE role = 'user'
  AND created_at > NOW() - INTERVAL '90 days'
  AND score_voice_signal(content, 'handler_dm') > 0
  AND NOT EXISTS (
    SELECT 1 FROM user_voice_corpus uvc
    WHERE uvc.user_id = handler_messages.user_id
      AND uvc.source_context->>'message_id' = handler_messages.id::text
  );

-- Backfill paid_conversations outbound
INSERT INTO user_voice_corpus (user_id, text, source, source_context, length, signal_score)
SELECT
  user_id,
  left(btrim(handler_response), 2000),
  'platform_dm',
  jsonb_build_object('platform', platform, 'subscriber_id', subscriber_id, 'paid_conversation_id', id, 'backfill', true),
  char_length(btrim(handler_response)),
  score_voice_signal(handler_response, 'platform_dm')
FROM paid_conversations
WHERE COALESCE(handler_response, '') <> ''
  AND created_at > NOW() - INTERVAL '90 days'
  AND score_voice_signal(handler_response, 'platform_dm') > 0
  AND NOT EXISTS (
    SELECT 1 FROM user_voice_corpus uvc
    WHERE uvc.user_id = paid_conversations.user_id
      AND uvc.source_context->>'paid_conversation_id' = paid_conversations.id::text
  );

-- ============================================
-- 7. DISTILLED VOICE PROFILE
-- ============================================

CREATE TABLE IF NOT EXISTS user_voice_profile (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  sample_count INTEGER NOT NULL DEFAULT 0,
  avg_length NUMERIC,
  median_length NUMERIC,
  avg_sentence_length NUMERIC,
  exclamation_rate NUMERIC,
  question_rate NUMERIC,
  ellipsis_rate NUMERIC,
  all_lower_rate NUMERIC,
  emoji_rate NUMERIC,
  profanity_rate NUMERIC,
  top_openers JSONB DEFAULT '[]',
  top_closers JSONB DEFAULT '[]',
  signature_bigrams JSONB DEFAULT '[]',
  banned_phrases_observed JSONB DEFAULT '[]',
  computed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE user_voice_profile ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users own voice profile" ON user_voice_profile
  FOR ALL USING (auth.uid() = user_id);

-- Refresh function: computes profile stats from last 500 samples
CREATE OR REPLACE FUNCTION refresh_voice_profile(p_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  v_count INT;
  v_avg_len NUMERIC;
  v_median_len NUMERIC;
  v_avg_sent_len NUMERIC;
  v_excl_rate NUMERIC;
  v_q_rate NUMERIC;
  v_ellip_rate NUMERIC;
  v_lower_rate NUMERIC;
  v_emoji_rate NUMERIC;
  v_prof_rate NUMERIC;
  v_openers JSONB;
  v_closers JSONB;
  v_bigrams JSONB;
BEGIN
  WITH recent AS (
    SELECT text, length
    FROM user_voice_corpus
    WHERE user_id = p_user_id
    ORDER BY signal_score DESC, created_at DESC
    LIMIT 500
  )
  SELECT
    COUNT(*),
    AVG(length),
    PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY length),
    AVG( GREATEST(1, array_length(regexp_split_to_array(text, '[.!?]+'), 1)) ),
    AVG( (length(text) - length(replace(text, '!', '')))::numeric / NULLIF(length(text),0) ),
    AVG( (length(text) - length(replace(text, '?', '')))::numeric / NULLIF(length(text),0) ),
    AVG( CASE WHEN text ~ '\.\.\.' THEN 1 ELSE 0 END ),
    AVG( CASE WHEN text = lower(text) AND text ~ '[a-z]' THEN 1 ELSE 0 END ),
    AVG( CASE WHEN text ~ '[\U0001F300-\U0001FAFF]' THEN 1 ELSE 0 END ),
    AVG( CASE WHEN text ~* '\m(fuck|shit|damn|hell)\M' THEN 1 ELSE 0 END )
  INTO v_count, v_avg_len, v_median_len, v_avg_sent_len,
       v_excl_rate, v_q_rate, v_ellip_rate, v_lower_rate, v_emoji_rate, v_prof_rate
  FROM recent;

  IF COALESCE(v_count, 0) = 0 THEN RETURN; END IF;

  -- Top openers (first 3 words)
  WITH recent AS (
    SELECT text FROM user_voice_corpus
    WHERE user_id = p_user_id
    ORDER BY signal_score DESC, created_at DESC LIMIT 500
  ),
  openers AS (
    SELECT lower(substring(btrim(text) FROM '^[[:alpha:]'']+([[:space:]]+[[:alpha:]'']+){0,2}')) AS opener
    FROM recent
    WHERE length(text) > 10
  )
  SELECT jsonb_agg(jsonb_build_object('phrase', opener, 'count', c))
  INTO v_openers
  FROM (
    SELECT opener, COUNT(*) AS c
    FROM openers WHERE opener IS NOT NULL AND length(opener) > 2
    GROUP BY opener ORDER BY c DESC LIMIT 10
  ) x;

  -- Top closers (last 3 words)
  WITH recent AS (
    SELECT text FROM user_voice_corpus
    WHERE user_id = p_user_id
    ORDER BY signal_score DESC, created_at DESC LIMIT 500
  ),
  closers AS (
    SELECT lower(substring(btrim(text) FROM '([[:alpha:]'']+[[:space:]]+){0,2}[[:alpha:]'']+[.!?]*$')) AS closer
    FROM recent
    WHERE length(text) > 10
  )
  SELECT jsonb_agg(jsonb_build_object('phrase', closer, 'count', c))
  INTO v_closers
  FROM (
    SELECT closer, COUNT(*) AS c
    FROM closers WHERE closer IS NOT NULL AND length(closer) > 2
    GROUP BY closer ORDER BY c DESC LIMIT 10
  ) x;

  -- Signature bigrams (excluding trivial stopwords)
  WITH recent AS (
    SELECT lower(text) AS t FROM user_voice_corpus
    WHERE user_id = p_user_id
    ORDER BY signal_score DESC, created_at DESC LIMIT 500
  ),
  words AS (
    SELECT t, regexp_split_to_array(regexp_replace(t, '[^a-z'' ]', ' ', 'g'), '\s+') AS w FROM recent
  ),
  bigrams AS (
    SELECT w[i] || ' ' || w[i+1] AS bg
    FROM words, generate_series(1, array_length(w,1) - 1) AS i
    WHERE w[i] IS NOT NULL AND w[i+1] IS NOT NULL
      AND length(w[i]) > 2 AND length(w[i+1]) > 2
      AND w[i] NOT IN ('the','and','but','you','for','with','this','that','have','are','was','will','just','not','its','like','its')
  )
  SELECT jsonb_agg(jsonb_build_object('phrase', bg, 'count', c))
  INTO v_bigrams
  FROM (
    SELECT bg, COUNT(*) AS c FROM bigrams
    GROUP BY bg HAVING COUNT(*) >= 3
    ORDER BY c DESC LIMIT 20
  ) x;

  INSERT INTO user_voice_profile (
    user_id, sample_count, avg_length, median_length, avg_sentence_length,
    exclamation_rate, question_rate, ellipsis_rate, all_lower_rate, emoji_rate, profanity_rate,
    top_openers, top_closers, signature_bigrams, computed_at
  ) VALUES (
    p_user_id, v_count, v_avg_len, v_median_len, v_avg_sent_len,
    v_excl_rate, v_q_rate, v_ellip_rate, v_lower_rate, v_emoji_rate, v_prof_rate,
    COALESCE(v_openers, '[]'::jsonb), COALESCE(v_closers, '[]'::jsonb), COALESCE(v_bigrams, '[]'::jsonb),
    NOW()
  )
  ON CONFLICT (user_id) DO UPDATE SET
    sample_count = EXCLUDED.sample_count,
    avg_length = EXCLUDED.avg_length,
    median_length = EXCLUDED.median_length,
    avg_sentence_length = EXCLUDED.avg_sentence_length,
    exclamation_rate = EXCLUDED.exclamation_rate,
    question_rate = EXCLUDED.question_rate,
    ellipsis_rate = EXCLUDED.ellipsis_rate,
    all_lower_rate = EXCLUDED.all_lower_rate,
    emoji_rate = EXCLUDED.emoji_rate,
    profanity_rate = EXCLUDED.profanity_rate,
    top_openers = EXCLUDED.top_openers,
    top_closers = EXCLUDED.top_closers,
    signature_bigrams = EXCLUDED.signature_bigrams,
    computed_at = NOW();
END;
$$;
