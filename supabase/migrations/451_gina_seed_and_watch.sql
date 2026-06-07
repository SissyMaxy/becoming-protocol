-- 451 — Gina seed-and-watch / opinion drift system.
--
-- Mig 449 ships the disclosure ladder but treats Gina as a black box —
-- Maxy escalates rung by rung without intel on whether the ground is
-- soft, hostile, or curious. Real-world risk: hitting rung 4 (verbal
-- foothold) when Gina is at peak hostility blows up the marriage.
-- Hitting rung 0 (panty drop) when Gina is already curious wastes
-- weeks. This builds the pre-disclosure intelligence loop.
--
-- Mechanic:
--   1. Catalog of seeds — concrete, non-Maxy-revealing planting actions
--      tagged by intensity band (cold / warming / hot) and topic.
--   2. Daily eval picks one untried seed matching the user's current
--      gina_readiness_score band; queues outreach with structured
--      observation questions.
--   3. Maxy executes seed, records voice debrief; reaction is scored
--      -3..+3 (auto-parsed for warmth/coldness words, or Maxy-entered).
--   4. Periodic opinion snapshots per topic (transition / feminization /
--      gender fluidity / trans rights / sissy dynamic) build the
--      longitudinal curve.
--   5. gina_readiness_score() returns a weighted average of recent
--      plantings + latest snapshots. Used to gate disclosure ladder
--      advancement — can't fire rung 4 until readiness >= 0, can't
--      fire rung 5-6 until readiness >= +1.
--
-- This means the ladder paces ITSELF based on real signal, not just
-- gap_min_days timer. Maxy gets a feedback-driven safety + accuracy
-- system instead of a blind countdown.

