-- 314 — Bedtime ritual lock.
--
-- A configurable bedtime window during which the app shows a soft
-- full-screen overlay that walks the user through a sequence:
-- mantra recital + posture check + chastity confirm + breath cycle.
--
-- Hard rules (enforced in code, surfaced here for the audit trail):
--   - Always skippable. NO penalty for skipping.
--   - The lockout is a soft prompt overlay — tapping outside dismisses
--     with a 'skipped' log. It never actually locks the user out.
--   - Never mounts during a safeword-aftercare flow.
--   - Phase-gated: phase 1 users get a lighter (mantra-only) version.
--   - Skipping is a soft signal that the next morning's mommy-mood may
--     reference; it never triggers a punishment ladder.

-- ─── 1. user_state additions ─────────────────────────────────────────────
-- bedtime_window: enabled flag + 24h hour range. start_hour..end_hour
-- straddles midnight when end_hour > 24 (e.g. {22, 26} = 22:00-02:00).
-- Default off. UI and ritual loader both gate on .enabled.
ALTER TABLE user_state
  ADD COLUMN IF NOT EXISTS bedtime_window JSONB
    NOT NULL DEFAULT '{"start_hour": 22, "end_hour": 24, "enabled": false}'::jsonb;

-- Surface flag for whether the user prefers voice capture for mantra
-- recital (vs. tap-to-confirm). Read by the BedtimeLock UI to swap the
-- mantra step into the voice-recorder. Default false — opt-in.
-- Coexists with future voice-pref work; this is a single boolean and
-- a sibling branch can rename / extend without touching this column.
ALTER TABLE user_state
  ADD COLUMN IF NOT EXISTS prefers_voice BOOLEAN
    NOT NULL DEFAULT FALSE;

-- ─── 2. bedtime_ritual_completions ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS bedtime_ritual_completions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,

  -- Ordered list of {step, completed_at} entries. Step keys:
  --   'mantra' | 'posture' | 'chastity' | 'breath'
  -- Stored as JSONB so phase-1 light variants (mantra only) and
  -- future variants (e.g. journal step) don't need schema changes.
  steps_completed JSONB NOT NULL DEFAULT '[]'::jsonb,

  -- Skip path — soft, no penalty. skip_reason is freeform; UI offers
  -- presets ('not tonight', 'too tired', 'safeword') but allows custom.
  skipped_at TIMESTAMPTZ,
  skip_reason TEXT,

  -- Phase snapshot at start so the morning surface (mommy-mood) can
  -- reference the variant the user actually saw. Optional.
  phase_at_start INTEGER,

  -- Soft pointer back to the mommy-bedtime outreach the user was
  -- routed to on completion (NULL on skip / partial). Allows the
  -- morning surface to know whether the goodnight message was seen.
  goodnight_outreach_id UUID,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Lookup: "is there an open completion for tonight?" — the mount-gate
-- walks this index for (user_id, started_at) ordered desc.
CREATE INDEX IF NOT EXISTS idx_bedtime_ritual_user_started
  ON bedtime_ritual_completions (user_id, started_at DESC);

-- "Tonight's row" partial index — open OR resolved-since-midnight rows.
CREATE INDEX IF NOT EXISTS idx_bedtime_ritual_user_open
  ON bedtime_ritual_completions (user_id, started_at DESC)
  WHERE completed_at IS NULL AND skipped_at IS NULL;

ALTER TABLE bedtime_ritual_completions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS bedtime_ritual_owner ON bedtime_ritual_completions;
CREATE POLICY bedtime_ritual_owner ON bedtime_ritual_completions FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS bedtime_ritual_service ON bedtime_ritual_completions;
CREATE POLICY bedtime_ritual_service ON bedtime_ritual_completions FOR ALL
  TO service_role USING (true) WITH CHECK (true);
