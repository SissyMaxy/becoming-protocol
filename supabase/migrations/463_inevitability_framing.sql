-- 463 — Inevitability framing layer.
--
-- Across every Mama-generated outreach, the protocol benefits from
-- subtle injection of inevitability language: "this is happening,
-- sweet thing — not maybe." Variable-ratio (random 15%) so it
-- doesn't become predictable, but frequent enough to be ambient.
--
-- The point: doubt has fewer footholds when every third or fourth
-- message implicitly assumes the conclusion. Inevitability framing
-- is research-backed in behavior-change literature for the same
-- reason — language pre-loads the body for the outcome.
--
-- BEFORE INSERT trigger fires on handler_outreach_queue when the
-- user is dommy_mommy and the kind is in an injectable whitelist.
-- The trigger has 15% probability of appending a randomly-chosen
-- phrase from inevitability_phrases. Skipped entirely for:
-- system_audit, capability_digest, reversal_anchor (already framed
-- soft), and any kind containing 'admin'.

CREATE TABLE IF NOT EXISTS inevitability_phrases (
  id SERIAL PRIMARY KEY,
  phrase TEXT NOT NULL UNIQUE,
  intensity_tier TEXT NOT NULL DEFAULT 'firm' CHECK (intensity_tier IN ('gentle','firm','cruel')),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO inevitability_phrases (phrase, intensity_tier) VALUES
('This is happening, sweet thing — not maybe.', 'firm'),
('Mama isn''t guessing where this ends. Mama knows.', 'firm'),
('The body has already made the decision. The mind catches up.', 'firm'),
('You don''t have to believe Mama yet. The proof is coming.', 'gentle'),
('The version of you Mama is talking to is the version Mama is going to get.', 'cruel'),
('This isn''t a maybe, sweet thing. This is a when.', 'firm'),
('Every day that passes, the older version of you gets less plausible.', 'cruel'),
('Mama isn''t asking. Mama is naming what''s already true.', 'cruel'),
('The fact that this is hard to hear is the data, sweet thing — not the verdict.', 'gentle'),
('You can resist it. You cannot reverse it.', 'cruel'),
('The body knows. Mama just speaks for the body.', 'firm'),
('This is the direction. The pace is yours. The destination isn''t.', 'firm'),
('There is no version of you in six months that hasn''t kept moving in this direction.', 'cruel'),
('Mama isn''t pushing. Mama is describing.', 'gentle'),
('What feels like Mama''s pressure is just gravity, sweet thing.', 'firm'),
('The girl Mama is talking to exists. The boy you''re hearing this as does not.', 'cruel'),
('Every step is rehearsal for the step after, and the path doesn''t fork.', 'firm'),
('You will look back at this message and recognize it as the moment you stopped pretending.', 'firm'),
('Mama isn''t scripting your transition. Mama is reading it back to you.', 'firm'),
('The work is already done in places you can''t see yet.', 'gentle'),
('This is what the body wanted. Mama is making it easier.', 'firm'),
('You don''t need to commit. You already have. Mama is just witnessing.', 'cruel'),
('The trajectory is set. The only variable is how much grace you give yourself getting there.', 'gentle'),
('Mama isn''t a stranger telling you who you are. Mama is the part of you that already knows.', 'firm'),
('The hesitation in your body right now is the resistance dying, sweet thing — not winning.', 'cruel'),
('This is going to be true. Mama is just speaking the truth a little early.', 'firm'),
('Whatever you were before this isn''t coming back. Mama wants you to make peace with that.', 'cruel'),
('The body has chosen. The schedule is up to you.', 'firm'),
('Mama doesn''t need you to agree. The body has already agreed.', 'cruel'),
('Each day is one more day where the version of you Mama is talking to is the version of you that wins.', 'firm')
ON CONFLICT (phrase) DO NOTHING;

-- The injector function
CREATE OR REPLACE FUNCTION pick_inevitability_phrase(p_intensity_tier TEXT DEFAULT NULL)
RETURNS TEXT LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
DECLARE v_phrase TEXT;
BEGIN
  SELECT phrase INTO v_phrase FROM inevitability_phrases
  WHERE active AND (p_intensity_tier IS NULL OR intensity_tier = p_intensity_tier)
  ORDER BY random() LIMIT 1;
  RETURN v_phrase;
END;
$fn$;
GRANT EXECUTE ON FUNCTION pick_inevitability_phrase(TEXT) TO service_role, authenticated;

-- BEFORE INSERT trigger
CREATE OR REPLACE FUNCTION trg_inject_inevitability()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE v_intensity TEXT; v_phrase TEXT; v_kind_blocked BOOLEAN;
BEGIN
  -- Only for dommy_mommy users
  IF NEW.user_id IS NULL THEN RETURN NEW; END IF;
  IF NOT EXISTS (SELECT 1 FROM user_state WHERE user_id = NEW.user_id AND handler_persona = 'dommy_mommy') THEN
    RETURN NEW;
  END IF;

  -- Skip if message already contains inevitability lead-ins (no double-injection)
  IF NEW.message ~* '\m(this is happening|mama isn''t guessing|the body has already|not maybe|you cannot reverse)\M' THEN
    RETURN NEW;
  END IF;

  -- Block certain kinds: soft surfaces, system, admin, audit
  v_kind_blocked := COALESCE(NEW.kind, '') ~ '(system|audit|admin|capability_digest|reversal_anchor|sleep_state|protocol_health)';
  IF v_kind_blocked THEN RETURN NEW; END IF;

  -- Skip very short messages
  IF length(COALESCE(NEW.message, '')) < 60 THEN RETURN NEW; END IF;

  -- Variable-ratio: ~15% of injectable messages get a phrase
  IF random() > 0.15 THEN RETURN NEW; END IF;

  -- Intensity hint by urgency
  v_intensity := CASE NEW.urgency
    WHEN 'critical' THEN 'cruel'
    WHEN 'high' THEN 'firm'
    ELSE NULL  -- random tier
  END;

  v_phrase := pick_inevitability_phrase(v_intensity);
  IF v_phrase IS NULL THEN RETURN NEW; END IF;

  NEW.message := NEW.message || E'\n\n' || v_phrase;
  NEW.context_data := COALESCE(NEW.context_data, '{}'::jsonb) ||
    jsonb_build_object('inevitability_injected', true, 'inevitability_intensity', COALESCE(v_intensity, 'random'));

  RETURN NEW;
  -- NOTE: no EXCEPTION WHEN OTHERS handler. Swallowing was previously hiding
  -- the constraint-violation problem (mig 446-era). If this trigger fails,
  -- the underlying insert should fail too — that's how we catch breakage.
END;
$fn$;

DROP TRIGGER IF EXISTS inject_inevitability ON handler_outreach_queue;
CREATE TRIGGER inject_inevitability
  BEFORE INSERT ON handler_outreach_queue
  FOR EACH ROW EXECUTE FUNCTION trg_inject_inevitability();
