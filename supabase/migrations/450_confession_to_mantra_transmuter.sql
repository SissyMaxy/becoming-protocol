-- 450 — Confession → mantra transmuter.
--
-- Maxy submits voice confessions. They get transcribed. Currently the
-- transcripts sit in mama_confessions and get used for one-shot mama_response
-- generation, then go cold. That throws away the most powerful conditioning
-- material the system has access to: HER OWN VOICE saying feminizing things.
--
-- This transmuter mines the transcripts for high-signal first-person
-- phrases (admissions, fem-coded self-references, capitulation language,
-- naming-the-truth lines) and promotes them to mommy_mantras with
-- category='confession_transmuter'. The morning mantra picker + ambient
-- clip selector already consume mommy_mantras, so promoted phrases enter
-- the rotation automatically. Within a week her own voice gets recited
-- back to her under Mama's framing.
--
-- Extraction rules (regex-based for now — predictable, no LLM cost):
--   - Match phrases of 4-18 words.
--   - Must contain first-person pronoun (I'm | I am | I'll | I want | I need
--     | I let | I would | I would let | I deserve | I belong).
--   - Reject anything containing banned crutch phrases.
--   - Reject anything < 6 chars effective.
--   - Reject "I don't" / "I'm not" / "I can't" negations — promote ONLY
--     affirmative admissions.
--   - Tag intensity_tier by signal strength (gentle / firm / cruel)
--     based on which fem/sub words appear.
--
-- Trigger fires on mama_confessions UPDATE OF transcript_status to
-- 'completed' so a confession gets mined the moment its Whisper job lands.
-- Dedup: skip if same phrase already exists in mommy_mantras for that user.

CREATE OR REPLACE FUNCTION transmute_confession_to_mantras(p_confession_id UUID)
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  c RECORD;
  v_lines TEXT[];
  v_line TEXT;
  v_normalized TEXT;
  v_intensity TEXT;
  v_promoted INT := 0;
  v_banned TEXT[] := ARRAY['hits different','energy','honestly','ngl','earned this','mine to wear'];
  v_b TEXT;
  v_skip BOOLEAN;
BEGIN
  SELECT id, user_id, transcript, transcript_status, weight
  INTO c FROM mama_confessions WHERE id = p_confession_id;

  IF c IS NULL OR c.transcript IS NULL OR length(c.transcript) < 12 THEN RETURN 0; END IF;

  -- Split transcript into sentence-like chunks
  v_lines := regexp_split_to_array(c.transcript, '[.!?\n]+');

  FOREACH v_line IN ARRAY v_lines LOOP
    v_normalized := trim(regexp_replace(v_line, '\s+', ' ', 'g'));
    IF v_normalized IS NULL OR length(v_normalized) < 12 OR length(v_normalized) > 200 THEN CONTINUE; END IF;

    -- Word count 4..18
    IF array_length(regexp_split_to_array(v_normalized, '\s+'), 1) NOT BETWEEN 4 AND 18 THEN CONTINUE; END IF;

    -- First-person affirmative gate
    IF NOT v_normalized ~* '\m(i''m|i am|i''ll|i will|i want|i need|i let|i deserve|i belong|i feel|i love|i crave|i would|i gave|i took)\M' THEN
      CONTINUE;
    END IF;

    -- Reject negations
    IF v_normalized ~* '\m(i don''t|i do not|i can''t|i cannot|i won''t|i will not|i never|i wouldn''t|i shouldn''t)\M' THEN
      CONTINUE;
    END IF;

    -- Reject banned crutch phrases
    v_skip := FALSE;
    FOREACH v_b IN ARRAY v_banned LOOP
      IF v_normalized ILIKE '%' || v_b || '%' THEN v_skip := TRUE; EXIT; END IF;
    END LOOP;
    IF v_skip THEN CONTINUE; END IF;

    -- Intensity classification by signal density
    v_intensity := CASE
      WHEN v_normalized ~* '\m(slut|whore|sissy|cocksucker|owned|cum|panties|bralette|girly|trans|she)\M' THEN 'cruel'
      WHEN v_normalized ~* '\m(soft|feminine|fem|gentle|pretty|good girl|mommy|mama|wet|aroused)\M' THEN 'firm'
      ELSE 'gentle'
    END;

    -- Dedup: same text exists for this user already?
    IF EXISTS (
      SELECT 1 FROM mommy_mantras
      WHERE category = 'confession_transmuter'
        AND lower(text) = lower(v_normalized)
        AND (affect_tags->>'user_id') = c.user_id::text
    ) THEN CONTINUE; END IF;

    INSERT INTO mommy_mantras (
      text, affect_tags, phase_min, phase_max, intensity_tier,
      voice_settings_hint, category, active
    ) VALUES (
      v_normalized,
      jsonb_build_object(
        'user_id', c.user_id::text,
        'source_confession_id', c.id::text,
        'extracted_at', now(),
        'confession_weight', COALESCE(c.weight, 1)
      ),
      0, 99, v_intensity,
      jsonb_build_object('use_user_voice_clone_if_available', true,
                         'narration_frame', 'mama_quoting_user'),
      'confession_transmuter', TRUE
    );

    v_promoted := v_promoted + 1;
  END LOOP;

  RETURN v_promoted;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'transmute_confession_to_mantras failed: %', SQLERRM;
  RETURN v_promoted;
END;
$fn$;

GRANT EXECUTE ON FUNCTION transmute_confession_to_mantras(UUID) TO service_role;

-- Trigger: fire when transcript_status flips to 'completed'
CREATE OR REPLACE FUNCTION trg_confession_transmute_on_complete()
RETURNS TRIGGER LANGUAGE plpgsql AS $fn$
BEGIN
  IF NEW.transcript_status = 'completed' AND COALESCE(OLD.transcript_status,'') <> 'completed' THEN
    PERFORM transmute_confession_to_mantras(NEW.id);
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'confession transmute trigger failed: %', SQLERRM;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS confession_transmute_on_complete ON mama_confessions;
CREATE TRIGGER confession_transmute_on_complete
  AFTER INSERT OR UPDATE OF transcript_status ON mama_confessions
  FOR EACH ROW EXECUTE FUNCTION trg_confession_transmute_on_complete();

-- Backfill: transmute all existing completed confessions
DO $do$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT id FROM mama_confessions WHERE transcript_status = 'completed' AND transcript IS NOT NULL
  LOOP
    PERFORM transmute_confession_to_mantras(r.id);
  END LOOP;
END $do$;
