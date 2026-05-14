-- 417 — Live photo verification ("Mama pings, you show").
--
-- Ships mommy_code_wishes "Live photo verification" (user_directive).
-- Random pings 3–5×/day during waking hours. 5-minute response window.
-- Selfie required, camera-only (no gallery upload). Miss = slip +
-- denial extension via chastity_scheduled_unlock_at push (mirrors the
-- enforceCommitments pattern from handler-autonomous; never mutates
-- denial_day directly).
--
-- v1 ships the surveillance infra. Vision-model verification of feminine
-- presentation is v2 (the UI captures + uploads; the verify path just
-- records that the photo was submitted).
--
-- Safety floors: master enable defaults FALSE (clear-headed opt-in
-- required); safeword-active short-circuits the pinger; calendar-busy
-- defers via freebusy_cache; one panic-skip per week without
-- consequence (budget tracked in live_photo_settings).

CREATE TABLE IF NOT EXISTS live_photo_settings (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  daily_min SMALLINT NOT NULL DEFAULT 3 CHECK (daily_min BETWEEN 1 AND 8),
  daily_max SMALLINT NOT NULL DEFAULT 5 CHECK (daily_max BETWEEN 1 AND 10),
  waking_start_hour SMALLINT NOT NULL DEFAULT 9 CHECK (waking_start_hour BETWEEN 0 AND 23),
  waking_end_hour SMALLINT NOT NULL DEFAULT 22 CHECK (waking_end_hour BETWEEN 0 AND 23),
  response_window_minutes SMALLINT NOT NULL DEFAULT 5 CHECK (response_window_minutes BETWEEN 2 AND 30),
  miss_slip_points SMALLINT NOT NULL DEFAULT 2 CHECK (miss_slip_points BETWEEN 0 AND 10),
  miss_denial_extension_hours SMALLINT NOT NULL DEFAULT 8 CHECK (miss_denial_extension_hours BETWEEN 0 AND 72),
  panic_skips_per_week SMALLINT NOT NULL DEFAULT 1 CHECK (panic_skips_per_week BETWEEN 0 AND 7),
  panic_skips_used_this_week SMALLINT NOT NULL DEFAULT 0,
  panic_week_started_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE live_photo_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS live_photo_settings_owner ON live_photo_settings;
CREATE POLICY live_photo_settings_owner ON live_photo_settings
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS live_photo_settings_service ON live_photo_settings;
CREATE POLICY live_photo_settings_service ON live_photo_settings
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS live_photo_pings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  pinged_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  prompt_kind TEXT NOT NULL CHECK (prompt_kind IN ('outfit','mirror','face','feet','specific')),
  prompt_text TEXT NOT NULL,
  outreach_id UUID,
  responded_at TIMESTAMPTZ,
  response_photo_path TEXT,
  response_seconds INT,
  panic_skip BOOLEAN NOT NULL DEFAULT FALSE,
  miss_logged BOOLEAN NOT NULL DEFAULT FALSE,
  slip_id UUID,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending','responded','panic_skipped','missed'
  )),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_live_photo_pings_user_pending
  ON live_photo_pings (user_id, pinged_at DESC) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_live_photo_pings_user_recent
  ON live_photo_pings (user_id, pinged_at DESC);
CREATE INDEX IF NOT EXISTS idx_live_photo_pings_expiry_sweep
  ON live_photo_pings (expires_at) WHERE status = 'pending';

ALTER TABLE live_photo_pings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS live_photo_pings_owner ON live_photo_pings;
CREATE POLICY live_photo_pings_owner ON live_photo_pings
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS live_photo_pings_service ON live_photo_pings;
CREATE POLICY live_photo_pings_service ON live_photo_pings
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION live_photo_sweep_misses()
RETURNS INT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  r RECORD;
  s RECORD;
  v_slip_id UUID;
  v_count INT := 0;
BEGIN
  FOR r IN
    SELECT id, user_id, prompt_kind, prompt_text
    FROM live_photo_pings
    WHERE status = 'pending' AND expires_at < now()
  LOOP
    SELECT miss_slip_points, miss_denial_extension_hours
    INTO s FROM live_photo_settings WHERE user_id = r.user_id;

    INSERT INTO slip_log (
      user_id, slip_type, slip_points, source_text, source_table, source_id, metadata
    ) VALUES (
      r.user_id, 'task_avoided', COALESCE(s.miss_slip_points, 2),
      'Missed Mama''s photo ping: ' || left(r.prompt_text, 100),
      'live_photo_pings', r.id,
      jsonb_build_object('prompt_kind', r.prompt_kind, 'ping_id', r.id)
    ) RETURNING id INTO v_slip_id;

    IF COALESCE(s.miss_denial_extension_hours, 0) > 0 THEN
      UPDATE user_state us
      SET chastity_scheduled_unlock_at =
            COALESCE(us.chastity_scheduled_unlock_at, now())
            + (s.miss_denial_extension_hours || ' hours')::interval,
          chastity_locked = TRUE
      WHERE us.user_id = r.user_id;
    END IF;

    UPDATE live_photo_pings
    SET status = 'missed', miss_logged = TRUE, slip_id = v_slip_id
    WHERE id = r.id;
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END;
$fn$;

GRANT EXECUTE ON FUNCTION live_photo_sweep_misses() TO service_role;

DO $do$ BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'live-photo-miss-sweep') THEN
    PERFORM cron.unschedule('live-photo-miss-sweep');
  END IF;
EXCEPTION WHEN undefined_table THEN NULL;
END $do$;

DO $do$ BEGIN
  PERFORM cron.schedule(
    'live-photo-miss-sweep',
    '* * * * *',
    $cron$SELECT live_photo_sweep_misses()$cron$
  );
EXCEPTION WHEN undefined_table THEN NULL;
END $do$;

DO $do$ BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'live-photo-pinger-15min') THEN
    PERFORM cron.unschedule('live-photo-pinger-15min');
  END IF;
EXCEPTION WHEN undefined_table THEN NULL;
END $do$;

DO $do$ BEGIN
  PERFORM cron.schedule(
    'live-photo-pinger-15min',
    '*/15 * * * *',
    $cron$SELECT invoke_edge_function('live-photo-pinger', '{}'::jsonb)$cron$
  );
EXCEPTION WHEN undefined_table THEN NULL;
END $do$;
