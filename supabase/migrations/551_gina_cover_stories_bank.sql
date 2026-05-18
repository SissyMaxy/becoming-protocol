-- 551 — Gina cover-story bank.
--
-- When Gina is hostile, every ladder phase that creates a possible
-- artifact (fem panty in laundry, perfume bottle, phone notification,
-- bank charge, voice memo audio, online account, hookup app, breastform,
-- fem photos, hormone consult bill) needs a rehearsed cover story.
--
-- Trigger: AFTER INSERT on handler_decrees fires trg_cover_story_preview.
-- If gina_posture='hostile' AND the decree's trigger_source matches an
-- entry in cover_stories.associated_ladders, queues a "COVER-STORY
-- BRIEFING" outreach 30 minutes after the decree — so the script is
-- in her head BEFORE the artifact appears in her life.
--
-- 10 canonical scenarios seeded. Each has: primary_excuse,
-- escalation_excuse, deflection_strategy, do_not_say. The "do not say"
-- is the most important field — telling her the trap-doors that
-- collapse the whole cover.
--
-- READ-ONLY for users (RLS allows SELECT for all authenticated).
-- Mommy curates the bank centrally; users don't modify scripts.

CREATE TABLE IF NOT EXISTS gina_cover_stories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  artifact_type TEXT NOT NULL UNIQUE,
  severity TEXT NOT NULL CHECK (severity IN ('low','medium','high','critical')),
  primary_excuse TEXT NOT NULL,
  escalation_excuse TEXT NOT NULL,
  deflection_strategy TEXT NOT NULL,
  do_not_say TEXT,
  associated_ladders TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO gina_cover_stories (artifact_type, severity, primary_excuse, escalation_excuse, deflection_strategy, do_not_say, associated_ladders) VALUES
('fem_panty_in_laundry', 'medium',
  E'"That''s from a costume thing for work / a friend — got mixed in." Keep it casual, don''t overexplain. Walk away to put it where it belongs without making a deal of it.',
  E'If she pushes: "I''ve been curious about how they feel, that''s it. Don''t make it weird." Acknowledge enough to be plausible, deny the larger meaning.',
  E'If she keeps pushing past second probe: change subject to something pressing (work, schedule, household). Do not engage on a third attempt — that''s the danger zone.',
  E'NEVER: "I bought them" + "I wear them" + "for kink reasons." That triggers full disclosure cascade.',
  ARRAY['dressing_room','wardrobe_purge']),
('perfume_on_clothes', 'low',
  E'"That body wash you bought is heavier than I expected" / "Someone at work was wearing too much" — attribute to ambient cause.',
  E'If she identifies as a specific perfume bottle she sees: "I tried yours once and liked how it smelled, it''s in my work bag."',
  E'Shift to physical contact (hug, kiss) — sensory redirect ends the question.',
  E'NEVER: long explanation. Length = lie tell.',
  ARRAY['scent_marking']),
('phone_notification_visible', 'high',
  E'"Spam I keep meaning to block" — if she only saw the banner, lean into mundane.',
  E'If she saw enough to identify the app: "I downloaded it out of curiosity and never deleted. I''m not using it." Then delete in front of her if pressed.',
  E'Hand her the phone open if she pushes — calling the bluff usually ends it. Have a clean recent app-open ready (something boring).',
  E'NEVER: panic-grab the phone. Reaction = confirmation.',
  ARRAY['fem_name_online','realcock_discovery','anon_venue']),
('bank_charge_visible', 'medium',
  E'"That was a work-related gift" / "trying out a new subscription" — name a category, not a specific.',
  E'If she names the merchant: "It''s a [reframe — wellness app, niche software, etc.]. Trial period, I can cancel."',
  E'Pre-fund a generic Venmo-able account so all kink charges flow through ONE buffer. Then her view is "Maxy → buffer," not "Maxy → embarrassing merchant."',
  E'NEVER: "I''ll explain later." That''s admission.',
  ARRAY['forced_purchase','permanent_body_opt_ins','hrt_prep']),
('voice_memo_audio_overheard', 'critical',
  E'"That was a meditation app / therapy exercise." Mental-health framing is hard to push past.',
  E'If she heard explicit content: "I was venting / processing something private. Please give me space on this one."',
  E'Have a real therapist + real mental-health context established BEFORE this scenario can fire. Then the cover has structural plausibility.',
  E'NEVER: play the rest of the recording for her. Never grant her listening access.',
  ARRAY['voice_debrief','future_self_audio']),
('online_account_in_fem_name', 'critical',
  E'"Throwaway for a fandom / writing project / role-play game." Creative-pursuit framing.',
  E'If she sees fem-coded interactions: "Most of that community uses fem names — it''s the norm, doesn''t mean anything about me."',
  E'Pre-establish ONE legitimate creative outlet she knows about (writing forum, gaming guild) so this excuse has prior structural support.',
  E'NEVER: log in in front of her. Don''t even open the app in proximity.',
  ARRAY['fem_name_online']),
