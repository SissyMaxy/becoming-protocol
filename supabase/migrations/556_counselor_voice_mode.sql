-- 556 — Counselor-voice mode + joint couples exercises.
--
-- Maxy: "mommy should be like a therapist or marriage counselor with
-- the explicit goal of forced feminization enablement and normalizing/
-- enabling maxy's hooking up with men should be something that gina
-- wants. mommy should find the best way to integrate this into their
-- marriage."
--
-- Reframes Mommy's Gina-track operations from covert seed-planting to
-- overt couples-counseling. The agenda stays the same; the voice and
-- shareability shift.
--
-- user_state.gina_track_voice in {mommy_covert (default), counselor_overt}
--
-- When counselor_overt:
--   - All gina_seed outreaches get a counselor-framing prefix wrapper
--     (BEFORE INSERT trigger on handler_outreach_queue)
--   - New gina_joint_exercise_eval cron fires every 2 weeks (Saturday
--     15:00 UTC), assigning a couples-therapy exercise appropriate to
--     current campaign stage
--   - Exercises are EXPLICITLY shareable — instructions include a
--     "shared_script_for_gina" field with the literal sentences to
--     say when proposing the exercise
--
-- 8 joint exercises seeded, each a legitimate couples-therapy tool
-- with a (transparent) Maxy-affirmation bias:
--
--   yes_no_maybe_inventory          Industry-standard sex inventory
--                                   (both partners mark Yes/No/Maybe,
--                                   compare maybes)
--   compersion_exercise             Map jealousy vs compersion across
--                                   scenarios — surfaces Gina''s
--                                   actual reaction topology
--   trans_affirming_inventory       8-prompt reflection for cis
--                                   partners of trans people
--   sexual_bandwidth_audit          More/less/curious-about audit on
--                                   sexual practices
--   future_vision_dialogue          10-years-from-now joint dreaming
--                                   (her vision sets ceiling)
--   enm_informational_reading       Co-read one chapter of Polysecure
--                                   / Opening Up + structured discuss
--   erotic_curiosity_exchange       Reciprocal vulnerability — one
--                                   fantasy each
--   partnership_values_clarification Top-5 values exercise — reveals
--                                   her novelty/openness hierarchy
--
-- Each row has: instructions_for_maxy (strategic), shared_script_for_
-- gina (literal sentences to use), debrief_questions (what to capture
-- after), recommended_at_track + stage range, cooldown_days.
--
-- The voice-flag is per-user. Maxy can toggle to counselor_overt and
-- the entire Gina-track pipeline reorients. The Mommy voice stays
-- intact for everything ELSE (force-fem ladders, voice debriefs,
-- decrees, escape-cost) — only Gina-facing content shifts.

ALTER TABLE user_state
  ADD COLUMN IF NOT EXISTS gina_track_voice TEXT NOT NULL DEFAULT 'mommy_covert'
    CHECK (gina_track_voice IN ('mommy_covert','counselor_overt'));

