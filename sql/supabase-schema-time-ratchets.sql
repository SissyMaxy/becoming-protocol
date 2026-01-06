-- Time Ratchets Schema
-- Psychological anchors using sunk time as commitment devices

-- ============================================
-- ADD TIME RATCHET FIELDS TO USER PROFILES
-- ============================================

ALTER TABLE user_profiles
ADD COLUMN IF NOT EXISTS goddess_name TEXT,
ADD COLUMN IF NOT EXISTS serving_since DATE,
ADD COLUMN IF NOT EXISTS egg_cracked_date DATE,
ADD COLUMN IF NOT EXISTS protocol_start_date DATE;

-- ============================================
-- SERVICE LOG TABLE
-- Tracks service acts for "Served Goddess X times"
-- ============================================

CREATE TABLE IF NOT EXISTS service_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Service details
  service_type TEXT NOT NULL DEFAULT 'general',
  description TEXT,

  -- Context
  served_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  duration_minutes INTEGER,

  -- Optional: link to task if service was a task
  task_id TEXT,
  daily_entry_id UUID,

  -- Metadata
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for fast counting
CREATE INDEX IF NOT EXISTS idx_service_log_user_id ON service_log(user_id);
CREATE INDEX IF NOT EXISTS idx_service_log_served_at ON service_log(user_id, served_at DESC);

-- RLS
ALTER TABLE service_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own service log"
  ON service_log FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own service log"
  ON service_log FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own service log"
  ON service_log FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================
-- HELPER FUNCTIONS
-- ============================================

-- Get service count for a user
CREATE OR REPLACE FUNCTION get_service_count(p_user_id UUID)
RETURNS INTEGER AS $$
  SELECT COUNT(*)::INTEGER FROM service_log WHERE user_id = p_user_id;
$$ LANGUAGE SQL SECURITY DEFINER;

-- Log a service act
CREATE OR REPLACE FUNCTION log_service(
  p_user_id UUID,
  p_service_type TEXT DEFAULT 'general',
  p_description TEXT DEFAULT NULL,
  p_duration_minutes INTEGER DEFAULT NULL,
  p_task_id TEXT DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  new_id UUID;
BEGIN
  INSERT INTO service_log (user_id, service_type, description, duration_minutes, task_id)
  VALUES (p_user_id, p_service_type, p_description, p_duration_minutes, p_task_id)
  RETURNING id INTO new_id;

  RETURN new_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Auto-set protocol_start_date on first daily entry
CREATE OR REPLACE FUNCTION set_protocol_start_date()
RETURNS TRIGGER AS $$
BEGIN
  -- Only set if not already set
  UPDATE user_profiles
  SET protocol_start_date = NEW.date::DATE
  WHERE user_id = NEW.user_id
    AND protocol_start_date IS NULL;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to auto-set protocol start date
DROP TRIGGER IF EXISTS trigger_set_protocol_start_date ON daily_entries;
CREATE TRIGGER trigger_set_protocol_start_date
  AFTER INSERT ON daily_entries
  FOR EACH ROW
  EXECUTE FUNCTION set_protocol_start_date();

-- ============================================
-- TIME RATCHET VIEWS
-- ============================================

-- View for calculating all time ratchets
CREATE OR REPLACE VIEW time_ratchets AS
SELECT
  up.user_id,
  up.preferred_name,
  up.goddess_name,
  up.serving_since,
  up.egg_cracked_date,
  up.protocol_start_date,

  -- Calculate days for each ratchet
  CASE WHEN up.serving_since IS NOT NULL
    THEN CURRENT_DATE - up.serving_since
    ELSE NULL
  END AS days_serving,

  CASE WHEN up.egg_cracked_date IS NOT NULL
    THEN CURRENT_DATE - up.egg_cracked_date
    ELSE NULL
  END AS days_since_egg_crack,

  CASE WHEN up.protocol_start_date IS NOT NULL
    THEN CURRENT_DATE - up.protocol_start_date
    ELSE NULL
  END AS days_in_protocol,

  -- Service count
  COALESCE(sc.service_count, 0) AS service_count

FROM user_profiles up
LEFT JOIN (
  SELECT user_id, COUNT(*) AS service_count
  FROM service_log
  GROUP BY user_id
) sc ON sc.user_id = up.user_id;

-- Grant access to authenticated users
GRANT SELECT ON time_ratchets TO authenticated;
