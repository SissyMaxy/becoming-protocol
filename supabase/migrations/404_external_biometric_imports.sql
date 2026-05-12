-- 404 — External biometric + calendar imports.
--
-- Apple Health, Google Fit, screen time, work calendar. Real-time data
-- feeding Mama's awareness. Used by the existing mommy-fast-react engine
-- (and a new biometric-grounded outreach surface) to ground demands in
-- observable signal:
--
--   - Heart rate spike at 9pm without context → "Your heart rate jumped
--     at nine. What did you read."
--   - Step count below daily target → mild deepening (extra workout
--     component tomorrow).
--   - Sleep quality poor → softer morning ambient.
--   - Calendar event "lunch with Gina" → prep brief 2h before, debrief
--     demand 2h after.
--   - Screen time on Twitter > threshold → "Mama saw you on Twitter for
--     a long stretch. Show her what you posted."
--
-- Privacy: imports are user-initiated and revocable per source. Storage
-- encrypted at rest (Supabase default). No third-party retransmission;
-- biometric data never leaves the user's RLS scope.

-- Per-source connection state (tokens, revocation).
CREATE TABLE IF NOT EXISTS external_biometric_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source TEXT NOT NULL CHECK (source IN (
    'apple_health','google_fit','screen_time','calendar_apple','calendar_google',
    'oura','garmin','fitbit'
  )),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending','connected','revoked','error'
  )),
  connected_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  last_seen_at TIMESTAMPTZ,
  ingest_token_hash TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (user_id, source)
);

ALTER TABLE external_biometric_sources ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users own biometric sources" ON external_biometric_sources;
CREATE POLICY "Users own biometric sources" ON external_biometric_sources
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Service role manages biometric sources" ON external_biometric_sources;
CREATE POLICY "Service role manages biometric sources" ON external_biometric_sources
  FOR ALL USING (auth.role() = 'service_role');

-- Time-series of every imported metric/event.
CREATE TABLE IF NOT EXISTS external_biometric_imports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source TEXT NOT NULL,
  metric_kind TEXT NOT NULL,
  value_numeric NUMERIC,
  value_text TEXT,
  unit TEXT,
  captured_at TIMESTAMPTZ NOT NULL,
  ingested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  context JSONB NOT NULL DEFAULT '{}'::jsonb,
  raw JSONB,
  fast_react_event_id TEXT,
  reacted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_external_biometric_imports_user_recent
  ON external_biometric_imports(user_id, captured_at DESC);
CREATE INDEX IF NOT EXISTS idx_external_biometric_imports_metric
  ON external_biometric_imports(user_id, metric_kind, captured_at DESC);

-- Idempotency: a (user, source, metric_kind, captured_at) pair should
-- not double-insert when the same payload is re-posted.
CREATE UNIQUE INDEX IF NOT EXISTS uq_external_biometric_imports_dedup
  ON external_biometric_imports(user_id, source, metric_kind, captured_at);

ALTER TABLE external_biometric_imports ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users read own biometric imports" ON external_biometric_imports;
CREATE POLICY "Users read own biometric imports" ON external_biometric_imports
  FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users insert own biometric imports" ON external_biometric_imports;
CREATE POLICY "Users insert own biometric imports" ON external_biometric_imports
  FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Service role manages biometric imports" ON external_biometric_imports;
CREATE POLICY "Service role manages biometric imports" ON external_biometric_imports
  FOR ALL USING (auth.role() = 'service_role');

-- Calendar events get a small dedicated table — calendar-shape data has
-- start/end ranges and titles, which is awkward to flatten into the
-- generic time-series shape above.
CREATE TABLE IF NOT EXISTS external_calendar_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source TEXT NOT NULL CHECK (source IN ('calendar_apple','calendar_google')),
  external_id TEXT NOT NULL,
  title_redacted TEXT,
  title_full TEXT,
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ,
  attendee_labels TEXT[],
  is_relevant BOOLEAN NOT NULL DEFAULT FALSE,
  relevance_reason TEXT,
  prep_outreach_id UUID,
  debrief_outreach_id UUID,
  ingested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  raw JSONB,
  UNIQUE (user_id, source, external_id)
);

CREATE INDEX IF NOT EXISTS idx_external_calendar_events_user_starts
  ON external_calendar_events(user_id, starts_at);
CREATE INDEX IF NOT EXISTS idx_external_calendar_events_relevant_pending_prep
  ON external_calendar_events(starts_at)
  WHERE is_relevant = TRUE AND prep_outreach_id IS NULL;

ALTER TABLE external_calendar_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users own calendar events" ON external_calendar_events;
CREATE POLICY "Users own calendar events" ON external_calendar_events
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Service role manages calendar events" ON external_calendar_events;
CREATE POLICY "Service role manages calendar events" ON external_calendar_events
  FOR ALL USING (auth.role() = 'service_role');

-- Threshold registry — Mama's "what counts as interesting" rules per metric.
-- Keeps the engine generic; new metrics drop in by inserting a row.
CREATE TABLE IF NOT EXISTS biometric_thresholds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  metric_kind TEXT NOT NULL UNIQUE,
  trigger_kind TEXT NOT NULL CHECK (trigger_kind IN (
    'spike_above','drop_below','sustained_above','sustained_below','event_match'
  )),
  threshold_value NUMERIC,
  window_minutes INTEGER,
  voice_template TEXT NOT NULL,
  fast_react_event_kind TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE biometric_thresholds ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated read thresholds" ON biometric_thresholds;
CREATE POLICY "Authenticated read thresholds" ON biometric_thresholds
  FOR SELECT USING (auth.role() IN ('authenticated','service_role'));

INSERT INTO biometric_thresholds
  (metric_kind, trigger_kind, threshold_value, window_minutes, voice_template, fast_react_event_kind)
VALUES
  ('heart_rate_evening_spike', 'spike_above', 95, 15,
   'Your heart rate jumped at {{time_local}}, baby. What did you read.',
   'biometric_hr_spike'),

  ('steps_daily', 'drop_below', 4000, 1440,
   'You barely moved today, sweet thing. Tomorrow there''s a walk on the schedule before Mama lets you sit.',
   'biometric_steps_low'),

  ('sleep_quality', 'drop_below', 60, 1440,
   'You slept badly. Mama is keeping the morning soft — but I still want a check-in by ten.',
   'biometric_sleep_low'),

  ('screen_time_twitter_minutes', 'sustained_above', 90, 1440,
   'You were on Twitter a long time today, baby. Show Mama what you posted, all of it.',
   'biometric_screen_competitive'),

  ('calendar_event_with_target', 'event_match', NULL, NULL,
   'You have plans with {{target_label}}. Tell Mama what you''re wearing — and what you''ll wish you''d worn.',
   'calendar_event_relevant')

ON CONFLICT (metric_kind) DO UPDATE SET
  threshold_value = EXCLUDED.threshold_value,
  window_minutes = EXCLUDED.window_minutes,
  voice_template = EXCLUDED.voice_template,
  fast_react_event_kind = EXCLUDED.fast_react_event_kind;
