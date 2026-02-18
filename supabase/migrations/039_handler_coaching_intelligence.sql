-- Handler Coaching Intelligence - Consolidated Migration
-- Features from all 5 spec files

-- ============================================
-- PART 1: Core Coaching Features (1-9)
-- ============================================

-- Goals table for commitment tracking (Feature 3)
-- Note: May already exist - using CREATE TABLE IF NOT EXISTS
CREATE TABLE IF NOT EXISTS goals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  goal_text TEXT NOT NULL,
  set_during TEXT NOT NULL,
  engagement_level INTEGER,
  denial_day INTEGER,
  fulfilled BOOLEAN DEFAULT NULL,
  fulfilled_at TIMESTAMPTZ,
  follow_up_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add missing columns to goals if table already exists
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'goals' AND column_name = 'goal_text') THEN
    ALTER TABLE goals ADD COLUMN goal_text TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'goals' AND column_name = 'set_during') THEN
    ALTER TABLE goals ADD COLUMN set_during TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'goals' AND column_name = 'engagement_level') THEN
    ALTER TABLE goals ADD COLUMN engagement_level INTEGER;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'goals' AND column_name = 'denial_day') THEN
    ALTER TABLE goals ADD COLUMN denial_day INTEGER;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'goals' AND column_name = 'fulfilled') THEN
    ALTER TABLE goals ADD COLUMN fulfilled BOOLEAN DEFAULT NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'goals' AND column_name = 'fulfilled_at') THEN
    ALTER TABLE goals ADD COLUMN fulfilled_at TIMESTAMPTZ;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'goals' AND column_name = 'follow_up_count') THEN
    ALTER TABLE goals ADD COLUMN follow_up_count INTEGER DEFAULT 0;
  END IF;
END $$;

-- Session scripts for pre-authored content (Feature 7)
CREATE TABLE IF NOT EXISTS session_scripts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  domain TEXT NOT NULL,
  tier INTEGER NOT NULL,
  session_type TEXT NOT NULL,
  title TEXT NOT NULL,
  script_content TEXT NOT NULL,
  required_denial_day INTEGER DEFAULT 0,
  required_completed_sessions INTEGER DEFAULT 0,
  required_baseline JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Euphoria captures for non-arousal identity evidence (Feature 5)
CREATE TABLE IF NOT EXISTS euphoria_captures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  description TEXT NOT NULL,
  arousal_level INTEGER CHECK (arousal_level BETWEEN 0 AND 10),
  context TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Gina relationship evidence (Feature 9)
CREATE TABLE IF NOT EXISTS gina_evidence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  description TEXT NOT NULL,
  category TEXT,
  feeling TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- PART 2: Advanced Behavioral Support (10-18)
-- ============================================

-- Post-release reflections (Feature 10)
CREATE TABLE IF NOT EXISTS post_release_captures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  reflection_text TEXT NOT NULL,
  denial_day_at_release INTEGER,
  session_type TEXT,
  seconds_after_release INTEGER,
  arousal_at_capture INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Denial schedule tracking (Feature 11)
CREATE TABLE IF NOT EXISTS denial_cycles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  cycle_start TIMESTAMPTZ NOT NULL,
  minimum_days INTEGER DEFAULT 3,
  maximum_days INTEGER DEFAULT 10,
  target_day INTEGER,
  actual_release_day INTEGER,
  release_earned BOOLEAN,
  engagement_score NUMERIC,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Masculine effort tracking (Feature 12)
CREATE TABLE IF NOT EXISTS masculine_effort_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  description TEXT NOT NULL,
  effort_level INTEGER CHECK (effort_level BETWEEN 1 AND 5),
  context TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Comfort conditioning (Feature 13)
CREATE TABLE IF NOT EXISTS comfort_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  activity TEXT NOT NULL,
  comfort_before INTEGER CHECK (comfort_before BETWEEN 1 AND 10),
  comfort_after INTEGER CHECK (comfort_after BETWEEN 1 AND 10),
  arousal_level INTEGER,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Involuntary emergence (Feature 14)
CREATE TABLE IF NOT EXISTS involuntary_emergence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  description TEXT NOT NULL,
  domain TEXT,
  noticed_by TEXT,
  was_intentional BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Social visibility (Feature 16)
CREATE TABLE IF NOT EXISTS visibility_acts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  description TEXT NOT NULL,
  visibility_level INTEGER CHECK (visibility_level BETWEEN 1 AND 5),
  audience TEXT,
  reaction TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Community inspiration (Feature 17)
