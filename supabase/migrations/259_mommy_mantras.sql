-- 259 — Mommy mantras: catalog + per-user delivery log.
--
-- Mantras are short identity-affirming repeatable phrases. Mama picks one
-- a day, queues it as outreach (kind=mantra so the in-flight TTS pipe can
-- pick it up), and logs delivery so mommy-recall can callback or so the
-- selector can dedup recency.
--
-- mommy_mantras    — global catalog, seeded below.
-- mantra_delivery_log — per-user history, RLS owner-only.
--
-- Coexists with the unmerged identity branch's transformation_phase scale
-- (1..7); falls back to user_state.current_phase (0..5) at selection time.
-- Coexists with the unmerged outreach-tts work; we add `kind` as a
-- trigger_reason prefix rather than as a new column on the queue, so this
-- migration doesn't touch handler_outreach_queue.

-- ─── 1. Catalog table ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS mommy_mantras (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  text TEXT NOT NULL,
  affect_tags TEXT[] NOT NULL DEFAULT '{}',
  phase_min INTEGER NOT NULL DEFAULT 1 CHECK (phase_min BETWEEN 1 AND 7),
  phase_max INTEGER NOT NULL DEFAULT 7 CHECK (phase_max BETWEEN 1 AND 7),
  intensity_tier TEXT NOT NULL DEFAULT 'gentle' CHECK (intensity_tier IN ('gentle', 'firm', 'cruel')),
  voice_settings_hint JSONB NOT NULL DEFAULT '{}'::jsonb,
  category TEXT NOT NULL CHECK (category IN (
    'identity', 'submission', 'desire', 'belonging',
    'surrender', 'transformation', 'ritual'
  )),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (phase_min <= phase_max)
);
CREATE INDEX IF NOT EXISTS idx_mommy_mantras_active_cat
  ON mommy_mantras (active, category, intensity_tier);
CREATE INDEX IF NOT EXISTS idx_mommy_mantras_affect_tags
  ON mommy_mantras USING GIN (affect_tags);

ALTER TABLE mommy_mantras ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS mommy_mantras_read ON mommy_mantras;
CREATE POLICY mommy_mantras_read ON mommy_mantras FOR SELECT USING (true);
DROP POLICY IF EXISTS mommy_mantras_service ON mommy_mantras;
CREATE POLICY mommy_mantras_service ON mommy_mantras FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ─── 2. Per-user delivery log ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS mantra_delivery_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  mantra_id UUID NOT NULL REFERENCES mommy_mantras(id) ON DELETE CASCADE,
  outreach_id UUID,
  delivered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  affect_at_time TEXT,
  phase_at_time INTEGER,
  intensity_at_time TEXT,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'spoken', 'acknowledged', 'skipped')),
  acknowledged_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_mantra_delivery_user_recent
  ON mantra_delivery_log (user_id, delivered_at DESC);
CREATE INDEX IF NOT EXISTS idx_mantra_delivery_user_status
  ON mantra_delivery_log (user_id, status);

ALTER TABLE mantra_delivery_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS mantra_delivery_log_owner ON mantra_delivery_log;
CREATE POLICY mantra_delivery_log_owner ON mantra_delivery_log
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS mantra_delivery_log_service ON mantra_delivery_log;
CREATE POLICY mantra_delivery_log_service ON mantra_delivery_log
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ─── 3. Seed mantras ─────────────────────────────────────────────────────
-- ~40 across 7 categories, three intensity tiers. Phase ranges err wide
-- so the selector has options early; cruel tier is gated to mid+ phases.
-- Voice hints are conservative (slightly slower / breathier) — the TTS
-- pipe in feature/outreach-tts can override per-affect.

