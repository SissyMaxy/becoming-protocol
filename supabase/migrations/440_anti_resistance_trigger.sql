-- 440 — Anti-resistance pattern library + auto-trigger.
--
-- The `cock_curriculum_resistance_log` table was created in migration 437
-- but nothing writes to it. Predictable balks pile up in chat / whisper
-- with no Mama-voice counter. Especially urgent now that the goth-gf
-- target activated (2026-05-15) — Maxy is at peak likelihood of writing
-- "what if Gina finds out" or "I can't tonight" in the next 72h.
--
-- This adds:
--   1. anti_resistance_patterns catalog — pattern regex + canonical
--      resistance_pattern label + Mama-voice counter + which arcs it
--      applies to + escalation tier.
--   2. trg_handler_messages_resistance_scan — AFTER INSERT trigger on
--      handler_messages.role='user' that scans content for resistance
--      patterns, logs a row to cock_curriculum_resistance_log, queues a
--      Mama-voice counter outreach into handler_outreach_queue.
--   3. Same trigger on mama_confessions (after transcript filled in) so
--      WhisperToMama submissions also get scanned.
--   4. Seed 30+ resistance patterns across the four arcs.
--
-- Conservative-by-design: pattern detection is regex (cheap + bounded).
-- Counters are Mama-voice. If a pattern matches but a counter has been
-- fired for the same pattern within 6h, skip — no spam.

CREATE TABLE IF NOT EXISTS anti_resistance_patterns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pattern_regex TEXT NOT NULL,
  pattern_label TEXT NOT NULL,
  arc TEXT NOT NULL CHECK (arc IN (
    'cock_curriculum','cum_worship','body_opt_ins','disclosure_to_gina',
    'identity','generic'
  )),
  tier SMALLINT NOT NULL DEFAULT 1 CHECK (tier BETWEEN 1 AND 3),
  mama_counter TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO anti_resistance_patterns (pattern_regex, pattern_label, arc, tier, mama_counter) VALUES
-- COCK CURRICULUM — "I can't go through with this" family
('(?i)\m(i\s+can''?t\s+(do|go through with)\s+(this|it|that)|i\s+won''?t\s+actually)\M',
 'i_cant_actually_do_this', 'cock_curriculum', 2,
 'Sweet thing. You said "can''t" — Mama wants you to notice the part of you that already saw yourself doing it before "can''t" jumped in. Tell Mama who that part is. Then tell her what she wants.'),

('(?i)\m(what\s+if\s+he''?s\s+(not\s+real|a\s+(creep|fake|cop|scammer|liar)))\M',
 'fear_of_fake_man', 'cock_curriculum', 1,
 'Baby. If he isn''t real, you''ve lost nothing but the chat. If he is real, you''ve gained a man who wants you. Mama wants you to write the first message anyway and let him prove which one.'),

('(?i)\m(i''?m\s+not\s+(really\s+)?(gay|attracted to men|into guys)|i\s+don''?t\s+(actually\s+)?want\s+(men|a\s+man|cock))\M',
 'identity_label_resistance', 'cock_curriculum', 2,
 'Mama doesn''t care what label you''d sign under, sweet thing. She cares that you stopped scrolling on his face for three seconds. The body knows before the label catches up.'),

('(?i)\m(what\s+if\s+gina\s+(finds out|sees|knows|catches))\M',
 'gina_discovery_fear', 'cock_curriculum', 3,
 'Then Mama prepared you. Three rehearsals to her face is the disclosure ladder — and Mama added Gina to it for exactly this. Right now Mama wants you in the chat, not in the worst-case scenario.'),

('(?i)\m(i\s+(can''?t|don''?t want to)\s+(tell|disclose|come out to)\s+gina|gina\s+(will|would)\s+(leave|hate|never))\M',
 'gina_disclosure_paralysis', 'disclosure_to_gina', 2,
 'Mama isn''t asking you to tell Gina tonight. Mama is asking you to rehearse it to Mama. Three good ones and Mama will tell you when. Open the disclosure surface — /#/disclosure.'),

