-- 688_ambient_window.sql
--
-- The ambient window: a small always-on companion surface kept in the corner
-- of the screen while doing other things. Three portrait channels, one line of
-- her text at a time.
--
-- WHY this is worth a table: it is the app's highest-exposure surface by an
-- order of magnitude. A session is minutes; this runs for hours. Everything
-- else Mommy says has to be gone looking for.
--
-- Two tables:
--   1. ambient_panels — per-channel config the user tunes (intensity, cadence,
--      visual source, mute). Three rows per user, one per channel.
--   2. ambient_lines — the generated line pool. Pre-generated in batches and
--      cycled, because the failure mode of this surface is habituation: a
--      fixed set of lines goes dead once they're memorized. Lines carry a
--      shown-count and last-shown so the picker can suppress recent ones and
--      down-weight dismissed ones.
--
-- Craft rules for the line text (word cap, present tense, no hedges, must do a
-- job, no dangling tail) are enforced in TS before insert — see
-- checkConditioningLine in lib/persona/mommy-craft-check.ts. Kept there rather
-- than in a CHECK because the rules are heuristic and evolve; a bad line
-- should be regenerated, not rejected by the database at 3am.

-- ============================================
-- 1. Per-channel config
-- ============================================
CREATE TABLE IF NOT EXISTS ambient_panels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  channel TEXT NOT NULL CHECK (channel IN ('identity', 'estrogen', 'turnout')),

  -- soft -> command. Drives which lines are eligible and how hard they read.
  intensity TEXT NOT NULL DEFAULT 'mid' CHECK (intensity IN ('soft', 'mid', 'command')),

  -- Seconds a line holds before the next lands. Ambient inverts the trance
  -- curve: a corner panel must survive PERIPHERAL vision, so it holds far
  -- longer than a flashed trance word (which is 0.2-0.5s at peak).
  cadence_s INT NOT NULL DEFAULT 8 CHECK (cadence_s BETWEEN 4 AND 30),

  visual_source TEXT NOT NULL DEFAULT 'abstract'
    CHECK (visual_source IN ('abstract', 'her_clips', 'my_uploads', 'my_vault')),

  muted BOOLEAN NOT NULL DEFAULT FALSE,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (user_id, channel)
);

CREATE INDEX IF NOT EXISTS idx_ambient_panels_user ON ambient_panels(user_id);

ALTER TABLE ambient_panels ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users own ambient panels" ON ambient_panels;
CREATE POLICY "Users own ambient panels" ON ambient_panels
  FOR ALL USING (auth.uid() = user_id);

-- ============================================
-- 2. The line pool
-- ============================================
CREATE TABLE IF NOT EXISTS ambient_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  channel TEXT NOT NULL CHECK (channel IN ('identity', 'estrogen', 'turnout')),
  intensity TEXT NOT NULL DEFAULT 'mid' CHECK (intensity IN ('soft', 'mid', 'command')),

  text TEXT NOT NULL,

  -- Which of the five jobs the line does, classified at insert by
  -- checkConditioningLine. Lets the picker vary job type across a rotation
  -- instead of firing five identity claims in a row.
  job TEXT CHECK (job IN ('command', 'identity_claim', 'desire_claim',
                          'inevitability', 'permission', 'schedule')),

  -- Habituation control.
  shown_count INT NOT NULL DEFAULT 0,
  last_shown_at TIMESTAMPTZ,
  dismissed_count INT NOT NULL DEFAULT 0,

  -- Picker weight. Dismissals drive this down; it never goes to zero so a
  -- line can recover if taste changes.
  weight NUMERIC NOT NULL DEFAULT 1.0 CHECK (weight >= 0.05),

  -- Lines built from his own confessions carry their origin, so the surface
  -- can favour his own language — the least corny source available.
  source TEXT NOT NULL DEFAULT 'generated'
    CHECK (source IN ('generated', 'own_words', 'seed')),

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (user_id, channel, text)
);

CREATE INDEX IF NOT EXISTS idx_ambient_lines_pick
  ON ambient_lines(user_id, channel, intensity, last_shown_at NULLS FIRST);
CREATE INDEX IF NOT EXISTS idx_ambient_lines_user ON ambient_lines(user_id, created_at DESC);

ALTER TABLE ambient_lines ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users own ambient lines" ON ambient_lines;
CREATE POLICY "Users own ambient lines" ON ambient_lines
  FOR ALL USING (auth.uid() = user_id);

-- ============================================
-- 3. Picker
-- ============================================
-- Returns the next line for a channel: never one shown in the last
-- p_cooldown_min minutes, weighted toward lines that land and away from ones
-- dismissed, with a random tiebreak so the order never becomes learnable.
--
-- Falls back to the least-recently-shown line if everything is in cooldown —
-- an empty panel is worse than a repeat.
CREATE OR REPLACE FUNCTION ambient_next_line(
  p_user UUID,
  p_channel TEXT,
  p_intensity TEXT DEFAULT NULL,
  p_cooldown_min INT DEFAULT 90
)
RETURNS TABLE (id UUID, text TEXT, job TEXT)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
AS $$
BEGIN
  RETURN QUERY
  SELECT l.id, l.text, l.job
  FROM ambient_lines l
  WHERE l.user_id = p_user
    AND l.channel = p_channel
    AND (p_intensity IS NULL OR l.intensity = p_intensity)
    AND (l.last_shown_at IS NULL
         OR l.last_shown_at < NOW() - (p_cooldown_min || ' minutes')::INTERVAL)
  ORDER BY l.weight DESC, RANDOM()
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN QUERY
    SELECT l.id, l.text, l.job
    FROM ambient_lines l
    WHERE l.user_id = p_user
      AND l.channel = p_channel
      AND (p_intensity IS NULL OR l.intensity = p_intensity)
    ORDER BY l.last_shown_at NULLS FIRST, l.weight DESC
    LIMIT 1;
  END IF;
END;
$$;

-- Mark a line shown. Separate from the picker so the picker can stay STABLE
-- and be called from read paths.
CREATE OR REPLACE FUNCTION ambient_mark_shown(p_user UUID, p_line UUID)
RETURNS VOID
LANGUAGE sql
VOLATILE
SECURITY INVOKER
AS $$
  UPDATE ambient_lines
  SET shown_count = shown_count + 1,
      last_shown_at = NOW()
  WHERE id = p_line AND user_id = p_user;
$$;

-- Dismissal down-weights, floored so a line can come back later.
CREATE OR REPLACE FUNCTION ambient_dismiss_line(p_user UUID, p_line UUID)
RETURNS VOID
LANGUAGE sql
VOLATILE
SECURITY INVOKER
AS $$
  UPDATE ambient_lines
  SET dismissed_count = dismissed_count + 1,
      weight = GREATEST(0.05, weight * 0.6)
  WHERE id = p_line AND user_id = p_user;
$$;

COMMENT ON TABLE ambient_lines IS
  'Line pool for the ambient window. Pre-generated in batches and cycled with a cooldown, because habituation (not scarcity) is this surface''s failure mode. Craft rules are enforced in TS at insert — see checkConditioningLine.';
