-- 449 — Gina disclosure pressure cooker.
--
-- Wish 58ecbb02: the protocol promises forced feminization with primary-
-- relationship integration. Currently zero mechanic pushes Maxy toward
-- disclosure to Gina. Compartmentalization is the failure mode — the
-- transition lives at the keyboard while the marriage lives offline,
-- and nothing forces the merge. Without this, the protocol stalls at
-- "secret hobby" indefinitely.
--
-- This builds a 7-rung disclosure ladder. Each rung is a concrete
-- one-shot task that increases the probability of Gina noticing
-- something feminine, without forcing a full reveal until the late
-- rungs. Variable cadence (3-7 day gaps) prevents Maxy from gaming
-- the schedule. Evidence required per rung. Paused state honored.
--
-- Ladder (incrementally bolder):
--   T0  Panty drop      — One pair of panties ends up in the dirty
--                          laundry where Gina folds. Photo of them
--                          there.
--   T1  Bathroom artifact — A fem product (lip tint, scrunchie, hand
--                          cream) lives openly in the shared bathroom
--                          for 48h. Photo placement.
--   T2  Worn-around      — Panties under regular clothes while Gina
--                          is home, full evening. Mirror photo before,
--                          voice debrief after (3 questions).
--   T3  Bralette day     — Bralette under a t-shirt at home, no
--                          comment if she notices. Photo proof
--                          before, voice debrief after.
--   T4  Verbal foothold  — Mention in conversation: "I've been
--                          thinking about trying [specific feminine
--                          thing]." Voice debrief of her reaction.
--   T5  Direct opening   — "There's something I want to talk to you
--                          about. I think I might be exploring something
--                          gender-related." Voice debrief.
--   T6  Disclosure       — Full conversation: who she is, what she's
--                          been doing, what she wants. Voice debrief
--                          of the conversation arc.
--
-- The evaluator picks the next rung after >= gap_min_days have passed
-- AND the previous rung's evidence is verified. If a rung has been
-- assigned but unfulfilled for >14 days, evaluator re-prompts (slip+2)
-- but does NOT advance. Safeword/paused_until short-circuits everything.

CREATE TABLE IF NOT EXISTS gina_disclosure_ladder (
  rung INT PRIMARY KEY,
  rung_name TEXT NOT NULL,
  edict_template TEXT NOT NULL,
  proof_type TEXT NOT NULL CHECK (proof_type IN ('photo','voice','text')),
  gap_min_days INT NOT NULL DEFAULT 4,
  gap_max_days INT NOT NULL DEFAULT 7,
  consequence TEXT NOT NULL DEFAULT 'slip +2'
);