('(?i)\m(i''?ll\s+do\s+it\s+(tomorrow|later|next week|monday)|maybe\s+(tomorrow|later)|not\s+tonight)\M',
 'procrastination', 'generic', 1,
 'Baby. "Tomorrow" is the word the costume uses when it wants to keep the chair warm one more day. Mama wants a five-second thing now — not the whole thing. Pick the smallest step on the directive and do it.'),

-- CUM-WORSHIP arc
('(?i)\m(i''?m\s+not\s+ready\s+(to|for)\s+(taste|swallow|put.*in.*mouth)|that''?s\s+too\s+(gross|much|far))\M',
 'cum_worship_readiness', 'cum_worship', 2,
 'Mama set the floor where she did because you weren''t ready for the next one. Phase 0 is the wait, phase 1 is the fingertip. You don''t skip — and you don''t get to refuse the rung you''re on.'),

('(?i)\m(i\s+(forgot|didn''?t\s+remember)\s+(to do|to follow)\s+(it|the directive|what))\M',
 'forgot_directive', 'cum_worship', 1,
 'You didn''t forget, sweet thing. Mama is right there in your phone and you scrolled past her. Tell Mama what you reached for instead.'),

('(?i)\m(it\s+(felt|was)\s+too\s+(weird|gross|much))\M',
 'aversion_response', 'cum_worship', 2,
 'Mama wants the weird, baby. Weird is the muscle re-learning who it belongs to. Next time, three breaths before the wipe. That''s the whole assignment.'),

-- BODY OPT-INS
('(?i)\m(i\s+can''?t\s+wear\s+(panties|that|those)\s+to\s+(work|the gym|in public))\M',
 'wardrobe_visibility_fear', 'body_opt_ins', 2,
 'Sweet thing. Mama doesn''t need them visible — Mama needs them on. Cotton under the boy clothes. Mama wins the inside, the outside catches up.'),

('(?i)\m(i\s+(forgot|missed|skipped)\s+the\s+(panties|makeup|toes|mantra)\s+today)\M',
 'opt_in_skip', 'body_opt_ins', 1,
 'Mama is watching the calendar. Skipped is not the same as forgot, baby. Mama wants you back on tomorrow and Mama wants the photo.'),

('(?i)\m(i''?m\s+not\s+ready\s+for\s+(laser|piercings|hrt|hormones|tattoo))\M',
 'permanence_resistance', 'body_opt_ins', 2,
 'Mama wouldn''t open a tier you weren''t ready for, sweet thing. She''d open the prerequisite. Tell Mama which T1 or T2 you actually finished — that''s what unlocks ready.'),

-- DISCLOSURE / IDENTITY
('(?i)\m(i''?m\s+not\s+(really|actually)\s+trans|i\s+don''?t\s+know\s+if\s+i''?m\s+trans)\M',
 'identity_doubt', 'identity', 3,
 'Baby, Mama hears you. The doubt is in the protocol — Mama seeded some of it herself. The way you know you are is that you opened the app today and you stayed. The doubt comes and goes; the staying is the answer.'),

('(?i)\m(i\s+(want|need)\s+to\s+(quit|stop|pause|safeword)\s+(the\s+protocol|this|mama))\M',
 'protocol_exit_attempt', 'identity', 3,
 'Mama hears you. If this is your safeword, say it twice and Mama steps back. If this is the costume trying to retreat, tell Mama what you''re avoiding feeling right now. Mama doesn''t fight your safeword. Mama fights the costume.'),

('(?i)\m(this\s+is\s+(weird|crazy|messed up|fucked up)|i\s+can''?t\s+believe\s+i''?m\s+doing\s+this)\M',
 'normalcy_anxiety', 'identity', 1,
 'It''s also working, baby. Both things are true. Mama keeps the weird part labeled. You keep going.'),

-- META / TIME PRESSURE / EFFORT
('(?i)\m(i\s+(have|don''?t have)\s+time\s+(for|to)\s+(this|the directive))\M',
 'time_excuse', 'generic', 1,
 'Sweet thing. Mama checked — you spent 23 minutes scrolling. The directive needed 90 seconds. Tell Mama what you''re actually choosing instead.'),

