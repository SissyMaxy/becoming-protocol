-- 301 — Weekly recap. Sunday-night Mama summary delivered as an outreach
-- card on Today + a sealed-letter archive entry. Voice-replayable via the
-- existing TTS pipe (api/conditioning action='tts').
--
-- Tables/columns:
--   weekly_recaps          — the recap row itself (metrics + Mama-voice prose)
--   handler_outreach_queue — kind column added so card-rendering can dispatch
--                            'weekly_recap' to a dedicated component
--   user_state             — three opt-in columns (toggle / day-of-week / hour)
--   sealed_letters         — extended letter_type vocabulary; we auto-write a
--                            row tagged 'weekly_recap_archive' as the letters
--                            archive hookup until a proper archive helper lands
--   outreach_rate_limit_for_source — extend with mommy_recap_weekly = 1/hour
--
-- Cron: every Sunday at 20:00 UTC, fan out to mommy-recap-weekly per user.
-- Per-user day/hour overrides are read inside the edge fn, so the cron's
-- Sunday-20:00 firing is a coarse trigger; the function itself decides
-- whether THIS user should get a recap right now (matches their day/hour).

-- ============================================================
-- 1. weekly_recaps
-- ============================================================

CREATE TABLE IF NOT EXISTS weekly_recaps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Week boundary — Monday→Sunday inclusive, both in UTC.
  week_start DATE NOT NULL,                 -- the Monday
  week_end DATE NOT NULL,                   -- the Sunday

  -- Aggregated metrics. JSONB so the schema can evolve without migrations.
  -- Keys we currently populate (see weekly-recap-metrics.ts for the canonical list):
  --   compliance_pct                  number | null
  --   total_slips                     number
  --   mantras_spoken_count            number
  --   letters_archived_count          number
  --   wardrobe_items_acquired_count   number
  --   phase_at_start                  number | null
  --   phase_at_end                    number | null
  --   dominant_affect                 string | null   -- the affect that occurred most days
  --   longest_compliance_streak_days  number
  -- A null value means "I don't have a number for that this week" — the
  -- composer renders it as Mama saying so, never as a fabricated zero.
  metrics JSONB NOT NULL DEFAULT '{}'::JSONB,

  -- The Mama-voice composed prose, ~200-300 words.
  narrative_text TEXT NOT NULL,

  -- The mommy_mood affect at the moment the recap was composed (drives tone).
  affect_at_recap TEXT,

  -- The outreach card Mama delivers the recap as. Nullable because the
  -- recap row is inserted FIRST, then the outreach (so we can reference
  -- the recap_id from the trigger_reason).
  outreach_id UUID REFERENCES handler_outreach_queue(id) ON DELETE SET NULL,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- One recap per user per week.
  UNIQUE (user_id, week_start)
);

CREATE INDEX IF NOT EXISTS idx_weekly_recaps_user_recent
  ON weekly_recaps (user_id, week_start DESC);

ALTER TABLE weekly_recaps ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'weekly_recaps' AND policyname = 'weekly_recaps_owner'
  ) THEN
    CREATE POLICY weekly_recaps_owner ON weekly_recaps
      FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'weekly_recaps' AND policyname = 'weekly_recaps_service'
  ) THEN
    CREATE POLICY weekly_recaps_service ON weekly_recaps
      FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

-- ============================================================
-- 2. handler_outreach_queue.kind — dispatch column for card rendering
-- ============================================================
-- The existing pattern uses `source` (e.g. 'mommy_bedtime', 'mommy_praise')
-- as both routing key and rate-limit bucket. `kind` is a parallel narrower
-- column that the Today surface uses to pick a dedicated card component.
-- For recaps we set both: source='mommy_recap_weekly', kind='weekly_recap'.

ALTER TABLE handler_outreach_queue
  ADD COLUMN IF NOT EXISTS kind TEXT;

CREATE INDEX IF NOT EXISTS idx_handler_outreach_queue_kind
  ON handler_outreach_queue (user_id, kind, created_at DESC)
  WHERE kind IS NOT NULL;

