-- Migration 133: Device Control Engine
-- Autonomous Lovense scheduling: morning anchors, ambient conditioning,
-- denial scaling, enforcement mode, session pull.

CREATE TABLE IF NOT EXISTS device_schedule (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  schedule_type TEXT NOT NULL,
  -- Types: morning_anchor, ambient_pulse, denial_ramp, enforcement,
  --        session_pull, vulnerability, scheduled_session

  -- Timing
  scheduled_at TIMESTAMPTZ NOT NULL,
  duration_seconds INTEGER NOT NULL DEFAULT 30,
  repeat_interval_minutes INTEGER,  -- NULL = one-shot, >0 = repeating
  expires_at TIMESTAMPTZ,

  -- Device command
  device_id TEXT,              -- NULL = all devices
  intensity INTEGER NOT NULL DEFAULT 5 CHECK (intensity BETWEEN 0 AND 20),
  pattern TEXT DEFAULT 'pulse', -- pulse, wave, fireworks, earthquake, constant
  pattern_data JSONB,          -- Custom pattern definition

  -- Context
  trigger_source TEXT,          -- cron, commitment, session, handler_signal
  trigger_id UUID,              -- Reference to the triggering record
  denial_day INTEGER,           -- Current denial day when scheduled

  -- Status
  status TEXT NOT NULL DEFAULT 'scheduled',
  -- scheduled, executing, completed, skipped, failed
  executed_at TIMESTAMPTZ,
  result JSONB,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_device_schedule_user ON device_schedule(user_id, status, scheduled_at);
ALTER TABLE device_schedule ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users own device schedules" ON device_schedule FOR ALL USING (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS device_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  schedule_id UUID REFERENCES device_schedule(id),
  event_type TEXT NOT NULL,
  -- Types: command_sent, command_ack, pattern_start, pattern_end,
  --        device_offline, user_override, enforcement_escalation
  device_id TEXT,
  intensity INTEGER,
  details JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_device_events_user ON device_events(user_id, created_at DESC);
ALTER TABLE device_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users own device events" ON device_events FOR ALL USING (auth.uid() = user_id);

-- Cron job: check device schedule every 5 minutes
SELECT cron.schedule(
  'device-control-check',
  '*/5 * * * *',
  $$SELECT net.http_post(
    url := current_setting('app.settings.supabase_url') || '/functions/v1/device-control',
    body := '{"action": "check_schedule"}'::jsonb,
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key'),
      'Content-Type', 'application/json'
    )
  )$$
);
