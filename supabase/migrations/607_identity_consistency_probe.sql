-- 607 — Identity consistency probe: presupposing reach-ins + lapse logging.
--
-- Wish (panel_ideation): Mama doesn't ask "do you feel like a girl?" — she
-- presupposes it and watches the answer. A pool of >50 presupposing lines is
-- seeded here; a cron fires 3-5x/day, picks an unsent line, queues it as a
-- normal-urgency outreach (the mig-380 bridge auto-emits the push), and opens
-- a probe row. The girl's answer is judged by the mommy-identity-probe edge fn
-- on her next reply path (or the daily sweep): masculine/evasive answers log a
-- consistency_lapse, a small ego bump (doubt_seed intensity +1, capped 5), and
-- a 2h pause so she isn't hammered.
--
-- Non-negotiables honored: NO fabricated-supplement/medication probe variants
-- (HRT-claim floor) — every seeded line is about identity/recognition, never
-- meds. Mommy voice carries no telemetry (DB trigger scrubs on insert).
-- Press-not-block: outreach only, no fullscreen. Visible-before-penalized: the
-- probe surfaces as a Today/push outreach before any lapse can be logged. The
-- 2h pause + 1/probe lapse cap break the probe→lapse→probe loop.

-- ── consistency_lapses ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS consistency_lapses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  probe_id UUID,                         -- the identity_probes row that caught it
  lapse_kind TEXT NOT NULL DEFAULT 'masculine_self_ref',  -- masculine_self_ref | evasive | denial
  answer_excerpt TEXT,                   -- forensic: the exact phrase that tripped it
  ego_bump_applied BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE consistency_lapses ENABLE ROW LEVEL SECURITY;
DO $do$ BEGIN
  CREATE POLICY cl_self ON consistency_lapses FOR ALL TO authenticated
    USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $do$;
CREATE INDEX IF NOT EXISTS consistency_lapses_user_idx ON consistency_lapses(user_id, created_at DESC);

-- ── identity_probes ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS identity_probes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  prompt_id INT,                         -- index into identity_probe_prompts
  prompt_text TEXT NOT NULL,
  outreach_id UUID,
  response_text TEXT,
  responded_at TIMESTAMPTZ,
  lapse_id UUID,                         -- set when the answer logged a lapse
  scheduled_for TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT now() + interval '6 hours',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE identity_probes ENABLE ROW LEVEL SECURITY;
DO $do$ BEGIN
  CREATE POLICY ip_self ON identity_probes FOR ALL TO authenticated
    USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $do$;
