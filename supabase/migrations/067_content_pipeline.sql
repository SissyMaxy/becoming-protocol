-- ============================================
-- Content Pipeline: Handler as Autonomous Showrunner
-- ALTERs existing tables + creates new pipeline tables
-- ============================================

-- ============================================
-- ALTER content_vault (from 048) — add pipeline columns
-- ============================================

ALTER TABLE content_vault
  ADD COLUMN IF NOT EXISTS quality_rating INTEGER CHECK (quality_rating BETWEEN 1 AND 5),
  ADD COLUMN IF NOT EXISTS content_type TEXT CHECK (content_type IN (
    'progress', 'lifestyle', 'explicit', 'tease', 'educational',
    'behind_the_scenes', 'voice', 'before_after', 'journal_excerpt',
    'outfit', 'routine', 'cam_highlight', 'milestone'
  )),
  ADD COLUMN IF NOT EXISTS explicitness_level INTEGER DEFAULT 0 CHECK (explicitness_level BETWEEN 0 AND 5),
  ADD COLUMN IF NOT EXISTS identification_risk TEXT DEFAULT 'none' CHECK (identification_risk IN ('none', 'low', 'medium', 'high')),
  ADD COLUMN IF NOT EXISTS platform_suitability JSONB DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS narrative_arc_id UUID,
  ADD COLUMN IF NOT EXISTS handler_notes TEXT,
  ADD COLUMN IF NOT EXISTS approval_status TEXT DEFAULT 'pending' CHECK (approval_status IN ('pending', 'approved', 'rejected', 'auto_approved', 'distributed', 'archived')),
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS auto_approval_rule TEXT,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- ============================================
-- ALTER revenue_log (from 050) — add pipeline columns
-- ============================================

ALTER TABLE revenue_log
  ADD COLUMN IF NOT EXISTS revenue_type TEXT,
  ADD COLUMN IF NOT EXISTS distribution_id UUID,
  ADD COLUMN IF NOT EXISTS session_id TEXT,
  ADD COLUMN IF NOT EXISTS period_date DATE,
  ADD COLUMN IF NOT EXISTS notes TEXT;

-- ============================================
-- content_distribution: Platform posts with captions, schedule, metrics
-- ============================================

CREATE TABLE IF NOT EXISTS content_distribution (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  vault_id UUID REFERENCES content_vault(id) ON DELETE SET NULL,

  platform TEXT NOT NULL CHECK (platform IN ('twitter', 'reddit', 'onlyfans', 'fansly', 'moltbook')),
  caption TEXT,
  hashtags TEXT[],
  scheduled_at TIMESTAMPTZ,
  posted_at TIMESTAMPTZ,
  post_url TEXT,

  post_status TEXT DEFAULT 'draft' CHECK (post_status IN ('draft', 'scheduled', 'posted', 'failed', 'cancelled')),

  -- Engagement metrics
  views INTEGER DEFAULT 0,
  likes INTEGER DEFAULT 0,
  comments INTEGER DEFAULT 0,
  tips_cents INTEGER DEFAULT 0,
  shares INTEGER DEFAULT 0,

  -- Handler metadata
  handler_strategy TEXT,
  narrative_arc_id UUID,
  auto_generated BOOLEAN DEFAULT false,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- narrative_arcs: Handler's showrunner arc engine
-- (Separate from story_arcs in 049)
-- ============================================

CREATE TABLE IF NOT EXISTS narrative_arcs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,

  title TEXT NOT NULL,
  arc_type TEXT NOT NULL CHECK (arc_type IN (
    'transformation', 'challenge', 'milestone', 'vulnerability',
    'fan_driven', 'revenue_push', 'seasonal', 'recovery'
  )),
  domain_focus TEXT,
  platform_emphasis TEXT[],

  -- Beats: [{week: 1, beat: "First gym session", status: "completed"}, ...]
  beats JSONB DEFAULT '[]',
  current_beat INTEGER DEFAULT 0,

  arc_status TEXT DEFAULT 'planned' CHECK (arc_status IN ('planned', 'active', 'climax', 'completed', 'abandoned')),
  revenue_generated_cents INTEGER DEFAULT 0,

  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- fan_profiles: Audience intelligence
-- ============================================

CREATE TABLE IF NOT EXISTS fan_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,

  platform TEXT NOT NULL CHECK (platform IN ('twitter', 'reddit', 'onlyfans', 'fansly', 'moltbook')),
  username TEXT NOT NULL,
  display_name TEXT,

  engagement_score FLOAT DEFAULT 0,
  total_spent_cents INTEGER DEFAULT 0,
  message_count INTEGER DEFAULT 0,
  tip_count INTEGER DEFAULT 0,

  fan_tier TEXT DEFAULT 'casual' CHECK (fan_tier IN ('casual', 'regular', 'supporter', 'whale')),
  notes TEXT,
  last_interaction_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(user_id, platform, username)
);

