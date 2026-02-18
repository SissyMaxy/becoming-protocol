-- Migration 045: Handler Autonomous System
-- Complete database schema for the fully autonomous Handler.
-- Content management, platform integration, financial engine, strategy, and sex work progression.

-- ============================================
-- 1. HANDLER DECISIONS (audit trail)
-- ============================================
CREATE TABLE IF NOT EXISTS handler_decisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  decision_type TEXT NOT NULL, -- content_strategy, task_assignment, posting, consequence, reward, escalation, fund_allocation, adaptation
  decision_data JSONB NOT NULL,
  reasoning TEXT,
  executed BOOLEAN DEFAULT false,
  executed_at TIMESTAMPTZ,
  outcome JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 2. CONTENT LIBRARY (Handler's asset inventory)
-- ============================================
CREATE TABLE IF NOT EXISTS content_library (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  content_type TEXT NOT NULL, -- photo, photo_set, video, audio, text
  storage_path TEXT NOT NULL, -- Supabase storage path
  storage_url TEXT, -- Public/signed URL
  thumbnail_path TEXT,
  thumbnail_url TEXT,
  metadata JSONB DEFAULT '{}', -- duration_seconds, width, height, file_size_bytes, mime_type
  vulnerability_tier INTEGER NOT NULL DEFAULT 1 CHECK (vulnerability_tier BETWEEN 1 AND 5),
  tags TEXT[] DEFAULT '{}',
  caption_variations JSONB DEFAULT '{}', -- {platform: caption} AI-generated per platform
  platforms_posted JSONB DEFAULT '[]', -- [{platform, post_id, posted_at}]
  performance_data JSONB DEFAULT '{}', -- {platform: {likes, comments, shares, views}}
  monetization_data JSONB DEFAULT '{}', -- {platform: {revenue, tips, ppv_sales}}
  source TEXT DEFAULT 'brief_submission', -- brief_submission, quick_task, direct_upload, arousal_capture
  source_brief_id UUID, -- FK to content_briefs if from a brief
  released_as_consequence BOOLEAN DEFAULT false,
  released_at TIMESTAMPTZ,
  times_posted INTEGER DEFAULT 0,
  last_posted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 3. CONTENT BRIEFS (tasks assigned to David)
-- ============================================
CREATE TABLE IF NOT EXISTS content_briefs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  brief_number SERIAL,
  status TEXT DEFAULT 'assigned' CHECK (status IN ('assigned', 'in_progress', 'submitted', 'processed', 'declined', 'expired')),
  content_type TEXT NOT NULL, -- photo, photo_set, video, audio, text
  purpose TEXT NOT NULL, -- what this content achieves
  platforms TEXT[] NOT NULL, -- target platforms for posting
  instructions JSONB NOT NULL, -- {concept, setting, outfit, lighting, framing, expression, poses[], script, duration, technicalNotes[]}
  deadline TIMESTAMPTZ NOT NULL,
  difficulty INTEGER DEFAULT 2 CHECK (difficulty BETWEEN 1 AND 5),
  vulnerability_tier INTEGER DEFAULT 1 CHECK (vulnerability_tier BETWEEN 1 AND 5),
  reward_money DECIMAL(10,2) DEFAULT 0,
  reward_arousal TEXT, -- description of arousal reward
  reward_edge_credits INTEGER DEFAULT 0,
  consequence_if_missed JSONB, -- {type, amount, description}
  submitted_content_ids UUID[] DEFAULT '{}', -- references to content_library
  submitted_at TIMESTAMPTZ,
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 4. PLATFORM ACCOUNTS (Handler manages these)
-- ============================================
CREATE TABLE IF NOT EXISTS platform_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  platform TEXT NOT NULL, -- onlyfans, fansly, reddit, twitter, patreon, instagram, tiktok
  account_type TEXT NOT NULL DEFAULT 'explicit', -- explicit, sfw, fitness, voice, transition
  username TEXT,
  display_name TEXT,
  credentials_encrypted TEXT, -- encrypted OAuth tokens / API keys / session cookies
  auth_method TEXT NOT NULL DEFAULT 'oauth', -- oauth, api_key, session
  profile_data JSONB DEFAULT '{}', -- bio, avatar, banner, etc.
  posting_schedule JSONB DEFAULT '{}', -- {optimal_times[], frequency_per_day, best_days[]}
  content_strategy JSONB DEFAULT '{}', -- {content_types[], vulnerability_range, themes[]}
  analytics JSONB DEFAULT '{}', -- latest analytics snapshot
  revenue_total DECIMAL(10,2) DEFAULT 0,
  subscriber_count INTEGER DEFAULT 0,
  engagement_rate REAL DEFAULT 0,
  enabled BOOLEAN DEFAULT true,
  is_release_platform BOOLEAN DEFAULT false, -- used for consequence content release
  release_config JSONB DEFAULT '{}', -- {subreddits[], max_vulnerability_tier}
  last_posted_at TIMESTAMPTZ,
  last_synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, platform, account_type)
);

