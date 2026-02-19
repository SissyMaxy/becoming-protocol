-- Sprint 1: Industry Foundation — Autonomous Engine
-- handler_autonomous_actions + community_targets

-- ============================================================
-- handler_autonomous_actions: Everything Handler does without Maxy
-- (Distinct from handler_decisions in 045 — this tracks specific
--  social/marketing actions, not decision-making logic)
-- ============================================================
CREATE TABLE handler_autonomous_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,

  action_type TEXT NOT NULL CHECK (action_type IN (
    'community_comment', 'community_post', 'creator_dm',
    'poll_posted', 'engagement_reply', 'follow', 'cross_promo',
    'milestone_post', 'text_post', 'repost', 'subreddit_comment'
  )),

  platform TEXT NOT NULL,
  target TEXT,

  -- What the Handler did
  content_text TEXT,
  handler_intent TEXT,

  -- Result
  result JSONB DEFAULT '{}',

  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE handler_autonomous_actions ENABLE ROW LEVEL SECURITY;
CREATE POLICY handler_autonomous_actions_user ON handler_autonomous_actions
  FOR ALL USING (auth.uid() = user_id);

CREATE INDEX idx_handler_autonomous_actions_type
  ON handler_autonomous_actions(user_id, action_type, created_at DESC);
CREATE INDEX idx_handler_autonomous_actions_platform
  ON handler_autonomous_actions(user_id, platform, created_at DESC);

-- ============================================================
-- community_targets: Communities the Handler is active in
-- ============================================================
CREATE TABLE community_targets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,

  platform TEXT NOT NULL,
  community_id TEXT NOT NULL,
  community_name TEXT NOT NULL,

  -- Engagement config
  engagement_strategy TEXT,
  posting_frequency TEXT,
  voice_config JSONB DEFAULT '{}',
  content_types_allowed TEXT[] DEFAULT '{}',
  rules_summary TEXT,

  -- Tracking
  followers_attributed INTEGER DEFAULT 0,
  karma_earned INTEGER DEFAULT 0,
  total_posts INTEGER DEFAULT 0,
  total_comments INTEGER DEFAULT 0,
  last_post_at TIMESTAMPTZ,
  last_engagement_at TIMESTAMPTZ,

  -- Status
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'paused')),

  created_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(user_id, platform, community_id)
);

ALTER TABLE community_targets ENABLE ROW LEVEL SECURITY;
CREATE POLICY community_targets_user ON community_targets
  FOR ALL USING (auth.uid() = user_id);

CREATE INDEX idx_community_targets_platform
  ON community_targets(user_id, platform, status);