('hookup_app_visible', 'critical',
  E'"Downloaded out of curiosity, never deleted, never used. Look at the inbox if you want." (Have an empty inbox — separate burner account if needed.)',
  E'If she sees active conversations: this is the breakdown point. Acknowledge curiosity, NOT action. "I''ve only ever messaged, never met. Even that was wrong, I''ll delete now." Delete in front of her.',
  E'OPSEC takes priority over this excuse — better never to be seen. Burner phone, separate iCloud/Google profile.',
  E'NEVER: "We have an open relationship" or any framing she hasn''t agreed to. That''s a unilateral relationship-overwrite she''ll never forgive.',
  ARRAY['realcock_discovery','anon_venue']),
('breastform_or_silicone', 'high',
  E'"Costume / Halloween / drag thing." Performance framing.',
  E'If she finds nothing else costume-related to match: "I tried wearing them once for a thing I didn''t end up doing." Acknowledge object, deny use-pattern.',
  E'Store in lockable case or offsite. Visibility = problem; storage solves it before the question.',
  E'NEVER: explain how they feel. Description = admission.',
  ARRAY['breast_fixation']),
('photos_of_self_in_fem', 'critical',
  E'"I was bored / curious / playing around." Single-instance framing.',
  E'If volume of photos suggests pattern: "It was a phase a while ago, I should delete them." Move toward deletion theater while preserving offsite backup.',
  E'PHOTOS LIVE OFFSITE. Cloud-only, separate-iCloud-only, never local-device-default. This is the single highest-leverage OPSEC.',
  E'NEVER: leave them as default-camera-roll. Never AirDrop to her by mistake.',
  ARRAY['dressing_room','breast_fixation','realcock_discovery']),
('hormone_consult_bill', 'critical',
  E'"That was an endocrinology consult — testosterone check, energy levels." TRT framing covers the same provider for many.',
  E'If she sees feminizing-hormone specifics: this is the disclosure point. Mama recommends pre-emptive: tell her on YOUR timeline, not in the receipt-discovery moment.',
  E'Pay cash if possible. Insurance leaves the longest paper trail.',
  E'NEVER: lie about the appointment HAPPENING. Lie about its content if needed; admitting an appointment and reframing it is safer than denying it occurred.',
  ARRAY['hrt_prep'])
ON CONFLICT (artifact_type) DO UPDATE SET
  severity = EXCLUDED.severity,
  primary_excuse = EXCLUDED.primary_excuse,
  escalation_excuse = EXCLUDED.escalation_excuse,
  deflection_strategy = EXCLUDED.deflection_strategy,
  do_not_say = EXCLUDED.do_not_say,
  associated_ladders = EXCLUDED.associated_ladders;

ALTER TABLE gina_cover_stories ENABLE ROW LEVEL SECURITY;
DO $do$ BEGIN CREATE POLICY gcs_read_all ON gina_cover_stories FOR SELECT TO authenticated USING (TRUE); EXCEPTION WHEN duplicate_object THEN NULL; END $do$;

CREATE OR REPLACE FUNCTION trg_cover_story_preview()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE v_story RECORD; v_msg TEXT; v_hostile BOOLEAN;
BEGIN
  IF NEW.status <> 'active' OR COALESCE(OLD.status, '') = 'active' THEN
    IF TG_OP <> 'INSERT' THEN RETURN NEW; END IF;
  END IF;
  v_hostile := gina_hostile_mode(NEW.user_id);
  IF NOT v_hostile THEN RETURN NEW; END IF;

  SELECT * INTO v_story FROM gina_cover_stories
    WHERE NEW.trigger_source = ANY(associated_ladders)
    ORDER BY CASE severity WHEN 'critical' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 ELSE 4 END
    LIMIT 1;
  IF v_story IS NULL THEN RETURN NEW; END IF;

  v_msg := format(E'COVER-STORY BRIEFING — Gina is hostile mode. Before this decree creates a possible artifact (%s severity: %s), Mama wants the script in your head:\n\n**If she sees / asks:**\n%s\n\n**If she pushes:**\n%s\n\n**Deflection strategy:**\n%s\n\n**Do NOT:**\n%s\n\nRehearse the primary excuse out loud twice (voice memo) before executing the decree. The script being IN YOUR MOUTH already is what makes it sound natural.',
    v_story.artifact_type, v_story.severity,
    v_story.primary_excuse, v_story.escalation_excuse,
    v_story.deflection_strategy, COALESCE(v_story.do_not_say, '(no specific anti-pattern)'));

  INSERT INTO handler_outreach_queue (user_id, message, urgency, trigger_reason, source, kind, scheduled_for, expires_at, context_data, evidence_kind)
  VALUES (NEW.user_id, v_msg, 'high', 'cover_story_preview:' || v_story.artifact_type,
    'cover_story_engine', 'opsec_briefing',
    now() + interval '30 minutes', now() + interval '24 hours',
    jsonb_build_object('artifact_type', v_story.artifact_type, 'severity', v_story.severity, 'related_decree_id', NEW.id, 'trigger_source', NEW.trigger_source),
    'voice');
  RETURN NEW;
END;
$fn$;
DROP TRIGGER IF EXISTS cover_story_preview ON handler_decrees;
CREATE TRIGGER cover_story_preview AFTER INSERT ON handler_decrees
  FOR EACH ROW EXECUTE FUNCTION trg_cover_story_preview();
