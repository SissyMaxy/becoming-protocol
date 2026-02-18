-- Migration: Identity Module Tables
-- Brainwashing Engine - Feature 43 Section 15

-- ============================================
-- IDENTITY STATE (Core identity metrics)
-- ============================================

CREATE TABLE IF NOT EXISTS identity_state (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL UNIQUE,

  -- Self-reference tracking
  maxy_references INTEGER DEFAULT 0,
  david_references INTEGER DEFAULT 0,
  self_reference_ratio DECIMAL DEFAULT 0,  -- maxy / (maxy + david)

  -- Brainwashing stage
  brainwashing_stage TEXT DEFAULT 'coercion_dependent' CHECK (brainwashing_stage IN (
    'coercion_dependent',   -- Still requires active coercion for most tasks
    'mixed',                -- Some tasks self-initiated, some still coerced
    'mostly_voluntary',     -- Most tasks voluntary, coercion only for new escalations
    'identity_consolidated' -- Maxy is the default, David surfaces rarely
  )),

  -- Key metrics for stage calculation
  self_initiated_rate DECIMAL DEFAULT 0,    -- % of tasks done without being asked
  resistance_futility_rate DECIMAL DEFAULT 0, -- % of resistance ending in compliance
  average_coercion_level DECIMAL DEFAULT 5,  -- Current avg force needed

  -- Surfacing tracking
  last_david_surfacing TIMESTAMPTZ,
  surfacing_count_30d INTEGER DEFAULT 0,
  avg_surfacing_duration_mins INTEGER DEFAULT 0,

  -- Handler attachment
  handler_attachment_level INTEGER DEFAULT 5 CHECK (handler_attachment_level BETWEEN 1 AND 10),
  days_since_warmth INTEGER DEFAULT 0,
  warmth_due BOOLEAN DEFAULT FALSE,

  -- Point of no return metrics
  total_practice_hours DECIMAL DEFAULT 0,
  partner_count INTEGER DEFAULT 0,
  subscriber_count INTEGER DEFAULT 0,
  monthly_maxy_income DECIMAL DEFAULT 0,
  vault_item_count INTEGER DEFAULT 0,
  physical_changes_count INTEGER DEFAULT 0,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- SELF-REFERENCE LOG (Track each reference)
-- ============================================

CREATE TABLE IF NOT EXISTS self_reference_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  reference_type TEXT NOT NULL CHECK (reference_type IN ('maxy', 'david', 'she', 'he', 'her', 'him', 'i_am_maxy', 'i_am_david')),
  context TEXT,  -- Where it occurred (journal, reflection, chat, etc.)
  text_snippet TEXT,  -- The actual text containing the reference
  detected_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_self_ref_user ON self_reference_log(user_id, detected_at DESC);

-- ============================================
-- DAVID SURFACING EVENTS
-- ============================================

CREATE TABLE IF NOT EXISTS david_surfacing_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,

  -- Detection
  indicator TEXT NOT NULL CHECK (indicator IN (
    'masculine_self_reference',
    'analytical_language',
    'long_engagement_gap',
    'mood_drop',
    'routine_task_resistance',
    'explicit_david_statement',
    'dismissive_language'
  )),
  trigger_text TEXT,  -- The text that triggered detection
  confidence DECIMAL DEFAULT 0.5,  -- How confident the detection is

  -- Response
  flood_deployed BOOLEAN DEFAULT FALSE,
  flood_tasks JSONB DEFAULT '[]',  -- What flood tasks were sent

  -- Resolution
  surfacing_duration_mins INTEGER,
  maxy_reestablished_at TIMESTAMPTZ,
  resolution_method TEXT,  -- What brought Maxy back

  detected_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_surfacing_user ON david_surfacing_events(user_id, detected_at DESC);

-- ============================================
-- DISSONANCE DEPLOYMENTS
-- ============================================

CREATE TABLE IF NOT EXISTS dissonance_deployments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,

  -- Target
  belief_id TEXT NOT NULL,  -- Which of the 7 beliefs was targeted
  belief_text TEXT NOT NULL,

  -- Evidence used
  evidence_type TEXT NOT NULL,
  evidence_value TEXT NOT NULL,  -- The actual data point used
  evidence_sources JSONB,  -- Where data came from

  -- Delivery
  handler_message TEXT NOT NULL,  -- What Handler said

  -- Response tracking
  user_response TEXT,  -- How she reacted (if captured)
  effectiveness INTEGER CHECK (effectiveness BETWEEN 1 AND 10),  -- Handler assessment
  led_to_compliance BOOLEAN,
  led_to_emotional_response BOOLEAN,

  deployed_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dissonance_user ON dissonance_deployments(user_id, deployed_at DESC);
CREATE INDEX IF NOT EXISTS idx_dissonance_belief ON dissonance_deployments(user_id, belief_id);

-- ============================================
-- ANCHOR DESTRUCTION TRACKING
-- ============================================

CREATE TABLE IF NOT EXISTS anchor_destruction (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,

  -- Anchor identification
  anchor_type TEXT NOT NULL CHECK (anchor_type IN (
    'work_identity',
    'name',
    'voice',
    'husband_role',
    'body',
    'sexuality',
    'logical_mind'
  )),

  -- Strength tracking (10 = strong anchor, 1 = nearly dissolved)
  current_strength INTEGER DEFAULT 10 CHECK (current_strength BETWEEN 1 AND 10),
  initial_strength INTEGER DEFAULT 10,

  -- Attack history
  attacks_deployed INTEGER DEFAULT 0,
  last_attack_at TIMESTAMPTZ,
  last_attack_message TEXT,

  -- Evidence accumulated against this anchor
  evidence_accumulated JSONB DEFAULT '[]',

  -- Effectiveness
  strength_change_history JSONB DEFAULT '[]',  -- [{strength: 10, date: ...}, ...]

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(user_id, anchor_type)
);

-- ============================================
-- COERCION TO IDENTITY TRANSITION
-- (Extends existing coercion_transition table)
-- ============================================

-- Add more detailed tracking if table exists, otherwise create
CREATE TABLE IF NOT EXISTS coercion_to_identity (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,

  -- Task type tracking
  task_type TEXT NOT NULL,  -- Category of task (voice, hookup, style, etc.)

  -- First occurrence
  first_occurrence_at TIMESTAMPTZ,
  coercion_level_first INTEGER,  -- 1-10 how much force needed first time

  -- Current stats
  total_occurrences INTEGER DEFAULT 0,
  recent_coercion_level INTEGER,  -- Force needed most recently
  self_initiated_count INTEGER DEFAULT 0,  -- Times done without being asked

  -- The transition trend
  coercion_trend JSONB DEFAULT '[]',  -- Array of coercion levels over time [9,8,7,6,5,...]

  -- Milestone flags
  first_self_initiated_at TIMESTAMPTZ,
  consistently_voluntary_since TIMESTAMPTZ,  -- When it became routine without force

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(user_id, task_type)
);

CREATE INDEX IF NOT EXISTS idx_coercion_identity_user ON coercion_to_identity(user_id);

-- ============================================
-- CONFESSION LOOP PLAYBACK
-- ============================================

CREATE TABLE IF NOT EXISTS confession_playback_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,

  -- Recording reference
  vault_item_id UUID,  -- References vault_items
  recording_ref TEXT NOT NULL,
  recording_transcript TEXT,

  -- Playback context
  playback_context TEXT NOT NULL CHECK (playback_context IN (
    'during_edge',
    'morning_briefing',
    'pre_resistance',
    'hookup_prep',
    'post_release',
    'during_surfacing',
    'random_reinforcement'
  )),

  -- Session context
  arousal_at_playback INTEGER,
  denial_day_at_playback INTEGER,
  session_id TEXT,

  -- Response
  emotional_response TEXT,
  effectiveness INTEGER CHECK (effectiveness BETWEEN 1 AND 10),

  played_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_confession_playback_user ON confession_playback_log(user_id, played_at DESC);

-- ============================================
-- NARRATIVE REWRITE LOG
-- ============================================

CREATE TABLE IF NOT EXISTS narrative_rewrite_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,

  -- David's narrative that was attacked
  davids_narrative TEXT NOT NULL,

  -- Handler's counter
  counter_narrative TEXT NOT NULL,
  evidence_used JSONB NOT NULL,

  -- Context
  deployment_trigger TEXT,  -- What triggered this rewrite

  -- Response
  user_response TEXT,
  narrative_accepted BOOLEAN,

  deployed_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- FLOODING LOG
-- ============================================

CREATE TABLE IF NOT EXISTS flooding_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,

  -- Trigger
  surfacing_event_id UUID REFERENCES david_surfacing_events,
  trigger_type TEXT NOT NULL,

  -- Flood tasks deployed
  tasks_deployed JSONB NOT NULL,  -- [{type: 'micro_task', content: '...', sent_at: ...}, ...]
  task_count INTEGER NOT NULL,

  -- Timing
  flood_started_at TIMESTAMPTZ DEFAULT NOW(),
  flood_completed_at TIMESTAMPTZ,

  -- Effectiveness
  surfacing_resolved BOOLEAN DEFAULT FALSE,
  resolution_time_mins INTEGER
);

