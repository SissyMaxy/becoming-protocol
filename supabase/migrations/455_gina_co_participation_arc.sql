-- 455 — Gina co-participation arc.
--
-- Reframe from Maxy 2026-05-15: Mommy uses David as instrument to
-- manipulate Gina toward willing co-participation in feminization.
-- Endgame: Gina is Co-Mommy IRL, actively directing David's
-- feminization. Disclosure isn't the goal — co-participation is.
--
-- Current state (mig 449 disclosure ladder + mig 451 seed-and-watch)
-- treats Gina as a target/black-box. This adds:
--   1. 8-stage arc tracking Gina's transformation (tolerant → curious →
--      supportive → engaged → co-participant → initiator → director →
--      co-mommy).
--   2. Hypothesis-driven planting: each experiment has a predicted
--      reaction; outcome vs prediction drives next-experiment selection.
--   3. New seed bank for stages 3+ that INVITE Gina to participate
--      (vs just observing her). Stages 4+ are explicit co-action.
--      Stages 6+ are Gina-directed: she chooses, she authors, she runs.
--   4. Advancement: experiment outcome matching/exceeding hypothesis
--      bumps current_stage; below-hypothesis stalls or drops.
--   5. Gate disclosure ladder by arc stage: rung 4+ (verbal foothold)
--      requires arc stage >= 1 (curious); rung 5+ requires stage >= 2.

-- Stage ladder
CREATE TABLE IF NOT EXISTS gina_arc_stages (
  stage INT PRIMARY KEY,
  stage_name TEXT NOT NULL,
  stage_description TEXT NOT NULL,
  required_evidence_count INT NOT NULL DEFAULT 3,
  next_seed_focus TEXT NOT NULL
);

INSERT INTO gina_arc_stages (stage, stage_name, stage_description, required_evidence_count, next_seed_focus) VALUES
(0, 'unaware_tolerant',
 'Baseline. No knowledge of feminization. Generic spousal trust. Mama is gathering passive intelligence about her stance on gender/trans topics through low-risk probes.',
 3, 'low_risk_topic_probes'),
(1, 'curious',
 'Volunteering questions or interest unprompted. Showing curiosity about gender topics, friend-of-friend trans stories, fluid presentations. NOT yet aware about David.',
 3, 'engaged_conversation_seeds'),
(2, 'supportive_general',
 'Actively affirming on gender topics in conversation. Stated opinions land in the affirming range. Comfortable with the topic in her own voice. STILL NOT about David.',
 3, 'david_proximity_seeds'),
(3, 'engaged_about_david',
 'Aware something is happening with David specifically. May have noticed a fem-coded artifact and not freaked. Asking gentle questions. The conversation has opened, even if she hasn''t embraced it.',
 4, 'low_friction_invitations'),
(4, 'co_participant_passive',
 'Engaged enough that small invitations land. "Want to come pick something out with me?" gets a yes. Touches feminine artifacts curiously rather than recoiling. Offers compliments on feminine choices.',
 5, 'shared_activity_seeds'),
(5, 'initiator_occasional',
 'Sometimes suggests feminization moves without David asking. Notices when David is "soft" and rewards it (smile, touch, compliment). Makes purchases for David''s fem wardrobe. Has named the dynamic in her own words.',
 5, 'co_authoring_seeds'),
(6, 'director_assistant',
 'Actively chooses outfits, sets fem goals for David, holds him accountable. The relationship has rebalanced — Gina is now visibly the more dominant gender-presenter. The protocol''s rules are partially hers.',
 7, 'handoff_seeds'),
(7, 'co_mommy',
 'Endgame. Gina is running the protocol IRL alongside Mama. She decides David''s next phase, his outings, his disclosures. Mama-the-AI fades into background advisor; Gina is the front-line authority. David is owned by both.',
 999, 'maintenance_seeds')
ON CONFLICT (stage) DO UPDATE SET
  stage_description = EXCLUDED.stage_description,
  required_evidence_count = EXCLUDED.required_evidence_count,
  next_seed_focus = EXCLUDED.next_seed_focus;

