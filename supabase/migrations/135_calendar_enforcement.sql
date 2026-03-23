-- Migration 135: Handler Calendar + Enforcement
-- Weekly schedule generation and 30-min enforcement loop.

CREATE TABLE IF NOT EXISTS handler_calendar (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Event details
  event_type TEXT NOT NULL,
  -- Types: session, task_block, capture, voice_drill, conditioning,
  --        exercise, journal, check_in, custom
  title TEXT NOT NULL,
  description TEXT,

  -- Timing
  scheduled_at TIMESTAMPTZ NOT NULL,
  duration_minutes INTEGER NOT NULL DEFAULT 30,
  deadline_at TIMESTAMPTZ, -- When it becomes "missed"

  -- Conditions
  requires_privacy BOOLEAN DEFAULT false,
  gina_must_be_away BOOLEAN DEFAULT false,
  min_recovery_score INTEGER, -- Whoop green/yellow/red gate

  -- Status
  status TEXT NOT NULL DEFAULT 'scheduled',
  -- scheduled, reminded, active, completed, missed, rescheduled, skipped
  completed_at TIMESTAMPTZ,
  missed_at TIMESTAMPTZ,
  rescheduled_to UUID REFERENCES handler_calendar(id),

  -- Enforcement
  reminder_sent BOOLEAN DEFAULT false,
  device_summons_sent BOOLEAN DEFAULT false,
  outreach_sent BOOLEAN DEFAULT false,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_calendar_user_status ON handler_calendar(user_id, status, scheduled_at);
ALTER TABLE handler_calendar ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users own calendar" ON handler_calendar;
CREATE POLICY "Users own calendar" ON handler_calendar FOR ALL USING (auth.uid() = user_id);

-- Cron job: enforce calendar every 30 minutes
SELECT cron.schedule(
  'handler-calendar-enforce',
  '*/30 * * * *',
  $$SELECT net.http_post(
    url := current_setting('app.settings.supabase_url') || '/functions/v1/handler-calendar',
    body := '{"action": "enforce"}'::jsonb,
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key'),
      'Content-Type', 'application/json'
    )
  )$$
);

INSERT INTO supabase_migrations.schema_migrations (version) VALUES ('135');
