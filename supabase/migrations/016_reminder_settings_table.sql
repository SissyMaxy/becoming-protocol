-- Migration 016: Reminder Settings Table
-- User settings for feminization reminders

CREATE TABLE IF NOT EXISTS reminder_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL UNIQUE,

  -- Enable/disable
  enabled BOOLEAN DEFAULT TRUE,

  -- Active hours (0-23)
  active_hours_start INTEGER DEFAULT 8 CHECK (active_hours_start >= 0 AND active_hours_start <= 23),
  active_hours_end INTEGER DEFAULT 22 CHECK (active_hours_end >= 0 AND active_hours_end <= 23),

  -- Frequency
  frequency_per_day INTEGER DEFAULT 5 CHECK (frequency_per_day >= 1 AND frequency_per_day <= 20),

  -- Enabled reminder types
  enabled_types TEXT[] DEFAULT ARRAY['posture', 'voice', 'movement', 'identity'],

  -- Notifications
  use_notifications BOOLEAN DEFAULT TRUE,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS
ALTER TABLE reminder_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users access own reminder_settings" ON reminder_settings;
CREATE POLICY "Users access own reminder_settings" ON reminder_settings
  FOR ALL USING (auth.uid() = user_id);

-- Index
CREATE INDEX IF NOT EXISTS idx_reminder_settings_user ON reminder_settings(user_id);

-- Trigger for updated_at
DROP TRIGGER IF EXISTS update_reminder_settings_updated_at ON reminder_settings;
CREATE TRIGGER update_reminder_settings_updated_at
  BEFORE UPDATE ON reminder_settings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
