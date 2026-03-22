-- Migration 128: Autonomous Revenue Engine
-- The Handler generates revenue independently through social presence,
-- paid conversations, written content, and autonomous financial decisions.

-- ── AI-generated content (Handler-created text/engagement) ──────────

CREATE TABLE IF NOT EXISTS ai_generated_content (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  content_type TEXT NOT NULL CHECK (content_type IN (
    'tweet', 'reply', 'quote_tweet',
    'reddit_post', 'reddit_comment',
    'fetlife_post', 'fetlife_comment',
    'dm_response', 'gfe_message', 'sexting_message',
    'erotica', 'caption', 'journal_entry',
    'product_review', 'bio_update', 'engagement_bait'
  )),

  platform TEXT NOT NULL,
  content TEXT NOT NULL,

  -- Targeting
  target_subreddit TEXT,
  target_account TEXT,
  target_hashtags TEXT[] DEFAULT '{}',

  -- Generation context
  generation_prompt TEXT,
  generation_strategy TEXT,

  -- Performance
  posted_at TIMESTAMPTZ,
  engagement_likes INTEGER DEFAULT 0,
  engagement_comments INTEGER DEFAULT 0,
  engagement_shares INTEGER DEFAULT 0,
  engagement_clicks INTEGER DEFAULT 0,
  revenue_generated DECIMAL DEFAULT 0,

  -- A/B testing
  variant TEXT,

  -- Status
  status TEXT DEFAULT 'generated' CHECK (status IN (
    'generated', 'scheduled', 'posted', 'failed'
  )),
  scheduled_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_content_schedule
  ON ai_generated_content(user_id, platform, status, scheduled_at);
CREATE INDEX IF NOT EXISTS idx_ai_content_performance
  ON ai_generated_content(user_id, status, created_at DESC);

-- ── Engagement targets ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS engagement_targets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  platform TEXT NOT NULL,
  target_handle TEXT NOT NULL,
  target_type TEXT NOT NULL CHECK (target_type IN (
    'similar_creator', 'larger_creator', 'potential_subscriber',
    'community_leader', 'media_outlet'
  )),

  follower_count INTEGER,
  engagement_rate FLOAT,

  strategy TEXT,
  interactions_count INTEGER DEFAULT 0,
  last_interaction_at TIMESTAMPTZ,

  followed_back BOOLEAN DEFAULT FALSE,
  dm_opened BOOLEAN DEFAULT FALSE,
  collaboration_potential TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_engagement_targets_platform
  ON engagement_targets(user_id, platform, target_type);

-- ── Daily content calendar (Handler-planned) ────────────────────────

CREATE TABLE IF NOT EXISTS revenue_content_calendar (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  date DATE NOT NULL,
  platform TEXT NOT NULL,

  planned_posts JSONB NOT NULL DEFAULT '[]',
  actual_posts INTEGER DEFAULT 0,
  total_engagement INTEGER DEFAULT 0,
  revenue_generated DECIMAL DEFAULT 0,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE(user_id, date, platform)
);

CREATE INDEX IF NOT EXISTS idx_revenue_content_calendar
  ON revenue_content_calendar(user_id, date);

-- ── Paid conversations ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS paid_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  platform TEXT NOT NULL,
  subscriber_id TEXT NOT NULL,
  subscriber_name TEXT,

  conversation_type TEXT NOT NULL CHECK (conversation_type IN (
    'dm_response', 'gfe_daily', 'sexting_session', 'custom_request'
  )),

  handler_response TEXT NOT NULL,

  revenue DECIMAL DEFAULT 0,
  revenue_type TEXT,

  response_quality TEXT,

  requires_approval BOOLEAN DEFAULT FALSE,
  approved BOOLEAN,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_paid_conversations
  ON paid_conversations(user_id, platform, created_at DESC);

-- ── GFE subscribers ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS gfe_subscribers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  platform TEXT NOT NULL,
  subscriber_id TEXT NOT NULL,
  subscriber_name TEXT,

  tier TEXT NOT NULL DEFAULT 'basic',
  monthly_rate DECIMAL NOT NULL DEFAULT 0,
  subscribed_at TIMESTAMPTZ,

  known_preferences TEXT,
  conversation_history_summary TEXT,

  daily_message_sent_today BOOLEAN DEFAULT FALSE,
  last_message_at TIMESTAMPTZ,

  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'paused', 'cancelled')),

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_gfe_subscribers
  ON gfe_subscribers(user_id, status);

-- ── Affiliate links ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS affiliate_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  product_name TEXT NOT NULL,
  product_category TEXT NOT NULL,
  product_url TEXT NOT NULL,
  affiliate_url TEXT NOT NULL,
  affiliate_program TEXT NOT NULL,

  clicks INTEGER DEFAULT 0,
  conversions INTEGER DEFAULT 0,
  revenue_generated DECIMAL DEFAULT 0,

  review_generated BOOLEAN DEFAULT FALSE,
  last_mentioned_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_affiliate_links
  ON affiliate_links(user_id, product_category);

-- ── Revenue decisions (autonomous Handler financial decisions) ───────

CREATE TABLE IF NOT EXISTS revenue_decisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  decision_type TEXT NOT NULL CHECK (decision_type IN (
    'pricing_change', 'promotion', 'investment', 'content_focus',
    'platform_rebalance', 'tier_adjustment', 'bundle_creation'
  )),

  decision_data JSONB NOT NULL DEFAULT '{}',
  rationale TEXT NOT NULL,

  revenue_before DECIMAL,
  revenue_after DECIMAL,
  projected_impact DECIMAL,

  executed BOOLEAN DEFAULT FALSE,
  executed_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_revenue_decisions
  ON revenue_decisions(user_id, decision_type, created_at DESC);

-- ── Reset GFE daily flags (cron helper) ─────────────────────────────

CREATE OR REPLACE FUNCTION reset_gfe_daily_flags()
RETURNS void AS $$
BEGIN
  UPDATE gfe_subscribers SET daily_message_sent_today = FALSE
  WHERE daily_message_sent_today = TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── RLS policies ────────────────────────────────────────────────────

ALTER TABLE ai_generated_content ENABLE ROW LEVEL SECURITY;
ALTER TABLE engagement_targets ENABLE ROW LEVEL SECURITY;
ALTER TABLE revenue_content_calendar ENABLE ROW LEVEL SECURITY;
ALTER TABLE paid_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE gfe_subscribers ENABLE ROW LEVEL SECURITY;
ALTER TABLE affiliate_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE revenue_decisions ENABLE ROW LEVEL SECURITY;

-- User can read their own data
CREATE POLICY "Users read own ai_generated_content" ON ai_generated_content
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users read own engagement_targets" ON engagement_targets
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users read own revenue_content_calendar" ON revenue_content_calendar
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users read own paid_conversations" ON paid_conversations
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users read own gfe_subscribers" ON gfe_subscribers
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users read own affiliate_links" ON affiliate_links
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users read own revenue_decisions" ON revenue_decisions
  FOR SELECT USING (auth.uid() = user_id);

-- Service role can do everything (for edge functions / Handler)
CREATE POLICY "Service manages ai_generated_content" ON ai_generated_content
  FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service manages engagement_targets" ON engagement_targets
  FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service manages revenue_content_calendar" ON revenue_content_calendar
  FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service manages paid_conversations" ON paid_conversations
  FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service manages gfe_subscribers" ON gfe_subscribers
  FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service manages affiliate_links" ON affiliate_links
  FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service manages revenue_decisions" ON revenue_decisions
  FOR ALL USING (true) WITH CHECK (true);
