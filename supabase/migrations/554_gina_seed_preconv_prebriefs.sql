-- 554 — Pre-conversation pre-brief templates for Gina-recruitment seeds.
--
-- Maxy's full ask: "slowly dripping new thoughts/ideas to warm her up
-- to feminizing david and having an active part." The seed catalog
-- gives her the WHAT; this migration gives her the HOW for each
-- conversation.
--
-- gina_seed_prebrief_templates is keyed on arc_focus. Each row has 4
-- fields:
--   timing_guidance        when to broach (best windows, worst windows)
--   leadin_pattern         how to lead in (don't blurt; what to anchor to)
--   predicted_reactions    3 patterns to watch for + how to read each
--   recovery_script        what to do if it goes sideways
--
-- Trigger trg_gina_seed_prebrief on gina_seed_plantings AFTER INSERT
-- queues a "PRE-CONVERSATION BRIEFING" outreach 10 minutes after the
-- planting (so Maxy gets the seed first, then the strategy brief).
-- Skipped in hostile mode (different content needed there).
--
-- 5 arc_focus values seeded: trans_normalization, mm_desire_norm,
-- her_dom_kink, fem_as_sexy, open_probe.

CREATE TABLE IF NOT EXISTS gina_seed_prebrief_templates (
  arc_focus TEXT PRIMARY KEY,
  timing_guidance TEXT NOT NULL,
  leadin_pattern TEXT NOT NULL,
  predicted_reactions TEXT NOT NULL,
  recovery_script TEXT NOT NULL
);
INSERT INTO gina_seed_prebrief_templates (arc_focus, timing_guidance, leadin_pattern, predicted_reactions, recovery_script) VALUES
('trans_normalization',
  E'Best windows: shared TV time, scrolling news together, after she mentions someone you both know. Worst: when she''s stressed, after a fight, or after she''s been reading culture-war content.',
  E'NEVER lead with "speaking of trans stuff." The seed has to feel like a normal observation. Slide it into an existing topic: a show she''s watching → "oh that reminds me," a news scroll → "did you see this," a person you both know → "you know who else is..."',
  E'Three patterns to watch: (1) **engaged-curious** = leans in, asks follow-ups, shares her own thought. Win. (2) **polite-disengaged** = neutral acknowledgment but no engagement, eyes drift. Cool result, try again with different vector. (3) **pejorative-deflect** = makes a dismissive comment or pivots to politics. Cold; back off and don''t escalate this arc_focus for 14+ days.',
  E'If she shuts down: do NOT push. "Oh, fair enough" and pivot to something else immediately. The shutdown IS the data — log it and let it sit. Next attempt comes in 3+ weeks via a different angle, NOT the same one.'),
('mm_desire_norm',
  E'Best windows: post-intimacy / pillow talk (highest receptivity), tipsy date night, a movie scene that just naturally surfaces the topic. Worst: after a fight, in the kitchen, when she''s tired.',
  E'Anchor to something external first — a character, a celebrity, a story — before asking about her directly. "Did you see Lil Nas X / the bisexual storyline in X / Pete Buttigieg thing?" Then drift to her experience.',
  E'Three patterns: (1) **leans in** = answers honestly, asks you back, body softens. Big win. (2) **deflects with humor** = laughs nervously, makes a joke. Mid — she heard you but isn''t ready to engage. (3) **redirects to monogamy concern** = "wait are you saying you want..." = she heard it as a proposal not a question. Recovery needed.',
  E'If she heard it as a proposal: walk it back immediately. "No, sorry, I was just curious what you thought, didn''t mean anything by it." Wait 30+ days before re-approaching. The MM probe is high-stakes; misfires cost campaign months.'),
('her_dom_kink',
  E'Best windows: any moment she''s already in a directive register — making plans, ordering food, running the household. Stack the felt sense gradually, daily, never as a big moment.',
  E'Don''t announce it. The "yes ma''am" / slow-compliance pattern works because it''s SUBTLE. She FEELS it without it being a topic. Do it 5-10 times before any explicit conversation. Earn the conversation by building the felt sense first.',
  E'Three patterns: (1) **her eyes change** = she notices the new energy and likes it; she''ll start giving more direction unprompted. (2) **she comments lightly** = "you''re being weird today (smiling)" = she clocked it and it''s landing. (3) **she names it explicitly** = "are you being submissive right now?" = the conversation has been earned. Engage.',
  E'If she calls it out negatively ("stop being weird, it''s annoying"): drop the energy immediately. "Yeah I was being weird, my bad." Don''t defend. Wait 2+ weeks. Try again with even smaller signals.'),
('fem_as_sexy',
  E'Best windows: after sex (she''s relaxed and language-loose), during getting-ready together (you''re both engaging with clothing/aesthetics already), in a long-drive low-stakes conversation. Worst: when she''s trying to look good for an event (your aesthetic talk competes with her ego in that moment).',
  E'Hand her the SPECIFIC compliment first. "The curve of that hip" / "you in heels does something to me." Then on a different day, the curiosity probe. Don''t link them in time — let the compliment-pattern run for a month before any "what would I look like in..." probe.',
  E'Three patterns: (1) **she leans into the aesthetic** = she''s wearing the dress more, the heels more, the lipstick more. Win. (2) **she compliments YOUR aesthetic back** = unexpectedly says "you look nice in that gray sweater" → she''s engaging with the aesthetic frame. Bigger win — she''s noticing your appearance with intentionality. (3) **she questions the specificity** = "why are you being so specific lately?" = caught. Slow down.',
  E'If caught: "I''ve been more attentive lately, you''ve been beautiful and I''ve been bad about saying it" — generic-romantic recovery. Don''t name the specific aesthetic theme. Wait 2+ weeks before resuming.'),
('open_probe',
  E'Best windows: long conversations during travel / road trips (no exit, both relaxed), after a dinner-and-wine evening, on a walk. Worst: in bed (too intimate, the answer feels too high-stakes), at the start of the week (her cortisol is up).',
  E'These are the highest-stakes probes. Lead with explicit framing: "I''m not proposing anything, I''m curious how you think." Repeating this twice in the lead-in lowers her threat-response. Then the question.',
  E'Three patterns: (1) **engages thoughtfully** = takes time, articulates distinctions (open vs swinging, hierarchical vs not, etc.). HUGE win — she''s already thought about this. (2) **rejects the premise** = "no I don''t want that and I don''t want to talk about it." Hard ceiling. Don''t push, log carefully, alter campaign. (3) **counter-question** = "why are you asking" = she''s threat-assessing. Answer honestly that you''re curious about her perspective, NOT proposing.',
  E'If hard rejection: "Fair enough, just curious." Drop it COMPLETELY. Don''t bring it up again for 60+ days. If you do, frame entirely differently and approach from a different arc_focus first to re-establish that you''re trustworthy with these conversations.')
ON CONFLICT (arc_focus) DO UPDATE SET
  timing_guidance = EXCLUDED.timing_guidance,
  leadin_pattern = EXCLUDED.leadin_pattern,
  predicted_reactions = EXCLUDED.predicted_reactions,
  recovery_script = EXCLUDED.recovery_script;

ALTER TABLE gina_seed_prebrief_templates ENABLE ROW LEVEL SECURITY;
DO $do$ BEGIN CREATE POLICY gspt_read_all ON gina_seed_prebrief_templates FOR SELECT TO authenticated USING (TRUE); EXCEPTION WHEN duplicate_object THEN NULL; END $do$;

CREATE OR REPLACE FUNCTION trg_gina_seed_prebrief()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE v_seed RECORD; v_template RECORD; v_msg TEXT; v_persona TEXT; v_hostile BOOLEAN;
BEGIN
  SELECT * INTO v_seed FROM gina_seed_catalog WHERE id = NEW.seed_id;
  IF v_seed IS NULL OR v_seed.arc_focus IS NULL THEN RETURN NEW; END IF;
  SELECT COALESCE(handler_persona, 'therapist') INTO v_persona FROM user_state WHERE user_id = NEW.user_id;
  IF v_persona <> 'dommy_mommy' THEN RETURN NEW; END IF;
  v_hostile := gina_hostile_mode(NEW.user_id);
  IF v_hostile THEN RETURN NEW; END IF;
  SELECT * INTO v_template FROM gina_seed_prebrief_templates WHERE arc_focus = v_seed.arc_focus;
  IF v_template IS NULL THEN RETURN NEW; END IF;

  v_msg := format(E'PRE-CONVERSATION BRIEFING for the "%s" probe Mama just gave you.\n\n**When to broach:**\n%s\n\n**Lead-in pattern:**\n%s\n\n**Watch for these reactions:**\n%s\n\n**If it goes sideways:**\n%s\n\nRehearse the lead-in once before you broach. The seed lands cleanly when the WAY you bring it up is already familiar to your mouth.',
    v_seed.seed_key, v_template.timing_guidance, v_template.leadin_pattern,
    v_template.predicted_reactions, v_template.recovery_script);

  INSERT INTO handler_outreach_queue (user_id, message, urgency, trigger_reason, source, kind, scheduled_for, expires_at, context_data, evidence_kind)
  VALUES (NEW.user_id, v_msg, 'normal', 'gina_seed_prebrief:' || v_seed.seed_key,
    'gina_seed_prebrief', 'preconv_briefing', now() + interval '10 minutes', now() + interval '5 days',
    jsonb_build_object('planting_id', NEW.id, 'seed_id', v_seed.id, 'arc_focus', v_seed.arc_focus), NULL);
  RETURN NEW;
END;
$fn$;
DROP TRIGGER IF EXISTS gina_seed_prebrief ON gina_seed_plantings;
CREATE TRIGGER gina_seed_prebrief AFTER INSERT ON gina_seed_plantings
  FOR EACH ROW EXECUTE FUNCTION trg_gina_seed_prebrief();