-- ============================================
-- fan_messages: DM queue with approval pipeline
-- ============================================

CREATE TABLE IF NOT EXISTS fan_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  fan_id UUID REFERENCES fan_profiles(id) ON DELETE CASCADE,

  platform TEXT NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  message_text TEXT NOT NULL,
  handler_draft TEXT,

  approval_status TEXT DEFAULT 'pending' CHECK (approval_status IN ('auto', 'pending', 'approved', 'rejected')),
  approved_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- content_permissions: Standing auto-approval rules
-- ============================================

CREATE TABLE IF NOT EXISTS content_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,

  rule_type TEXT NOT NULL CHECK (rule_type IN ('explicitness_max', 'content_type', 'platform', 'source', 'full_autonomy')),
  rule_value TEXT NOT NULL,
  is_active BOOLEAN DEFAULT true,

  granted_denial_day INTEGER,
  granted_at TIMESTAMPTZ DEFAULT NOW(),

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- content_calendar: Daily slots for content scheduling
-- ============================================

CREATE TABLE IF NOT EXISTS content_calendar (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,

  calendar_date DATE NOT NULL,
  -- Slots: [{time: "10:00", platform: "twitter", vault_id: "...", status: "scheduled"}, ...]
  slots JSONB DEFAULT '[]',

  narrative_arc_id UUID REFERENCES narrative_arcs(id) ON DELETE SET NULL,
  beat_label TEXT,
  revenue_target_cents INTEGER DEFAULT 0,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(user_id, calendar_date)
);

-- ============================================
-- RLS Policies
-- ============================================

ALTER TABLE content_distribution ENABLE ROW LEVEL SECURITY;
ALTER TABLE narrative_arcs ENABLE ROW LEVEL SECURITY;
ALTER TABLE fan_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE fan_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE content_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE content_calendar ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own content_distribution"
  ON content_distribution FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can manage own narrative_arcs"
  ON narrative_arcs FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can manage own fan_profiles"
  ON fan_profiles FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can manage own fan_messages"
  ON fan_messages FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can manage own content_permissions"
  ON content_permissions FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can manage own content_calendar"
  ON content_calendar FOR ALL USING (auth.uid() = user_id);

-- ============================================
-- Indexes
-- ============================================

-- content_vault pipeline queries
CREATE INDEX IF NOT EXISTS idx_content_vault_approval ON content_vault(user_id, approval_status);
CREATE INDEX IF NOT EXISTS idx_content_vault_content_type ON content_vault(user_id, content_type);
CREATE INDEX IF NOT EXISTS idx_content_vault_updated ON content_vault(user_id, updated_at DESC);

-- distribution queries
CREATE INDEX IF NOT EXISTS idx_content_distribution_user_schedule ON content_distribution(user_id, scheduled_at);
CREATE INDEX IF NOT EXISTS idx_content_distribution_user_status ON content_distribution(user_id, post_status);
CREATE INDEX IF NOT EXISTS idx_content_distribution_vault ON content_distribution(vault_id);

-- arc queries
CREATE INDEX IF NOT EXISTS idx_narrative_arcs_user_status ON narrative_arcs(user_id, arc_status);

-- fan queries
CREATE INDEX IF NOT EXISTS idx_fan_profiles_user_platform ON fan_profiles(user_id, platform);
CREATE INDEX IF NOT EXISTS idx_fan_profiles_user_tier ON fan_profiles(user_id, fan_tier);
CREATE INDEX IF NOT EXISTS idx_fan_messages_user_status ON fan_messages(user_id, approval_status);

-- permission queries
CREATE INDEX IF NOT EXISTS idx_content_permissions_user_active ON content_permissions(user_id, is_active);

-- calendar queries
CREATE INDEX IF NOT EXISTS idx_content_calendar_user_date ON content_calendar(user_id, calendar_date);