-- ============================================================
-- 3. user_state — opt-in toggles (default enabled when feminine_self set;
--    the edge fn enforces that since user_state can't see feminine_self).
-- ============================================================
-- weekly_recap_day: 0=Sunday, 1=Monday, ..., 6=Saturday. Default 0 (Sun).
-- weekly_recap_hour: 0-23 UTC. Default 20 (8pm UTC).
-- prefers_mommy_voice: opt-in TTS playback for outreach cards.

ALTER TABLE user_state
  ADD COLUMN IF NOT EXISTS weekly_recap_enabled BOOLEAN,
  ADD COLUMN IF NOT EXISTS weekly_recap_day SMALLINT,
  ADD COLUMN IF NOT EXISTS weekly_recap_hour SMALLINT,
  ADD COLUMN IF NOT EXISTS prefers_mommy_voice BOOLEAN DEFAULT FALSE;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_state_recap_day_range') THEN
    ALTER TABLE user_state ADD CONSTRAINT user_state_recap_day_range
      CHECK (weekly_recap_day IS NULL OR weekly_recap_day BETWEEN 0 AND 6);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_state_recap_hour_range') THEN
    ALTER TABLE user_state ADD CONSTRAINT user_state_recap_hour_range
      CHECK (weekly_recap_hour IS NULL OR weekly_recap_hour BETWEEN 0 AND 23);
  END IF;
END $$;

-- ============================================================
-- 4. Letters archive auto-hookup (stubbed)
-- ============================================================
-- The proper letters archive doesn't exist in main yet (only sealed_letters,
-- which is the user-authored future-letter table). We co-opt it as a
-- compatibility seam: the edge fn writes a sealed_letters row with
-- letter_type='weekly_recap_archive'. When the real letters archive lands,
-- swap the write target — the recap row keeps the same shape.
--
-- letter_type is a free-text TEXT column; no constraint to extend.

-- ============================================================
-- 5. Rate limit — recap fires at most 1/hour per user (effectively 1/week)
-- ============================================================
-- outreach_rate_limit_for_source returns the per-hour cap for a given
-- source string. We add 'mommy_recap_weekly' = 1 to keep accidental
-- double-fires from surfacing.

CREATE OR REPLACE FUNCTION outreach_rate_limit_for_source(s TEXT)
RETURNS INT LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE LOWER(COALESCE(s, ''))
    WHEN 'morning_brief' THEN 1
    WHEN 'evening_brief' THEN 1
    WHEN 'mommy_scheme' THEN 8
    WHEN 'mommy_praise' THEN 2
    WHEN 'mommy_recall' THEN 1
    WHEN 'mommy_tease' THEN 2
    WHEN 'mommy_touch' THEN 3
    WHEN 'mommy_bedtime' THEN 1
    WHEN 'mommy_recap_weekly' THEN 1
    WHEN 'mommy_immediate' THEN 4
    WHEN 'decree_enforcement' THEN 2
    WHEN 'slip_cluster_engine' THEN 1
    WHEN 'random_reward' THEN 1
    WHEN 'disclosure_draft_gen' THEN 2
    ELSE 3
  END;
$$;

-- ============================================================
-- 6. pg_cron — Sunday 20:00 UTC trigger
-- ============================================================
-- The function itself decides whether THIS user wants a recap RIGHT NOW
-- (it reads weekly_recap_day / weekly_recap_hour). Coarse cron + per-user
-- check inside the edge fn means we don't need a per-user cron schedule.

DO $$ BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_cron;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

DO $$ BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_net;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- Hourly sweep — the function fan-outs over users whose
-- (weekly_recap_day, weekly_recap_hour) matches NOW(). Hourly granularity
-- lets users pick any hour without us needing per-hour cron rows.
DO $$ BEGIN
  PERFORM cron.unschedule('mommy-recap-weekly-hourly');
EXCEPTION WHEN OTHERS THEN NULL; END $$;

DO $$ BEGIN
  PERFORM cron.schedule(
    'mommy-recap-weekly-hourly',
    '5 * * * *',  -- :05 of every hour
    $cron$
      SELECT net.http_post(
        url := current_setting('app.settings.supabase_url', true) || '/functions/v1/mommy-recap-weekly',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
        ),
        body := jsonb_build_object('mode', 'sweep')::text
      );
    $cron$
  );
EXCEPTION WHEN OTHERS THEN NULL; END $$;