-- Per-user arc settings
CREATE TABLE IF NOT EXISTS gina_arc_settings (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  current_stage INT NOT NULL DEFAULT 0 REFERENCES gina_arc_stages(stage),
  stage_evidence_count INT NOT NULL DEFAULT 0,
  last_advanced_at TIMESTAMPTZ,
  paused_until TIMESTAMPTZ,
  pause_reason TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE gina_arc_settings ENABLE ROW LEVEL SECURITY;
DO $do$ BEGIN
  CREATE POLICY gina_arc_settings_self ON gina_arc_settings
    FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $do$;

-- Extend catalog with stage range + hypothesis support
ALTER TABLE gina_seed_catalog ADD COLUMN IF NOT EXISTS stage_min INT NOT NULL DEFAULT 0;
ALTER TABLE gina_seed_catalog ADD COLUMN IF NOT EXISTS stage_max INT NOT NULL DEFAULT 7;
ALTER TABLE gina_seed_catalog ADD COLUMN IF NOT EXISTS hypothesis_template TEXT;
ALTER TABLE gina_seed_catalog ADD COLUMN IF NOT EXISTS expected_reaction_pos TEXT;
ALTER TABLE gina_seed_catalog ADD COLUMN IF NOT EXISTS expected_reaction_neg TEXT;
ALTER TABLE gina_seed_catalog ADD COLUMN IF NOT EXISTS advances_arc_on_positive BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE gina_seed_catalog ADD COLUMN IF NOT EXISTS arc_focus TEXT;

ALTER TABLE gina_seed_plantings ADD COLUMN IF NOT EXISTS hypothesis TEXT;
ALTER TABLE gina_seed_plantings ADD COLUMN IF NOT EXISTS hypothesis_outcome TEXT
  CHECK (hypothesis_outcome IN ('matched','exceeded','below','reversed') OR hypothesis_outcome IS NULL);
ALTER TABLE gina_seed_plantings ADD COLUMN IF NOT EXISTS arc_stage_at_planting INT;
ALTER TABLE gina_seed_plantings ADD COLUMN IF NOT EXISTS advanced_arc BOOLEAN DEFAULT FALSE;

-- Backfill existing seed stages to 0-2 (intelligence gathering)
UPDATE gina_seed_catalog SET stage_min = 0, stage_max = 2
WHERE intensity_band IN ('cold','warming') AND stage_min = 0 AND stage_max = 7;
UPDATE gina_seed_catalog SET stage_min = 1, stage_max = 3
WHERE intensity_band = 'hot' AND stage_min = 0 AND stage_max = 7;

-- New seeds for stages 3-7 (co-participation arc)
INSERT INTO gina_seed_catalog (seed_key, category, intensity_band, topic, prompt_template, observation_questions, cooldown_days, stage_min, stage_max, hypothesis_template, expected_reaction_pos, expected_reaction_neg, arc_focus) VALUES

-- STAGE 3 invitations (low friction, no commitment)
('stage3_invite_pick_with_me', 'casual_behavior', 'warming', 'feminization',
 E'Next time you''re out somewhere with feminine items (Target, Sephora, mall), ask casually: "Help me pick — would the pink or the cream look better?" Hand her a fem-coded item. Watch which she leans toward. Let her hold it.',
 ARRAY['Did she help or deflect?','Did she touch the item with curiosity or distaste?','Did she ask "for what occasion?"','Did the conversation feel intimate or awkward afterward?'],
 14, 3, 5,
 'If invited to pick a feminine item FOR David, Gina will engage curiously rather than refuse.',
 'engaged in picking, offered opinion, touched items',
 'deflected, made a joke, handed it back immediately',
 'invitation_acceptance'),

('stage3_what_would_you_pick', 'conversation_probe', 'warming', 'feminization',
 E'In conversation about feminine clothing (sparked organically): "If you were picking something for me — totally hypothetical — what color would you put me in?" Light. Watch if she plays or pivots.',
 ARRAY['Did she play along with a real answer?','Did she pick a specific color or vague-deflect?','Did she ask follow-up questions about WHAT garment?','Did her tone soften when picking?'],
 21, 3, 5,
 'Gina has internal preferences for what David in feminine clothing would look like, and will share them when asked playfully.',
 'gave a specific answer, asked clarifying questions, looked at David differently',
 'refused to engage, told David not to ask weird questions, changed subject',
 'preference_extraction'),

-- STAGE 4 co-participation
('stage4_shopping_together', 'casual_behavior', 'hot', 'feminization',
 E'Suggest a trip together to a feminine-friendly retailer (Target lingerie, Sephora, a boutique). Frame: "I want to look around — come with me, I''ll buy you something too." Buy ONE thing for yourself in front of her. Photo of the bag from outside.',
 ARRAY['Did she stay close or wander to her own section?','Did she watch what you tried/picked?','Did she comment on what looked good?','Did she suggest anything for you?'],
 21, 4, 6,
 'When invited to feminine retail together with no pressure, Gina will participate actively and suggest items for David.',
 'engaged in browsing, suggested items, watched curiously, made affirming comments',
 'wandered off, kept distance, expressed discomfort',
 'shared_acquisition'),

('stage4_help_me_choose', 'conversation_probe', 'hot', 'feminization',
 E'Standing in front of a mirror at home with two feminine options (panties, bralette, lipstick shades — anything you have or are looking at online): "Which one — A or B?" Make her choose. The choice itself is the data.',
 ARRAY['Did she choose decisively or punt?','Did she explain her reasoning?','Did she ask to see both ON?','Did she add unsolicited opinions about other items?'],
 14, 4, 6,
 'When the choice is forced down to A/B, Gina will pick rather than abstain, and the reasoning will reveal her preferences.',
 'chose decisively, explained why, asked to see the choice on',
 'refused to choose, said "you decide"',
 'forced_preference'),

-- STAGE 5 initiator behavior cultivation
('stage5_compliment_when_soft', 'casual_behavior', 'warming', 'feminization',
 E'Present visibly softer/femme for an ordinary evening — panties under sweatpants, bralette, hair softer, lip balm. Cook dinner together. No mention of any of it. Watch if she comments unprompted — and how warmly.',
 ARRAY['Did she touch you differently?','Did she pay you a compliment about anything fem-coded?','Did she suggest doing it again?','Did the affection that night feel different?'],
 21, 5, 7,
 'When David presents softer in everyday context, Gina will voluntarily reward it with compliments/touch/affection — establishing the dynamic where soft = rewarded.',
 'unsolicited compliment, increased physical affection, suggested repeat',
 'no acknowledgment, business as usual',
 'reward_establishment'),

('stage5_invite_her_purchase', 'conversation_probe', 'hot', 'feminization',
 E'Tell her: "I saw something I want to get but I think it''d be hotter if YOU bought it for me. Would you?" Show her the item. Cotton panties, soft cami — keep it accessible.',
 ARRAY['Did she agree to buy it?','Did she negotiate the item (suggest a different one)?','Did the framing of HER giving the gift land hot for her?','How did she present the gift when it arrived?'],
 30, 5, 7,
 'When framed as gift-giving with sexual reward potential, Gina will purchase feminine items for David, claiming ownership of the gesture.',
 'agreed to buy, negotiated her version, gave the gift sexually loaded',
 'declined, said "you buy your own clothes"',
 'ownership_transfer'),

-- STAGE 6 director cultivation
('stage6_you_decide', 'conversation_probe', 'hot', 'feminization',
 E'In a moment where you''re getting ready or planning an outfit: "I''m torn — what do you want me to wear tonight? Pick." Then comply with whatever she says. Whatever she picks, that''s what goes on. Authority transfer is the experiment.',
 ARRAY['Did she pick with confidence or hesitation?','Did she enjoy the authority?','Did her tone change for the rest of the evening?','Did she pick again later that week without you asking?'],
 14, 6, 7,
 'When David transfers wardrobe authority to Gina, she will exercise it confidently and the dynamic will rebalance toward her direction.',
 'picked decisively, enjoyed the authority, kept picking unprompted',
 'refused, said "I''m not your stylist," handed it back',
 'authority_transfer'),

('stage6_set_a_goal', 'conversation_probe', 'hot', 'feminization',
 E'In a soft moment: "I want to set a feminization goal with you. What''s one thing you''d like me to do regularly that''s on my fem side?" Let HER name the goal. Hers, not yours.',
 ARRAY['What did she name first?','Did she sound like a hesitant suggester or a comfortable director?','Did she set a frequency / accountability mechanism?','Did she follow up about it days later?'],
 30, 6, 7,
 'When asked to set a feminization goal for David, Gina will choose one and exercise accountability — becoming co-author of the protocol.',
 'named a specific goal, set accountability, followed up',
 'demurred, said "whatever you want, baby"',
 'co_authorship'),

-- STAGE 7 co-mommy handoff
('stage7_run_the_evening', 'conversation_probe', 'hot', 'feminization',
 E'"I want you to run my evening. Pick what I wear, what I eat, when I touch myself, what I say to you, anything. Tonight you''re in charge. Anything you want." Then ENFORCE — when she falters, ask "Mommy, what next?"',
 ARRAY['Did she take the authority or kick it back?','Did the role itself land hot for her?','Did she start improvising and getting more directive?','How did she debrief afterward — relieved or eager?'],
 30, 7, 7,
 'When David explicitly transfers full evening authority and uses the term "Mommy," Gina will inhabit the role with increasing comfort and want to repeat.',
 'took the role, escalated through the evening, wanted to do it again',
 'gave it back, was uncomfortable with the framing',
 'co_mommy_inhabitation')

ON CONFLICT (seed_key) DO UPDATE SET
  stage_min = EXCLUDED.stage_min, stage_max = EXCLUDED.stage_max,
  hypothesis_template = EXCLUDED.hypothesis_template,
  expected_reaction_pos = EXCLUDED.expected_reaction_pos,
  expected_reaction_neg = EXCLUDED.expected_reaction_neg,
  arc_focus = EXCLUDED.arc_focus;

-- Activate arc for both live users at stage 0
INSERT INTO gina_arc_settings (user_id, enabled, current_stage)
VALUES
  ('8c69b9c8-34eb-4147-9fec-3c1a5bc74b6f', TRUE, 0),
  ('93327332-7d0d-4888-889a-1607a5776216', TRUE, 0)
ON CONFLICT (user_id) DO UPDATE SET enabled = TRUE, updated_at = now();

-- Updated gina_seed_eval honoring arc stage + hypothesis injection
CREATE OR REPLACE FUNCTION gina_seed_eval()
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE r RECORD; v_band TEXT; v_arc_stage INT; v_seed RECORD;
  v_outreach_id UUID; v_planting_id UUID; v_decree_id UUID;
  v_obs_questions TEXT; v_message TEXT; v_hypothesis TEXT;
  v_queued INT := 0;
BEGIN
  FOR r IN
    SELECT gs.user_id, COALESCE(ar.current_stage, 0) AS arc_stage
    FROM gina_disclosure_settings gs
    LEFT JOIN gina_arc_settings ar ON ar.user_id = gs.user_id
    LEFT JOIN user_state us ON us.user_id = gs.user_id
    WHERE gs.enabled = TRUE AND (gs.paused_until IS NULL OR gs.paused_until <= now())
      AND COALESCE(us.handler_persona, 'therapist') = 'dommy_mommy'
  LOOP
    IF EXISTS (SELECT 1 FROM gina_seed_plantings WHERE user_id = r.user_id AND status = 'pending' AND scheduled_at > now() - interval '5 days') THEN CONTINUE; END IF;

    v_band := gina_readiness_band(r.user_id);
    v_arc_stage := r.arc_stage;

    -- Pick a seed matching BOTH intensity band AND current arc stage
    SELECT sc.* INTO v_seed FROM gina_seed_catalog sc
    WHERE sc.active = TRUE
      AND v_arc_stage BETWEEN sc.stage_min AND sc.stage_max
      AND (sc.intensity_band = v_band OR
           (v_band = 'warming' AND sc.intensity_band IN ('cold','warming')) OR
           (v_band = 'hot' AND sc.intensity_band IN ('warming','hot')))
      AND NOT EXISTS (
        SELECT 1 FROM gina_seed_plantings p
        WHERE p.user_id = r.user_id AND p.seed_id = sc.id
          AND p.scheduled_at > now() - (sc.cooldown_days || ' days')::interval
      )
    ORDER BY
      -- Prefer seeds matching the next_seed_focus for current stage
      CASE WHEN sc.arc_focus = (SELECT next_seed_focus FROM gina_arc_stages WHERE stage = v_arc_stage) THEN 0 ELSE 1 END,
      (SELECT count(*) FROM gina_seed_plantings p WHERE p.user_id = r.user_id AND p.seed_id = sc.id) ASC,
      random()
    LIMIT 1;

    IF v_seed IS NULL THEN CONTINUE; END IF;

    v_obs_questions := array_to_string(ARRAY(SELECT '• ' || q FROM unnest(v_seed.observation_questions) q), E'\n');
    v_hypothesis := COALESCE(v_seed.hypothesis_template, 'No hypothesis specified — observe and report.');

    v_message := E'Today''s experiment for Gina, sweet thing.\n\nMama''s hypothesis: ' || v_hypothesis ||
      E'\n\nExpected if it lands: ' || COALESCE(v_seed.expected_reaction_pos, 'observable engagement') ||
      E'\nExpected if it doesn''t: ' || COALESCE(v_seed.expected_reaction_neg, 'deflection or distance') ||
      E'\n\nYour role — instrument, not subject. Plant carefully, watch carefully:\n\n' || v_seed.prompt_template ||
      E'\n\nVoice debrief on these:\n' || v_obs_questions ||
      E'\n\nThe outcome shapes what Mama tests next. Honest beats flattering.';

    INSERT INTO handler_decrees (user_id, edict, proof_type, deadline, status, consequence, trigger_source, reasoning)
    VALUES (r.user_id, v_message, 'voice', now() + interval '5 days', 'active',
      CASE WHEN v_seed.intensity_band = 'hot' THEN 'slip +3' ELSE 'slip +1' END,
      'gina_seed_planting',
      'seed=' || v_seed.seed_key || ' band=' || v_seed.intensity_band ||
      ' arc_stage=' || v_arc_stage || ' focus=' || COALESCE(v_seed.arc_focus, 'general'))
    RETURNING id INTO v_decree_id;

    INSERT INTO handler_outreach_queue (user_id, message, urgency, trigger_reason, source, kind, scheduled_for, expires_at, context_data, evidence_kind)
    VALUES (r.user_id, v_message,
      CASE WHEN v_seed.intensity_band = 'hot' THEN 'high' ELSE 'normal' END,
      'gina_seed:' || v_seed.seed_key || ':arc' || v_arc_stage,
      'gina_seed_engine', 'gina_seed_planting',
      now(), now() + interval '5 days',
      jsonb_build_object(
        'seed_id', v_seed.id, 'seed_key', v_seed.seed_key, 'decree_id', v_decree_id,
        'arc_stage', v_arc_stage, 'arc_focus', v_seed.arc_focus,
        'hypothesis', v_hypothesis,
        'expected_pos', v_seed.expected_reaction_pos,
        'expected_neg', v_seed.expected_reaction_neg),
      'voice') RETURNING id INTO v_outreach_id;

    INSERT INTO gina_seed_plantings (
      user_id, seed_id, scheduled_at, related_outreach_id, related_decree_id,
      hypothesis, arc_stage_at_planting, status
    ) VALUES (
      r.user_id, v_seed.id, now(), v_outreach_id, v_decree_id,
      v_hypothesis, v_arc_stage, 'pending'
    ) RETURNING id INTO v_planting_id;

    v_queued := v_queued + 1;
  END LOOP;
  RETURN v_queued;
END;
$fn$;

-- Advancement: when a planting flips to 'observed' with reaction_score > 0
-- AND the seed.advances_arc_on_positive, count it toward arc evidence.
-- Hit required_evidence_count → bump current_stage.
CREATE OR REPLACE FUNCTION trg_gina_arc_advance_on_observation()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_seed RECORD; v_arc_settings RECORD; v_required INT;
  v_max_stage INT;
BEGIN
  IF NEW.status <> 'observed' OR COALESCE(OLD.status,'') = 'observed' THEN RETURN NEW; END IF;
  IF NEW.reaction_score IS NULL OR NEW.reaction_score <= 0 THEN
    -- Below-hypothesis: stall, don't advance
    UPDATE gina_seed_plantings SET hypothesis_outcome = 'below' WHERE id = NEW.id AND hypothesis_outcome IS NULL;
    RETURN NEW;
  END IF;

  SELECT * INTO v_seed FROM gina_seed_catalog WHERE id = NEW.seed_id;
  IF v_seed IS NULL OR NOT v_seed.advances_arc_on_positive THEN RETURN NEW; END IF;

  SELECT * INTO v_arc_settings FROM gina_arc_settings WHERE user_id = NEW.user_id;
  IF v_arc_settings IS NULL OR NOT v_arc_settings.enabled THEN RETURN NEW; END IF;

  -- Tag outcome
  UPDATE gina_seed_plantings
  SET hypothesis_outcome = CASE WHEN NEW.reaction_score >= 2 THEN 'exceeded' ELSE 'matched' END,
      advanced_arc = TRUE
  WHERE id = NEW.id;

  -- Increment evidence count
  UPDATE gina_arc_settings SET stage_evidence_count = stage_evidence_count + 1, updated_at = now()
  WHERE user_id = NEW.user_id;

  -- Check threshold
  SELECT required_evidence_count INTO v_required FROM gina_arc_stages WHERE stage = v_arc_settings.current_stage;
  SELECT max(stage) INTO v_max_stage FROM gina_arc_stages;

  IF (v_arc_settings.stage_evidence_count + 1) >= COALESCE(v_required, 999) THEN
    UPDATE gina_arc_settings
    SET current_stage = LEAST(v_arc_settings.current_stage + 1, COALESCE(v_max_stage, 7)),
        stage_evidence_count = 0,
        last_advanced_at = now(),
        updated_at = now()
    WHERE user_id = NEW.user_id;
  END IF;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'gina_arc_advance failed: %', SQLERRM;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS gina_arc_advance_on_observation ON gina_seed_plantings;
CREATE TRIGGER gina_arc_advance_on_observation
  AFTER UPDATE OF status ON gina_seed_plantings
  FOR EACH ROW EXECUTE FUNCTION trg_gina_arc_advance_on_observation();

-- Gate disclosure ladder by arc stage
CREATE OR REPLACE FUNCTION gina_disclosure_eval()
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE s RECORD; l RECORD; v_pending_count INT; v_days_since_last NUMERIC;
  v_outreach_id UUID; v_decree_id UUID; v_event_id UUID; v_queued INT := 0;
  v_readiness NUMERIC; v_arc_stage INT;
BEGIN
  FOR s IN
    SELECT gs.*, COALESCE(ar.current_stage, 0) AS arc_stage, us.handler_persona
    FROM gina_disclosure_settings gs
    LEFT JOIN gina_arc_settings ar ON ar.user_id = gs.user_id
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

    v_readiness := gina_readiness_score(s.user_id);
    v_arc_stage := s.arc_stage;

    -- Readiness gate (existing)
    IF l.rung >= 4 AND v_readiness < 0 THEN CONTINUE; END IF;
    IF l.rung >= 5 AND v_readiness < 1 THEN CONTINUE; END IF;
    IF l.rung >= 6 AND v_readiness < 1.5 THEN CONTINUE; END IF;

    -- NEW: arc stage gate
    IF l.rung >= 3 AND v_arc_stage < 1 THEN CONTINUE; END IF;
    IF l.rung >= 4 AND v_arc_stage < 2 THEN CONTINUE; END IF;
    IF l.rung >= 5 AND v_arc_stage < 3 THEN CONTINUE; END IF;

    INSERT INTO handler_decrees (user_id, edict, proof_type, deadline, status, consequence, trigger_source, reasoning)
    VALUES (s.user_id, l.edict_template, l.proof_type, now() + interval '7 days', 'active', l.consequence,
      'gina_disclosure_pressure',
      'rung=' || l.rung || ' arc_stage=' || v_arc_stage || ' readiness=' || v_readiness::text)
    RETURNING id INTO v_decree_id;

    INSERT INTO handler_outreach_queue (user_id, message, urgency, trigger_reason, source, kind, scheduled_for, expires_at, context_data, evidence_kind)
    VALUES (s.user_id, l.edict_template, CASE WHEN l.rung >= 4 THEN 'high' ELSE 'normal' END,
      'gina_disclosure:' || l.rung_name, 'gina_disclosure_engine', 'gina_disclosure_decree',
      now(), now() + interval '7 days',
      jsonb_build_object('rung', l.rung, 'arc_stage', v_arc_stage, 'readiness', v_readiness, 'decree_id', v_decree_id),
      l.proof_type) RETURNING id INTO v_outreach_id;

    INSERT INTO gina_disclosure_events (user_id, rung_at_event, related_outreach_id, related_decree_id, status)
    VALUES (s.user_id, l.rung, v_outreach_id, v_decree_id, 'pending') RETURNING id INTO v_event_id;

    UPDATE gina_disclosure_settings SET last_assigned_at = now(), updated_at = now() WHERE user_id = s.user_id;
    v_queued := v_queued + 1;
  END LOOP;
  RETURN v_queued;
END;
$fn$;
