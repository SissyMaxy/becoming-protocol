-- Migration 001: Profile Tables
-- Profile Foundation, History, Arousal, Psychology, Depth, and Intake Progress

-- ============================================
-- PROFILE FOUNDATION
-- Core user profile and living situation
-- ============================================
CREATE TABLE IF NOT EXISTS profile_foundation (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL UNIQUE,
  chosen_name TEXT NOT NULL DEFAULT '',
  pronouns TEXT DEFAULT 'she/her',
  age INTEGER,
  location TEXT,
  living_situation TEXT,
  work_situation TEXT,
  private_hours_daily DECIMAL,
  monthly_budget DECIMAL,
  partner_status TEXT,
  partner_awareness_level INTEGER DEFAULT 0,
  partner_reaction TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- PROFILE HISTORY
-- Background and journey history
-- ============================================
CREATE TABLE IF NOT EXISTS profile_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL UNIQUE,
  first_awareness_age TEXT,
  first_awareness_trigger TEXT,
  childhood_signals TEXT,
  interpretation_at_time TEXT,
  first_crossdressing_age TEXT,
  first_crossdressing_experience TEXT,
  clothing_evolution TEXT,
  items_owned JSONB DEFAULT '[]',
  previous_attempts BOOLEAN DEFAULT FALSE,
  previous_attempt_details TEXT,
  what_stopped_before TEXT,
  what_needs_to_change TEXT,
  dysphoria_frequency TEXT,
  dysphoria_triggers JSONB DEFAULT '[]',
  euphoria_triggers TEXT,
  peak_euphoria_moment TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- PROFILE AROUSAL
-- Arousal patterns and sexual architecture
-- ============================================
CREATE TABLE IF NOT EXISTS profile_arousal (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL UNIQUE,
  feminization_arousal_level INTEGER,
  arousal_aspects_ranked JSONB DEFAULT '[]',
  erotic_core_or_side_effect TEXT,
  arousal_pattern_evolution TEXT,
  fantasy_themes JSONB DEFAULT '{}',
  hypno_usage_level TEXT,
  hypno_content_preferences TEXT,
  trance_depth TEXT,
  conditioned_responses TEXT,
  hardest_hitting_content TEXT,
  chastity_history TEXT,
  longest_denial_days INTEGER,
  denial_effect_on_motivation TEXT,
  edge_frequency TEXT,
  post_orgasm_response TEXT,
  shame_intensifies_arousal TEXT,
  shameful_but_arousing TEXT,
  shame_function TEXT,
  eroticized_transformation TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- PROFILE PSYCHOLOGY
-- Psychological patterns and responses
-- ============================================
CREATE TABLE IF NOT EXISTS profile_psychology (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL UNIQUE,
  shame_aspects TEXT,
  shame_sources JSONB DEFAULT '[]',
  shame_function_preference TEXT,
  without_shame_hypothesis TEXT,
  resistance_triggers TEXT,
  resistance_sensation TEXT,
  stop_voice_triggers TEXT,
  resistance_overcome_methods TEXT,
  resistance_timing_patterns TEXT,
  authority_response TEXT,
  compliance_motivators TEXT,
  preferred_voice_framing TEXT,
  asked_vs_told_preference INTEGER,
  pushed_past_comfort_response TEXT,
  vulnerability_moments TEXT,
  guard_drop_triggers TEXT,
  surrender_moment_description TEXT,
  power_words_phrases TEXT,
  resistance_impossible_conditions TEXT,
  validation_importance INTEGER,
  validation_type_preference TEXT,
  praise_response TEXT,
  criticism_response TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- PROFILE DEPTH
-- Deepest desires and fears
-- ============================================
CREATE TABLE IF NOT EXISTS profile_depth (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL UNIQUE,
  darkest_fantasy TEXT,
  why_never_told TEXT,
  writing_it_feels TEXT,
  want_but_fear_wanting TEXT,
  full_admission_consequence TEXT,
  fear_of_getting_wanted TEXT,
  complete_transformation_vision TEXT,
  daily_life_vision TEXT,
  others_perception_vision TEXT,
  internal_feeling_vision TEXT,
  complete_surrender_vision TEXT,
  what_to_let_go TEXT,
  surrender_gains TEXT,
  takeover_desire TEXT,
  transformation_fears TEXT,
  worst_case_scenario TEXT,
  cant_stop_meaning TEXT,
  fear_as_barrier_or_appeal TEXT,
  secret_self_description TEXT,
  secret_self_visible_consequence TEXT,
  hiding_pleasure_or_necessity TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- INTAKE PROGRESS
-- Track intake questionnaire progress
-- ============================================
CREATE TABLE IF NOT EXISTS intake_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL UNIQUE,
  layer_completed INTEGER DEFAULT 0,
  questions_answered INTEGER DEFAULT 0,
  disclosure_score INTEGER DEFAULT 0,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  last_updated TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================
ALTER TABLE profile_foundation ENABLE ROW LEVEL SECURITY;
ALTER TABLE profile_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE profile_arousal ENABLE ROW LEVEL SECURITY;
ALTER TABLE profile_psychology ENABLE ROW LEVEL SECURITY;
ALTER TABLE profile_depth ENABLE ROW LEVEL SECURITY;
ALTER TABLE intake_progress ENABLE ROW LEVEL SECURITY;

-- RLS Policies (user can only access own data)
DROP POLICY IF EXISTS "Users can view own profile_foundation" ON profile_foundation;
CREATE POLICY "Users can view own profile_foundation" ON profile_foundation FOR ALL USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can view own profile_history" ON profile_history;
CREATE POLICY "Users can view own profile_history" ON profile_history FOR ALL USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can view own profile_arousal" ON profile_arousal;
CREATE POLICY "Users can view own profile_arousal" ON profile_arousal FOR ALL USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can view own profile_psychology" ON profile_psychology;
CREATE POLICY "Users can view own profile_psychology" ON profile_psychology FOR ALL USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can view own profile_depth" ON profile_depth;
CREATE POLICY "Users can view own profile_depth" ON profile_depth FOR ALL USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can view own intake_progress" ON intake_progress;
CREATE POLICY "Users can view own intake_progress" ON intake_progress FOR ALL USING (auth.uid() = user_id);

-- ============================================
-- INDEXES
-- ============================================
CREATE INDEX IF NOT EXISTS idx_profile_foundation_user_id ON profile_foundation(user_id);
CREATE INDEX IF NOT EXISTS idx_profile_history_user_id ON profile_history(user_id);
CREATE INDEX IF NOT EXISTS idx_profile_arousal_user_id ON profile_arousal(user_id);
CREATE INDEX IF NOT EXISTS idx_profile_psychology_user_id ON profile_psychology(user_id);
CREATE INDEX IF NOT EXISTS idx_profile_depth_user_id ON profile_depth(user_id);
CREATE INDEX IF NOT EXISTS idx_intake_progress_user_id ON intake_progress(user_id);

-- ============================================
-- UPDATED_AT TRIGGER
-- ============================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_profile_foundation_updated_at ON profile_foundation;
CREATE TRIGGER update_profile_foundation_updated_at
  BEFORE UPDATE ON profile_foundation
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