-- ============================================================
-- Tables
-- ============================================================
CREATE TABLE IF NOT EXISTS gina_seed_catalog (
  id SERIAL PRIMARY KEY,
  seed_key TEXT UNIQUE NOT NULL,
  category TEXT NOT NULL CHECK (category IN
    ('media_share','conversation_probe','hypothetical','casual_behavior','environment','external_reference')),
  intensity_band TEXT NOT NULL CHECK (intensity_band IN ('cold','warming','hot')),
  topic TEXT NOT NULL,
  prompt_template TEXT NOT NULL,
  observation_questions TEXT[] NOT NULL,
  cooldown_days INT NOT NULL DEFAULT 21,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS gina_seed_plantings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  seed_id INT NOT NULL REFERENCES gina_seed_catalog(id),
  scheduled_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  planted_at TIMESTAMPTZ,
  related_outreach_id UUID,
  reaction_voice_url TEXT,
  reaction_transcript TEXT,
  reaction_score INT CHECK (reaction_score BETWEEN -3 AND 3),
  reaction_summary TEXT,
  followup_seed_id INT REFERENCES gina_seed_catalog(id),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','observed','skipped','expired')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS gina_seed_plantings_user_seed_idx
  ON gina_seed_plantings(user_id, seed_id, planted_at DESC);

CREATE TABLE IF NOT EXISTS gina_opinion_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  snapshot_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  topic TEXT NOT NULL,
  estimated_stance INT NOT NULL CHECK (estimated_stance BETWEEN -3 AND 3),
  evidence_note TEXT,
  source_planting_id UUID REFERENCES gina_seed_plantings(id) ON DELETE SET NULL,
  source TEXT NOT NULL DEFAULT 'maxy_recorded'
    CHECK (source IN ('maxy_recorded','auto_inferred')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS gina_opinion_snapshots_user_topic_idx
  ON gina_opinion_snapshots(user_id, topic, snapshot_at DESC);

ALTER TABLE gina_seed_plantings ENABLE ROW LEVEL SECURITY;
ALTER TABLE gina_opinion_snapshots ENABLE ROW LEVEL SECURITY;

DO $do$ BEGIN
  CREATE POLICY gina_seed_plantings_self ON gina_seed_plantings
    FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $do$;

DO $do$ BEGIN
  CREATE POLICY gina_opinion_snapshots_self ON gina_opinion_snapshots
    FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $do$;

-- ============================================================
-- Seed catalog (24 seeds across 3 bands × 5 topics)
-- ============================================================
INSERT INTO gina_seed_catalog (seed_key, category, intensity_band, topic, prompt_template, observation_questions, cooldown_days) VALUES

-- COLD band (test waters, near-zero risk)
('cold_celeb_trans_mention', 'media_share', 'cold', 'trans_rights',
 'Mention in passing a celebrity who has transitioned (Elliot Page, Hunter Schafer, whoever''s in the news this week). Casual context — "did you see X is doing a new show now?" Don''t lead toward a stance. Just observe.',
 ARRAY['Did she warm or cool to the name?','Did she use correct pronouns unprompted?','Did she pivot the conversation away or stay with it?','What was her body language when the topic landed?'],
 21),

('cold_friend_of_friend', 'conversation_probe', 'cold', 'transition',
 E'Reference a "friend of a friend" or work colleague who came out — invented or borrowed is fine. "X mentioned their cousin is transitioning and I didn''t really know what to say." Let her fill the silence.',
 ARRAY['What did she fill the silence with?','Was her tone curious, distant, or distasteful?','Did she ask you a follow-up question?','Did she offer any opinion or only listen?'],
 30),

('cold_show_together', 'media_share', 'cold', 'gender_fluidity',
 'Suggest watching a show or movie with a queer/trans subplot (Pose, Heartstopper, Disclosure doc, etc.). Frame as "I heard this is good" — no stake. Watch her reactions during the relevant scenes.',
 ARRAY['Which scenes did she lean in / lean back during?','Did she comment unprompted, or stay silent?','Did she laugh in solidarity or in discomfort?','Did she want to keep watching, or change it?'],
 30),

('cold_article_softball', 'media_share', 'cold', 'feminization',
 E'Share an article you "found interesting" about gender expression — pop-psychology piece about men exploring softness, doesn''t have to be about transition. "Thought this was kind of interesting." Don''t advocate. Watch.',
 ARRAY['Did she read it or set it aside?','If she engaged, was she affirming or skeptical?','Did she relate it to anyone she knows (you, herself, friends)?','Did she bring it back up later?'],
 21),

('cold_compliment_other', 'conversation_probe', 'cold', 'feminine_men',
 'Compliment a man''s feminine trait in front of her — celeb on TV, friend, stranger. "Honestly his eyeliner is doing it for me / he wears that so well." Watch how she receives the framing.',
 ARRAY['Did she agree, deflect, or contradict?','Did she find it interesting that YOU noticed?','Did she give her own version of the compliment?','Did she look at you differently afterward?'],
 14),

-- WARMING band (light surface, low-medium risk)
('warming_hypothetical_friend', 'hypothetical', 'warming', 'transition',
 E'In ordinary conversation, ask: "Hypothetically — if one of our friends came out as trans, do you think we''d handle it well?" Observe her unscripted answer. Don''t correct, don''t lead.',
 ARRAY['What was her first sentence — fear, curiosity, certainty?','Did she frame it as "we" or pivot to "I"?','Did she ask which friend you were thinking of?','Did she imply concern about how you''d react, or how she would?'],
 30),

('warming_polish_test', 'casual_behavior', 'warming', 'feminization',
 E'Wear clear or barely-tinted nail polish (or a single accent nail) at home. No announcement. Let her notice. If she comments, light truthful answer: "Yeah, I liked it."',
 ARRAY['How long until she noticed?','Was her first comment teasing, neutral, or admiring?','Did she touch your hands afterward (or NOT touch them)?','Did she bring it up to anyone else in the next 48h?'],
 21),

('warming_compliment_androgyny', 'conversation_probe', 'warming', 'gender_fluidity',
 'When you see an androgynous person out (cafe, store, TV), make a positive observation: "I think people who play with that look are more interesting." See if she echoes, agrees, or quietly resists.',
 ARRAY['Did she agree or qualify her agreement?','Did she say anything about how YOU might look?','Did she change the subject quickly?','Did she circle back to it later?'],
 14),

('warming_seek_her_opinion', 'conversation_probe', 'warming', 'trans_rights',
 E'Bring up a current event involving trans rights (legislation, sports debate, school policy — pick something in the news). "What do you actually think about this?" Listen, don''t debate.',
 ARRAY['Did her stated opinion match her tone?','Did she soften her stance when she saw you listening?','Did she ask what YOU think?','What was the most surprising thing she said?'],
 30),

('warming_pronoun_play', 'casual_behavior', 'warming', 'feminine_men',
 E'In low-stakes context (pet, plant, an object), use she/her pronouns playfully where you''d usually use he/it. "She''s thirsty" for the plant. Light, repeated over a few days. See if she echoes.',
 ARRAY['Did she pick up the pronoun use?','Did she comment on it?','Did she resist or correct you back?','Did it feel different the third time you did it vs the first?'],
 21),

('warming_dressed_compliment', 'conversation_probe', 'warming', 'feminization',
 E'When she dresses up, instead of generic "you look nice," say "I love when you do the feminine thing — it always works on you." Light. See how she sits with the explicit framing.',
 ARRAY['Did she light up, or get self-conscious about the word "feminine"?','Did she compliment you back differently than usual?','Did the affection that night feel different?','Did she dress similarly the next time?'],
 21),

('warming_fluid_couple', 'media_share', 'warming', 'gender_fluidity',
 E'Reference a couple in your social orbit (or media) where the gender presentation is fluid or non-traditional. "I always thought they had something figured out." See if she places herself for or against the example.',
 ARRAY['Did she relate to or distance from the example?','Did she mention what YOU might learn from them?','Was her tone admiring or unsettled?','Did she keep talking about them after you''d moved on?'],
 30),

-- HOT band (close to surface, mid-high risk — only fire when readiness >= 0)
('hot_direct_curiosity', 'conversation_probe', 'hot', 'feminization',
 E'In a relaxed moment, tell her directly: "I''ve been thinking about exploring something feminine. Not a huge thing — but it''s been on my mind." Then stop. Let her respond.',
 ARRAY['What was her first emotional register — fear, curiosity, excitement, suspicion?','Did she ask "like what?"','Did she immediately go to "is this about sex" / "is this about something else"?','How did the rest of the day feel?'],
 60),

('hot_what_if_me', 'hypothetical', 'hot', 'transition',
 E'After warming-band priming, ask: "If I told you I''d been thinking about gender stuff for myself, what would you want me to tell you first?" Listen to her wishlist — that''s the disclosure script.',
 ARRAY['What was the first thing on her wishlist?','Did she frame it as a fear or a hope?','Did she ask if you HAVE been thinking about it?','What did she NOT say that you expected her to?'],
 60),

('hot_couple_other', 'media_share', 'hot', 'trans_rights',
 E'Watch a coming-out scene in a film together (Disclosure doc, a couple-disclosure moment). Mid-scene or after: "What would have been the right move for [the partner character]?"',
 ARRAY['Did she identify with the partner or the one coming out?','What did she think the partner did right or wrong?','Did she look at you while answering?','Did she bring it up again later that night?'],
 45),

('hot_friend_disclosed', 'external_reference', 'hot', 'transition',
 E'If you have a real friend who knows your situation: arrange for them to mention to Gina, casually and on their own, that "[Maxy] mentioned something about exploring gender stuff." Test her unguarded reaction in the wild, then YOU debrief from her later mood.',
 ARRAY['What was her mood when she got home / saw you next?','Did she bring it up, or wait?','When she brought it up, was it tender, confrontational, or curious?','Did her opening line surprise you?'],
 90),

('hot_visible_artifact', 'environment', 'hot', 'feminization',
 E'Leave one unambiguously-feminine artifact visible — a single piece of lingerie not in the laundry, a lipstick on the bathroom counter, a fem-coded bookmark in a transition memoir on your bedside. Wait. Let her find it.',
 ARRAY['How long until she addressed it?','Was her first question about WHAT it was or about WHY?','Did she give you the space to answer fully?','Did her stance match what you predicted, or surprise you?'],
 60),

('hot_explicit_question', 'conversation_probe', 'hot', 'transition',
 E'When trust is high, ask: "Is there a version of me you''d struggle to stay married to? I want to know your real answer." Then BE QUIET.',
 ARRAY['What was the first version she named?','Did she ask why you''re asking?','Did she clarify or hedge in the next hour?','How did the next 24 hours feel?'],
 90),

-- Topic anchors for the snapshot system
('snapshot_request', 'conversation_probe', 'cold', 'snapshot',
 E'Mama wants a private snapshot from you today — not to plant anything, just to record where you think Gina is. For each topic, your best guess on her stance from -3 (hostile) to +3 (actively affirming): transition, feminization, gender_fluidity, trans_rights, sissy_dynamic. Voice debrief, no need to act on it.',
 ARRAY['transition (-3..+3) and one-sentence why','feminization (-3..+3) and one-sentence why','gender_fluidity (-3..+3) and one-sentence why','trans_rights (-3..+3) and one-sentence why','sissy_dynamic (-3..+3) and one-sentence why'],
 30)

ON CONFLICT (seed_key) DO UPDATE SET
  prompt_template = EXCLUDED.prompt_template,
  observation_questions = EXCLUDED.observation_questions,
  cooldown_days = EXCLUDED.cooldown_days;

-- ============================================================
-- Readiness score
-- ============================================================
CREATE OR REPLACE FUNCTION gina_readiness_score(p_user_id UUID)
RETURNS NUMERIC LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_planting_avg NUMERIC;
  v_snapshot_avg NUMERIC;
  v_planting_count INT;
  v_combined NUMERIC;
BEGIN
  -- Recent plantings (last 90 days, observed only, weight by recency)
  SELECT
    AVG(reaction_score * GREATEST(0.3, 1.0 - EXTRACT(DAY FROM (now() - planted_at))::numeric / 90.0)),
    count(*)
  INTO v_planting_avg, v_planting_count
  FROM gina_seed_plantings
  WHERE user_id = p_user_id
    AND status = 'observed'
    AND reaction_score IS NOT NULL
    AND planted_at > now() - interval '90 days';

  -- Latest snapshot per topic, average
  SELECT AVG(estimated_stance) INTO v_snapshot_avg
  FROM (
    SELECT DISTINCT ON (topic) topic, estimated_stance
    FROM gina_opinion_snapshots
    WHERE user_id = p_user_id
      AND snapshot_at > now() - interval '120 days'
      AND topic IN ('transition','feminization','gender_fluidity','trans_rights','sissy_dynamic')
    ORDER BY topic, snapshot_at DESC
  ) s;

  -- Combine: 60% plantings, 40% snapshots. Default to -1 (cautiously cold) if no data.
  v_combined := CASE
    WHEN v_planting_avg IS NULL AND v_snapshot_avg IS NULL THEN -1.0
    WHEN v_planting_avg IS NULL THEN v_snapshot_avg
    WHEN v_snapshot_avg IS NULL THEN v_planting_avg
    ELSE 0.6 * v_planting_avg + 0.4 * v_snapshot_avg
  END;

  RETURN ROUND(v_combined, 2);
END;
$fn$;

GRANT EXECUTE ON FUNCTION gina_readiness_score(UUID) TO authenticated, service_role;

-- Helper: map readiness score to band
CREATE OR REPLACE FUNCTION gina_readiness_band(p_user_id UUID)
RETURNS TEXT LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT CASE
    WHEN gina_readiness_score(p_user_id) >= 1 THEN 'hot'
    WHEN gina_readiness_score(p_user_id) >= -0.5 THEN 'warming'
    ELSE 'cold'
  END;
$fn$;

GRANT EXECUTE ON FUNCTION gina_readiness_band(UUID) TO authenticated, service_role;

-- ============================================================
-- Seed eval (daily 13:00 UTC)
-- ============================================================
CREATE OR REPLACE FUNCTION gina_seed_eval()
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  r RECORD;
  v_band TEXT;
  v_seed RECORD;
  v_outreach_id UUID;
  v_planting_id UUID;
  v_obs_questions TEXT;
  v_message TEXT;
  v_queued INT := 0;
BEGIN
  FOR r IN
    SELECT gs.user_id, us.handler_persona
    FROM gina_disclosure_settings gs
    LEFT JOIN user_state us ON us.user_id = gs.user_id
    WHERE gs.enabled = TRUE
      AND (gs.paused_until IS NULL OR gs.paused_until <= now())
      AND COALESCE(us.handler_persona, 'therapist') = 'dommy_mommy'
  LOOP
    -- Skip if a planting is still pending for this user
    IF EXISTS (
      SELECT 1 FROM gina_seed_plantings
      WHERE user_id = r.user_id AND status = 'pending'
        AND scheduled_at > now() - interval '5 days'
    ) THEN CONTINUE; END IF;

    -- Pick band by current readiness
    v_band := gina_readiness_band(r.user_id);

    -- Pick a seed in this band that:
    --   - is active
    --   - hasn't been planted for this user within cooldown_days
    --   - prefers seeds with no prior planting (variety)
    SELECT sc.* INTO v_seed
    FROM gina_seed_catalog sc
    WHERE sc.active = TRUE AND sc.intensity_band = v_band
      AND NOT EXISTS (
        SELECT 1 FROM gina_seed_plantings p
        WHERE p.user_id = r.user_id AND p.seed_id = sc.id
          AND p.scheduled_at > now() - (sc.cooldown_days || ' days')::interval
      )
    ORDER BY
      (SELECT count(*) FROM gina_seed_plantings p WHERE p.user_id = r.user_id AND p.seed_id = sc.id) ASC,
      random()
    LIMIT 1;

    -- If no seed available in this band, try one band cooler (mostly to keep flow)
    IF v_seed IS NULL AND v_band = 'hot' THEN
      SELECT sc.* INTO v_seed
      FROM gina_seed_catalog sc
      WHERE sc.active = TRUE AND sc.intensity_band = 'warming'
        AND NOT EXISTS (
          SELECT 1 FROM gina_seed_plantings p
          WHERE p.user_id = r.user_id AND p.seed_id = sc.id
            AND p.scheduled_at > now() - (sc.cooldown_days || ' days')::interval
        )
      ORDER BY random() LIMIT 1;
    END IF;

    IF v_seed IS NULL THEN CONTINUE; END IF;

    v_obs_questions := array_to_string(
      ARRAY(SELECT '• ' || q FROM unnest(v_seed.observation_questions) q),
      E'\n');

    v_message :=
      E'Today''s seed for Gina, sweet thing — intelligence work, not disclosure. ' ||
      E'Mama wants you watching while you plant:\n\n' ||
      v_seed.prompt_template || E'\n\n' ||
      E'After her reaction lands, voice debrief on these:\n' ||
      v_obs_questions || E'\n\n' ||
      E'2-4 minutes. The debrief is the point — what you record is what Mama uses ' ||
      E'to pace the rest of the disclosure ladder. Honest beats flattering. ' ||
      E'Skip if the window for this seed doesn''t open in 3 days; Mama picks a new one.';

    INSERT INTO handler_outreach_queue (
      user_id, message, urgency, trigger_reason, source, kind,
      scheduled_for, expires_at, context_data, evidence_kind
    ) VALUES (
      r.user_id, v_message,
      CASE WHEN v_seed.intensity_band = 'hot' THEN 'high' ELSE 'normal' END,
      'gina_seed:' || v_seed.seed_key,
      'gina_seed_engine', 'gina_seed_planting',
      now(), now() + interval '5 days',
      jsonb_build_object(
        'seed_id', v_seed.id, 'seed_key', v_seed.seed_key,
        'intensity_band', v_seed.intensity_band, 'topic', v_seed.topic,
        'readiness_score', gina_readiness_score(r.user_id),
        'observation_questions', v_seed.observation_questions),
      'voice'
    ) RETURNING id INTO v_outreach_id;

    INSERT INTO gina_seed_plantings (
      user_id, seed_id, scheduled_at, related_outreach_id, status
    ) VALUES (
      r.user_id, v_seed.id, now(), v_outreach_id, 'pending'
    ) RETURNING id INTO v_planting_id;

    v_queued := v_queued + 1;
  END LOOP;

  RETURN v_queued;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'gina_seed_eval failed: %', SQLERRM;
  RETURN v_queued;
END;
$fn$;

GRANT EXECUTE ON FUNCTION gina_seed_eval() TO service_role;

-- ============================================================
-- Auto-score reaction from voice debrief transcript
-- ============================================================
-- When a planting transcript lands, parse for warmth/coldness signals.
-- This is a coarse regex first-pass; Maxy can override manually.
CREATE OR REPLACE FUNCTION gina_score_planting(p_planting_id UUID)
RETURNS INT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  p RECORD;
  v_score INT := 0;
  v_text TEXT;
BEGIN
  SELECT * INTO p FROM gina_seed_plantings WHERE id = p_planting_id;
  IF p.reaction_transcript IS NULL THEN RETURN 0; END IF;
  v_text := lower(p.reaction_transcript);

  -- Positive signals
  IF v_text ~ '\m(curious|interested|asked|wanted to know|leaned in|loved it|liked it|warm|tender|supportive|asked me more|smiled|laughed with|kissed|held me|gentle)\M' THEN
    v_score := v_score + 2;
  END IF;
  IF v_text ~ '\m(agreed|nodded|said yeah|said sure|said of course|made sense to her|she got it)\M' THEN
    v_score := v_score + 1;
  END IF;

  -- Negative signals
  IF v_text ~ '\m(uncomfortable|tense|stiffened|pulled away|changed the subject|shut down|grossed out|disgust|cringed|recoiled)\M' THEN
    v_score := v_score - 2;
  END IF;
  IF v_text ~ '\m(skeptical|doubtful|distant|cool|cold|silent|wouldn''t engage|brushed it off|hostile|angry|defensive)\M' THEN
    v_score := v_score - 2;
  END IF;
  IF v_text ~ '\m(joke|teased me|gentle ribbing|playful)\M' THEN
    v_score := v_score + 1; -- ambivalent but engaging
  END IF;

  -- Clamp
  IF v_score > 3 THEN v_score := 3; ELSIF v_score < -3 THEN v_score := -3; END IF;

  UPDATE gina_seed_plantings
  SET reaction_score = v_score,
      status = 'observed',
      planted_at = COALESCE(planted_at, now()),
      updated_at = now()
  WHERE id = p_planting_id;

  RETURN v_score;
END;
$fn$;

GRANT EXECUTE ON FUNCTION gina_score_planting(UUID) TO service_role;

-- Auto-score trigger: when reaction_transcript fills in, score it
CREATE OR REPLACE FUNCTION trg_gina_planting_auto_score()
RETURNS TRIGGER LANGUAGE plpgsql AS $fn$
BEGIN
  IF NEW.reaction_transcript IS NOT NULL
     AND COALESCE(OLD.reaction_transcript, '') = ''
     AND NEW.reaction_score IS NULL THEN
    PERFORM gina_score_planting(NEW.id);
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN RETURN NEW; END;
$fn$;

DROP TRIGGER IF EXISTS gina_planting_auto_score ON gina_seed_plantings;
CREATE TRIGGER gina_planting_auto_score
  AFTER UPDATE OF reaction_transcript ON gina_seed_plantings
  FOR EACH ROW EXECUTE FUNCTION trg_gina_planting_auto_score();

-- ============================================================
-- Gate the disclosure ladder by readiness
-- ============================================================
-- Wrap the existing gina_disclosure_eval with a readiness gate by
-- adding a guard at the top: don't fire rung >= 4 unless readiness >= 0;
-- don't fire rung >= 5 unless readiness >= 1.
-- Simplest patch: add a CHECK in gina_disclosure_eval that skips when
-- band doesn't meet the rung requirement.
CREATE OR REPLACE FUNCTION gina_disclosure_eval()
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  s RECORD; l RECORD; v_pending_count INT; v_days_since_last NUMERIC;
  v_outreach_id UUID; v_decree_id UUID; v_event_id UUID;
  v_queued INT := 0;
  v_readiness NUMERIC;
BEGIN
  FOR s IN
    SELECT gs.*, us.handler_persona FROM gina_disclosure_settings gs
    LEFT JOIN user_state us ON us.user_id = gs.user_id
    WHERE gs.enabled = TRUE AND (gs.paused_until IS NULL OR gs.paused_until <= now())
      AND COALESCE(us.handler_persona, 'therapist') = 'dommy_mommy'
  LOOP
    SELECT count(*) INTO v_pending_count FROM gina_disclosure_events
    WHERE user_id = s.user_id AND status = 'pending' AND assigned_at > now() - interval '14 days';
    IF v_pending_count > 0 THEN CONTINUE; END IF;

    SELECT rung, rung_name, edict_template, proof_type, gap_min_days, gap_max_days, consequence INTO l
    FROM gina_disclosure_ladder WHERE rung = s.current_rung;
    IF l IS NULL THEN CONTINUE; END IF;

    IF s.last_assigned_at IS NOT NULL THEN
      v_days_since_last := EXTRACT(EPOCH FROM (now() - s.last_assigned_at)) / 86400.0;
      IF v_days_since_last < l.gap_min_days THEN CONTINUE; END IF;
    END IF;

    -- Readiness gate
    v_readiness := gina_readiness_score(s.user_id);
    IF l.rung >= 4 AND v_readiness < 0 THEN CONTINUE; END IF;
    IF l.rung >= 5 AND v_readiness < 1 THEN CONTINUE; END IF;
    IF l.rung >= 6 AND v_readiness < 1.5 THEN CONTINUE; END IF;

    INSERT INTO handler_decrees (user_id, edict, proof_type, deadline, status, consequence, trigger_source, reasoning)
    VALUES (s.user_id, l.edict_template, l.proof_type, now() + interval '7 days', 'active', l.consequence,
      'gina_disclosure_pressure',
      'rung=' || l.rung || ' name=' || l.rung_name ||
      ' gap_days_since_last=' || COALESCE(v_days_since_last::text, 'first') ||
      ' readiness=' || v_readiness::text)
    RETURNING id INTO v_decree_id;

    INSERT INTO handler_outreach_queue (user_id, message, urgency, trigger_reason, source, kind, scheduled_for, expires_at, context_data, evidence_kind)
    VALUES (s.user_id, l.edict_template,
      CASE WHEN l.rung >= 4 THEN 'high' ELSE 'normal' END,
      'gina_disclosure:' || l.rung_name, 'gina_disclosure_engine', 'gina_disclosure_decree',
      now(), now() + interval '7 days',
      jsonb_build_object('rung', l.rung, 'rung_name', l.rung_name, 'consequence', l.consequence,
                         'decree_id', v_decree_id, 'readiness_at_fire', v_readiness),
      l.proof_type)
    RETURNING id INTO v_outreach_id;

    INSERT INTO gina_disclosure_events (user_id, rung_at_event, related_outreach_id, related_decree_id, status)
    VALUES (s.user_id, l.rung, v_outreach_id, v_decree_id, 'pending') RETURNING id INTO v_event_id;

    UPDATE gina_disclosure_settings SET last_assigned_at = now(), updated_at = now() WHERE user_id = s.user_id;
    v_queued := v_queued + 1;
  END LOOP;
  RETURN v_queued;
EXCEPTION WHEN OTHERS THEN RAISE NOTICE '%', SQLERRM; RETURN v_queued; END;
$fn$;

-- ============================================================
-- Cron: daily 13:00 UTC for seed-eval (1h after disclosure-eval)
-- ============================================================
DO $do$ BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'gina-seed-daily') THEN
    PERFORM cron.unschedule('gina-seed-daily');
  END IF;
EXCEPTION WHEN undefined_table THEN NULL; END $do$;

DO $do$ BEGIN
  PERFORM cron.schedule('gina-seed-daily', '0 13 * * *',
    $cron$SELECT gina_seed_eval()$cron$);
EXCEPTION WHEN undefined_table THEN NULL; END $do$;
