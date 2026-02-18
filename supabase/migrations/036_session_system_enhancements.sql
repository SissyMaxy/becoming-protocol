-- Migration 036: Session System Enhancements
-- Supports Phase D: Session System requirements
-- - Scheduled notifications for post-session mood capture
-- - Session handler state tracking
-- - Enhanced intimate_sessions logging

-- ============================================
-- SCHEDULED NOTIFICATIONS
-- For post-session mood capture and other timed events
-- ============================================
CREATE TABLE IF NOT EXISTS scheduled_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  notification_type TEXT NOT NULL, -- post_session_mood, reminder, intervention, etc.
  scheduled_for TIMESTAMPTZ NOT NULL,
  sent_at TIMESTAMPTZ,
  dismissed_at TIMESTAMPTZ,
  payload JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add columns if table already exists
ALTER TABLE scheduled_notifications ADD COLUMN IF NOT EXISTS sent_at TIMESTAMPTZ;
ALTER TABLE scheduled_notifications ADD COLUMN IF NOT EXISTS dismissed_at TIMESTAMPTZ;
ALTER TABLE scheduled_notifications ADD COLUMN IF NOT EXISTS payload JSONB DEFAULT '{}';

-- ============================================
-- ENHANCE INTIMATE_SESSIONS
-- Add Handler v2 integration fields
-- ============================================
ALTER TABLE intimate_sessions ADD COLUMN IF NOT EXISTS handler_mode TEXT;
ALTER TABLE intimate_sessions ADD COLUMN IF NOT EXISTS guidance_messages JSONB DEFAULT '[]';
ALTER TABLE intimate_sessions ADD COLUMN IF NOT EXISTS time_capsules_prompted INTEGER DEFAULT 0;
ALTER TABLE intimate_sessions ADD COLUMN IF NOT EXISTS time_capsules_saved INTEGER DEFAULT 0;
ALTER TABLE intimate_sessions ADD COLUMN IF NOT EXISTS post_session_mood_captured BOOLEAN DEFAULT FALSE;
ALTER TABLE intimate_sessions ADD COLUMN IF NOT EXISTS crash_detected BOOLEAN DEFAULT FALSE;
ALTER TABLE intimate_sessions ADD COLUMN IF NOT EXISTS session_context JSONB DEFAULT '{}';

-- ============================================
-- ENHANCE USER_STATE
-- Add session-related state fields
-- ============================================
ALTER TABLE user_state ADD COLUMN IF NOT EXISTS last_session_id UUID;
ALTER TABLE user_state ADD COLUMN IF NOT EXISTS last_session_ended_at TIMESTAMPTZ;
ALTER TABLE user_state ADD COLUMN IF NOT EXISTS post_session_mood_pending BOOLEAN DEFAULT FALSE;
ALTER TABLE user_state ADD COLUMN IF NOT EXISTS current_failure_mode TEXT;

-- ============================================
-- ENHANCE TIME_CAPSULES
-- Add session context if not already present
-- ============================================
ALTER TABLE time_capsules ADD COLUMN IF NOT EXISTS session_id UUID REFERENCES intimate_sessions;
ALTER TABLE time_capsules ADD COLUMN IF NOT EXISTS arousal_level INTEGER;
ALTER TABLE time_capsules ADD COLUMN IF NOT EXISTS edge_count INTEGER;

-- ============================================
-- ENHANCE MOOD_CHECKINS
-- Add context column for session data
-- ============================================
ALTER TABLE mood_checkins ADD COLUMN IF NOT EXISTS context JSONB DEFAULT '{}';

-- ============================================
-- SESSION GUIDANCE LOG
-- Tracks Handler guidance during sessions
-- ============================================
CREATE TABLE IF NOT EXISTS session_guidance_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES intimate_sessions NOT NULL,
  user_id UUID REFERENCES auth.users NOT NULL,
  phase TEXT NOT NULL, -- warmup, building, plateau, edge, recovery, cooldown
  guidance_text TEXT NOT NULL,
  guidance_layer INTEGER NOT NULL, -- 1 = rules, 2 = template, 3 = AI
  handler_mode TEXT,
  arousal_level INTEGER,
  edge_count INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================
ALTER TABLE scheduled_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE session_guidance_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users access own notifications" ON scheduled_notifications;
CREATE POLICY "Users access own notifications" ON scheduled_notifications
  FOR ALL USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users access own guidance" ON session_guidance_log;
CREATE POLICY "Users access own guidance" ON session_guidance_log
  FOR ALL USING (auth.uid() = user_id);

-- ============================================
-- INDEXES
-- ============================================
CREATE INDEX IF NOT EXISTS idx_scheduled_notifications_user ON scheduled_notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_scheduled_notifications_pending ON scheduled_notifications(user_id, scheduled_for)
  WHERE sent_at IS NULL AND dismissed_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_scheduled_notifications_type ON scheduled_notifications(user_id, notification_type);

CREATE INDEX IF NOT EXISTS idx_session_guidance_session ON session_guidance_log(session_id);
CREATE INDEX IF NOT EXISTS idx_session_guidance_user ON session_guidance_log(user_id);

CREATE INDEX IF NOT EXISTS idx_intimate_sessions_handler ON intimate_sessions(user_id, handler_mode);
CREATE INDEX IF NOT EXISTS idx_intimate_sessions_crash ON intimate_sessions(user_id, crash_detected)
  WHERE crash_detected = TRUE;

-- ============================================
-- FUNCTION: Get pending post-session mood checks
-- ============================================
CREATE OR REPLACE FUNCTION get_pending_mood_checks(p_user_id UUID)
RETURNS TABLE (
  notification_id UUID,
  session_id UUID,
  session_type TEXT,
  edge_count INTEGER,
  scheduled_for TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    sn.id as notification_id,
    (sn.payload->>'sessionId')::UUID as session_id,
    sn.payload->>'sessionType' as session_type,
    (sn.payload->>'edgeCount')::INTEGER as edge_count,
    sn.scheduled_for
  FROM scheduled_notifications sn
  WHERE sn.user_id = p_user_id
    AND sn.notification_type = 'post_session_mood'
    AND sn.sent_at IS NULL
    AND sn.dismissed_at IS NULL
    AND sn.scheduled_for <= NOW()
  ORDER BY sn.scheduled_for ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- FUNCTION: Mark notification as sent
-- ============================================
CREATE OR REPLACE FUNCTION mark_notification_sent(p_notification_id UUID)
RETURNS void AS $$
BEGIN
  UPDATE scheduled_notifications
  SET sent_at = NOW()
  WHERE id = p_notification_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- FUNCTION: Dismiss notification
-- ============================================
CREATE OR REPLACE FUNCTION dismiss_notification(p_notification_id UUID)
RETURNS void AS $$
BEGIN
  UPDATE scheduled_notifications
  SET dismissed_at = NOW()
  WHERE id = p_notification_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
