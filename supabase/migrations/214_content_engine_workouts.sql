-- Migration 214: Autonomous content engine + workout prescriptions
-- Idempotent.

-- ============================================================================
-- Content calendar — Handler populates daily, auto-poster dispatches
-- ============================================================================

CREATE TABLE IF NOT EXISTS content_calendar (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE
);

ALTER TABLE content_calendar
  ADD COLUMN IF NOT EXISTS scheduled_date DATE,
  ADD COLUMN IF NOT EXISTS platform TEXT,
  ADD COLUMN IF NOT EXISTS content_type TEXT DEFAULT 'tweet',
  ADD COLUMN IF NOT EXISTS theme TEXT,
  ADD COLUMN IF NOT EXISTS draft_content TEXT,
  ADD COLUMN IF NOT EXISTS final_content TEXT,
  ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'draft',
  ADD COLUMN IF NOT EXISTS generated_by TEXT DEFAULT 'handler_strategist',
  ADD COLUMN IF NOT EXISTS quality_score FLOAT,
  ADD COLUMN IF NOT EXISTS posted_content_id UUID,
  ADD COLUMN IF NOT EXISTS performance_likes INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS performance_comments INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS performance_shares INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS performance_followers_gained INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'content_calendar_status_check') THEN
    ALTER TABLE content_calendar ADD CONSTRAINT content_calendar_status_check
      CHECK (status IN ('draft', 'approved', 'scheduled', 'posted', 'rejected', 'failed'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_content_calendar_date ON content_calendar(user_id, scheduled_date, status);
ALTER TABLE content_calendar ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users own calendar" ON content_calendar;
CREATE POLICY "Users own calendar" ON content_calendar FOR ALL USING (auth.uid() = user_id);

-- ============================================================================
-- Content performance tracking — what works, what doesn't
-- ============================================================================

CREATE TABLE IF NOT EXISTS content_performance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE
);

ALTER TABLE content_performance
  ADD COLUMN IF NOT EXISTS platform TEXT,
  ADD COLUMN IF NOT EXISTS theme TEXT,
  ADD COLUMN IF NOT EXISTS content_type TEXT,
  ADD COLUMN IF NOT EXISTS avg_likes FLOAT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS avg_comments FLOAT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS avg_shares FLOAT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS avg_follower_gain FLOAT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sample_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS best_performing_content TEXT,
  ADD COLUMN IF NOT EXISTS worst_performing_content TEXT,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

CREATE UNIQUE INDEX IF NOT EXISTS idx_content_perf_unique ON content_performance(user_id, platform, theme);
ALTER TABLE content_performance ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users own performance" ON content_performance;
CREATE POLICY "Users own performance" ON content_performance FOR ALL USING (auth.uid() = user_id);

-- ============================================================================
-- Workout prescriptions — Handler assigns, system tracks
-- ============================================================================

CREATE TABLE IF NOT EXISTS workout_prescriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE
);

ALTER TABLE workout_prescriptions
  ADD COLUMN IF NOT EXISTS workout_type TEXT,
  ADD COLUMN IF NOT EXISTS focus_area TEXT,
  ADD COLUMN IF NOT EXISTS exercises JSONB DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS duration_minutes INTEGER,
  ADD COLUMN IF NOT EXISTS prescribed_by TEXT DEFAULT 'handler',
  ADD COLUMN IF NOT EXISTS scheduled_date DATE DEFAULT CURRENT_DATE,
  ADD COLUMN IF NOT EXISTS whoop_recovery_at_prescription FLOAT,
  ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'prescribed',
  ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS skipped_reason TEXT,
  ADD COLUMN IF NOT EXISTS completion_notes TEXT,
  ADD COLUMN IF NOT EXISTS post_workout_photo_url TEXT,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'workout_prescriptions_status_check') THEN
    ALTER TABLE workout_prescriptions ADD CONSTRAINT workout_prescriptions_status_check
      CHECK (status IN ('prescribed', 'started', 'completed', 'skipped', 'partial'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'workout_prescriptions_type_check') THEN
    ALTER TABLE workout_prescriptions ADD CONSTRAINT workout_prescriptions_type_check
      CHECK (workout_type IS NULL OR workout_type IN (
        'glute_sculpt', 'hip_widening', 'waist_slimming', 'posture_feminine',
        'flexibility', 'yoga_flow', 'dance_cardio', 'full_body_feminine',
        'upper_body_toning', 'core_cinch', 'recovery_stretch'
      ));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_workout_rx_user_date ON workout_prescriptions(user_id, scheduled_date);
CREATE INDEX IF NOT EXISTS idx_workout_rx_pending ON workout_prescriptions(user_id, status) WHERE status = 'prescribed';
ALTER TABLE workout_prescriptions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users own workouts" ON workout_prescriptions;
CREATE POLICY "Users own workouts" ON workout_prescriptions FOR ALL USING (auth.uid() = user_id);

-- ============================================================================
-- Workout streak tracking on user_state
-- ============================================================================

ALTER TABLE user_state
  ADD COLUMN IF NOT EXISTS workout_streak_days INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_workout_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS workout_focus_preference TEXT;

NOTIFY pgrst, 'reload schema';
