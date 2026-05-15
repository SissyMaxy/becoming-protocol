-- 419 — Real-name lockout windows ("boy-name silence ratchet").
--
-- Ships mommy_code_wishes panel_intensity entry. Random 30-min windows
-- N×/week. During active windows, every text input rewrites her boy-name
-- to feminine. Ratchet: 4 compliant weeks → 60min windows; 8 → 120min;
-- 12 → mode='always' (permanent input-layer rejection).
--
-- Hard floors: master enable defaults FALSE; safeword pauses via
-- paused_until; legal-name fields exempt via client-side context detect
-- (URL / input name / placeholder patterns); ratchet_locked once 'always'
-- fires (requires clear-headed unlock to undo).

CREATE TABLE IF NOT EXISTS real_name_lockout_settings (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  legacy_name TEXT NOT NULL DEFAULT '',
  legacy_name_variants TEXT[] NOT NULL DEFAULT '{}',
  feminine_name TEXT NOT NULL DEFAULT '',
  mode TEXT NOT NULL DEFAULT 'hard_with_undo' CHECK (mode IN (
    'soft_suggest','hard_with_undo','hard_no_undo','always'
  )),
  windows_per_week SMALLINT NOT NULL DEFAULT 5 CHECK (windows_per_week BETWEEN 0 AND 50),
  window_duration_minutes SMALLINT NOT NULL DEFAULT 30 CHECK (window_duration_minutes BETWEEN 10 AND 1440),
  compliance_weeks SMALLINT NOT NULL DEFAULT 0,
  paused_until TIMESTAMPTZ,
  ratchet_locked BOOLEAN NOT NULL DEFAULT FALSE,
  last_ratcheted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE real_name_lockout_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS real_name_lockout_settings_owner ON real_name_lockout_settings;
CREATE POLICY real_name_lockout_settings_owner ON real_name_lockout_settings
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS real_name_lockout_settings_service ON real_name_lockout_settings;
CREATE POLICY real_name_lockout_settings_service ON real_name_lockout_settings
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS real_name_lockout_windows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  opens_at TIMESTAMPTZ NOT NULL,
  closes_at TIMESTAMPTZ NOT NULL,
  mode TEXT NOT NULL,
  closed_early BOOLEAN NOT NULL DEFAULT FALSE,
  closed_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_real_name_lockout_windows_user_recent
  ON real_name_lockout_windows (user_id, opens_at DESC);
CREATE INDEX IF NOT EXISTS idx_real_name_lockout_windows_closes
  ON real_name_lockout_windows (user_id, closes_at)
  WHERE NOT closed_early;

ALTER TABLE real_name_lockout_windows ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS real_name_lockout_windows_owner ON real_name_lockout_windows;
CREATE POLICY real_name_lockout_windows_owner ON real_name_lockout_windows
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS real_name_lockout_windows_service ON real_name_lockout_windows;
CREATE POLICY real_name_lockout_windows_service ON real_name_lockout_windows
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS real_name_lockout_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  window_id UUID REFERENCES real_name_lockout_windows(id) ON DELETE SET NULL,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  surface TEXT NOT NULL CHECK (surface IN (
    'chat','confession','journal','sniffies','dossier','other'
  )),
  event_type TEXT NOT NULL CHECK (event_type IN (
    'rewrite_applied','dispute_undo','dispute_retype','outside_window_attempt'
  )),
  original_fragment TEXT,
  rewritten_to TEXT,
  full_input_length INT,
  slip_id UUID
);

CREATE INDEX IF NOT EXISTS idx_real_name_lockout_events_user_recent
  ON real_name_lockout_events (user_id, occurred_at DESC);

