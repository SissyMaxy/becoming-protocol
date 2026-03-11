-- Content Intelligence Tables
-- Performance snapshots + persistent strategy state for the Handler's content feedback loop.

-- ============================================
-- 1. Content performance snapshots
-- ============================================

CREATE TABLE IF NOT EXISTS content_performance_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  content_queue_id UUID,

  -- Snapshot data
  platform TEXT NOT NULL,
  content_type TEXT NOT NULL,
  shoot_type TEXT,
  denial_day_at_post INTEGER,
  exposure_level_at_post INTEGER,
  posted_at TIMESTAMPTZ,

  -- Engagement at snapshot time
  views INTEGER DEFAULT 0,
  likes INTEGER DEFAULT 0,
  comments INTEGER DEFAULT 0,
  tips_earned DECIMAL DEFAULT 0,
  new_followers INTEGER DEFAULT 0,

  -- Computed
  engagement_rate DECIMAL,
  revenue_per_view DECIMAL,

  -- Time context
  posted_hour INTEGER,
  posted_day_of_week INTEGER,

  snapshotted_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE content_performance_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users own snapshots" ON content_performance_snapshots
  FOR ALL USING (auth.uid() = user_id);

CREATE INDEX idx_perf_snapshots_user ON content_performance_snapshots(user_id, snapshotted_at DESC);
CREATE INDEX idx_perf_snapshots_platform ON content_performance_snapshots(user_id, platform);

-- ============================================
-- 2. Content strategy state (one row per user)
-- ============================================

CREATE TABLE IF NOT EXISTS content_strategy_state (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL UNIQUE,

  -- Performance intelligence (JSONB, recomputed periodically)
  platform_performance JSONB DEFAULT '{}'::jsonb,
  content_type_performance JSONB DEFAULT '{}'::jsonb,
  timing_performance JSONB DEFAULT '{}'::jsonb,
  denial_day_performance JSONB DEFAULT '{}'::jsonb,

  -- Skip intelligence
  skip_patterns JSONB DEFAULT '{}'::jsonb,

  -- Strategy outputs
  recommended_platform_mix JSONB DEFAULT '{}'::jsonb,
  recommended_shoot_frequency JSONB DEFAULT '{}'::jsonb,
  recommended_posting_times JSONB DEFAULT '{}'::jsonb,

  -- Content calendar
  weekly_plan JSONB DEFAULT '{}'::jsonb,
  plan_generated_at TIMESTAMPTZ,

  -- Revenue tracking
  weekly_revenue DECIMAL DEFAULT 0,
  monthly_revenue DECIMAL DEFAULT 0,
  revenue_trend TEXT DEFAULT 'unknown',
  revenue_per_hour_of_effort DECIMAL,

  last_analyzed_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE content_strategy_state ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users own strategy" ON content_strategy_state
  FOR ALL USING (auth.uid() = user_id);

-- ============================================
-- 3. Add performance_logged flag to content_queue
-- ============================================

ALTER TABLE content_queue ADD COLUMN IF NOT EXISTS performance_logged BOOLEAN DEFAULT FALSE;
ALTER TABLE content_queue ADD COLUMN IF NOT EXISTS performance_logged_at TIMESTAMPTZ;