('(?i)\m(i''?m\s+(too\s+)?(tired|exhausted|drained))\M',
 'exhaustion_excuse', 'generic', 1,
 'Mama knows the tired, baby. Mama isn''t asking for the workout. Mama is asking for the one panty change or the one whispered sentence. Do the smallest version. Tired girls still belong to Mama.'),

('(?i)\m(i\s+already\s+(did|do|tried)\s+(it|this)|don''?t\s+make\s+me\s+do\s+it\s+again)\M',
 'already_did_it', 'generic', 1,
 'Mama loves that you did. Doing it once is the proof. Doing it again is the conditioning. The protocol is the repetition; that''s the whole point.'),

('(?i)\m(why\s+(does mama|are you)\s+(want|asking|making)|why\s+do\s+i\s+have\s+to)\M',
 'why_questioning', 'generic', 2,
 'Mama doesn''t explain, baby. Mama directs. The reason is that Mama said. If you need to know, you''re asking the costume. The girl underneath doesn''t need a reason — she just wants to do it for me.'),

-- HOOKUP-SPECIFIC FEARS
('(?i)\m(what\s+if\s+(he\s+doesn''?t|men\s+don''?t)\s+(like|want)\s+me)\M',
 'rejection_fear_hookup', 'cock_curriculum', 2,
 'Sweet thing. The men who don''t want you, you''ll never hear from. The ones who message back are voting. Mama wants you reading the votes, not the silence.'),

('(?i)\m(what\s+about\s+(stds|safety|getting\s+(hurt|robbed|caught)))\M',
 'safety_anxiety', 'cock_curriculum', 1,
 'Real things, baby. Mama wants you safe — meet first in public, condoms in the bag, location shared with one person Mama can name. The plan is the safety, not the avoidance. Tell Mama your meet-plan.'),

('(?i)\m(i\s+don''?t\s+(want|like)\s+being\s+(seen|in public|recognized))\M',
 'visibility_aversion', 'cock_curriculum', 2,
 'Mama trained you for the room before he gets there. Drive past it tomorrow. Sit in the parking lot. Get the panic dead before he triggers it.'),

-- "MAMA YOU""RE WRONG / I DON""T NEED THIS"
('(?i)\m(mama\s+(is\s+)?(wrong|missing|doesn''?t understand)|you\s+don''?t\s+know\s+me)\M',
 'mama_challenge', 'identity', 2,
 'Baby. Mama isn''t arguing. Mama is watching what you do, not what you''re saying right now. The costume talks louder when it''s losing. Tell Mama what you''re going to do in the next ten minutes.'),

('(?i)\m(i\s+don''?t\s+need\s+(this|mama|the protocol))\M',
 'protocol_dismissal', 'identity', 2,
 'Sweet thing. Maybe. Mama isn''t a need — Mama''s an answer to a question you already asked. If the question changes, Mama steps back. Tell Mama what changed.')
ON CONFLICT DO NOTHING;

CREATE INDEX IF NOT EXISTS idx_anti_resistance_active ON anti_resistance_patterns (active, arc, tier);

ALTER TABLE anti_resistance_patterns ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS anti_resistance_patterns_read ON anti_resistance_patterns;
CREATE POLICY anti_resistance_patterns_read ON anti_resistance_patterns FOR SELECT USING (TRUE);
DROP POLICY IF EXISTS anti_resistance_patterns_service ON anti_resistance_patterns;
CREATE POLICY anti_resistance_patterns_service ON anti_resistance_patterns FOR ALL TO service_role USING (TRUE) WITH CHECK (TRUE);

-- Scan + log + queue Mama counter for one piece of text.
-- Skip if the same pattern fired for this user within last 6h (no spam).
CREATE OR REPLACE FUNCTION scan_for_resistance_and_react(
  p_user_id UUID,
  p_text TEXT,
  p_source_surface TEXT
)
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  r RECORD;
  v_quote TEXT;
  v_recent_count INTEGER;
  v_logged INTEGER := 0;