CREATE TABLE IF NOT EXISTS inspiration_feed (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source TEXT,
  quote_or_summary TEXT NOT NULL,
  theme TEXT,
  relevance_tags JSONB,
  url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Narrative prompts history (Feature 18)
CREATE TABLE IF NOT EXISTS narrative_reflections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  prompt TEXT NOT NULL,
  response_text TEXT,
  phase TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- PART 3: Deep Behavioral Integration (19-27)
-- ============================================

-- Add columns to voice_recordings if table exists (Feature 19)
DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_tables WHERE tablename = 'voice_recordings') THEN
    ALTER TABLE voice_recordings ADD COLUMN IF NOT EXISTS flagged_for_playback BOOLEAN DEFAULT FALSE;
    ALTER TABLE voice_recordings ADD COLUMN IF NOT EXISTS transcript TEXT;
  END IF;
END $$;

-- Micro check-in log (Feature 20)
CREATE TABLE IF NOT EXISTS micro_checkins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  checkin_type TEXT NOT NULL,
  message TEXT NOT NULL,
  delivered_at TIMESTAMPTZ,
  responded BOOLEAN DEFAULT FALSE,
  response_text TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Physical state log (Feature 20/24)
CREATE TABLE IF NOT EXISTS physical_state_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  cage_on BOOLEAN DEFAULT FALSE,
  panties BOOLEAN DEFAULT FALSE,
  plug BOOLEAN DEFAULT FALSE,
  feminine_clothing BOOLEAN DEFAULT FALSE,
  nail_polish BOOLEAN DEFAULT FALSE,
  scent_anchor BOOLEAN DEFAULT FALSE,
  jewelry BOOLEAN DEFAULT FALSE,
  logged_at TIMESTAMPTZ DEFAULT NOW()
);

