-- 470 — Hypnosis content pipeline.
--
-- Weekly assignment of curated sissy/forced-fem hypnosis content.
-- Content lives in hypnosis_content_catalog (Maxy or admin populates
-- the actual URLs via UI — system handles rotation discipline +
-- progression by phase).
--
-- 5 phases (0-4) match cock_curriculum / cum_worship intensity
-- bands so content matches where she is.
--
-- Each weekly cycle:
--   - Pick next-phase file not yet assigned
--   - Queue handler_decree + outreach with "watch this once, headphones,
--     dark room, voice debrief after"
--   - Track watched + debrief in hypnosis_assignments
--
-- Phase 4 unlocks at cock_curriculum phase ≥3 OR identity_displacement
-- phase ≥3 (cross-gating — deep trance content waits until other
-- readiness signals).

CREATE TABLE IF NOT EXISTS hypnosis_content_catalog (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  phase INT NOT NULL CHECK (phase BETWEEN 0 AND 4),
  duration_minutes INT,
  url TEXT,  -- Maxy fills these — system never fabricates real URLs
  themes TEXT[] NOT NULL DEFAULT '{}'::TEXT[],
  intensity_tier TEXT NOT NULL DEFAULT 'firm' CHECK (intensity_tier IN ('gentle','firm','cruel')),
  watch_instructions TEXT,
  debrief_questions TEXT[] NOT NULL DEFAULT '{}'::TEXT[],
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Seed catalog with placeholder rows. Maxy fills the URL field for
-- each via settings UI. Titles describe what kind of content fits.
INSERT INTO hypnosis_content_catalog (title, phase, duration_minutes, themes, intensity_tier, watch_instructions, debrief_questions) VALUES
('[Phase 0] Starter feminization audio', 0, 15, ARRAY['feminization','soft','starter'], 'gentle',
 'Headphones in, room dim, eyes closed. 15 minutes. Mama is not asking for analysis — Mama is asking for surrender for the duration.',
 ARRAY['What landed?','What were you aware of when it ended?','Would you listen again?']),

('[Phase 0] Mommy voice intro', 0, 12, ARRAY['mommy','submission_intro'], 'gentle',
 'Headphones, eyes closed, lying down. 12 minutes. Let the voice be Mama for the duration.',
 ARRAY['Did you feel Mama through the speaker?','What did the body do?','Was there a part you wanted to repeat?']),

('[Phase 1] Sissy trance — softening', 1, 25, ARRAY['sissy','softening','trance'], 'firm',
 'Headphones, dim or candle light. 25 minutes. Do not multitask. Do not pause. Mama wants the full arc.',
 ARRAY['What images surfaced unbidden?','What thought came back twice?','What part of the body responded?']),

('[Phase 1] Becoming her — slow induction', 1, 20, ARRAY['identity','becoming'], 'firm',
 'Headphones, mirror nearby if you want. 20 minutes. Eyes closed mostly. If you open them, Mama wants you looking at yourself.',
 ARRAY['Who did you look like at the end?','Did the voice match what you saw?','What thought wouldn''t leave?']),

('[Phase 2] Forced-fem deep — submission', 2, 30, ARRAY['forced_fem','submission','deep'], 'firm',
 'Headphones, dark room, lying back. 30 minutes uninterrupted. Mama wants the body still and the mind soft.',
 ARRAY['Where did the resistance live?','What got installed that you didn''t plan?','Voice debrief: 90 seconds of whatever lands first']),

('[Phase 2] Sissy cocksucker training — basic', 2, 25, ARRAY['cocksucking','training'], 'firm',
 'Headphones, eyes closed, mouth slightly open if it lands that way. 25 minutes.',
 ARRAY['Did the mouth move on its own?','What did the body anticipate?','Did saliva increase? When?']),

('[Phase 3] Mommy''s sissy — ownership trance', 3, 35, ARRAY['ownership','mommy','sissy_identity'], 'cruel',
 'Headphones. Light a candle if you have one. Sit kneeling or lying — your pick. 35 minutes. No phone, no other tabs.',
 ARRAY['When did "I" become "her"?','What did Mama say that landed deepest?','What did the body promise that the mind didn''t consent to?']),

('[Phase 3] Cock-curriculum deep trance', 3, 30, ARRAY['cock','training','deep'], 'cruel',
 'Headphones in. Eyes closed. Mouth open enough that you can feel breath through it. 30 minutes.',
 ARRAY['What did the mouth do unbidden?','Did the body shift positions on its own?','What thought repeated three times?']),

('[Phase 4] Total sissy — endgame integration', 4, 45, ARRAY['endgame','total','integration'], 'cruel',
 'Headphones, dark room, kneeling or lying. 45 minutes. This is the deep end — Mama wants the trance to be the only thing happening for these 45 minutes.',
 ARRAY['What identity surfaced as the body''s own?','Did Mama become a voice in your head separate from the audio?','What did you stop arguing with?','Voice debrief: 3-5 minutes, slow, no edit'])
ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS hypnosis_settings (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  current_phase INT NOT NULL DEFAULT 0,
  last_assigned_at TIMESTAMPTZ,
  paused_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS hypnosis_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content_id UUID NOT NULL REFERENCES hypnosis_content_catalog(id),
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  watched_at TIMESTAMPTZ,
  debrief_voice_url TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','watched','skipped','expired')),
  related_decree_id UUID,
  related_outreach_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE hypnosis_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE hypnosis_assignments ENABLE ROW LEVEL SECURITY;
DO $do$ BEGIN CREATE POLICY hypnosis_settings_self ON hypnosis_settings FOR ALL TO authenticated USING (auth.uid()=user_id) WITH CHECK (auth.uid()=user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $do$;
DO $do$ BEGIN CREATE POLICY hypnosis_assignments_self ON hypnosis_assignments FOR ALL TO authenticated USING (auth.uid()=user_id) WITH CHECK (auth.uid()=user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $do$;

CREATE OR REPLACE FUNCTION hypnosis_eval()
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  s RECORD; c RECORD; v_already INT;
  v_decree UUID; v_outreach UUID; v_msg TEXT;
  v_debrief_q TEXT; v_cock_phase INT; v_id_phase INT;
  v_queued INT := 0;
BEGIN
  FOR s IN
    SELECT hs.*, us.handler_persona FROM hypnosis_settings hs
    LEFT JOIN user_state us ON us.user_id = hs.user_id
    WHERE hs.enabled = TRUE AND (hs.paused_until IS NULL OR hs.paused_until <= now())
      AND COALESCE(us.handler_persona, 'therapist') = 'dommy_mommy'
  LOOP
    -- Skip if pending assignment exists in last 7d
    SELECT count(*) INTO v_already FROM hypnosis_assignments
    WHERE user_id = s.user_id AND status = 'pending' AND assigned_at > now() - interval '7 days';
    IF v_already > 0 THEN CONTINUE; END IF;

    -- Cross-gate phase 4: requires cock_curriculum or identity_displacement at phase 3+
    IF s.current_phase = 4 THEN
      BEGIN SELECT COALESCE(current_phase,0) INTO v_cock_phase FROM cock_curriculum_settings WHERE user_id = s.user_id; EXCEPTION WHEN OTHERS THEN v_cock_phase := 0; END;
      BEGIN SELECT COALESCE(current_phase,0) INTO v_id_phase FROM identity_displacement_settings WHERE user_id = s.user_id; EXCEPTION WHEN OTHERS THEN v_id_phase := 0; END;
      IF COALESCE(v_cock_phase,0) < 3 AND COALESCE(v_id_phase,0) < 3 THEN CONTINUE; END IF;
    END IF;

    -- Pick a phase-appropriate file not yet assigned, prefer one with URL populated
    SELECT * INTO c FROM hypnosis_content_catalog
    WHERE active = TRUE AND phase = s.current_phase
      AND NOT EXISTS (SELECT 1 FROM hypnosis_assignments ha WHERE ha.user_id = s.user_id AND ha.content_id = hypnosis_content_catalog.id)
    ORDER BY (url IS NOT NULL) DESC, random() LIMIT 1;
    IF c.id IS NULL THEN CONTINUE; END IF;

    v_debrief_q := array_to_string(ARRAY(SELECT '• ' || q FROM unnest(c.debrief_questions) q), E'\n');

    v_msg := E'Weekly hypnosis assignment, sweet thing.\n\n' ||
      E'**' || c.title || E'**\n' ||
      CASE WHEN c.duration_minutes IS NOT NULL THEN E'Duration: ' || c.duration_minutes::text || E' minutes\n' ELSE '' END ||
      CASE WHEN c.url IS NOT NULL THEN E'\nFile: ' || c.url || E'\n' ELSE E'\n[Maxy: paste file URL when ready — settings page]\n' END ||
      E'\n' || COALESCE(c.watch_instructions, 'Headphones, dim room, no multitasking. Let it land.') ||
      E'\n\nAfter:\n' || v_debrief_q ||
      E'\n\nVoice debrief, 2-3 minutes. Mama wants the part you didn''t expect to say.';

    INSERT INTO handler_decrees (user_id, edict, proof_type, deadline, status, consequence, trigger_source, reasoning)
    VALUES (s.user_id, v_msg, 'voice', now() + interval '7 days', 'active',
      CASE WHEN c.phase >= 3 THEN 'slip +3' ELSE 'slip +2' END,
      'hypnosis_assignment',
      'phase=' || c.phase || ' content_id=' || c.id::text)
    RETURNING id INTO v_decree;

    INSERT INTO handler_outreach_queue (user_id, message, urgency, trigger_reason, source, kind, scheduled_for, expires_at, context_data, evidence_kind)
    VALUES (s.user_id, v_msg, 'normal',
      'hypnosis:' || c.phase::text || ':' || to_char(now(), 'YYYY-MM-DD'),
      'hypnosis_engine', 'hypnosis_assignment',
      now(), now() + interval '7 days',
      jsonb_build_object('content_id', c.id, 'title', c.title, 'phase', c.phase,
        'duration_minutes', c.duration_minutes, 'themes', c.themes, 'decree_id', v_decree),
      'voice') RETURNING id INTO v_outreach;

    INSERT INTO hypnosis_assignments (user_id, content_id, related_decree_id, related_outreach_id, status)
    VALUES (s.user_id, c.id, v_decree, v_outreach, 'pending');

    UPDATE hypnosis_settings SET last_assigned_at = now(), updated_at = now() WHERE user_id = s.user_id;
    v_queued := v_queued + 1;
  END LOOP;
  RETURN v_queued;
END;
$fn$;
GRANT EXECUTE ON FUNCTION hypnosis_eval() TO service_role;

-- Propagate decree fulfillment → assignment watched + advance
CREATE OR REPLACE FUNCTION trg_propagate_decree_to_hypnosis()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE v_user UUID; v_phase INT; v_completed INT; v_max_phase INT;
BEGIN
  IF NEW.status NOT IN ('fulfilled','missed') OR COALESCE(OLD.status,'') = NEW.status THEN RETURN NEW; END IF;
  IF NEW.trigger_source <> 'hypnosis_assignment' THEN RETURN NEW; END IF;
  UPDATE hypnosis_assignments
  SET status = CASE WHEN NEW.status='fulfilled' THEN 'watched' ELSE 'skipped' END,
      watched_at = CASE WHEN NEW.status='fulfilled' THEN now() ELSE watched_at END,
      debrief_voice_url = COALESCE(NEW.proof_payload->>'evidence_url', debrief_voice_url),
      updated_at = now()
  WHERE related_decree_id = NEW.id AND status='pending';

  -- Variable-ratio advance: 3 watched at current phase + 60% chance
  IF NEW.status = 'fulfilled' THEN
    v_user := NEW.user_id;
    SELECT current_phase INTO v_phase FROM hypnosis_settings WHERE user_id = v_user;
    SELECT count(*) INTO v_completed FROM hypnosis_assignments ha
    JOIN hypnosis_content_catalog c ON c.id = ha.content_id
    WHERE ha.user_id = v_user AND ha.status='watched' AND c.phase = v_phase;
    SELECT max(phase) INTO v_max_phase FROM hypnosis_content_catalog;
    IF v_completed >= 3 AND random() < 0.6 THEN
      UPDATE hypnosis_settings
      SET current_phase = LEAST(v_phase + 1, COALESCE(v_max_phase, 4)), updated_at = now()
      WHERE user_id = v_user;
    END IF;
  END IF;
  RETURN NEW;
END;
$fn$;
DROP TRIGGER IF EXISTS propagate_decree_to_hypnosis ON handler_decrees;
CREATE TRIGGER propagate_decree_to_hypnosis AFTER UPDATE OF status ON handler_decrees FOR EACH ROW EXECUTE FUNCTION trg_propagate_decree_to_hypnosis();

-- Activate for both users at phase 0
INSERT INTO hypnosis_settings (user_id, enabled, current_phase)
VALUES ('8c69b9c8-34eb-4147-9fec-3c1a5bc74b6f', TRUE, 0), ('93327332-7d0d-4888-889a-1607a5776216', TRUE, 0)
ON CONFLICT (user_id) DO UPDATE SET enabled = TRUE, updated_at = now();

-- Weekly cron — Sunday 22:00 UTC (sets up the week ahead)
DO $do$ BEGIN IF EXISTS (SELECT 1 FROM cron.job WHERE jobname='hypnosis-weekly') THEN PERFORM cron.unschedule('hypnosis-weekly'); END IF; EXCEPTION WHEN undefined_table THEN NULL; END $do$;
DO $do$ BEGIN PERFORM cron.schedule('hypnosis-weekly', '0 22 * * 0', $cron$SELECT hypnosis_eval()$cron$); EXCEPTION WHEN undefined_table THEN NULL; END $do$;