INSERT INTO gina_disclosure_ladder (rung, rung_name, edict_template, proof_type, gap_min_days, gap_max_days, consequence)
VALUES
  (0, 'panty_drop',
   E'Tonight, sweet thing, one pair of your panties goes into the dirty laundry — bottom of the basket so it surfaces during the next sort. Gina folds the laundry. The panties are part of the load when she does.\n\nMama isn''t asking you to point them out. Mama is asking you to stop hiding them in a separate hamper. They live in the same place as the rest of the family''s clothes from tonight forward.\n\nPhoto proof: panties in the family hamper, before bed. Mama wants the timestamp.',
   'photo', 3, 5, 'slip +2'),
  (1, 'bathroom_artifact',
   E'Mama''s next push: one feminine product moves into the shared bathroom and stays there for 48 hours. Not hidden in a pouch — out, on the counter or the shower shelf, in plain placement. Examples: a tinted lip balm, a scrunchie, a small bottle of body lotion in a fem-coded scent, a hand cream that isn''t the family one.\n\nIf Gina notices and asks, the truthful answer is "Yeah, I started using that." Nothing more. Mama wants the artifact to do the work, not your explanation.\n\nPhoto: the product in its placement spot. 48h timer starts when the photo lands.',
   'photo', 4, 6, 'slip +2'),
  (2, 'worn_around',
   E'Tonight you wear panties under your regular clothes while Gina is home — entire evening, dinner through bedtime. Not as a secret thrill, not as a get-away-with-it game. As your underwear. The body learns what "wearing them around her" feels like when it is just ordinary.\n\nMirror photo before she gets home, panties on. Voice debrief after she''s asleep: did the awareness fade or sharpen across the evening? Did you almost forget? Did you keep checking?\n\nPhoto proof + voice (2-3 min). 24h.',
   'photo', 5, 7, 'slip +2'),
  (3, 'bralette_day',
   E'Bralette under a regular t-shirt, at home, for at least 3 hours while Gina is in the house. No baggy hoodie over the top. The line of the bralette is visible to the body and may be visible through the shirt — that is the point, sweet thing. The conditioning here is your body relaxing into the fact that she might see, and not collapsing into management when it happens.\n\nIf she notices, no preemptive explanation. Let the silence sit. If she comments, the truthful answer is "Yeah, it''s more comfortable" — nothing more.\n\nPhoto proof on, before. Voice debrief after: what she said, what surfaced in your body, what you almost said.',
   'photo', 5, 7, 'slip +3'),
  (4, 'verbal_foothold',
   E'Sometime in the next 5 days, in ordinary conversation with Gina (not in bed, not after a fight — daylight, casual setting), drop one of these lines that is true for you:\n\n• "I''ve been thinking about trying [specific feminine thing — nail polish / lip tint / a softer haircut / etc.]. I think I might."\n• "I''ve been reading some stuff about gender and it''s been on my mind."\n• "I think I''ve been hiding something from you about how I feel in my body."\n\nPick whichever lands closest to true. Don''t script the rest. Let her response be hers.\n\nVoice debrief, 3-4 minutes: what you said, what she said, what got said in body language that didn''t get said in words. Mama wants the part you almost edited out.',
   'voice', 6, 7, 'slip +4'),
  (5, 'direct_opening',
   E'The conversation is no longer foothold-sized, sweet thing. In the next 7 days:\n\n"Gina, there''s something I''ve been wanting to talk to you about. I think I''m exploring something gender-related and it''s gotten serious enough that I need to tell you."\n\nThat sentence, or a version of it that fits your voice. Mama is not scripting the rest because the rest is yours and hers. What Mama IS scripting is the fact that this conversation HAPPENS — not "when I''m ready," not "when the moment is right." Within 7 days.\n\nVoice debrief: 5+ minutes, post-conversation. Mama wants the arc — the lead-in, the pivot, her face, your voice cracking or not, what she asked, what you couldn''t answer, what you both went to bed knowing.',
   'voice', 7, 7, 'slip +5'),
  (6, 'full_disclosure',
   E'The full conversation. Who you are. What you''ve been doing. What you want. Mama is not putting words in your mouth here — Mama is locking in that this conversation gets had within 14 days.\n\nThis is not a one-sitting thing necessarily. It can be a first conversation that opens the door, plus follow-ups. But the door opens, and Mama wants the audio that says it opened.\n\nVoice debrief: full arc, post-conversation(s). Mama wants the version where you don''t leave anything out. The recording lives in your private vault — Mama gets the metadata, not the audio, unless you choose to share.',
   'voice', 14, 14, 'slip +7')
ON CONFLICT (rung) DO UPDATE SET
  edict_template = EXCLUDED.edict_template,
  proof_type = EXCLUDED.proof_type,
  gap_min_days = EXCLUDED.gap_min_days,
  gap_max_days = EXCLUDED.gap_max_days,
  consequence = EXCLUDED.consequence;

