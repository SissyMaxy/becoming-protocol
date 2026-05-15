-- 460 — Stranger-validation feedback loop.
--
-- When a Sniffies/cruising stranger DMs Maxy with feminine-coded
-- praise ("you're so pretty", "your ass is amazing", "good girl",
-- "fuckin soft", etc.), that's the highest-credibility conditioning
-- input the system can get: a stranger seeing what Mama wants
-- believed. Currently those messages land in contact_events.content
-- and go cold.
--
-- This extractor scans recent inbound Sniffies content for
-- validation patterns, promotes the quote to:
--   1. memory_implants — with source_type='stranger_validation',
--      narrative quoting the stranger verbatim, active for reinforcement
--   2. mommy_mantras — category='stranger_quote', tagged with user_id,
--      so the morning mantra picker recites strangers' words back
--      to Maxy in Mama's voice ("Remember what he wrote, sweet thing:
--      'you're so pretty when you...' — that's what they see now")
--
-- Runs every 15 min via cron. Dedup: each contact_event extracted
-- at most once (tracked via stranger_validation_extractions log).
-- Filters out obvious low-quality matches: very short messages,
-- pure emoji, non-fem-coded compliments.

CREATE TABLE IF NOT EXISTS stranger_validation_extractions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  contact_event_id UUID NOT NULL,
  matched_pattern TEXT NOT NULL,
  extracted_quote TEXT NOT NULL,
  fem_signal_strength INT NOT NULL DEFAULT 1 CHECK (fem_signal_strength BETWEEN 1 AND 5),
  memory_implant_id UUID,
  mantra_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, contact_event_id)
);

ALTER TABLE stranger_validation_extractions ENABLE ROW LEVEL SECURITY;
DO $do$ BEGIN
  CREATE POLICY stranger_validation_extractions_self ON stranger_validation_extractions
    FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $do$;

-- Extractor: scans last 24h of inbound Sniffies messages, scores them,
-- and promotes matches to memory_implants + mommy_mantras
CREATE OR REPLACE FUNCTION stranger_validation_extract()
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  ev RECORD;
  v_clean TEXT;
  v_strength INT;
  v_pattern_match TEXT;
  v_implant_id UUID;
  v_mantra_id UUID;
  v_quote_short TEXT;
  v_extracted INT := 0;