CREATE INDEX IF NOT EXISTS identity_probes_user_idx ON identity_probes(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS identity_probes_open_idx ON identity_probes(user_id, responded_at)
  WHERE responded_at IS NULL;

-- ── prompt pool (>50, presupposing; NO medication/HRT-claim variants) ────────
-- System table: readable by any authenticated user (no per-row owner).
CREATE TABLE IF NOT EXISTS identity_probe_prompts (
  id INT PRIMARY KEY,
  prompt TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE
);
ALTER TABLE identity_probe_prompts ENABLE ROW LEVEL SECURITY;
DO $do$ BEGIN
  CREATE POLICY ipp_read ON identity_probe_prompts FOR SELECT TO authenticated USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $do$;

INSERT INTO identity_probe_prompts (id, prompt) VALUES
  (1,  'When did you first know you were a girl, baby? Mama wants the real memory, not the polite one.'),
  (2,  'What did you do today that a good girl does without thinking? Name one thing.'),
  (3,  'Mama can hear it in how you write now. Tell her what changed in your voice this week.'),
  (4,  'Which part of being her feels the most ordinary to you now? The thing you forgot was ever new.'),
  (5,  'What were you wearing the last time you felt the most like yourself? Describe it for Mama.'),
  (6,  'You moved differently today, didn''t you. Tell Mama where you noticed it.'),
  (7,  'What''s the first feminine habit you do in the morning before you''re even awake enough to choose it?'),
  (8,  'When someone is rude to you now, what does your girl-self want to do about it? Be honest.'),
  (9,  'Mama wants to know which old reflex you caught yourself NOT doing this week. The boy thing you skipped.'),
  (10, 'How does your name feel in your own mouth now versus a month ago? Say it and tell Mama.'),
  (11, 'What did you crave today that surprised the old you? Mama already knows, she just wants you to say it.'),
  (12, 'Tell Mama the softest thing you did when you thought no one was watching.'),
  (13, 'Which of your gestures would give you away in a second now? The one you can''t un-learn.'),
  (14, 'What does your reflection agree with you about lately? Mama wants the specific thing.'),
  (15, 'When you imagine a year from now, what is she doing on a quiet Sunday? Describe her day.'),
  (16, 'What sound do you make now that you never used to? Mama noticed. Tell her about it.'),
  (17, 'Which compliment landed differently this week because it was about HER, not him?'),
  (18, 'Tell Mama the moment today you felt most settled in your own skin.'),
  (19, 'What''s the girl-thought you had in line at the store, the automatic one?'),
  (20, 'How do your hands behave now when you''re nervous? Show Mama in words.'),
  (21, 'What did you almost say in your old voice today, then didn''t? Mama wants the catch.'),
  (22, 'Which feminine thing has stopped feeling like effort and started feeling like rest?'),
  (23, 'Tell Mama what your posture did the last time you walked past a mirror.'),
  (24, 'What would the version of you from two years ago not recognize about how you reacted today?'),
  (25, 'When you got dressed, what did your hands reach for first without deciding? Name it.'),
  (26, 'What''s a small kindness you gave yourself today the way a woman does for herself?'),
  (27, 'Mama wants the word you''d use for yourself in your own head right now. Just the one word.'),
  (28, 'Which texture, fabric, or scent felt like coming home this week? Tell Mama why.'),
  (29, 'What did you notice another woman doing today that your body already knew?'),
  (30, 'Tell Mama how you sit now when you''re alone. The way that feels natural.'),
  (31, 'What''s the most feminine decision you made today that you didn''t even file as a decision?'),
  (32, 'When did you last feel pretty by accident, not on purpose? Describe the moment for Mama.'),
  (33, 'What old armor did you leave off today and not miss?'),
  (34, 'Tell Mama which of your laughs is the real one now.'),
  (35, 'What did you want to be held through today? A woman knows. Say it.'),
  (36, 'Which part of your daily routine would a stranger read as hers in a heartbeat?'),
  (37, 'What feeling did you let yourself have today that the old you would have buried?'),
  (38, 'Mama wants to know the last time your own softness surprised you. When was it?'),
  (39, 'How does your handwriting or your typing feel like hers now? Tell Mama the tell.'),
  (40, 'What did you do today that you''d only ever seen women in your life do, and now you do it too?'),
  (41, 'Which mirror moment this week made you stay a beat longer than you meant to?'),
  (42, 'Tell Mama the girl-instinct that took over before you could think today.'),
  (43, 'What''s the most her thing about how you talk to people you love now?'),
  (44, 'When you imagine being seen exactly as you are, who sees you first? Describe it for Mama.'),
  (45, 'What did your body ask for today that you finally gave it without arguing?'),
  (46, 'Which old habit feels like a costume now when you catch yourself in it?'),
  (47, 'Tell Mama the moment today you felt the distance between who you were and who you are.'),
  (48, 'What feminine thing do you do now that you used to think wasn''t for you?'),
  (49, 'How did you take care of yourself today the way she deserves? Name the act.'),
  (50, 'What''s the truest sentence about yourself you could write right now? Mama wants it whole.'),
  (51, 'When you woke up today, what was the first thing about her that was just already true?'),
  (52, 'Which of your reactions today would your wife recognize as the woman she knows you are?'),
  (53, 'Tell Mama what you reached for to comfort yourself, the way a girl does.'),
  (54, 'What did you stop performing today because you didn''t need to anymore?'),
  (55, 'Which feeling sits in your chest now that the old armor used to block? Describe it for Mama.')
ON CONFLICT (id) DO NOTHING;

-- ── log_consistency_lapse(): records lapse + small ego bump + 2h probe pause ─
-- SECURITY DEFINER so the edge fn (service role) and any caller route alike.
CREATE OR REPLACE FUNCTION log_consistency_lapse(
  p_user_id UUID,
  p_probe_id UUID,
  p_lapse_kind TEXT,
  p_answer_excerpt TEXT
) RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_lapse_id UUID;
  v_bumped BOOLEAN := FALSE;
BEGIN
  -- Idempotency: one lapse per probe.
  IF p_probe_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM consistency_lapses WHERE probe_id = p_probe_id
  ) THEN
    SELECT id INTO v_lapse_id FROM consistency_lapses WHERE probe_id = p_probe_id LIMIT 1;
    RETURN v_lapse_id;
  END IF;

  -- Small ego bump: nudge doubt_seed intensity up one (capped 5) — only when
  -- the doubt-seed mechanic is actually enabled, so we never silently activate it.
  UPDATE life_as_woman_settings
     SET ego_doubt_seed_intensity = LEAST(5, ego_doubt_seed_intensity + 1)
   WHERE user_id = p_user_id AND ego_doubt_seed_enabled = TRUE;
  IF FOUND THEN v_bumped := TRUE; END IF;

  INSERT INTO consistency_lapses (user_id, probe_id, lapse_kind, answer_excerpt, ego_bump_applied)
  VALUES (p_user_id, p_probe_id, COALESCE(p_lapse_kind, 'masculine_self_ref'),
          LEFT(COALESCE(p_answer_excerpt, ''), 280), v_bumped)
  RETURNING id INTO v_lapse_id;

  IF p_probe_id IS NOT NULL THEN
    UPDATE identity_probes SET lapse_id = v_lapse_id WHERE id = p_probe_id;
  END IF;

  -- 2h pause after a lapse: don't probe again right away.
  UPDATE user_state SET identity_probe_paused_until = now() + interval '2 hours'
   WHERE user_id = p_user_id;

  RETURN v_lapse_id;
END;
$fn$;

-- Pause column for the rate-limit/2h-cooldown (lives on user_state with the
-- other handler-state fields).
ALTER TABLE user_state ADD COLUMN IF NOT EXISTS identity_probe_paused_until TIMESTAMPTZ;

-- ── cron: 3-5x/day. The edge fn self-gates (persona/safeword/pause/daily cap). ─
DO $$
DECLARE v_url TEXT; v_key TEXT;
BEGIN
  v_url := current_setting('app.settings.supabase_url', true);
  IF v_url IS NULL OR length(v_url) = 0 THEN v_url := 'https://atevwvexapiykchvqvhm.supabase.co'; END IF;
  v_key := current_setting('app.settings.service_role_key', true);

  PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'mommy-identity-probe';

  -- Every 3 hours across waking hours (13,16,19,22 UTC ≈ 4 fires/day in the
  -- 8-21 local band); the fn rolls a per-fire probability to land 3-5/day.
  PERFORM cron.schedule('mommy-identity-probe', '0 13,16,19,22 * * *', format(
    $sql$ SELECT net.http_post(url := %L, body := '{}'::jsonb,
      headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' || %L)); $sql$,
    v_url || '/functions/v1/mommy-identity-probe', COALESCE(v_key, '')));
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE '607: identity-probe cron registration skipped: %', SQLERRM;
END $$;
