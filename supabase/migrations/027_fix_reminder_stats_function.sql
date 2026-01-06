-- Migration 027: Fix get_reminder_stats to use reminder_responses table
-- The original function referenced non-existent 'reminders' table

-- Drop and recreate get_reminder_stats
DROP FUNCTION IF EXISTS get_reminder_stats(UUID);

CREATE OR REPLACE FUNCTION get_reminder_stats(p_user_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result JSON;
BEGIN
  SELECT json_build_object(
    'total_reminders', COALESCE(COUNT(*), 0),
    'completed_today', COALESCE(COUNT(*) FILTER (
      WHERE skipped = false
      AND DATE(created_at) = CURRENT_DATE
    ), 0),
    'skipped_today', COALESCE(COUNT(*) FILTER (
      WHERE skipped = true
      AND DATE(created_at) = CURRENT_DATE
    ), 0),
    'streak', 0
  ) INTO result
  FROM reminder_responses
  WHERE user_id = p_user_id;

  IF result IS NULL THEN
    result := json_build_object(
      'total_reminders', 0,
      'completed_today', 0,
      'skipped_today', 0,
      'streak', 0
    );
  END IF;

  RETURN result;
END;
$$;

-- Create get_reminder_streak if it doesn't exist
CREATE OR REPLACE FUNCTION get_reminder_streak(p_user_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  streak INTEGER := 0;
  check_date DATE := CURRENT_DATE;
  has_response BOOLEAN;
BEGIN
  LOOP
    SELECT EXISTS(
      SELECT 1 FROM reminder_responses
      WHERE user_id = p_user_id
      AND DATE(created_at) = check_date
      AND skipped = false
    ) INTO has_response;

    IF has_response THEN
      streak := streak + 1;
      check_date := check_date - INTERVAL '1 day';
    ELSE
      EXIT;
    END IF;

    IF streak > 365 THEN
      EXIT;
    END IF;
  END LOOP;

  RETURN streak;
END;
$$;

GRANT EXECUTE ON FUNCTION get_reminder_stats(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_reminder_streak(UUID) TO authenticated;
