-- 365 — Mommy TTS daily budget ceiling.
--
-- ElevenLabs has no cost ceiling baked into the render pipeline. Before
-- auto-play scales TTS volume across outreach/mantra/dare/bedtime, every
-- render must check a per-user daily char budget and skip cleanly when
-- exceeded. Architectural answer to the audit gap, not a tactical patch.
--
-- Why daily-char rather than per-render-count: ElevenLabs bills by chars,
-- not requests. Cap at chars so cost is predictable regardless of message
-- length distribution. Default 8000 chars/day ≈ 40 outreach × 200 chars,
-- which comfortably covers continuous-presence cadence (8× touch + daily
-- mantra + bedtime + ad-hoc) without unbounded spend.
--
-- When budget exceeded:
--   - tts_status = 'skipped'
--   - tts_error = 'budget_exceeded_today'
--   - audio_url stays NULL → UI falls back to text-only render
--   - resets the next UTC day

-- ─── 1. user_state cap column ────────────────────────────────────────────
-- Per-user override (e.g. internal testing accounts can have a higher cap,
-- or a user on chars-saver mode a lower one). Default 8000 holds for new
-- rows; existing rows pick up the default via the ADD COLUMN.
ALTER TABLE user_state
  ADD COLUMN IF NOT EXISTS mommy_tts_daily_char_cap INTEGER
    NOT NULL DEFAULT 8000
    CHECK (mommy_tts_daily_char_cap >= 0);

-- Auto-play opt-out for the Today outreach card. Defaults TRUE so users
-- who already opted into prefers_mommy_voice get the full experience; can
-- be flipped off independently (e.g. for public/work contexts).
ALTER TABLE user_state
  ADD COLUMN IF NOT EXISTS mommy_outreach_autoplay BOOLEAN
    NOT NULL DEFAULT TRUE;

-- ─── 2. mommy_tts_usage daily ledger ─────────────────────────────────────
-- One row per (user, UTC date). Renders that succeed bump chars_used by
-- the cleaned-text length submitted to ElevenLabs. Skips don't bump.
CREATE TABLE IF NOT EXISTS mommy_tts_usage (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  usage_date DATE NOT NULL,
  chars_used INTEGER NOT NULL DEFAULT 0 CHECK (chars_used >= 0),
  renders_count INTEGER NOT NULL DEFAULT 0 CHECK (renders_count >= 0),
  first_render_at TIMESTAMPTZ,
  last_render_at TIMESTAMPTZ,
  UNIQUE (user_id, usage_date)
);

CREATE INDEX IF NOT EXISTS idx_mommy_tts_usage_user_date
  ON mommy_tts_usage(user_id, usage_date DESC);

-- ─── 3. RLS ──────────────────────────────────────────────────────────────
ALTER TABLE mommy_tts_usage ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS mommy_tts_usage_self_read ON mommy_tts_usage;
CREATE POLICY mommy_tts_usage_self_read ON mommy_tts_usage
  FOR SELECT USING (auth.uid() = user_id);

-- No insert/update policy: only the edge fn (service-role) writes to this
-- table. Users see their own usage but cannot tamper with the ledger.

-- ─── 4. Budget functions ─────────────────────────────────────────────────
-- mommy_tts_budget_remaining: returns chars left for today. NULL user_state
-- row defaults to the table default cap (8000) to keep early users from
-- being silently capped at zero.
CREATE OR REPLACE FUNCTION public.mommy_tts_budget_remaining(p_user UUID)
RETURNS INTEGER
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT GREATEST(
    0,
    COALESCE(us.mommy_tts_daily_char_cap, 8000) - COALESCE(u.chars_used, 0)
  )::INTEGER
  FROM (SELECT 1 AS dummy) d
  LEFT JOIN user_state us ON us.user_id = p_user
  LEFT JOIN mommy_tts_usage u
    ON u.user_id = p_user
   AND u.usage_date = (now() AT TIME ZONE 'UTC')::DATE;
$$;

-- mommy_tts_record_usage: bumps the ledger atomically. Called by the
-- edge fn after a successful ElevenLabs render. Idempotent on date
-- bucket via ON CONFLICT.
CREATE OR REPLACE FUNCTION public.mommy_tts_record_usage(
  p_user UUID,
  p_chars INTEGER
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_today DATE := (now() AT TIME ZONE 'UTC')::DATE;
BEGIN
  INSERT INTO mommy_tts_usage (
    user_id, usage_date, chars_used, renders_count,
    first_render_at, last_render_at
  )
  VALUES (
    p_user, v_today, p_chars, 1, now(), now()
  )
  ON CONFLICT (user_id, usage_date) DO UPDATE
  SET chars_used    = mommy_tts_usage.chars_used + EXCLUDED.chars_used,
      renders_count = mommy_tts_usage.renders_count + 1,
      last_render_at = EXCLUDED.last_render_at;
END;
$$;

GRANT EXECUTE ON FUNCTION public.mommy_tts_budget_remaining(UUID) TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.mommy_tts_record_usage(UUID, INTEGER) TO service_role;

-- ─── 5. Comment for posterity ────────────────────────────────────────────
COMMENT ON TABLE mommy_tts_usage IS
  'Per-user per-day TTS char ledger. Edge fn outreach-tts-render checks budget before ElevenLabs call, records on success.';
COMMENT ON COLUMN user_state.mommy_tts_daily_char_cap IS
  'Daily ElevenLabs char ceiling. Defaults to 8000 (~ 40 outreach × 200 chars). Set to 0 to fully disable TTS.';