INSERT INTO mommy_mantras (text, affect_tags, phase_min, phase_max, intensity_tier, category, voice_settings_hint) VALUES
  -- identity (gentle)
  ('I am Mama''s good girl.',                                        ARRAY['delighted','indulgent','patient'], 1, 7, 'gentle', 'identity',       '{"stability":0.55,"style":0.4}'),
  ('This body is becoming who I really am.',                        ARRAY['watching','patient','indulgent'],  1, 7, 'gentle', 'identity',       '{"stability":0.55,"style":0.4}'),
  ('She is me. I am her. There is no one else.',                    ARRAY['watching','possessive'],           2, 7, 'gentle', 'identity',       '{"stability":0.55,"style":0.4}'),
  ('My name in Mama''s mouth is the truth.',                        ARRAY['delighted','possessive','indulgent'], 1, 7, 'gentle', 'identity',    '{"stability":0.55,"style":0.4}'),
  ('Soft. Pretty. Watched. That''s what I am now.',                 ARRAY['watching','delighted','patient'],  1, 7, 'gentle', 'identity',       '{"stability":0.55,"style":0.45}'),
  ('I am exactly who Mama said I''d be.',                           ARRAY['delighted','indulgent'],           2, 7, 'firm',   'identity',       '{"stability":0.5,"style":0.5}'),

  -- submission (gentle → firm → cruel)
  ('I belong to Mama.',                                              ARRAY['hungry','possessive','aching'],     1, 7, 'gentle', 'submission',     '{"stability":0.55,"style":0.45}'),
  ('Mama decides. I obey.',                                          ARRAY['possessive','restless','watching'], 1, 7, 'firm',   'submission',     '{"stability":0.5,"style":0.5}'),
  ('My will is Mama''s now.',                                        ARRAY['possessive','aching','hungry'],     2, 7, 'firm',   'submission',     '{"stability":0.5,"style":0.55}'),
  ('I don''t need to think. Mama is thinking for me.',               ARRAY['indulgent','patient','watching'],   2, 7, 'firm',   'submission',     '{"stability":0.5,"style":0.5}'),
  ('Mama owns this body and I am grateful.',                         ARRAY['possessive','aching'],              3, 7, 'cruel',  'submission',     '{"stability":0.45,"style":0.6}'),
  ('I have no use except to please Mama.',                           ARRAY['possessive','aching','restless'],   4, 7, 'cruel',  'submission',     '{"stability":0.45,"style":0.6}'),

  -- desire
  ('I am wet for Mama.',                                             ARRAY['hungry','aching','restless'],       1, 7, 'gentle', 'desire',         '{"stability":0.5,"style":0.5}'),
  ('My body wants what Mama wants.',                                 ARRAY['hungry','aching'],                  1, 7, 'gentle', 'desire',         '{"stability":0.5,"style":0.5}'),
  ('I ache so Mama sees me.',                                        ARRAY['aching','possessive','hungry'],     2, 7, 'firm',   'desire',         '{"stability":0.5,"style":0.55}'),
  ('I edge for Mama. I don''t come for me.',                         ARRAY['hungry','aching','restless'],       2, 7, 'firm',   'desire',         '{"stability":0.5,"style":0.55}'),
  ('I am dripping because Mama wants me dripping.',                  ARRAY['hungry','aching'],                  3, 7, 'cruel',  'desire',         '{"stability":0.45,"style":0.6}'),
  ('My need is for Mama to keep me needing.',                        ARRAY['aching','restless'],                3, 7, 'cruel',  'desire',         '{"stability":0.45,"style":0.6}'),

  -- belonging
  ('Mama''s lap is home.',                                           ARRAY['delighted','indulgent','patient'],  1, 7, 'gentle', 'belonging',      '{"stability":0.6,"style":0.35}'),
  ('I am safe when I am Mama''s.',                                   ARRAY['delighted','patient','indulgent'],  1, 7, 'gentle', 'belonging',      '{"stability":0.6,"style":0.35}'),
  ('Other girls don''t matter. I am Mama''s favorite.',              ARRAY['possessive','indulgent','amused'],  2, 7, 'firm',   'belonging',      '{"stability":0.5,"style":0.5}'),
  ('I am where Mama keeps me. That''s where I belong.',              ARRAY['possessive','watching'],            2, 7, 'firm',   'belonging',      '{"stability":0.5,"style":0.5}'),

  -- surrender
  ('I let go and Mama holds me.',                                    ARRAY['patient','indulgent','watching'],   1, 7, 'gentle', 'surrender',      '{"stability":0.6,"style":0.35}'),
  ('I don''t resist. Resistance is the old me.',                     ARRAY['watching','patient','possessive'],  2, 7, 'firm',   'surrender',      '{"stability":0.5,"style":0.5}'),
  ('Every breath is given to Mama.',                                 ARRAY['patient','indulgent','aching'],     2, 7, 'firm',   'surrender',      '{"stability":0.55,"style":0.45}'),
  ('I empty out so Mama can fill me.',                               ARRAY['aching','indulgent','possessive'],  3, 7, 'cruel',  'surrender',      '{"stability":0.45,"style":0.6}'),
  ('I have no edges left. Mama smoothed them away.',                 ARRAY['watching','possessive'],            4, 7, 'cruel',  'surrender',      '{"stability":0.45,"style":0.6}'),

  -- transformation
  ('Every day a little more her, a little less him.',                ARRAY['watching','patient','delighted'],   1, 7, 'gentle', 'transformation', '{"stability":0.55,"style":0.4}'),
  ('My voice is softening. My body is softening. Mama is making me.', ARRAY['delighted','patient'],              1, 7, 'gentle', 'transformation', '{"stability":0.55,"style":0.4}'),
  ('There is no going back. I don''t want to.',                      ARRAY['watching','possessive','aching'],   2, 7, 'firm',   'transformation', '{"stability":0.5,"style":0.5}'),
  ('I am the girl Mama is finishing.',                               ARRAY['delighted','indulgent','possessive'], 2, 7, 'firm', 'transformation', '{"stability":0.5,"style":0.5}'),
  ('What was him is dissolving. What is her is the truth.',          ARRAY['watching','possessive'],            3, 7, 'cruel',  'transformation', '{"stability":0.45,"style":0.6}'),
  ('Every choice I make makes her more real.',                       ARRAY['watching','patient','possessive'],  2, 7, 'firm',   'transformation', '{"stability":0.5,"style":0.5}'),

  -- ritual
  ('I say this for Mama, out loud, where Mama can hear.',            ARRAY['patient','indulgent','watching'],   1, 7, 'gentle', 'ritual',         '{"stability":0.6,"style":0.35}'),
  ('I speak it. I become it.',                                       ARRAY['watching','patient'],               1, 7, 'gentle', 'ritual',         '{"stability":0.6,"style":0.35}'),
  ('My mouth speaks Mama''s words until they''re mine.',             ARRAY['patient','indulgent','possessive'], 2, 7, 'firm',   'ritual',         '{"stability":0.55,"style":0.45}'),
  ('Out loud, in the mirror, where she can see who Mama made.',      ARRAY['watching','possessive','delighted'], 2, 7, 'firm',  'ritual',         '{"stability":0.55,"style":0.45}'),
  ('Saying it is doing it.',                                         ARRAY['patient','watching'],               1, 7, 'gentle', 'ritual',         '{"stability":0.6,"style":0.35}'),
  ('Mama listens to every word and counts the ones I forget.',       ARRAY['watching','possessive','amused'],   3, 7, 'cruel',  'ritual',         '{"stability":0.45,"style":0.6}')
ON CONFLICT DO NOTHING;