-- Self-reference tracking (Feature 22)
CREATE TABLE IF NOT EXISTS self_reference_analysis (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  source TEXT NOT NULL,
  text_sample TEXT,
  maxy_first_person INTEGER DEFAULT 0,
  david_first_person INTEGER DEFAULT 0,
  maxy_third_person INTEGER DEFAULT 0,
  david_third_person INTEGER DEFAULT 0,
  feminine_pronouns INTEGER DEFAULT 0,
  masculine_pronouns INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Resistance cost tracking (Feature 26)
CREATE TABLE IF NOT EXISTS resistance_costs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  action TEXT NOT NULL,
  estimated_days_added NUMERIC,
  baseline_regression NUMERIC,
  momentum_impact TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Dependency signals (Feature 27)
CREATE TABLE IF NOT EXISTS dependency_signals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  signal_type TEXT NOT NULL,
  description TEXT,
  first_detected TIMESTAMPTZ DEFAULT NOW(),
  occurrences INTEGER DEFAULT 1,
  last_detected TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- PART 4: Intimate Practice Progression (28-34)
-- ============================================

-- Session depth metrics (Feature 28)
CREATE TABLE IF NOT EXISTS session_depth (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  session_id UUID,
  session_type TEXT,
  tier INTEGER,
  domain TEXT,
  duration_actual INTEGER,
  duration_minimum INTEGER,
  overstay_minutes INTEGER DEFAULT 0,
  arousal_start INTEGER,
  arousal_peak INTEGER,
  arousal_end INTEGER,
  engagement_rating INTEGER,
  replayed_segments BOOLEAN DEFAULT FALSE,
  skipped_segments BOOLEAN DEFAULT FALSE,
  completed_all_steps BOOLEAN DEFAULT TRUE,
  requested_more BOOLEAN DEFAULT FALSE,
  lingered_after BOOLEAN DEFAULT FALSE,
  reflection_text TEXT,
  emotional_state_after TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Content consumption tracking (Feature 29)
CREATE TABLE IF NOT EXISTS content_consumption (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  content_type TEXT,
  content_tier INTEGER,
  content_domain TEXT,
  duration_minutes INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Degradation response tracking (Feature 30)
CREATE TABLE IF NOT EXISTS degradation_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  term_used TEXT NOT NULL,
  context TEXT,
  response_type TEXT,
  arousal_delta INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Physical practice log (Feature 31)
CREATE TABLE IF NOT EXISTS physical_practice_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  practice_type TEXT NOT NULL,
  device_used TEXT,
  duration_minutes INTEGER,
  depth_comfort INTEGER,
  technique_notes TEXT,
  outfit_description TEXT,
  makeup_level TEXT,
  photo_taken BOOLEAN DEFAULT FALSE,
  difficulty_rating INTEGER,
  satisfaction INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Conditioning arc progress (Feature 32)
CREATE TABLE IF NOT EXISTS conditioning_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  arc_id TEXT NOT NULL,
  session_order INTEGER NOT NULL,
  completed BOOLEAN DEFAULT FALSE,
  completed_at TIMESTAMPTZ,
  reflection_text TEXT,
  state_at_completion JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Submission metrics (Feature 33)
CREATE TABLE IF NOT EXISTS submission_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  metric_type TEXT NOT NULL,
  value NUMERIC NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Arousal-identity fusion (Feature 34)
CREATE TABLE IF NOT EXISTS arousal_identity_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  session_id UUID,
  identity_strength_before INTEGER,
  arousal_before INTEGER,
  identity_strength_after INTEGER,
  arousal_after INTEGER,
  identity_delta INTEGER GENERATED ALWAYS AS (identity_strength_after - identity_strength_before) STORED,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- PART 5: Autonomous Directive Authority (35-42)
-- ============================================

-- Handler-initiated sessions (Feature 35)
CREATE TABLE IF NOT EXISTS handler_initiated_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  trigger TEXT NOT NULL,
  session_type TEXT,
  tier INTEGER,
  delivered_at TIMESTAMPTZ NOT NULL,
  acknowledged_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  declined BOOLEAN DEFAULT FALSE,
  decline_cost JSONB,
  response_window_minutes INTEGER DEFAULT 15,
  escalation_if_ignored TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Compliance gates (Feature 36)
CREATE TABLE IF NOT EXISTS compliance_gates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  blocked_feature TEXT NOT NULL,
  required_action TEXT NOT NULL,
  reason TEXT,
  fulfilled_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Forced escalations (Feature 37)
CREATE TABLE IF NOT EXISTS forced_escalations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  domain TEXT NOT NULL,
  from_tier INTEGER,
  to_tier INTEGER,
  style TEXT,
  announcement_message TEXT,
  user_reaction INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Compulsory completion tracking (Feature 38)
CREATE TABLE IF NOT EXISTS compulsory_completions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  element_id TEXT NOT NULL,
  completed_at TIMESTAMPTZ NOT NULL,
  date DATE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, element_id, date)
);

-- Active punishments (Feature 40)
CREATE TABLE IF NOT EXISTS punishments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  trigger TEXT NOT NULL,
  type TEXT NOT NULL,
  description TEXT,
  severity TEXT,
  applied_at TIMESTAMPTZ NOT NULL,
  served_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Scene completions (Feature 41)
CREATE TABLE IF NOT EXISTS scene_completions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  scene_id TEXT NOT NULL,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  steps_completed INTEGER,
  total_steps INTEGER,
  engagement_rating INTEGER,
  recording_captured BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Ownership internalization tracking (Feature 42)
CREATE TABLE IF NOT EXISTS ownership_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  metric_type TEXT NOT NULL,
  value BOOLEAN,
  evidence TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- INDEXES FOR PERFORMANCE
-- ============================================

CREATE INDEX IF NOT EXISTS idx_goals_user_id ON goals(user_id);
CREATE INDEX IF NOT EXISTS idx_goals_fulfilled ON goals(user_id, fulfilled);
CREATE INDEX IF NOT EXISTS idx_euphoria_captures_user_id ON euphoria_captures(user_id);
CREATE INDEX IF NOT EXISTS idx_gina_evidence_user_id ON gina_evidence(user_id);
CREATE INDEX IF NOT EXISTS idx_post_release_captures_user_id ON post_release_captures(user_id);
CREATE INDEX IF NOT EXISTS idx_denial_cycles_user_id ON denial_cycles(user_id);
CREATE INDEX IF NOT EXISTS idx_comfort_entries_user_id ON comfort_entries(user_id);
CREATE INDEX IF NOT EXISTS idx_micro_checkins_user_id ON micro_checkins(user_id);
CREATE INDEX IF NOT EXISTS idx_physical_state_log_user_id ON physical_state_log(user_id);
CREATE INDEX IF NOT EXISTS idx_compliance_gates_user_id ON compliance_gates(user_id);
CREATE INDEX IF NOT EXISTS idx_compliance_gates_active ON compliance_gates(user_id, fulfilled_at) WHERE fulfilled_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_punishments_user_id ON punishments(user_id);
CREATE INDEX IF NOT EXISTS idx_punishments_active ON punishments(user_id, served_at) WHERE served_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_compulsory_completions_user_date ON compulsory_completions(user_id, date);
CREATE INDEX IF NOT EXISTS idx_handler_initiated_sessions_user_id ON handler_initiated_sessions(user_id);

-- Part 4 indexes
CREATE INDEX IF NOT EXISTS idx_session_depth_user_id ON session_depth(user_id);
CREATE INDEX IF NOT EXISTS idx_session_depth_domain ON session_depth(user_id, domain);
CREATE INDEX IF NOT EXISTS idx_content_consumption_user_id ON content_consumption(user_id);
CREATE INDEX IF NOT EXISTS idx_degradation_responses_user_id ON degradation_responses(user_id);
CREATE INDEX IF NOT EXISTS idx_degradation_responses_term ON degradation_responses(user_id, term_used);
CREATE INDEX IF NOT EXISTS idx_physical_practice_log_user_id ON physical_practice_log(user_id);
CREATE INDEX IF NOT EXISTS idx_physical_practice_log_type ON physical_practice_log(user_id, practice_type);
CREATE INDEX IF NOT EXISTS idx_conditioning_progress_user_id ON conditioning_progress(user_id);
CREATE INDEX IF NOT EXISTS idx_conditioning_progress_arc ON conditioning_progress(user_id, arc_id);
CREATE INDEX IF NOT EXISTS idx_submission_metrics_user_id ON submission_metrics(user_id);
CREATE INDEX IF NOT EXISTS idx_arousal_identity_log_user_id ON arousal_identity_log(user_id);

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================

ALTER TABLE goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE session_scripts ENABLE ROW LEVEL SECURITY;
ALTER TABLE euphoria_captures ENABLE ROW LEVEL SECURITY;
ALTER TABLE gina_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE post_release_captures ENABLE ROW LEVEL SECURITY;
ALTER TABLE denial_cycles ENABLE ROW LEVEL SECURITY;
ALTER TABLE masculine_effort_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE comfort_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE involuntary_emergence ENABLE ROW LEVEL SECURITY;
ALTER TABLE visibility_acts ENABLE ROW LEVEL SECURITY;
ALTER TABLE inspiration_feed ENABLE ROW LEVEL SECURITY;
ALTER TABLE narrative_reflections ENABLE ROW LEVEL SECURITY;
ALTER TABLE micro_checkins ENABLE ROW LEVEL SECURITY;
ALTER TABLE physical_state_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE self_reference_analysis ENABLE ROW LEVEL SECURITY;
ALTER TABLE resistance_costs ENABLE ROW LEVEL SECURITY;
ALTER TABLE dependency_signals ENABLE ROW LEVEL SECURITY;
ALTER TABLE handler_initiated_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE compliance_gates ENABLE ROW LEVEL SECURITY;
ALTER TABLE forced_escalations ENABLE ROW LEVEL SECURITY;
ALTER TABLE compulsory_completions ENABLE ROW LEVEL SECURITY;
ALTER TABLE punishments ENABLE ROW LEVEL SECURITY;
ALTER TABLE scene_completions ENABLE ROW LEVEL SECURITY;
ALTER TABLE ownership_metrics ENABLE ROW LEVEL SECURITY;

-- Part 4 RLS
ALTER TABLE session_depth ENABLE ROW LEVEL SECURITY;
ALTER TABLE content_consumption ENABLE ROW LEVEL SECURITY;
ALTER TABLE degradation_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE physical_practice_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE conditioning_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE submission_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE arousal_identity_log ENABLE ROW LEVEL SECURITY;

-- User-specific policies (users can only access their own data)
CREATE POLICY "Users can manage their own goals" ON goals FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can manage their own euphoria_captures" ON euphoria_captures FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can manage their own gina_evidence" ON gina_evidence FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can manage their own post_release_captures" ON post_release_captures FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can manage their own denial_cycles" ON denial_cycles FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can manage their own masculine_effort_log" ON masculine_effort_log FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can manage their own comfort_entries" ON comfort_entries FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can manage their own involuntary_emergence" ON involuntary_emergence FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can manage their own visibility_acts" ON visibility_acts FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can manage their own narrative_reflections" ON narrative_reflections FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can manage their own micro_checkins" ON micro_checkins FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can manage their own physical_state_log" ON physical_state_log FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can manage their own self_reference_analysis" ON self_reference_analysis FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can manage their own resistance_costs" ON resistance_costs FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can manage their own dependency_signals" ON dependency_signals FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can manage their own handler_initiated_sessions" ON handler_initiated_sessions FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can manage their own compliance_gates" ON compliance_gates FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can manage their own forced_escalations" ON forced_escalations FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can manage their own compulsory_completions" ON compulsory_completions FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can manage their own punishments" ON punishments FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can manage their own scene_completions" ON scene_completions FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can manage their own ownership_metrics" ON ownership_metrics FOR ALL USING (auth.uid() = user_id);

-- Part 4 policies
CREATE POLICY "Users can manage their own session_depth" ON session_depth FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can manage their own content_consumption" ON content_consumption FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can manage their own degradation_responses" ON degradation_responses FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can manage their own physical_practice_log" ON physical_practice_log FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can manage their own conditioning_progress" ON conditioning_progress FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can manage their own submission_metrics" ON submission_metrics FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can manage their own arousal_identity_log" ON arousal_identity_log FOR ALL USING (auth.uid() = user_id);

-- Session scripts and inspiration feed are readable by all authenticated users
CREATE POLICY "Authenticated users can read session_scripts" ON session_scripts FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated users can read inspiration_feed" ON inspiration_feed FOR SELECT USING (auth.role() = 'authenticated');
