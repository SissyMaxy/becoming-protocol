-- ============================================
-- Content Pipeline Phase 2: Showrunner Narrative Engine
-- ============================================

-- Story Arcs: Narrative containers for serialized content
CREATE TABLE IF NOT EXISTS story_arcs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,

  title TEXT NOT NULL,
  arc_type TEXT NOT NULL CHECK (arc_type IN (
    'domain_deep_dive', 'challenge', 'denial', 'funding',
    'vulnerability', 'fan_driven', 'milestone', 'style_outfit',
    'voice', 'chastity', 'obedience', 'body'
  )),
  domain TEXT,

  -- Narrative plan (AI-generated beats structure)
  narrative_plan JSONB NOT NULL DEFAULT '{}',
  transformation_goal TEXT,
  escalation_target TEXT,
  sissification_angle TEXT,
  stakes_description TEXT,

  -- Timeline
  current_beat INTEGER DEFAULT 0,
  total_beats INTEGER DEFAULT 0,
  start_date DATE,
  target_end_date DATE,
  actual_end_date DATE,

  -- Fan engagement
  fan_poll_id UUID,
  fan_hook_active TEXT,

  -- Performance
  engagement_score FLOAT,
  revenue_attributed_cents INTEGER DEFAULT 0,
  cam_sessions_completed INTEGER DEFAULT 0,
  submission_count INTEGER DEFAULT 0,
  veto_count INTEGER DEFAULT 0,

  status TEXT DEFAULT 'planned' CHECK (status IN ('planned', 'active', 'climax', 'resolved', 'abandoned')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_arcs_user_status ON story_arcs(user_id, status);
CREATE INDEX idx_arcs_active ON story_arcs(user_id, start_date) WHERE status IN ('planned', 'active', 'climax');

-- Content Beats: Individual narrative moments within arcs
CREATE TABLE IF NOT EXISTS content_beats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  arc_id UUID REFERENCES story_arcs(id) ON DELETE CASCADE,

  beat_type TEXT NOT NULL CHECK (beat_type IN (
    'setup', 'progress', 'setback', 'breakthrough', 'climax',
    'reflection', 'tease', 'cam_session', 'fan_interaction', 'funding_push'
  )),
  beat_number INTEGER,
  scheduled_date DATE,

  -- Task integration
  task_id TEXT,
  task_domain TEXT,
  task_category TEXT,
  task_instructions_override TEXT,
  capture_type TEXT,
  capture_instructions TEXT NOT NULL,
  requires_submission BOOLEAN DEFAULT false,

  -- Cam integration
  cam_session_id UUID,
  is_cam_beat BOOLEAN DEFAULT false,

  -- Narrative
  narrative_framing TEXT,
  fan_hook TEXT,
  suggested_caption_direction TEXT,
  sissification_framing TEXT,

  -- Execution
  vault_content_id UUID REFERENCES content_vault(id),
  executed_at TIMESTAMPTZ,
  caption_used TEXT,
  platform_posted_to TEXT,

  status TEXT DEFAULT 'planned' CHECK (status IN ('planned', 'active', 'captured', 'posted', 'skipped')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_beats_arc ON content_beats(arc_id, beat_number);
CREATE INDEX idx_beats_date ON content_beats(user_id, scheduled_date);
CREATE INDEX idx_beats_pending ON content_beats(user_id, status) WHERE status IN ('planned', 'active');

-- Funding Milestones: Crowdfunding targets
CREATE TABLE IF NOT EXISTS funding_milestones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,

  title TEXT NOT NULL,
  description TEXT,
  target_amount_cents INTEGER NOT NULL,
  current_amount_cents INTEGER DEFAULT 0,

  reward_content TEXT,
  reward_tier_minimum INTEGER,
  transformation_action TEXT,

  arc_id UUID REFERENCES story_arcs(id),

  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'funded', 'fulfilled', 'cancelled')),
  funded_at TIMESTAMPTZ,
  fulfilled_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_milestones_active ON funding_milestones(user_id, status) WHERE status = 'active';

-- ============================================
-- RLS Policies
-- ============================================

ALTER TABLE story_arcs ENABLE ROW LEVEL SECURITY;
ALTER TABLE content_beats ENABLE ROW LEVEL SECURITY;
ALTER TABLE funding_milestones ENABLE ROW LEVEL SECURITY;

-- story_arcs
CREATE POLICY "Users can view own arcs"
  ON story_arcs FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own arcs"
  ON story_arcs FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own arcs"
  ON story_arcs FOR UPDATE USING (auth.uid() = user_id);

-- content_beats
CREATE POLICY "Users can view own beats"
  ON content_beats FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own beats"
  ON content_beats FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own beats"
  ON content_beats FOR UPDATE USING (auth.uid() = user_id);

-- funding_milestones
CREATE POLICY "Users can view own milestones"
  ON funding_milestones FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own milestones"
  ON funding_milestones FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own milestones"
  ON funding_milestones FOR UPDATE USING (auth.uid() = user_id);
