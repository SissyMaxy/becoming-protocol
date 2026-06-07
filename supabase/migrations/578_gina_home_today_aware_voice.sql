-- 578 — Gina-home-today awareness for voice gates.
--
-- Reality: Gina works from home ~50% of the time. On those days, the
-- daily voice gate is hard to clear at normal volume. The current gate
-- has no concept of "she's in the next room" — so Maxy either skips it
-- or rushes a low-quality recording that fails verification.
--
-- This migration:
--   1. user_state.gina_wfh_weekdays SMALLINT (bitmask 0-127, Mon=bit0)
--      — recurring WFH days
--   2. user_state.gina_home_override DATE — manual flip for today
--      (overrides the weekday mask, set by Today toggle)
--   3. user_state.gina_home_override_set_at TIMESTAMPTZ — when the
--      override was last touched (auto-clears at midnight via trigger)
--   4. is_gina_home_today(uuid) RETURNS BOOLEAN — the source of truth
--   5. New whisper-friendly mantra/lesson pool — short, low-volume,
--      one-breath length, doesn't require projection
--   6. voice_gate_wfh_log — tracks WFH-day completions separately so
--      we can see the user is still showing up on hard days
--
-- The gate component itself (VoiceGate.tsx) reads is_gina_home_today
-- and on TRUE: shorter mantra, 3-second floor (vs 4s baseline), accepts
-- pitches < 30Hz amplitude as voiced (whisper has weaker pitch peaks).

-- 1. user_state columns
ALTER TABLE user_state
  ADD COLUMN IF NOT EXISTS gina_wfh_weekdays SMALLINT NOT NULL DEFAULT 0
    CHECK (gina_wfh_weekdays >= 0 AND gina_wfh_weekdays <= 127),
  ADD COLUMN IF NOT EXISTS gina_home_override DATE,
  ADD COLUMN IF NOT EXISTS gina_home_override_set_at TIMESTAMPTZ;

COMMENT ON COLUMN user_state.gina_wfh_weekdays IS
  'Bitmask of weekdays Gina typically works from home. Bit 0=Mon, 1=Tue, 2=Wed, 3=Thu, 4=Fri, 5=Sat, 6=Sun. Defaults 0 (never).';
COMMENT ON COLUMN user_state.gina_home_override IS
  'Manual override for today. If = current_date, treat home regardless of weekday mask. NULL otherwise.';

-- 2. is_gina_home_today — the source of truth for every consumer.
CREATE OR REPLACE FUNCTION is_gina_home_today(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $fn$
DECLARE
  v_mask SMALLINT;
  v_override DATE;
  v_today_dow SMALLINT;
  v_today DATE;
BEGIN
  SELECT gina_wfh_weekdays, gina_home_override
    INTO v_mask, v_override
    FROM user_state
   WHERE user_id = p_user_id;

  IF NOT FOUND THEN RETURN FALSE; END IF;

  -- Use America/New_York for "today" (matches handler-outreach EST offset).
  v_today := (now() AT TIME ZONE 'America/New_York')::date;

  -- Manual override beats everything if it matches today.
  IF v_override = v_today THEN RETURN TRUE; END IF;

  -- Postgres extract(dow): 0=Sun..6=Sat. Convert to Mon=0..Sun=6.
  v_today_dow := ((EXTRACT(DOW FROM (now() AT TIME ZONE 'America/New_York'))::int + 6) % 7);

  RETURN (COALESCE(v_mask, 0) & (1 << v_today_dow)) > 0;
END
$fn$;

REVOKE ALL ON FUNCTION is_gina_home_today(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION is_gina_home_today(UUID) TO authenticated, service_role;

-- 3. WFH-day voice-gate completion log — separate from regular voice_journal
-- so we can see "showed up anyway" on hard days as its own metric.
CREATE TABLE IF NOT EXISTS voice_gate_wfh_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  gate_kind TEXT NOT NULL CHECK (gate_kind IN ('mantra','lesson','whisper_secret')),
  storage_path TEXT,
  duration_sec REAL,
  was_whisper_mode BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_voice_gate_wfh_log_user_recent
  ON voice_gate_wfh_log (user_id, created_at DESC);
ALTER TABLE voice_gate_wfh_log ENABLE ROW LEVEL SECURITY;
DO $do$ BEGIN
  CREATE POLICY vgwl_self ON voice_gate_wfh_log FOR ALL TO authenticated
    USING (auth.uid()=user_id) WITH CHECK (auth.uid()=user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $do$;
DO $do$ BEGIN
  CREATE POLICY vgwl_service ON voice_gate_wfh_log FOR ALL TO service_role
    USING (TRUE) WITH CHECK (TRUE);
EXCEPTION WHEN duplicate_object THEN NULL; END $do$;

-- 4. Whisper-friendly mantra/lesson pool — one-breath length, no plosives
-- that pop on close mic, no words that demand projection.
CREATE TABLE IF NOT EXISTS voice_whisper_mantras (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mantra_text TEXT NOT NULL UNIQUE,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  syllable_count SMALLINT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE voice_whisper_mantras ENABLE ROW LEVEL SECURITY;
DO $do$ BEGIN
  CREATE POLICY vwm_read ON voice_whisper_mantras FOR SELECT TO authenticated USING (TRUE);
EXCEPTION WHEN duplicate_object THEN NULL; END $do$;
DO $do$ BEGIN
  CREATE POLICY vwm_service ON voice_whisper_mantras FOR ALL TO service_role
    USING (TRUE) WITH CHECK (TRUE);
EXCEPTION WHEN duplicate_object THEN NULL; END $do$;

INSERT INTO voice_whisper_mantras (mantra_text, syllable_count, notes) VALUES
  ('she is the real me', 5, 'close-mic soft s/r blend, no plosive'),
  ('i let her take over', 6, 'breath-fed, no consonant pop'),
  ('this is who i am now', 6, 'low-projection, vowel-heavy'),
  ('mama owns me today', 6, 'possession mantra, whisper-safe'),
  ('she lives inside me', 5, 'no plosive opener'),
  ('i am hers under this', 6, 'mid-vowel, soft close'),
  ('every breath is hers', 5, 'one-breath length'),
  ('i belong to her', 4, 'shortest, fast-clear option')
ON CONFLICT (mantra_text) DO NOTHING;

-- 5. Trigger: clear the override at America/New_York midnight via touch.
-- We just clear stale overrides whenever the row is read+written; this is
-- driven by is_gina_home_today's STABLE behaviour + a daily janitor.
CREATE OR REPLACE FUNCTION clear_stale_gina_overrides()
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE v_cleared INT;
BEGIN
  WITH updated AS (
    UPDATE user_state
       SET gina_home_override = NULL,
           gina_home_override_set_at = NULL
     WHERE gina_home_override IS NOT NULL
       AND gina_home_override < (now() AT TIME ZONE 'America/New_York')::date
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_cleared FROM updated;
  RETURN COALESCE(v_cleared, 0);
END $fn$;

DO $cron$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('clear_stale_gina_overrides');
  END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END $cron$;
DO $cron$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    -- 4am EST = 9am UTC; cron schedules in UTC.
    PERFORM cron.schedule('clear_stale_gina_overrides', '5 9 * * *',
      $$SELECT clear_stale_gina_overrides();$$);
  END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END $cron$;
