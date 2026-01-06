-- ============================================
-- FEMINIZATION REMINDERS SCHEMA
-- All-day presence reminders for constant feminization
-- ============================================

-- Reminder settings per user
CREATE TABLE IF NOT EXISTS reminder_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Schedule
  enabled BOOLEAN DEFAULT true,
  active_hours_start INTEGER DEFAULT 8 CHECK (active_hours_start >= 0 AND active_hours_start <= 23),
  active_hours_end INTEGER DEFAULT 22 CHECK (active_hours_end >= 0 AND active_hours_end <= 23),
  frequency_per_day INTEGER DEFAULT 5 CHECK (frequency_per_day >= 1 AND frequency_per_day <= 15),

  -- Types enabled
  enabled_types TEXT[] DEFAULT ARRAY['posture', 'voice', 'movement', 'identity'],

  -- Notification preferences
  use_notifications BOOLEAN DEFAULT true,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(user_id)
);

-- Reminder responses (tracking)
CREATE TABLE IF NOT EXISTS reminder_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Reminder info
  reminder_id TEXT NOT NULL,
  reminder_type TEXT NOT NULL CHECK (reminder_type IN ('posture', 'voice', 'movement', 'identity')),
  prompt TEXT NOT NULL,

  -- Response
  responded_at TIMESTAMPTZ DEFAULT NOW(),
  rating INTEGER CHECK (rating IS NULL OR (rating >= 1 AND rating <= 5)),
  skipped BOOLEAN DEFAULT false,
  note TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Scheduled reminders queue (for tracking what's been sent today)
CREATE TABLE IF NOT EXISTS reminder_schedule (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  scheduled_date DATE NOT NULL,
  scheduled_times TIMESTAMPTZ[] NOT NULL,
  sent_count INTEGER DEFAULT 0,

  created_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(user_id, scheduled_date)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_reminder_responses_user_date
ON reminder_responses(user_id, responded_at);

CREATE INDEX IF NOT EXISTS idx_reminder_responses_type
ON reminder_responses(reminder_type);

CREATE INDEX IF NOT EXISTS idx_reminder_schedule_user_date
ON reminder_schedule(user_id, scheduled_date);

-- RLS Policies
ALTER TABLE reminder_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE reminder_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE reminder_schedule ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (for re-runs)
DROP POLICY IF EXISTS "Users can view own reminder settings" ON reminder_settings;
DROP POLICY IF EXISTS "Users can insert own reminder settings" ON reminder_settings;
DROP POLICY IF EXISTS "Users can update own reminder settings" ON reminder_settings;
DROP POLICY IF EXISTS "Users can view own reminder responses" ON reminder_responses;
DROP POLICY IF EXISTS "Users can insert own reminder responses" ON reminder_responses;
DROP POLICY IF EXISTS "Users can view own reminder schedule" ON reminder_schedule;
DROP POLICY IF EXISTS "Users can manage own reminder schedule" ON reminder_schedule;

-- Settings policies
CREATE POLICY "Users can view own reminder settings"
ON reminder_settings FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own reminder settings"
ON reminder_settings FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own reminder settings"
ON reminder_settings FOR UPDATE
TO authenticated
USING (auth.uid() = user_id);

-- Response policies
CREATE POLICY "Users can view own reminder responses"
ON reminder_responses FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own reminder responses"
ON reminder_responses FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

-- Schedule policies
CREATE POLICY "Users can view own reminder schedule"
ON reminder_schedule FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can manage own reminder schedule"
ON reminder_schedule FOR ALL
TO authenticated
USING (auth.uid() = user_id);

-- Function to get reminder stats
CREATE OR REPLACE FUNCTION get_reminder_stats(p_user_id UUID)
RETURNS JSON AS $$
DECLARE
  result JSON;
BEGIN
  SELECT json_build_object(
    'total_reminders', COUNT(*),
    'responded_count', COUNT(*) FILTER (WHERE NOT skipped),
    'skipped_count', COUNT(*) FILTER (WHERE skipped),
    'average_rating', ROUND(AVG(rating) FILTER (WHERE rating IS NOT NULL), 1),
    'today_count', COUNT(*) FILTER (WHERE DATE(responded_at) = CURRENT_DATE),
    'by_type', json_build_object(
      'posture', json_build_object(
        'count', COUNT(*) FILTER (WHERE reminder_type = 'posture'),
        'avg_rating', ROUND(AVG(rating) FILTER (WHERE reminder_type = 'posture' AND rating IS NOT NULL), 1)
      ),
      'voice', json_build_object(
        'count', COUNT(*) FILTER (WHERE reminder_type = 'voice'),
        'avg_rating', ROUND(AVG(rating) FILTER (WHERE reminder_type = 'voice' AND rating IS NOT NULL), 1)
      ),
      'movement', json_build_object(
        'count', COUNT(*) FILTER (WHERE reminder_type = 'movement'),
        'avg_rating', ROUND(AVG(rating) FILTER (WHERE reminder_type = 'movement' AND rating IS NOT NULL), 1)
      ),
      'identity', json_build_object(
        'count', COUNT(*) FILTER (WHERE reminder_type = 'identity'),
        'avg_rating', ROUND(AVG(rating) FILTER (WHERE reminder_type = 'identity' AND rating IS NOT NULL), 1)
      )
    )
  ) INTO result
  FROM reminder_responses
  WHERE user_id = p_user_id;

  RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to calculate reminder streak (consecutive days with at least one response)
CREATE OR REPLACE FUNCTION get_reminder_streak(p_user_id UUID)
RETURNS INTEGER AS $$
DECLARE
  streak INTEGER := 0;
  check_date DATE := CURRENT_DATE;
  has_response BOOLEAN;
BEGIN
  LOOP
    SELECT EXISTS(
      SELECT 1 FROM reminder_responses
      WHERE user_id = p_user_id
      AND DATE(responded_at) = check_date
      AND NOT skipped
    ) INTO has_response;

    IF has_response THEN
      streak := streak + 1;
      check_date := check_date - 1;
    ELSE
      -- Allow today to be incomplete
      IF check_date = CURRENT_DATE THEN
        check_date := check_date - 1;
      ELSE
        EXIT;
      END IF;
    END IF;

    -- Safety limit
    IF streak > 365 THEN
      EXIT;
    END IF;
  END LOOP;

  RETURN streak;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
