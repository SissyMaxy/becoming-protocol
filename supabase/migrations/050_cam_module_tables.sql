-- ============================================
-- Cam Module: Session Tracking, Revenue & Fan Engagement
-- ============================================

-- ============================================
-- CAM_SESSIONS: Main cam session tracking
-- ============================================

CREATE TABLE IF NOT EXISTS cam_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,

  -- Scheduling
  scheduled_at TIMESTAMPTZ,
  handler_prescribed BOOLEAN DEFAULT true,
  prescription_context TEXT,

  -- Parameters (Handler-set)
  minimum_duration_minutes INTEGER NOT NULL,
  maximum_duration_minutes INTEGER,
  target_tip_goal_cents INTEGER,

  -- Platform
  platform TEXT NOT NULL,
  room_type TEXT DEFAULT 'public',

  -- Lovense
  tip_to_device_enabled BOOLEAN DEFAULT true,
  tip_levels JSONB,
  handler_device_control BOOLEAN DEFAULT true,

  -- Content parameters (Handler-set)
  allowed_activities TEXT[],
  required_activities TEXT[],
  outfit_directive TEXT,
  voice_directive TEXT,
  exposure_level TEXT,

  -- Session rules
  edging_required BOOLEAN DEFAULT false,
  denial_enforced BOOLEAN DEFAULT true,
  feminine_voice_required BOOLEAN DEFAULT true,
  fan_requests_allowed BOOLEAN DEFAULT false,
  fan_directive_suggestions BOOLEAN DEFAULT false,
  min_tip_for_suggestion INTEGER,

  -- Narrative
  arc_id UUID REFERENCES story_arcs(id),
  beat_id UUID,
  narrative_framing TEXT,
  pre_session_post TEXT,

  -- Execution
  status TEXT DEFAULT 'scheduled' CHECK (status IN ('scheduled','preparing','live','ended','cancelled','skipped')),
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  actual_duration_minutes INTEGER,

  -- Revenue
  total_tips_cents INTEGER DEFAULT 0,
  total_privates_cents INTEGER DEFAULT 0,
  new_subscribers INTEGER DEFAULT 0,
  peak_viewers INTEGER,

  -- Recording
  recording_saved BOOLEAN DEFAULT false,
  recording_vault_id UUID REFERENCES content_vault(id),
  highlight_vault_ids UUID[],

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cam_scheduled ON cam_sessions(user_id, scheduled_at);
CREATE INDEX IF NOT EXISTS idx_cam_status ON cam_sessions(user_id, status);

-- ============================================
-- CAM_REVENUE: Per-event revenue during cam sessions
-- ============================================

CREATE TABLE IF NOT EXISTS cam_revenue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  session_id UUID REFERENCES cam_sessions(id) NOT NULL,

  event_type TEXT NOT NULL CHECK (event_type IN ('tip','private_show','subscription','token_purchase','media_unlock')),
  amount_cents INTEGER NOT NULL,
  fan_identifier TEXT,
  fan_tier INTEGER,

  triggered_device BOOLEAN DEFAULT false,
  device_pattern TEXT,
  device_duration_seconds INTEGER,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cam_revenue_session ON cam_revenue(session_id, created_at DESC);

-- ============================================
-- FAN_POLLS: Fan voting system
-- ============================================

CREATE TABLE IF NOT EXISTS fan_polls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,

  question TEXT NOT NULL,
  options JSONB NOT NULL,

  allowed_tiers INTEGER[] DEFAULT '{1,2,3,4}',
  voting_closes_at TIMESTAMPTZ NOT NULL,

  results JSONB,
  winning_option TEXT,

  resulting_task_id UUID,
  resulting_arc_id UUID REFERENCES story_arcs(id),
  resulting_cam_session_id UUID REFERENCES cam_sessions(id),

  status TEXT DEFAULT 'active' CHECK (status IN ('active','closed','cancelled')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fan_polls_status ON fan_polls(user_id, status);

-- ============================================
-- REVENUE_LOG: All revenue events across platforms
-- ============================================

CREATE TABLE IF NOT EXISTS revenue_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,

  source TEXT NOT NULL CHECK (source IN ('subscription','tip','ppv','donation','custom_request','cam_tip','cam_private')),
  platform TEXT NOT NULL,
  amount_cents INTEGER NOT NULL,
  currency TEXT DEFAULT 'USD',

  content_vault_id UUID REFERENCES content_vault(id),
  arc_id UUID REFERENCES story_arcs(id),
  cam_session_id UUID REFERENCES cam_sessions(id),
  funding_milestone_id UUID REFERENCES funding_milestones(id),

  fan_tier INTEGER,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_revenue_period ON revenue_log(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_revenue_source ON revenue_log(user_id, source);

-- ============================================
-- REVENUE_ANALYTICS: Monthly aggregation view
-- ============================================

CREATE OR REPLACE VIEW revenue_analytics AS
SELECT
  user_id,
  date_trunc('month', created_at) as month,
  SUM(amount_cents) as total_cents,
  SUM(amount_cents) FILTER (WHERE source = 'subscription') as subscription_cents,
  SUM(amount_cents) FILTER (WHERE source IN ('tip', 'cam_tip')) as tip_cents,
  SUM(amount_cents) FILTER (WHERE source = 'donation') as donation_cents,
  SUM(amount_cents) FILTER (WHERE source IN ('cam_tip', 'cam_private')) as cam_cents,
  SUM(amount_cents) FILTER (WHERE source = 'ppv') as ppv_cents,
  SUM(amount_cents) FILTER (WHERE source = 'custom_request') as custom_cents
FROM revenue_log
GROUP BY user_id, date_trunc('month', created_at);

-- ============================================
-- RLS Policies
-- ============================================

ALTER TABLE cam_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE cam_revenue ENABLE ROW LEVEL SECURITY;
ALTER TABLE fan_polls ENABLE ROW LEVEL SECURITY;
ALTER TABLE revenue_log ENABLE ROW LEVEL SECURITY;

-- cam_sessions
CREATE POLICY "Users can view own cam sessions"
  ON cam_sessions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own cam sessions"
  ON cam_sessions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own cam sessions"
  ON cam_sessions FOR UPDATE
  USING (auth.uid() = user_id);

-- cam_revenue
CREATE POLICY "Users can view own cam revenue"
  ON cam_revenue FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own cam revenue"
  ON cam_revenue FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own cam revenue"
  ON cam_revenue FOR UPDATE
  USING (auth.uid() = user_id);

-- fan_polls
CREATE POLICY "Users can view own fan polls"
  ON fan_polls FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own fan polls"
  ON fan_polls FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own fan polls"
  ON fan_polls FOR UPDATE
  USING (auth.uid() = user_id);

-- revenue_log
CREATE POLICY "Users can view own revenue log"
  ON revenue_log FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own revenue log"
  ON revenue_log FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own revenue log"
  ON revenue_log FOR UPDATE
  USING (auth.uid() = user_id);

-- ============================================
-- Service Role Bypass Policies
-- ============================================

CREATE POLICY "Service role full access" ON cam_sessions
  FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

CREATE POLICY "Service role full access" ON cam_revenue
  FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

CREATE POLICY "Service role full access" ON fan_polls
  FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

CREATE POLICY "Service role full access" ON revenue_log
  FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');