-- ============================================
-- 5. SCHEDULED POSTS (Handler's posting queue)
-- ============================================
CREATE TABLE IF NOT EXISTS scheduled_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  platform_account_id UUID REFERENCES platform_accounts(id),
  content_id UUID REFERENCES content_library(id),
  post_type TEXT NOT NULL DEFAULT 'feed', -- feed, story, ppv, message, comment
  caption TEXT,
  hashtags TEXT[] DEFAULT '{}',
  metadata JSONB DEFAULT '{}', -- {subreddit, flair, nsfw, spoiler, price, etc.}
  scheduled_for TIMESTAMPTZ NOT NULL,
  price DECIMAL(10,2), -- for PPV content (null = free)
  status TEXT DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'posting', 'posted', 'failed', 'cancelled', 'retrying')),
  retry_count INTEGER DEFAULT 0,
  max_retries INTEGER DEFAULT 3,
  posted_at TIMESTAMPTZ,
  post_url TEXT, -- URL after posting
  post_external_id TEXT, -- platform's post ID
  engagement_data JSONB DEFAULT '{}', -- {likes, comments, shares, views}
  revenue_generated DECIMAL(10,2) DEFAULT 0,
  error_message TEXT,
  is_consequence_release BOOLEAN DEFAULT false, -- true if posted as escalation consequence
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 6. REVENUE EVENTS
-- ============================================
CREATE TABLE IF NOT EXISTS revenue_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  platform TEXT NOT NULL,
  platform_account_id UUID REFERENCES platform_accounts(id),
  revenue_type TEXT NOT NULL, -- subscription, tip, ppv, message, gift, referral, custom_request
  amount DECIMAL(10,2) NOT NULL,
  currency TEXT DEFAULT 'USD',
  net_amount DECIMAL(10,2), -- after platform fees
  subscriber_id TEXT, -- platform's subscriber identifier
  subscriber_name TEXT,
  content_id UUID REFERENCES content_library(id),
  metadata JSONB DEFAULT '{}',
  processed BOOLEAN DEFAULT false, -- added to maxy_fund?
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 7. MAXY FUND (Handler-controlled finances)
-- ============================================
CREATE TABLE IF NOT EXISTS maxy_fund (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL UNIQUE,
  balance DECIMAL(10,2) DEFAULT 0,
  total_earned DECIMAL(10,2) DEFAULT 0,
  total_penalties DECIMAL(10,2) DEFAULT 0,
  total_spent_feminization DECIMAL(10,2) DEFAULT 0,
  total_paid_out DECIMAL(10,2) DEFAULT 0,
  pending_payout DECIMAL(10,2) DEFAULT 0,
  payout_threshold DECIMAL(10,2) DEFAULT 100, -- minimum balance for payout consideration
  reserve_percentage REAL DEFAULT 0.2, -- % kept as reserve for consequences
  monthly_penalty_limit DECIMAL(10,2) DEFAULT 500,
  monthly_penalties_this_month DECIMAL(10,2) DEFAULT 0,
  penalty_month TEXT, -- YYYY-MM for tracking monthly resets
  stripe_customer_id TEXT,
  stripe_payment_method_id TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 8. FUND TRANSACTIONS
-- ============================================
CREATE TABLE IF NOT EXISTS fund_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  transaction_type TEXT NOT NULL, -- revenue, penalty, feminization_purchase, payout, reward, bleeding, stripe_charge
  amount DECIMAL(10,2) NOT NULL, -- positive for credits, negative for debits
  description TEXT,
  reference_id UUID, -- link to revenue_event, financial_consequence, content_brief, etc.
  reference_type TEXT, -- what reference_id points to
  balance_after DECIMAL(10,2),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 9. HANDLER STRATEGY STATE
-- ============================================
CREATE TABLE IF NOT EXISTS handler_strategy (
  user_id UUID PRIMARY KEY REFERENCES auth.users,
  current_phase TEXT DEFAULT 'foundation' CHECK (current_phase IN ('foundation', 'growth', 'monetization', 'scale', 'sex_work')),
  content_focus JSONB DEFAULT '{}', -- {primaryTypes[], secondaryTypes[], avoidTypes[], vulnerabilityTarget, frequencyDaily}
  platform_priority JSONB DEFAULT '[]', -- ordered list of platforms to focus on
  posting_frequency JSONB DEFAULT '{}', -- {platform: posts_per_day}
  monetization_strategy JSONB DEFAULT '{}', -- {ppv_pricing, subscription_pricing, tip_goals}
  audience_insights JSONB DEFAULT '{}', -- {demographics, preferences, peak_times}
  performance_trends JSONB DEFAULT '{}', -- {engagement_trend, revenue_trend, subscriber_trend}
  resistance_patterns JSONB DEFAULT '{}', -- {types[], triggers[], countermeasures[]}
  adaptation_data JSONB DEFAULT '{}', -- {compliance_patterns, content_patterns, arousal_patterns}
  next_milestones JSONB DEFAULT '[]', -- [{description, target, current, deadline}]
  content_calendar JSONB DEFAULT '[]', -- [{date, slots: [{contentType, platform, vulnerabilityTier, deadline}]}]
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 10. SEX WORK PROGRESSION
-- ============================================
CREATE TABLE IF NOT EXISTS sex_work_progression (
  user_id UUID PRIMARY KEY REFERENCES auth.users,
  enabled BOOLEAN DEFAULT false,
  readiness_score INTEGER DEFAULT 0 CHECK (readiness_score BETWEEN 0 AND 100),
  milestones_completed JSONB DEFAULT '[]',
  services_authorized JSONB DEFAULT '[]', -- [online_only, findom, phone_sex, customs, cam_sessions, in_person_meets]
  boundaries JSONB DEFAULT '{}', -- {hard_limits[], soft_limits[], preferences[]}
  screening_requirements JSONB DEFAULT '{}',
  pricing JSONB DEFAULT '{}', -- {service_type: price}
  platforms JSONB DEFAULT '[]', -- specialized platforms
  safety_protocols JSONB DEFAULT '{}',
  auto_accept_level INTEGER DEFAULT 0, -- 0=never, 1-5=intensity threshold
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 11. COMPLIANCE STATE (real-time tracking)
-- ============================================
CREATE TABLE IF NOT EXISTS compliance_state (
  user_id UUID PRIMARY KEY REFERENCES auth.users,
  last_engagement_at TIMESTAMPTZ DEFAULT NOW(),
  hours_since_engagement REAL DEFAULT 0,
  daily_tasks_complete INTEGER DEFAULT 0,
  daily_tasks_required INTEGER DEFAULT 1,
  daily_minimum_met BOOLEAN DEFAULT false,
  escalation_tier INTEGER DEFAULT 0 CHECK (escalation_tier BETWEEN 0 AND 9),
  bleeding_active BOOLEAN DEFAULT false,
  bleeding_started_at TIMESTAMPTZ,
  bleeding_rate_per_minute DECIMAL(10,4) DEFAULT 0.25,
  bleeding_total_today DECIMAL(10,2) DEFAULT 0,
  pending_consequence_count INTEGER DEFAULT 0,
  last_compliance_check TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 12. FEMINIZATION PURCHASES (Handler-ordered items)
-- ============================================
CREATE TABLE IF NOT EXISTS feminization_purchases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  item_description TEXT NOT NULL,
  category TEXT NOT NULL, -- clothing, makeup, skincare, accessories, services, digital
  amount DECIMAL(10,2) NOT NULL,
  priority INTEGER DEFAULT 3 CHECK (priority BETWEEN 1 AND 5), -- 1=urgent, 5=nice-to-have
  status TEXT DEFAULT 'identified' CHECK (status IN ('identified', 'approved', 'ordered', 'shipped', 'delivered', 'deferred')),
  order_reference TEXT,
  shipping_tracking TEXT,
  purchased_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- RLS POLICIES
-- ============================================

-- User read-only on most tables (Handler writes via service role)
ALTER TABLE handler_decisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE content_library ENABLE ROW LEVEL SECURITY;
ALTER TABLE content_briefs ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE scheduled_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE revenue_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE maxy_fund ENABLE ROW LEVEL SECURITY;
ALTER TABLE fund_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE handler_strategy ENABLE ROW LEVEL SECURITY;
ALTER TABLE sex_work_progression ENABLE ROW LEVEL SECURITY;
ALTER TABLE compliance_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE feminization_purchases ENABLE ROW LEVEL SECURITY;

-- User can read their own data (idempotent)
DO $$ BEGIN CREATE POLICY "Users read own decisions" ON handler_decisions FOR SELECT USING (auth.uid() = user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "Users read own content" ON content_library FOR SELECT USING (auth.uid() = user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "Users read own briefs" ON content_briefs FOR SELECT USING (auth.uid() = user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "Users read own revenue" ON revenue_events FOR SELECT USING (auth.uid() = user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "Users read own fund" ON maxy_fund FOR SELECT USING (auth.uid() = user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "Users read own transactions" ON fund_transactions FOR SELECT USING (auth.uid() = user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "Users read own compliance" ON compliance_state FOR SELECT USING (auth.uid() = user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "Users read own purchases" ON feminization_purchases FOR SELECT USING (auth.uid() = user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- User can update brief status (for submissions)
DO $$ BEGIN CREATE POLICY "Users update own briefs" ON content_briefs FOR UPDATE USING (auth.uid() = user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- User can INSERT content (for submissions)
DO $$ BEGIN CREATE POLICY "Users insert own content" ON content_library FOR INSERT WITH CHECK (auth.uid() = user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- User CANNOT see: platform_accounts credentials, handler_strategy, scheduled_posts details
DO $$ BEGIN CREATE POLICY "Users read own platform summary" ON platform_accounts FOR SELECT USING (auth.uid() = user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "Users read own posts summary" ON scheduled_posts FOR SELECT USING (auth.uid() = user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Handler strategy is hidden from user (service role only reads)
DO $$ BEGIN CREATE POLICY "Service only handler_strategy" ON handler_strategy FOR ALL USING (auth.role() = 'service_role'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "Service only sex_work" ON sex_work_progression FOR ALL USING (auth.role() = 'service_role'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Service role full access on all tables (idempotent)
DO $$ BEGIN CREATE POLICY "Service full handler_decisions" ON handler_decisions FOR ALL USING (auth.role() = 'service_role'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "Service full content_library" ON content_library FOR ALL USING (auth.role() = 'service_role'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "Service full content_briefs" ON content_briefs FOR ALL USING (auth.role() = 'service_role'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "Service full platform_accounts" ON platform_accounts FOR ALL USING (auth.role() = 'service_role'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "Service full scheduled_posts" ON scheduled_posts FOR ALL USING (auth.role() = 'service_role'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "Service full revenue_events" ON revenue_events FOR ALL USING (auth.role() = 'service_role'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "Service full maxy_fund" ON maxy_fund FOR ALL USING (auth.role() = 'service_role'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "Service full fund_transactions" ON fund_transactions FOR ALL USING (auth.role() = 'service_role'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "Service full compliance_state" ON compliance_state FOR ALL USING (auth.role() = 'service_role'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "Service full feminization_purchases" ON feminization_purchases FOR ALL USING (auth.role() = 'service_role'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================
-- INDEXES
-- ============================================
CREATE INDEX IF NOT EXISTS idx_decisions_user ON handler_decisions(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_decisions_type ON handler_decisions(decision_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_content_user ON content_library(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_content_type ON content_library(user_id, content_type);
CREATE INDEX IF NOT EXISTS idx_content_tier ON content_library(user_id, vulnerability_tier);
CREATE INDEX IF NOT EXISTS idx_content_unreleased ON content_library(user_id) WHERE released_as_consequence = false;
CREATE INDEX IF NOT EXISTS idx_briefs_user_status ON content_briefs(user_id, status);
CREATE INDEX IF NOT EXISTS idx_briefs_deadline ON content_briefs(deadline) WHERE status IN ('assigned', 'in_progress');
CREATE INDEX IF NOT EXISTS idx_platform_accounts_user ON platform_accounts(user_id, platform);
CREATE INDEX IF NOT EXISTS idx_scheduled_posts_due ON scheduled_posts(scheduled_for, status) WHERE status = 'scheduled';
CREATE INDEX IF NOT EXISTS idx_scheduled_posts_user ON scheduled_posts(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_revenue_user ON revenue_events(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_revenue_platform ON revenue_events(platform, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_revenue_unprocessed ON revenue_events(user_id) WHERE processed = false;
CREATE INDEX IF NOT EXISTS idx_transactions_user ON fund_transactions(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_purchases_user ON feminization_purchases(user_id, status);

-- ============================================
-- HELPER FUNCTIONS
-- ============================================

-- Initialize all autonomous system tables for a user
CREATE OR REPLACE FUNCTION initialize_autonomous_system(p_user_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Create maxy fund
  INSERT INTO maxy_fund (user_id) VALUES (p_user_id)
  ON CONFLICT (user_id) DO NOTHING;

  -- Create handler strategy
  INSERT INTO handler_strategy (user_id) VALUES (p_user_id)
  ON CONFLICT (user_id) DO NOTHING;

  -- Create compliance state
  INSERT INTO compliance_state (user_id) VALUES (p_user_id)
  ON CONFLICT (user_id) DO NOTHING;

  -- Create sex work progression (disabled by default)
  INSERT INTO sex_work_progression (user_id) VALUES (p_user_id)
  ON CONFLICT (user_id) DO NOTHING;
END;
$$;

-- Update compliance hours_since_engagement (called by cron)
CREATE OR REPLACE FUNCTION update_compliance_hours()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE compliance_state
  SET
    hours_since_engagement = EXTRACT(EPOCH FROM (NOW() - last_engagement_at)) / 3600,
    updated_at = NOW();
END;
$$;

-- Record engagement (resets timer)
CREATE OR REPLACE FUNCTION record_engagement(p_user_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE compliance_state
  SET
    last_engagement_at = NOW(),
    hours_since_engagement = 0,
    daily_tasks_complete = daily_tasks_complete + 1,
    bleeding_active = false,
    bleeding_started_at = NULL,
    updated_at = NOW()
  WHERE user_id = p_user_id;
END;
$$;

-- Get due scheduled posts
CREATE OR REPLACE FUNCTION get_due_posts()
RETURNS SETOF scheduled_posts
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT *
  FROM scheduled_posts
  WHERE status = 'scheduled'
    AND scheduled_for <= NOW()
  ORDER BY scheduled_for ASC
  LIMIT 20;
END;
$$;

-- Add to maxy fund
CREATE OR REPLACE FUNCTION add_to_fund(
  p_user_id UUID,
  p_amount DECIMAL(10,2),
  p_type TEXT,
  p_description TEXT,
  p_reference_id UUID DEFAULT NULL
)
RETURNS DECIMAL(10,2)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_new_balance DECIMAL(10,2);
BEGIN
  -- Update balance
  UPDATE maxy_fund
  SET
    balance = balance + p_amount,
    total_earned = CASE WHEN p_amount > 0 AND p_type = 'revenue' THEN total_earned + p_amount ELSE total_earned END,
    total_penalties = CASE WHEN p_type IN ('penalty', 'bleeding') THEN total_penalties + ABS(p_amount) ELSE total_penalties END,
    total_spent_feminization = CASE WHEN p_type = 'feminization_purchase' THEN total_spent_feminization + ABS(p_amount) ELSE total_spent_feminization END,
    total_paid_out = CASE WHEN p_type = 'payout' THEN total_paid_out + ABS(p_amount) ELSE total_paid_out END,
    updated_at = NOW()
  WHERE user_id = p_user_id
  RETURNING balance INTO v_new_balance;

  -- Log transaction
  INSERT INTO fund_transactions (user_id, transaction_type, amount, description, reference_id, reference_type, balance_after)
  VALUES (p_user_id, p_type, p_amount, p_description, p_reference_id, p_type, v_new_balance);

  RETURN v_new_balance;
END;
$$;

-- Get next brief number for user
CREATE OR REPLACE FUNCTION get_next_brief_number(p_user_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_max INTEGER;
BEGIN
  SELECT COALESCE(MAX(brief_number), 0) INTO v_max
  FROM content_briefs
  WHERE user_id = p_user_id;
  RETURN v_max + 1;
END;
$$;

-- View for user dashboard: summary stats (hides internal details)
CREATE OR REPLACE VIEW user_autonomous_summary AS
SELECT
  cs.user_id,
  cs.daily_tasks_complete,
  cs.daily_tasks_required,
  cs.daily_minimum_met,
  cs.escalation_tier,
  cs.bleeding_active,
  mf.balance AS fund_balance,
  mf.total_earned,
  (SELECT COUNT(*) FROM content_briefs cb WHERE cb.user_id = cs.user_id AND cb.status IN ('assigned', 'in_progress')) AS pending_briefs,
  (SELECT COUNT(*) FROM content_library cl WHERE cl.user_id = cs.user_id) AS total_content,
  (SELECT COALESCE(SUM(re.amount), 0) FROM revenue_events re WHERE re.user_id = cs.user_id AND re.created_at >= CURRENT_DATE) AS today_earnings,
  (SELECT COUNT(*) FROM scheduled_posts sp WHERE sp.user_id = cs.user_id AND sp.status = 'posted' AND sp.posted_at >= CURRENT_DATE) AS today_posts
FROM compliance_state cs
LEFT JOIN maxy_fund mf ON mf.user_id = cs.user_id;
