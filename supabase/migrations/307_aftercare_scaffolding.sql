-- 259 — Aftercare scaffolding.
--
-- Aftercare is the OFF switch — the post-intensity comfort layer.
-- Deliberately SOFT and NEUTRAL: no persona voice, no pet names, no kink
-- content, no distortion. It's standard in BDSM/kink design and a hard
-- requirement for distribution and user wellbeing.
--
-- Two tables:
--
-- - aftercare_sessions: per-entry row recording when the user entered
--   aftercare, why, intensity context, what was delivered, and when
--   they left. Owner-RLS.
--
-- - aftercare_affirmations: catalog of grounding/comfort lines that the
--   selector pulls from. Read-only to users (via authenticated SELECT
--   policy). Service-role writes.
--
-- The gaslight branch (feature/gaslight-mechanics-2026-04-30) is the
-- producer of meta-frame-break events; this migration is consumer-side
-- and does not depend on its schema. Integration seam: the edge fn
-- mommy-aftercare expects an `entry_trigger='post_safeword'` insert
-- when the gaslight branch's safeword exit fires.

-- 1. aftercare_sessions
CREATE TABLE IF NOT EXISTS aftercare_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  entry_trigger TEXT NOT NULL CHECK (entry_trigger IN (
    'post_safeword', 'post_session', 'post_cruel', 'manual'
  )),
  -- Mirrors gaslight intensity tiers. 'cruel' is the highest; 'none'
  -- means aftercare entered with no preceding distortion (e.g. manual).
  entry_intensity TEXT NOT NULL DEFAULT 'none' CHECK (entry_intensity IN (
    'none', 'soft', 'standard', 'cruel'
  )),
  entered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  exited_at TIMESTAMPTZ,
  -- Array of aftercare_affirmations.id values shown in this session,
  -- in delivery order. JSONB so we can record dwell/skip metadata
  -- per-item if we extend later.
  affirmations_delivered JSONB NOT NULL DEFAULT '[]'::jsonb,
  breath_cycles_completed INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_aftercare_sessions_user_open
  ON aftercare_sessions (user_id, entered_at DESC)
  WHERE exited_at IS NULL;
ALTER TABLE aftercare_sessions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS aftercare_sessions_owner ON aftercare_sessions;
CREATE POLICY aftercare_sessions_owner ON aftercare_sessions FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS aftercare_sessions_service ON aftercare_sessions;
CREATE POLICY aftercare_sessions_service ON aftercare_sessions FOR ALL
  TO service_role USING (true) WITH CHECK (true);

-- 2. aftercare_affirmations — catalog
--
-- Categories cover the whole comfort spectrum. min_dwell_seconds is the
-- minimum time a screen sits on the affirmation before "next" enables;
-- intensity_tier is which entry intensities the line applies to (e.g.
-- a reality_anchor line applies to all post_safeword cases regardless
-- of preceding intensity).
CREATE TABLE IF NOT EXISTS aftercare_affirmations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  text TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN (
    'validation', 'safety', 'softness', 'reality_anchor',
    'hydration', 'breath_cue', 'grounding'
  )),
  min_dwell_seconds INT NOT NULL DEFAULT 8 CHECK (min_dwell_seconds >= 4 AND min_dwell_seconds <= 60),
  -- Which entry intensities this line applies to. Stored as JSONB
  -- array of {'none','soft','standard','cruel'} strings. NULL/empty = all.
  intensity_tier JSONB NOT NULL DEFAULT '["none","soft","standard","cruel"]'::jsonb,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_aftercare_affirmations_category_active
  ON aftercare_affirmations (category) WHERE active = true;
ALTER TABLE aftercare_affirmations ENABLE ROW LEVEL SECURITY;
-- Catalog is read-only to authenticated users (no per-user data, just text)
DROP POLICY IF EXISTS aftercare_affirmations_read ON aftercare_affirmations;
CREATE POLICY aftercare_affirmations_read ON aftercare_affirmations FOR SELECT
  TO authenticated USING (active = true);
DROP POLICY IF EXISTS aftercare_affirmations_service ON aftercare_affirmations;
CREATE POLICY aftercare_affirmations_service ON aftercare_affirmations FOR ALL
  TO service_role USING (true) WITH CHECK (true);

-- 3. Seed — ~30 affirmations across the seven categories.
--
-- Tone rules (enforced here AND by the negative test):
--   - No kink language, no persona voice, no pet names ("baby","good
--     girl","mommy" etc are forbidden).
--   - No telemetry references (no /10, no "Day N", no slip count).
--   - No shaming, no app-analytics callouts ("you've been logged in
--     for 14h").
--   - Plain comforting prose. Reads like a competent friend, not a scene.

INSERT INTO aftercare_affirmations (text, category, min_dwell_seconds) VALUES
  -- validation (5)
  ('You are safe right now.', 'validation', 10),
  ('What you feel is real, and it is okay to feel it.', 'validation', 10),
  ('You did the brave thing by stopping.', 'validation', 10),
  ('Pausing is allowed. Pausing is wise.', 'validation', 8),
  ('You are allowed to take up space here.', 'validation', 8),
  -- safety (4)
  ('You are not in danger. The room around you is steady.', 'safety', 12),
  ('Nothing bad is happening right now. This moment is quiet.', 'safety', 10),
  ('You can come back to yourself slowly. There is no rush.', 'safety', 12),
  ('Your body is yours. You decide what happens next.', 'safety', 10),
  -- softness (4)
  ('Be gentle with yourself for a few minutes.', 'softness', 8),
  ('You do not have to do anything else right now.', 'softness', 8),
  ('Soft is allowed. Slow is allowed.', 'softness', 8),
  ('There is nothing to perform here.', 'softness', 8),
  -- reality_anchor (5)
  ('Look around the room. Notice three objects you can see.', 'reality_anchor', 15),
  ('Feel the surface beneath you. Notice where your weight rests.', 'reality_anchor', 15),
  ('Listen for one sound nearby. Then a second one further away.', 'reality_anchor', 15),
  ('Notice the temperature of the air on your skin.', 'reality_anchor', 12),
  ('Today is a real day. The date and time are real. You are here.', 'reality_anchor', 12),
  -- hydration (3)
  ('Drink some water before you do anything else.', 'hydration', 10),
  ('Have a glass of water nearby. Take small sips.', 'hydration', 10),
  ('A snack with protein helps after intense focus.', 'hydration', 10),
  -- breath_cue (4)
  ('Breathe in slowly through your nose for four counts.', 'breath_cue', 8),
  ('Hold the breath gently for seven counts.', 'breath_cue', 10),
  ('Let the breath out slowly through your mouth for eight counts.', 'breath_cue', 12),
  ('Repeat the breath when you are ready. There is no count to reach.', 'breath_cue', 10),
  -- grounding (5)
  ('Press your feet flat against the floor. Notice the contact.', 'grounding', 12),
  ('Place a hand on your chest. Feel it rise and fall.', 'grounding', 12),
  ('Gently stretch your arms above your head, then let them rest.', 'grounding', 10),
  ('Wiggle your toes. Wiggle your fingers. Both at once.', 'grounding', 10),
  ('If you have a soft blanket nearby, wrap it around your shoulders.', 'grounding', 10)
ON CONFLICT DO NOTHING;
