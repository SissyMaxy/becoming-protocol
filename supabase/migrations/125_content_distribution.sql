-- Content Distribution Pipeline Tables

CREATE TABLE IF NOT EXISTS content_vault (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  file_url TEXT NOT NULL,
  file_type TEXT NOT NULL,
  source TEXT NOT NULL,
  source_session_id UUID,
  explicitness_level INTEGER NOT NULL DEFAULT 1,
  content_tags TEXT[] DEFAULT '{}',
  approval_status TEXT NOT NULL DEFAULT 'pending',
  approved_at TIMESTAMPTZ,
  distribution_status TEXT DEFAULT 'undistributed',
  platforms_posted_to TEXT[] DEFAULT '{}',
  duration_seconds INTEGER,
  thumbnail_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_content_vault_status ON content_vault(user_id, approval_status, distribution_status);
ALTER TABLE content_vault ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users own vault" ON content_vault FOR ALL USING (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS content_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  vault_item_id UUID REFERENCES content_vault(id),
  platform TEXT NOT NULL,
  caption TEXT NOT NULL,
  hashtags TEXT[] DEFAULT '{}',
  subreddit TEXT,
  scheduled_at TIMESTAMPTZ NOT NULL,
  posted_at TIMESTAMPTZ,
  post_status TEXT NOT NULL DEFAULT 'scheduled',
  platform_post_id TEXT,
  platform_url TEXT,
  likes INTEGER DEFAULT 0,
  comments INTEGER DEFAULT 0,
  shares INTEGER DEFAULT 0,
  revenue_generated DECIMAL DEFAULT 0,
  engagement_fetched_at TIMESTAMPTZ,
  caption_variant TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_content_posts_schedule ON content_posts(user_id, post_status, scheduled_at);
ALTER TABLE content_posts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users own posts" ON content_posts FOR ALL USING (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS fan_interactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  platform TEXT NOT NULL,
  interaction_type TEXT NOT NULL,
  fan_identifier TEXT NOT NULL,
  fan_display_name TEXT,
  content TEXT NOT NULL,
  sentiment TEXT,
  response_status TEXT DEFAULT 'pending',
  response_text TEXT,
  responded_at TIMESTAMPTZ,
  briefing_worthy BOOLEAN DEFAULT FALSE,
  conditioning_aligned BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fan_interactions_pending ON fan_interactions(user_id, response_status);
ALTER TABLE fan_interactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users own interactions" ON fan_interactions FOR ALL USING (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS cam_highlights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id UUID,
  clip_url TEXT NOT NULL,
  start_time_seconds INTEGER NOT NULL,
  end_time_seconds INTEGER NOT NULL,
  highlight_type TEXT,
  tip_density FLOAT,
  lovense_intensity_avg FLOAT,
  vault_item_id UUID REFERENCES content_vault(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cam_highlights_session ON cam_highlights(user_id, session_id);
ALTER TABLE cam_highlights ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users own highlights" ON cam_highlights FOR ALL USING (auth.uid() = user_id);