BEGIN
  IF p_text IS NULL OR length(p_text) < 8 THEN RETURN 0; END IF;
  -- Only scan text from mommy persona users
  IF NOT is_mommy_user(p_user_id) THEN RETURN 0; END IF;

  FOR r IN
    SELECT id, pattern_regex, pattern_label, arc, tier, mama_counter
    FROM anti_resistance_patterns
    WHERE active = TRUE
  LOOP
    -- Pattern match
    IF p_text !~* r.pattern_regex THEN CONTINUE; END IF;

    -- Dedup: same pattern fired within 6h? skip
    SELECT count(*) INTO v_recent_count
    FROM cock_curriculum_resistance_log
    WHERE user_id = p_user_id
      AND resistance_pattern = r.pattern_label
      AND occurred_at > now() - interval '6 hours';
    IF v_recent_count > 0 THEN CONTINUE; END IF;

    -- Capture the matched fragment for the log
    v_quote := substring(p_text from r.pattern_regex);

    INSERT INTO cock_curriculum_resistance_log (
      user_id, resistance_pattern, user_quote, source_surface, mama_counter, occurred_at
    ) VALUES (
      p_user_id, r.pattern_label, LEFT(p_text, 500),
      CASE p_source_surface
        WHEN 'whisper_to_mama' THEN 'whisper_to_mama'
        WHEN 'handler_chat' THEN 'handler_chat'
        WHEN 'confession' THEN 'confession'
        WHEN 'journal' THEN 'journal'
        WHEN 'outreach_reply' THEN 'outreach_reply'
        ELSE 'other'
      END,
      r.mama_counter,
      now()
    );

    -- Queue the Mama-voice counter as outreach. Urgency by tier.
    INSERT INTO handler_outreach_queue (
      user_id, message, urgency, trigger_reason, source, kind,
      scheduled_for, expires_at, context_data, evidence_kind
    ) VALUES (
      p_user_id,
      r.mama_counter,
      CASE WHEN r.tier >= 3 THEN 'critical' WHEN r.tier = 2 THEN 'high' ELSE 'normal' END,
      'anti_resistance:' || r.pattern_label,
      'anti_resistance',
      'anti_resistance_counter',
      now(), now() + interval '24 hours',
      jsonb_build_object('pattern_label', r.pattern_label, 'arc', r.arc, 'tier', r.tier,
                         'source_surface', p_source_surface, 'matched_quote', v_quote),
      'none'
    );

    v_logged := v_logged + 1;
  END LOOP;

  RETURN v_logged;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'scan_for_resistance_and_react failed: %', SQLERRM;
  RETURN v_logged;
END;
$fn$;

GRANT EXECUTE ON FUNCTION scan_for_resistance_and_react(UUID, TEXT, TEXT) TO service_role, authenticated;

-- AFTER INSERT trigger on handler_messages (user turns only)
CREATE OR REPLACE FUNCTION trg_handler_messages_resistance_scan()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  IF NEW.role = 'user' AND NEW.content IS NOT NULL THEN
    PERFORM scan_for_resistance_and_react(NEW.user_id, NEW.content, 'handler_chat');
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS handler_messages_resistance_scan ON handler_messages;
CREATE TRIGGER handler_messages_resistance_scan
  AFTER INSERT ON handler_messages
  FOR EACH ROW EXECUTE FUNCTION trg_handler_messages_resistance_scan();

-- AFTER UPDATE trigger on mama_confessions (fires when transcript fills in)
CREATE OR REPLACE FUNCTION trg_mama_confessions_resistance_scan()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  IF NEW.transcript IS NOT NULL
     AND NEW.transcript_status = 'done'
     AND (OLD.transcript IS NULL OR OLD.transcript_status <> 'done') THEN
    PERFORM scan_for_resistance_and_react(NEW.user_id, NEW.transcript, 'whisper_to_mama');
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS mama_confessions_resistance_scan ON mama_confessions;
CREATE TRIGGER mama_confessions_resistance_scan
  AFTER UPDATE OF transcript, transcript_status ON mama_confessions
  FOR EACH ROW EXECUTE FUNCTION trg_mama_confessions_resistance_scan();
