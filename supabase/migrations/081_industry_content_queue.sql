-- Sprint 1: Industry Foundation — Content Queue & Multiplication
-- content_queue + content_multiplication_plans

-- ============================================================
-- content_multiplication_plans: 1 shoot → 8+ posts over 7 days
-- (Created first because content_queue references it)
-- ============================================================
CREATE TABLE content_multiplication_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,

  source_shoot_id UUID REFERENCES shoot_prescriptions NOT NULL,
  total_posts_planned INTEGER NOT NULL DEFAULT 1,

  -- Array of planned posts with scheduling
  posts JSONB NOT NULL DEFAULT '[]',
  -- Each entry: { platform, content_type, scheduled_day, caption,
  --               media_selection, status }

  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE content_multiplication_plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY content_multiplication_plans_user ON content_multiplication_plans
  FOR ALL USING (auth.uid() = user_id);

CREATE INDEX idx_multiplication_plans_shoot
  ON content_multiplication_plans(user_id, source_shoot_id);

-- ============================================================
-- content_queue: Scheduled posts across all platforms
-- (Distinct from scheduled_posts in 045 — this is denial-aware,
--  multiplication-aware, and tied to the shoot prescription system)
-- ============================================================
CREATE TABLE content_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,

  -- Source
  source_shoot_id UUID REFERENCES shoot_prescriptions,
  multiplication_plan_id UUID REFERENCES content_multiplication_plans,

  -- Content
  platform TEXT NOT NULL,
  content_type TEXT NOT NULL,
  media_paths JSONB DEFAULT '[]',
  caption TEXT,
  hashtags TEXT[] DEFAULT '{}',

  -- Denial context
  denial_day_badge INTEGER,

  -- Scheduling
  scheduled_for TIMESTAMPTZ,
  posted_at TIMESTAMPTZ,

  -- Status
  status TEXT DEFAULT 'queued' CHECK (status IN (
    'queued', 'posted', 'failed', 'skipped'
  )),

  -- Performance
  engagement_stats JSONB DEFAULT '{}',

  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE content_queue ENABLE ROW LEVEL SECURITY;
CREATE POLICY content_queue_user ON content_queue
  FOR ALL USING (auth.uid() = user_id);

CREATE INDEX idx_content_queue_status
  ON content_queue(user_id, status, scheduled_for);
CREATE INDEX idx_content_queue_platform
  ON content_queue(user_id, platform, status);