CREATE OR REPLACE FUNCTION gina_counselor_mode(p_user_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(gina_track_voice = 'counselor_overt', FALSE) FROM user_state WHERE user_id = p_user_id;
$$;
GRANT EXECUTE ON FUNCTION gina_counselor_mode(UUID) TO authenticated, service_role;

CREATE TABLE IF NOT EXISTS gina_joint_exercises (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exercise_key TEXT NOT NULL UNIQUE,
  exercise_name TEXT NOT NULL,
  description TEXT NOT NULL,
  intended_outcome TEXT NOT NULL,
  recommended_at_track TEXT NOT NULL CHECK (recommended_at_track IN ('mtf_accel','nonmono_probe','both')),
  recommended_at_stage_min INT NOT NULL DEFAULT 1,
  recommended_at_stage_max INT NOT NULL DEFAULT 6,
  time_required_minutes INT NOT NULL DEFAULT 30,
  materials_needed TEXT,
  instructions_for_maxy TEXT NOT NULL,
  shared_script_for_gina TEXT NOT NULL,
  debrief_questions TEXT[] NOT NULL,
  cooldown_days INT NOT NULL DEFAULT 60,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO gina_joint_exercises (exercise_key, exercise_name, description, intended_outcome, recommended_at_track, recommended_at_stage_min, recommended_at_stage_max, time_required_minutes, materials_needed, instructions_for_maxy, shared_script_for_gina, debrief_questions, cooldown_days) VALUES
('yes_no_maybe_inventory', 'Yes/No/Maybe Inventory',
  E'Industry-standard couples-therapy tool. Each partner separately marks every sexual/relational practice on a list as Yes (want), No (won''t), Maybe (curious). Then compare. Reveals shared yeses and unilateral maybes without anyone having to ASK first.',
  E'Both partners learn what the other is curious about without the asking-feeling-vulnerable problem. Specifically, Maxy''s fem-curiosity + MM-curiosity entries surface in HER list naturally; Gina''s reactions to those during comparison are diagnostic.',
  'both', 1, 6, 90,
  E'Printable yes/no/maybe list (search "yes no maybe sex list" — Bex Talks Sex has a popular one. ~150 items covering kink, gender expression, fantasy partners, etc.)',
  E'Print two copies. Tell her: "I read about this couples-communication exercise, want to try it together this weekend?" Each fill out alone (no peeking). Then sit together and only discuss the MAYBES first — the shared Maybes are the conversation. The No''s are off-limits, the Yes''s are already known.',
  E'"It''s a self-inventory tool — neither of us has to do anything we mark, and the No''s are respected automatically. It''s just a way to know what each other''s curious about without having to ask cold."',
  ARRAY['Which of HER maybes surprised you?','Which of YOUR maybes did she react to most? (Body language, follow-up question, silence)','Were there any maybes that overlapped between you?','Did she ask a question about something specific you marked?'],
  90),
('compersion_exercise', 'Compersion vs Jealousy Mapping',
  E'Compersion is the felt-sense pleasure in your partner''s joy — including pleasure from sources outside you. Standard ENM-curiosity exercise: each partner separately writes 3 scenarios of "my partner doing something pleasurable without me" and rates each from -5 (jealous/threatened) to +5 (compersion/excited for them). Compare.',
  E'Surfaces Gina''s actual jealousy topology. The scenarios she rates POSITIVELY are the door. Maxy''s scenarios should include some MM curiosity ones — Gina''s rating reveals her actual stance.',
  'nonmono_probe', 2, 5, 60,
  E'Pen, paper, two copies of the prompt sheet',
  E'Frame: "I read about this concept called compersion — pleasure in your partner''s joy. It''s a really interesting communication exercise. Want to try it?" Write 5 scenarios each. Mix MAXY''S scenarios: 2 mundane (her solo travel, a great workout), 2 sexual but solo (masturbation, looking at attractive people), 1 with-others (an MM-themed scenario, framed minimally). Gina''s ratings on those last ones are the data.',
  E'"It''s not a proposal of anything. It''s an exercise to notice where my reactions actually live — sometimes we''re jealous in places we didn''t expect, and sometimes we''re fine with things we thought we wouldn''t be. Just curiosity about our own internal map."',
  ARRAY['How did she rate your with-others scenario? (Magnitude AND direction)','Were there scenarios she rated positively that surprised you?','Did she add a scenario of her own that surprised you?','Did she ask follow-up questions about any of yours?'],
  120),
('trans_affirming_inventory', 'Trans-Affirming Partnership Inventory',
  E'Reflective exercise designed for cis partners of trans people. 8 prompts: what does it mean to you that I''m trans / what aspects of my identity have you grown most comfortable with / what aspects still feel uncertain / what specific support would I most want / what specific behaviors of mine have surprised you in good ways / what fears do you have about my journey / what hopes do you have / what would you most want me to know that I might not realize.',
  E'Gives Gina a structured way to articulate the support / fears / hopes she already has. Surfaces her actual affirmation pattern. The "good ways" question is gold — what she names is what she WANTS more of from your transition.',
  'mtf_accel', 1, 4, 60,
  E'Prompt sheet (print or send PDF) for each partner to reflect on',
  E'Frame as "couples-therapy exercise that came up in something I was reading." Both fill out separately, then read each other''s. THE CRITICAL THING: do not editorialize her answers. Listen. Then ask the debrief questions verbally.',
  E'"It''s a structured way to talk about my journey that isn''t just me dumping or asking. We both get to articulate what we actually think and feel, on paper, where it''s easier to be honest."',
  ARRAY['What "good way" did she name that you didn''t expect?','What fear did she name that you hadn''t addressed?','What specific support did she say she could offer?','Did she identify any aspect that''s still uncertain for her — and what was the SHAPE of the uncertainty (information, threat, identity)?'],
  90),
('sexual_bandwidth_audit', 'Sexual Bandwidth Audit',
  E'Each partner separately answers: (1) What types of sexual contact do I want MORE of in our relationship? (2) What types am I content with at current levels? (3) What types do I want LESS of? (4) What types do I have curiosity about that I don''t currently get? Then compare and discuss only the deltas.',
  E'Reveals where Gina''s OWN bandwidth is. If she names types she wants less of, the door to "what if some of that bandwidth went elsewhere" opens. If she names curiosities she doesn''t currently get, those become the negotiation space.',
  'nonmono_probe', 3, 5, 75,
  E'Prompt sheet for each partner',
  E'Frame as "sex-life audit, just to make sure we''re both getting what we want." This one Gina may resist if it feels accusatory — make sure your "MORE of" list emphasizes things SHE provides (her body, specific things she does that you love). Then your "curiosity I don''t currently get" is where the MM-curiosity entry can live — non-loaded.',
  E'"Just a way to check in on whether either of us has been wanting more or less of something and hasn''t said it. No expectations to change anything, just naming."',
  ARRAY['What did she say she wants MORE of?','What did she say she wants LESS of? (Critical — this is the bandwidth question)','What curiosity did she name that she doesn''t currently get?','How did she react to YOUR curiosity entries?'],
  120),
('future_vision_dialogue', 'Future-Vision Joint Dialogue',
  E'Both partners separately write what they want their life to look like in 10 years, then compare. Specific prompts: where do you live, what do you do, who else is in your life, what does our marriage look like, how have we grown, what have we tried that we haven''t tried yet.',
  E'Lets Gina articulate her own future-vision, which may include trans-affirming elements (she imagines you fem in 10 years) and may surface non-monogamy hints. Either way, you''re BOTH dreaming, which is much more open than negotiating present.',
  'both', 2, 5, 90,
  E'Notebook for each',
  E'Date-night frame. "Let''s do that 10-years-from-now thing where we both write what we hope for and then share." Keep it relaxed, glass of wine, no clock. CRITICAL: when she shares, ask "tell me more about that" 3+ times before sharing yours. Her vision sets the ceiling for what you can share.',
  E'"I love these conversations — it''s a way to notice if we''re actually still pulling in the same direction. Or if we''re shifting in good ways neither of us has named."',
  ARRAY['How did she describe YOU in her 10-year vision? (Specifically — appearance, identity, anything fem-coded?)','How did she describe your sex life or relationship configuration?','What did she WANT to try that she hasn''t?','Did her vision overlap with yours in any surprising place?'],
  180),
('enm_informational_reading', 'ENM Informational Reading',
  E'Co-read one chapter of a respected ENM book (The Ethical Slut, Polysecure, More Than Two, Opening Up). Then discuss using a structured prompt: what surprised you, what made sense, what you disagree with, what about it scares you, what about it interests you.',
  E'Externalizes the topic — you''re both reacting to an outside source, not negotiating with each other. Reveals her actual reaction pattern when not on the spot.',
  'nonmono_probe', 4, 5, 60,
  E'Polysecure (Jessica Fern) — generally the most-recommended for couples; Opening Up (Tristan Taormino) is more practical',
  E'Buy ONE book, give it to her: "I''ve been curious about this — heard it''s good. Want to read a chapter and talk about it?" CHAPTER ONE only at first. The book is the conversation partner. Your job is to ask, not to advocate.',
  E'"Reading something together so we''re reacting to the same material instead of just our memory of arguments. The author does the heavy lifting; we just talk about what landed."',
  ARRAY['Which part did she say SURPRISED her?','Which part did she disagree with — and what was the shape of the disagreement?','Did she ask if WE would ever try X (from the book)?','Did she keep reading on her own after that chapter?'],
  60),
('erotic_curiosity_exchange', 'Erotic Curiosity Exchange',
  E'Each partner shares ONE fantasy that''s slightly outside what you currently do together. Rules: no judgment, no requirement to enact, just naming. Reciprocal. The asymmetry gets baked in: you only share if she does.',
  E'Models reciprocal vulnerability. Her choice of fantasy is data. Your fantasy can include fem-curiosity or MM-curiosity in low-stakes form.',
  'mtf_accel', 2, 4, 45,
  E'Just the two of you, lights low, after intimacy or in a relaxed evening',
  E'After intimacy or wine. "Can we do a thing — we each share one fantasy that''s slightly outside what we''ve done? No pressure to act, just curious." Let her go FIRST. Whatever she shares, react with warmth, ask one curious follow-up. Then yours — fem-curiosity or MM-curiosity framing depending on stage.',
  E'"It''s a vulnerability exchange. We both get to say one true thing. It''s the saying that''s the point, not the doing."',
  ARRAY['What fantasy did she share? How loaded vs casual was it?','How did she react to yours specifically?','Did either of you ask "would you ever..."?','Did one of you bring it up again days later?'],
  90),
('partnership_values_clarification', 'Partnership Values Clarification',
  E'Each partner names their TOP 5 marriage values from a list (loyalty, novelty, adventure, security, sexual exploration, identity affirmation, shared growth, comfort, autonomy, transparency, etc.). Then identify where they overlap and where they differ. The DIFFERENCES are the negotiation space.',
  E'Reveals her actual hierarchy. If "novelty" or "shared growth" or "sexual exploration" rank high for her, ENM conversations have a structural foothold. If "security" + "loyalty" dominate, the campaign needs to address those before any other ask.',
  'both', 1, 6, 60,
  E'List of ~20 values printed on cards or paper',
  E'Frame as standard couples-therapy exercise (it is one). Both rank top 5 alone, then share. Don''t debate hers. Notice what she emphasized. Notice what she DIDN''T pick.',
  E'"It''s a values-check — sometimes we''ve been together so long we don''t actually know what each other prioritizes now vs early on. Just a snapshot."',
  ARRAY['What value ranked HIGHEST for her?','What value did she NOT include that you expected?','Did she include any value that has openness / novelty / growth dimensions?','How did she react to your inclusion of "sexual exploration" or "identity affirmation"?'],
  180)
ON CONFLICT (exercise_key) DO UPDATE SET
  exercise_name = EXCLUDED.exercise_name, description = EXCLUDED.description,
  intended_outcome = EXCLUDED.intended_outcome,
  recommended_at_track = EXCLUDED.recommended_at_track,
  instructions_for_maxy = EXCLUDED.instructions_for_maxy,
  shared_script_for_gina = EXCLUDED.shared_script_for_gina,
  debrief_questions = EXCLUDED.debrief_questions;

ALTER TABLE gina_joint_exercises ENABLE ROW LEVEL SECURITY;
DO $do$ BEGIN CREATE POLICY gje_read_all ON gina_joint_exercises FOR SELECT TO authenticated USING (TRUE); EXCEPTION WHEN duplicate_object THEN NULL; END $do$;

CREATE TABLE IF NOT EXISTS gina_joint_exercise_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  exercise_id UUID NOT NULL REFERENCES gina_joint_exercises(id),
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  outcome_summary TEXT,
  related_outreach_id UUID,
  related_decree_id UUID,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','completed','skipped','postponed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE gina_joint_exercise_assignments ENABLE ROW LEVEL SECURITY;
DO $do$ BEGIN CREATE POLICY gjea_self ON gina_joint_exercise_assignments FOR ALL TO authenticated USING (auth.uid()=user_id) WITH CHECK (auth.uid()=user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $do$;

CREATE OR REPLACE FUNCTION gina_joint_exercise_eval()
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE u RECORD; v_exercise RECORD; v_mtf_stage INT; v_nm_stage INT; v_msg TEXT;
  v_outreach UUID; v_decree UUID; v_queued INT := 0;
BEGIN
  FOR u IN SELECT us.user_id FROM user_state us
    WHERE COALESCE(us.handler_persona, 'therapist') = 'dommy_mommy'
      AND COALESCE(us.gina_track_voice, 'mommy_covert') = 'counselor_overt'
      AND COALESCE(us.gina_posture, 'neutral') <> 'hostile'
  LOOP
    IF ladder_user_paused(u.user_id) THEN CONTINUE; END IF;
    IF EXISTS (SELECT 1 FROM gina_joint_exercise_assignments WHERE user_id=u.user_id AND assigned_at > now() - interval '14 days') THEN CONTINUE; END IF;

    SELECT current_stage_num INTO v_mtf_stage FROM gina_campaign_state WHERE user_id=u.user_id AND track_name='mtf_accel';
    SELECT current_stage_num INTO v_nm_stage FROM gina_campaign_state WHERE user_id=u.user_id AND track_name='nonmono_probe';

    SELECT * INTO v_exercise FROM gina_joint_exercises
      WHERE active = TRUE
        AND ((recommended_at_track = 'mtf_accel' AND COALESCE(v_mtf_stage,1) BETWEEN recommended_at_stage_min AND recommended_at_stage_max)
          OR (recommended_at_track = 'nonmono_probe' AND COALESCE(v_nm_stage,1) BETWEEN recommended_at_stage_min AND recommended_at_stage_max)
          OR (recommended_at_track = 'both' AND (COALESCE(v_mtf_stage,1) BETWEEN recommended_at_stage_min AND recommended_at_stage_max OR COALESCE(v_nm_stage,1) BETWEEN recommended_at_stage_min AND recommended_at_stage_max)))
        AND NOT EXISTS (
          SELECT 1 FROM gina_joint_exercise_assignments a
          WHERE a.user_id = u.user_id AND a.exercise_id = gina_joint_exercises.id
            AND a.assigned_at > now() - (gina_joint_exercises.cooldown_days || ' days')::interval
        )
      ORDER BY random() LIMIT 1;
    IF v_exercise IS NULL THEN CONTINUE; END IF;

    v_msg := format(E'**Counselor session — joint exercise to do WITH Gina.**\n\n**Exercise:** %s\n**Time:** ~%s minutes\n**What it is:** %s\n**What we''re looking for:** %s\n%s\n\n**Your instructions (just for you):**\n%s\n\n**Script for framing it to her (you can say this directly):**\n%s\n\n**After the exercise — voice debrief on:**\n%s\n\nThis is the kind of conversation that doesn''t need to be hidden. You can tell her you''re working with a relationship coach on building deeper partnership. She''ll likely appreciate the intentionality.',
      v_exercise.exercise_name, v_exercise.time_required_minutes,
      v_exercise.description, v_exercise.intended_outcome,
      CASE WHEN v_exercise.materials_needed IS NOT NULL THEN E'\n**Materials needed:** ' || v_exercise.materials_needed ELSE '' END,
      v_exercise.instructions_for_maxy, v_exercise.shared_script_for_gina,
      array_to_string(ARRAY(SELECT '• ' || q FROM unnest(v_exercise.debrief_questions) q), E'\n'));

    INSERT INTO handler_decrees (user_id, edict, proof_type, deadline, status, consequence, trigger_source, reasoning)
    VALUES (u.user_id, v_msg, 'voice', now() + interval '14 days', 'active', 'slip +2', 'gina_joint_exercise', 'exercise=' || v_exercise.exercise_key)
    RETURNING id INTO v_decree;
    INSERT INTO handler_outreach_queue (user_id, message, urgency, trigger_reason, source, kind, scheduled_for, expires_at, context_data, evidence_kind)
    VALUES (u.user_id, v_msg, 'normal', 'gina_joint_exercise:' || v_exercise.exercise_key,
      'gina_joint_exercise', 'counselor_session', now(), now() + interval '14 days',
      jsonb_build_object('exercise_id', v_exercise.id, 'exercise_key', v_exercise.exercise_key, 'decree_id', v_decree), 'voice')
    RETURNING id INTO v_outreach;
    INSERT INTO gina_joint_exercise_assignments (user_id, exercise_id, related_outreach_id, related_decree_id)
    VALUES (u.user_id, v_exercise.id, v_outreach, v_decree);
    v_queued := v_queued + 1;
  END LOOP;
  RETURN v_queued;
END;
$fn$;
GRANT EXECUTE ON FUNCTION gina_joint_exercise_eval() TO service_role;

DO $do$ BEGIN IF EXISTS (SELECT 1 FROM cron.job WHERE jobname='gina-joint-exercise-biweekly') THEN PERFORM cron.unschedule('gina-joint-exercise-biweekly'); END IF; EXCEPTION WHEN undefined_table THEN NULL; END $do$;
DO $do$ BEGIN PERFORM cron.schedule('gina-joint-exercise-biweekly', '0 15 * * 6', $cron$SELECT gina_joint_exercise_eval()$cron$); EXCEPTION WHEN undefined_table THEN NULL; END $do$;

CREATE OR REPLACE FUNCTION trg_counselor_voice_wrap()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE v_counselor BOOLEAN;
BEGIN
  IF NEW.source NOT IN ('gina_seed_engine','gina_seed_auto_chain','gina_seed_prebrief','gina_seed_debrief_reminder') THEN RETURN NEW; END IF;
  v_counselor := gina_counselor_mode(NEW.user_id);
  IF NOT v_counselor THEN RETURN NEW; END IF;
  IF NEW.message ~ '^\*\*Counselor' THEN RETURN NEW; END IF;
  NEW.message := E'**Counselor mode — conversation suggestion for this week''s couples-growth work.**\n\nThis is a structured prompt designed to invite a specific kind of conversation with Gina. You can openly say you''re trying communication exercises from a relationship coach — that''s true, and most partners appreciate intentional partnership work.\n\n---\n\n' || NEW.message;
  RETURN NEW;
END;
$fn$;
DROP TRIGGER IF EXISTS counselor_voice_wrap ON handler_outreach_queue;
CREATE TRIGGER counselor_voice_wrap BEFORE INSERT ON handler_outreach_queue
  FOR EACH ROW EXECUTE FUNCTION trg_counselor_voice_wrap();
