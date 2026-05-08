-- Migration 259: External calendar integration (Google Calendar)
--
-- Tables:
--   calendar_credentials       — encrypted OAuth tokens, one row per (user, provider)
--   calendar_events_managed    — every event Mommy created on the user's calendar
--   freebusy_cache             — short-lived busy windows pulled from the user's calendar
--
-- Column add:
--   handler_outreach_queue.deliver_after  — defer delivery past a busy window without
--                                            blocking the insert.
--
-- Sibling branches: feature/stealth-mode-2026-04-30 may add stealth_settings later.
-- For now, neutral_calendar_titles defaults true on calendar_credentials. When stealth
-- merges, the runtime should consult stealth_settings.neutral_calendar_titles instead.
-- TODO(stealth-mode merge): consume stealth_settings.neutral_calendar_titles.

-- ============================================
-- 1. calendar_credentials
-- ============================================

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'calendar_provider') THEN
    CREATE TYPE calendar_provider AS ENUM ('google');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS calendar_credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider calendar_provider NOT NULL DEFAULT 'google',

  -- Encrypted at rest. Format: base64(iv || ciphertext_with_tag), AES-256-GCM.
  -- Encryption key lives in CALENDAR_TOKEN_KEY (32 bytes, base64).
  access_token_encrypted TEXT NOT NULL,
  refresh_token_encrypted TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  scopes TEXT[] NOT NULL DEFAULT '{}',

  -- The dedicated calendar Mommy creates and owns; never touch the user's other calendars.
  external_calendar_id TEXT,
  external_calendar_name TEXT,

  -- Default true until stealth_settings ships; see TODO above.
  neutral_calendar_titles BOOLEAN NOT NULL DEFAULT TRUE,

  -- User-overridable defaults (HH:MM 24h local-clock; minutes for duration).
  morning_ritual_local_time TEXT NOT NULL DEFAULT '06:30',
  morning_ritual_duration_min INTEGER NOT NULL DEFAULT 15,
  evening_reflection_local_time TEXT NOT NULL DEFAULT '21:00',
  evening_reflection_duration_min INTEGER NOT NULL DEFAULT 10,

  -- Mommy may place events. Off until user toggles on after connecting.
  events_enabled BOOLEAN NOT NULL DEFAULT FALSE,

  -- Free/busy aware delivery (default on).
  busy_aware_delivery BOOLEAN NOT NULL DEFAULT TRUE,

  connected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  disconnected_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (user_id, provider)
);

CREATE INDEX IF NOT EXISTS idx_calendar_credentials_user_active
  ON calendar_credentials(user_id) WHERE disconnected_at IS NULL;

ALTER TABLE calendar_credentials ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'calendar_credentials'
      AND policyname = 'Users own their data'
  ) THEN
    CREATE POLICY "Users own their data" ON calendar_credentials
      FOR ALL USING (auth.uid() = user_id);
  END IF;
END $$;

-- ============================================
-- 2. calendar_events_managed
-- ============================================

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'managed_event_type') THEN
    CREATE TYPE managed_event_type AS ENUM (
      'morning_ritual',
      'evening_reflection',
      'scheduled_punishment',
      'scheduled_reward',
      'aftercare_block',
      'mantra_recitation',
      'verification_window'
    );
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS calendar_events_managed (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- The provider's event id (Google: "events.id"). Unique per (user, provider).
  external_event_id TEXT NOT NULL,
  provider calendar_provider NOT NULL DEFAULT 'google',

  -- What's on the calendar (neutral when neutral_calendar_titles=true).
  title_external TEXT NOT NULL,
  -- What Mommy thinks of it as. NEVER pushed to the external calendar.
  title_internal TEXT NOT NULL,

  event_type managed_event_type NOT NULL,

  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  cancelled_at TIMESTAMPTZ,

  UNIQUE (user_id, provider, external_event_id)
);

CREATE INDEX IF NOT EXISTS idx_calendar_events_managed_user_starts
  ON calendar_events_managed(user_id, starts_at)
  WHERE cancelled_at IS NULL;

ALTER TABLE calendar_events_managed ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'calendar_events_managed'
      AND policyname = 'Users own their data'
  ) THEN
    CREATE POLICY "Users own their data" ON calendar_events_managed
      FOR ALL USING (auth.uid() = user_id);
  END IF;
END $$;

-- ============================================
-- 3. freebusy_cache
-- ============================================

CREATE TABLE IF NOT EXISTS freebusy_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  window_start TIMESTAMPTZ NOT NULL,
  window_end TIMESTAMPTZ NOT NULL,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (window_end > window_start)
);

-- Lookup is "is the user busy at time T?" → range query on (user_id, window_start, window_end).
CREATE INDEX IF NOT EXISTS idx_freebusy_cache_user_window
  ON freebusy_cache(user_id, window_start, window_end);
CREATE INDEX IF NOT EXISTS idx_freebusy_cache_fetched
  ON freebusy_cache(user_id, fetched_at DESC);

ALTER TABLE freebusy_cache ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'freebusy_cache'
      AND policyname = 'Users own their data'
  ) THEN
    CREATE POLICY "Users own their data" ON freebusy_cache
      FOR ALL USING (auth.uid() = user_id);
  END IF;
END $$;

-- ============================================
-- 4. handler_outreach_queue.deliver_after
-- ============================================
-- Set when an outreach lands during a busy window. Consumer queries must respect:
--   (deliver_after IS NULL OR deliver_after <= now())
-- The insert path is unchanged (no blocking); only delivery is gated.

ALTER TABLE handler_outreach_queue
  ADD COLUMN IF NOT EXISTS deliver_after TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_outreach_queue_deliver_after
  ON handler_outreach_queue(user_id, deliver_after)
  WHERE deliver_after IS NOT NULL;

-- ============================================
-- 5. Cron schedules — daily sync + ritual placement
-- ============================================

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'calendar-sync-daily') THEN
    PERFORM cron.unschedule('calendar-sync-daily');
  END IF;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$ BEGIN
  PERFORM cron.schedule(
    'calendar-sync-daily',
    '15 4 * * *',  -- 04:15 UTC daily
    $cron$SELECT net.http_post(
      url := 'https://atevwvexapiykchvqvhm.supabase.co/functions/v1/calendar-sync',
      body := '{}'::jsonb,
      headers := jsonb_build_object(
        'Authorization', 'Bearer PLACEHOLDER_SERVICE_KEY',
        'Content-Type', 'application/json'
      )
    )$cron$
  );
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'calendar-place-rituals-daily') THEN
    PERFORM cron.unschedule('calendar-place-rituals-daily');
  END IF;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$ BEGIN
  PERFORM cron.schedule(
    'calendar-place-rituals-daily',
    '30 4 * * *',  -- 04:30 UTC daily, after sync
    $cron$SELECT net.http_post(
      url := 'https://atevwvexapiykchvqvhm.supabase.co/functions/v1/calendar-place-rituals',
      body := '{}'::jsonb,
      headers := jsonb_build_object(
        'Authorization', 'Bearer PLACEHOLDER_SERVICE_KEY',
        'Content-Type', 'application/json'
      )
    )$cron$
  );
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

NOTIFY pgrst, 'reload schema';