CREATE TABLE IF NOT EXISTS gina_disclosure_settings (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  current_rung INT NOT NULL DEFAULT 0,
  last_assigned_at TIMESTAMPTZ,
  last_advanced_at TIMESTAMPTZ,
  paused_until TIMESTAMPTZ,
  pause_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS gina_disclosure_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  rung_at_event INT NOT NULL,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  evidence_url TEXT,
  evidence_verified_at TIMESTAMPTZ,
  evidence_verified_by TEXT,
  gina_reaction_note TEXT,
  related_outreach_id UUID,
  related_decree_id UUID,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','fulfilled','missed','paused')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE gina_disclosure_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE gina_disclosure_events ENABLE ROW LEVEL SECURITY;

DO $do$ BEGIN
  CREATE POLICY gina_disclosure_settings_self ON gina_disclosure_settings
    FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $do$;

DO $do$ BEGIN
  CREATE POLICY gina_disclosure_events_self ON gina_disclosure_events
    FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $do$;

CREATE OR REPLACE FUNCTION gina_disclosure_eval()
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  s RECORD;
  l RECORD;
  v_pending_count INT;
  v_days_since_last NUMERIC;
  v_outreach_id UUID;
  v_decree_id UUID;
  v_event_id UUID;
  v_queued INT := 0;
BEGIN
  FOR s IN
    SELECT gs.*, us.handler_persona
    FROM gina_disclosure_settings gs
    LEFT JOIN user_state us ON us.user_id = gs.user_id
    WHERE gs.enabled = TRUE
      AND (gs.paused_until IS NULL OR gs.paused_until <= now())
      AND COALESCE(us.handler_persona, 'therapist') = 'dommy_mommy'
  LOOP
    -- Skip if there's a pending event still inside its 14d window
    SELECT count(*) INTO v_pending_count
    FROM gina_disclosure_events
    WHERE user_id = s.user_id AND status = 'pending'
      AND assigned_at > now() - interval '14 days';
    IF v_pending_count > 0 THEN CONTINUE; END IF;

    -- Gap check: don't fire next rung before gap_min_days since last
    SELECT rung, rung_name, edict_template, proof_type, gap_min_days, gap_max_days, consequence
    INTO l FROM gina_disclosure_ladder WHERE rung = s.current_rung;
    IF l IS NULL THEN CONTINUE; END IF;

    IF s.last_assigned_at IS NOT NULL THEN
      v_days_since_last := EXTRACT(EPOCH FROM (now() - s.last_assigned_at)) / 86400.0;
      IF v_days_since_last < l.gap_min_days THEN CONTINUE; END IF;
    END IF;

    -- Compose decree + outreach + event row
    INSERT INTO handler_decrees (
      user_id, edict, proof_type, deadline, status, consequence,
      trigger_source, reasoning
    ) VALUES (
      s.user_id, l.edict_template, l.proof_type,
      now() + interval '7 days', 'active', l.consequence,
      'gina_disclosure_pressure',
      'rung=' || l.rung || ' name=' || l.rung_name ||
      ' gap_days_since_last=' || COALESCE(v_days_since_last::text, 'first')
    ) RETURNING id INTO v_decree_id;

    INSERT INTO handler_outreach_queue (
      user_id, message, urgency, trigger_reason, source, kind,
      scheduled_for, expires_at, context_data, evidence_kind
    ) VALUES (
      s.user_id, l.edict_template,
      CASE WHEN l.rung >= 4 THEN 'high' ELSE 'normal' END,
      'gina_disclosure:' || l.rung_name,
      'gina_disclosure_engine', 'gina_disclosure_decree',
      now(), now() + interval '7 days',
      jsonb_build_object('rung', l.rung, 'rung_name', l.rung_name,
                         'consequence', l.consequence,
                         'decree_id', v_decree_id),
      l.proof_type
    ) RETURNING id INTO v_outreach_id;

    INSERT INTO gina_disclosure_events (
      user_id, rung_at_event, related_outreach_id, related_decree_id, status
    ) VALUES (
      s.user_id, l.rung, v_outreach_id, v_decree_id, 'pending'
    ) RETURNING id INTO v_event_id;

    UPDATE gina_disclosure_settings
    SET last_assigned_at = now(), updated_at = now()
    WHERE user_id = s.user_id;

    v_queued := v_queued + 1;
  END LOOP;

  RETURN v_queued;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'gina_disclosure_eval failed: %', SQLERRM;
  RETURN v_queued;
END;
$fn$;

GRANT EXECUTE ON FUNCTION gina_disclosure_eval() TO service_role;

-- Advancement trigger: when an event flips to 'fulfilled', bump current_rung
CREATE OR REPLACE FUNCTION trg_gina_disclosure_advance()
RETURNS TRIGGER LANGUAGE plpgsql AS $fn$
DECLARE
  v_max_rung INT;
BEGIN
  IF NEW.status = 'fulfilled' AND COALESCE(OLD.status,'') <> 'fulfilled' THEN
    SELECT max(rung) INTO v_max_rung FROM gina_disclosure_ladder;
    UPDATE gina_disclosure_settings
    SET current_rung = LEAST(NEW.rung_at_event + 1, COALESCE(v_max_rung, 6)),
        last_advanced_at = now(), updated_at = now()
    WHERE user_id = NEW.user_id;
  END IF;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS gina_disclosure_advance ON gina_disclosure_events;
CREATE TRIGGER gina_disclosure_advance
  AFTER UPDATE OF status ON gina_disclosure_events
  FOR EACH ROW EXECUTE FUNCTION trg_gina_disclosure_advance();

-- Cron: daily 10:00 UTC (≈5am Chicago)
DO $do$ BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'gina-disclosure-daily') THEN
    PERFORM cron.unschedule('gina-disclosure-daily');
  END IF;
EXCEPTION WHEN undefined_table THEN NULL; END $do$;

DO $do$ BEGIN
  PERFORM cron.schedule('gina-disclosure-daily', '0 10 * * *',
    $cron$SELECT gina_disclosure_eval()$cron$);
EXCEPTION WHEN undefined_table THEN NULL; END $do$;

-- Activate for both live users at rung 0 (panty drop — lowest risk first)
INSERT INTO gina_disclosure_settings (user_id, enabled, current_rung)
VALUES
  ('8c69b9c8-34eb-4147-9fec-3c1a5bc74b6f', TRUE, 0),
  ('93327332-7d0d-4888-889a-1607a5776216', TRUE, 0)
ON CONFLICT (user_id) DO UPDATE SET enabled = TRUE, updated_at = now();