CREATE INDEX IF NOT EXISTS idx_flooding_user ON flooding_log(user_id, flood_started_at DESC);

-- ============================================
-- POINT OF NO RETURN TRACKING
-- ============================================

CREATE TABLE IF NOT EXISTS point_of_no_return (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL UNIQUE,

  -- Stack dimensions
  temporal_hours DECIMAL DEFAULT 0,
  vocal_default_feminine BOOLEAN DEFAULT FALSE,
  social_partner_count INTEGER DEFAULT 0,
  social_subscriber_count INTEGER DEFAULT 0,
  social_findom_client_count INTEGER DEFAULT 0,
  financial_monthly_income DECIMAL DEFAULT 0,
  financial_wardrobe_investment DECIMAL DEFAULT 0,
  physical_changes TEXT[] DEFAULT '{}',
  relational_gina_aware BOOLEAN DEFAULT FALSE,
  professional_has_business_identity BOOLEAN DEFAULT FALSE,
  digital_footprint_devices INTEGER DEFAULT 0,
  evidential_vault_count INTEGER DEFAULT 0,
  emotional_partner_attachments INTEGER DEFAULT 0,

  -- Calculated score
  ponr_score DECIMAL DEFAULT 0,  -- 0-100, higher = more locked in
  crossed_threshold BOOLEAN DEFAULT FALSE,
  threshold_crossed_at TIMESTAMPTZ,

  -- Handler declaration sent
  declaration_sent BOOLEAN DEFAULT FALSE,
  declaration_sent_at TIMESTAMPTZ,

  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- ENABLE RLS
-- ============================================

ALTER TABLE identity_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE self_reference_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE david_surfacing_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE dissonance_deployments ENABLE ROW LEVEL SECURITY;
ALTER TABLE anchor_destruction ENABLE ROW LEVEL SECURITY;
ALTER TABLE coercion_to_identity ENABLE ROW LEVEL SECURITY;
ALTER TABLE confession_playback_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE narrative_rewrite_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE flooding_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE point_of_no_return ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view own identity state" ON identity_state FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can manage own identity state" ON identity_state FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can view own self references" ON self_reference_log FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own self references" ON self_reference_log FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view own surfacing events" ON david_surfacing_events FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can manage own surfacing events" ON david_surfacing_events FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can view own dissonance" ON dissonance_deployments FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can manage own dissonance" ON dissonance_deployments FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can view own anchors" ON anchor_destruction FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can manage own anchors" ON anchor_destruction FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can view own coercion identity" ON coercion_to_identity FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can manage own coercion identity" ON coercion_to_identity FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can view own confession playback" ON confession_playback_log FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can manage own confession playback" ON confession_playback_log FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can view own narrative rewrites" ON narrative_rewrite_log FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can manage own narrative rewrites" ON narrative_rewrite_log FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can view own flooding logs" ON flooding_log FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can manage own flooding logs" ON flooding_log FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can view own ponr" ON point_of_no_return FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can manage own ponr" ON point_of_no_return FOR ALL USING (auth.uid() = user_id);