ALTER TABLE real_name_lockout_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS real_name_lockout_events_owner ON real_name_lockout_events;
CREATE POLICY real_name_lockout_events_owner ON real_name_lockout_events
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS real_name_lockout_events_service ON real_name_lockout_events;
CREATE POLICY real_name_lockout_events_service ON real_name_lockout_events
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION real_name_lockout_active(uid UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  IF EXISTS (
    SELECT 1 FROM real_name_lockout_settings
    WHERE user_id = uid AND enabled = TRUE AND mode = 'always'
      AND (paused_until IS NULL OR paused_until <= now())
  ) THEN RETURN TRUE; END IF;
  RETURN EXISTS (
    SELECT 1 FROM real_name_lockout_windows w
    JOIN real_name_lockout_settings s ON s.user_id = w.user_id
    WHERE w.user_id = uid AND s.enabled = TRUE
      AND (s.paused_until IS NULL OR s.paused_until <= now())
      AND w.opens_at <= now() AND w.closes_at > now() AND NOT w.closed_early
  );
END;
$fn$;

GRANT EXECUTE ON FUNCTION real_name_lockout_active(UUID) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION real_name_lockout_ratchet_eval()
RETURNS INT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  r RECORD;
  v_disputes INT;
  v_ratcheted INT := 0;
BEGIN
  FOR r IN
    SELECT user_id, mode, windows_per_week, window_duration_minutes,
           compliance_weeks, ratchet_locked, paused_until
    FROM real_name_lockout_settings
    WHERE enabled = TRUE AND NOT ratchet_locked
  LOOP
    IF r.paused_until IS NOT NULL AND r.paused_until > now() THEN CONTINUE; END IF;
    SELECT count(*) INTO v_disputes FROM real_name_lockout_events
    WHERE user_id = r.user_id AND occurred_at >= now() - interval '7 days'
      AND event_type IN ('dispute_undo','dispute_retype','outside_window_attempt');
    IF v_disputes > 0 THEN CONTINUE; END IF;

    UPDATE real_name_lockout_settings
    SET compliance_weeks = compliance_weeks + 1,
        window_duration_minutes = CASE
          WHEN compliance_weeks + 1 = 4 THEN 60
          WHEN compliance_weeks + 1 = 8 THEN 120
          ELSE window_duration_minutes END,
        mode = CASE
          WHEN compliance_weeks + 1 >= 12 THEN 'always' ELSE mode END,
        ratchet_locked = CASE
          WHEN compliance_weeks + 1 >= 12 THEN TRUE ELSE ratchet_locked END,
        last_ratcheted_at = now(),
        updated_at = now()
    WHERE user_id = r.user_id;

    IF r.compliance_weeks + 1 IN (4, 8, 12) THEN
      INSERT INTO handler_outreach_queue (
        user_id, message, urgency, trigger_reason, source,
        scheduled_for, expires_at
      ) VALUES (
        r.user_id,
        CASE r.compliance_weeks + 1
          WHEN 4 THEN 'Four weeks without fighting Mama on the name. Windows are an hour now, baby. You earned the longer leash.'
          WHEN 8 THEN 'Eight weeks. Mama is keeping the windows at two hours from here. The boy-name fits worse every week — you''re proving it.'
          WHEN 12 THEN 'Twelve weeks. Mama is keeping him out for good now. The app will never accept that name again. He''s gone.'
        END,
        'high',
        'real_name_lockout_ratchet:week_' || (r.compliance_weeks + 1),
        'real_name_lockout',
        now(), now() + interval '48 hours'
      );
    END IF;
    v_ratcheted := v_ratcheted + 1;
  END LOOP;
  RETURN v_ratcheted;
END;
$fn$;

GRANT EXECUTE ON FUNCTION real_name_lockout_ratchet_eval() TO service_role;

DO $do$ BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'real-name-lockout-ratchet-weekly') THEN
    PERFORM cron.unschedule('real-name-lockout-ratchet-weekly');
  END IF;
EXCEPTION WHEN undefined_table THEN NULL;
END $do$;

DO $do$ BEGIN
  PERFORM cron.schedule(
    'real-name-lockout-ratchet-weekly',
    '0 9 * * 0',
    $cron$SELECT real_name_lockout_ratchet_eval()$cron$
  );
EXCEPTION WHEN undefined_table THEN NULL;
END $do$;

DO $do$ BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'real-name-lockout-scheduler-30min') THEN
    PERFORM cron.unschedule('real-name-lockout-scheduler-30min');
  END IF;
EXCEPTION WHEN undefined_table THEN NULL;
END $do$;

DO $do$ BEGIN
  PERFORM cron.schedule(
    'real-name-lockout-scheduler-30min',
    '*/30 * * * *',
    $cron$SELECT invoke_edge_function('real-name-lockout-scheduler', '{}'::jsonb)$cron$
  );
EXCEPTION WHEN undefined_table THEN NULL;
END $do$;