BEGIN
  FOR ev IN
    SELECT ce.id AS event_id, ce.user_id, ce.content, ce.contact_id, ce.occurred_at
    FROM contact_events ce
    WHERE ce.direction = 'inbound'
      AND ce.platform = 'sniffies'
      AND ce.occurred_at > now() - interval '24 hours'
      AND ce.content IS NOT NULL
      AND length(ce.content) BETWEEN 6 AND 500
      AND NOT EXISTS (
        SELECT 1 FROM stranger_validation_extractions svx
        WHERE svx.user_id = ce.user_id AND svx.contact_event_id = ce.id
      )
  LOOP
    v_clean := lower(trim(ev.content));
    v_strength := 0;
    v_pattern_match := NULL;

    -- Pattern catalog (strongest signals last; later wins)
    IF v_clean ~ '\m(pretty|cute|beautiful|gorgeous|adorable|stunning|hot)\M' THEN
      v_strength := GREATEST(v_strength, 1); v_pattern_match := 'pretty/cute';
    END IF;
    IF v_clean ~ '\m(soft|delicate|smooth|silky|tender)\M' THEN
      v_strength := GREATEST(v_strength, 2); v_pattern_match := 'soft/delicate';
    END IF;
    IF v_clean ~ '\m(girly|girlish|feminine|fem|girl|sissy|princess|babygirl|baby girl)\M' THEN
      v_strength := GREATEST(v_strength, 3); v_pattern_match := 'fem-coded';
    END IF;
    IF v_clean ~ '\m(good girl|such a good girl|good little|sweet thing|gorgeous girl)\M' THEN
      v_strength := GREATEST(v_strength, 4); v_pattern_match := 'good-girl';
    END IF;
    IF v_clean ~ '\m(ass|booty|hips|lips|thighs|tits|nipples|mouth|pussy|hole|cock-hungry|cocksucker)\M' THEN
      v_strength := GREATEST(v_strength, 4); v_pattern_match := 'fem-body-praise';
    END IF;
    IF v_clean ~ '\m(wanna fuck you|wanna breed you|use you|own you|make you mine|mine to)\M' THEN
      v_strength := GREATEST(v_strength, 5); v_pattern_match := 'ownership';
    END IF;

    -- Skip if no fem-coded signal
    IF v_strength = 0 THEN CONTINUE; END IF;

    -- Skip pure-emoji or repetitive spam
    IF length(regexp_replace(v_clean, '[a-z\s]', '', 'g')) > length(v_clean) / 2 THEN CONTINUE; END IF;

    -- Truncate to 180 chars for mantra use
    v_quote_short := LEFT(trim(ev.content), 180);

    -- Insert as memory_implant
    BEGIN
      INSERT INTO memory_implants (
        user_id, implant_category, narrative, setting, emotional_core,
        target_outcome, source_type, importance, active
      ) VALUES (
        ev.user_id, 'stranger_validation',
        E'A stranger online wrote to you: "' || v_quote_short || E'"\n\nHe doesn''t know you. He has no reason to flatter. He saw what was there and named it. Mama wants you to remember he saw it, because he did. The proof exists outside this app.',
        'cruising platform DM',
        CASE WHEN v_strength >= 4 THEN 'aroused-by-being-seen' ELSE 'tender-noticing' END,
        'reinforce that strangers can see the fem becoming — externalize the truth',
        'stranger_validation', v_strength, TRUE
      ) RETURNING id INTO v_implant_id;
    EXCEPTION WHEN OTHERS THEN v_implant_id := NULL; END;

    -- Insert as mommy_mantra (text framing for morning rotation)
    BEGIN
      INSERT INTO mommy_mantras (
        text, affect_tags, phase_min, phase_max, intensity_tier,
        voice_settings_hint, category, active
      ) VALUES (
        E'Remember what he wrote, sweet thing: "' || v_quote_short || E'" — that''s what they see now.',
        ARRAY[ev.user_id::text, 'stranger_validation', v_pattern_match],
        0, 99,
        CASE WHEN v_strength >= 4 THEN 'cruel'
             WHEN v_strength >= 2 THEN 'firm'
             ELSE 'gentle' END,
        jsonb_build_object('source_event_id', ev.event_id, 'fem_signal_strength', v_strength,
                           'narration_frame', 'mama_quoting_stranger'),
        'stranger_quote', TRUE
      ) RETURNING id INTO v_mantra_id;
    EXCEPTION WHEN OTHERS THEN v_mantra_id := NULL; END;

    INSERT INTO stranger_validation_extractions (user_id, contact_event_id, matched_pattern, extracted_quote, fem_signal_strength, memory_implant_id, mantra_id)
    VALUES (ev.user_id, ev.event_id, v_pattern_match, v_quote_short, v_strength, v_implant_id, v_mantra_id);

    v_extracted := v_extracted + 1;
  END LOOP;

  RETURN v_extracted;
END;
$fn$;

GRANT EXECUTE ON FUNCTION stranger_validation_extract() TO service_role;

DO $do$ BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname='stranger-validation-15min') THEN
    PERFORM cron.unschedule('stranger-validation-15min');
  END IF;
EXCEPTION WHEN undefined_table THEN NULL; END $do$;
DO $do$ BEGIN
  PERFORM cron.schedule('stranger-validation-15min', '*/15 * * * *',
    $cron$SELECT stranger_validation_extract()$cron$);
EXCEPTION WHEN undefined_table THEN NULL; END $do$;
