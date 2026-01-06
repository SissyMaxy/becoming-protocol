-- Becoming Protocol V4 Schema - Onboarding & AI Context
-- Run this in Supabase SQL Editor

-- User profile with deep context for AI personalization
CREATE TABLE IF NOT EXISTS user_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE,

  -- Basic info
  preferred_name TEXT,
  pronouns TEXT,
  age_range TEXT CHECK (age_range IN ('18-24', '25-34', '35-44', '45-54', '55+')),

  -- Journey context
  journey_stage TEXT CHECK (journey_stage IN ('exploring', 'decided', 'started', 'established')),
  months_on_journey INTEGER DEFAULT 0,
  living_situation TEXT CHECK (living_situation IN ('alone', 'with_partner', 'with_family', 'with_roommates', 'other')),
  out_level TEXT CHECK (out_level IN ('not_out', 'few_people', 'mostly_out', 'fully_out')),

  -- Partner info (if applicable)
  has_partner BOOLEAN DEFAULT FALSE,
  partner_name TEXT,
  partner_supportive TEXT CHECK (partner_supportive IN ('very_supportive', 'supportive', 'neutral', 'unsupportive', 'doesnt_know')),
  partner_notes TEXT,

  -- Dysphoria map
  dysphoria_triggers JSONB DEFAULT '[]', -- array of {area, intensity, notes}
  dysphoria_worst_times TEXT, -- when is it worst
  dysphoria_coping TEXT, -- current coping strategies

  -- Euphoria map
  euphoria_triggers JSONB DEFAULT '[]', -- array of {activity, intensity, notes}
  euphoria_best_moments TEXT, -- describe peak moments
  euphoria_seeks TEXT, -- what they want more of

  -- Fears & resistance
  fears JSONB DEFAULT '[]', -- array of {fear, intensity}
  biggest_fear TEXT,
  resistance_patterns TEXT, -- what makes them skip/avoid

  -- Goals & vision
  short_term_goals TEXT, -- next 30 days
  long_term_vision TEXT, -- where they want to be
  non_negotiables TEXT, -- practices they won't compromise on

  -- Preferences
  preferred_intensity TEXT DEFAULT 'normal' CHECK (preferred_intensity IN ('gentle', 'normal', 'challenging')),
  voice_focus_level TEXT CHECK (voice_focus_level IN ('not_now', 'gentle', 'moderate', 'intensive')),
  social_comfort TEXT CHECK (social_comfort IN ('very_anxious', 'nervous', 'comfortable', 'confident')),

  -- Schedule/lifestyle
  morning_available BOOLEAN DEFAULT TRUE,
  evening_available BOOLEAN DEFAULT TRUE,
  work_from_home BOOLEAN DEFAULT FALSE,
  busy_days TEXT[], -- array of weekday names

  -- AI notes (accumulated observations)
  ai_notes JSONB DEFAULT '[]',

  -- Timestamps
  onboarding_completed BOOLEAN DEFAULT FALSE,
  onboarding_completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_profiles_user ON user_profiles(user_id);

ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own profile" ON user_profiles
  FOR ALL USING (auth.uid() = user_id);

-- Personalized sealed letters created during onboarding
CREATE TABLE IF NOT EXISTS personalized_letters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,

  -- Letter content
  title TEXT NOT NULL,
  letter_type TEXT NOT NULL CHECK (letter_type IN ('welcome', 'milestone', 'struggle', 'celebration', 'future_self', 'partner', 'secret')),
  content TEXT NOT NULL,

  -- Unlock conditions (hidden from user)
  unlock_type TEXT NOT NULL CHECK (unlock_type IN ('days', 'streak', 'phase', 'domain_level', 'alignment_avg', 'pattern', 'random', 'date')),
  unlock_value JSONB NOT NULL, -- condition details
  unlock_hint TEXT, -- vague hint shown to user

  -- State
  is_unlocked BOOLEAN DEFAULT FALSE,
  unlocked_at TIMESTAMPTZ,
  is_read BOOLEAN DEFAULT FALSE,
  read_at TIMESTAMPTZ,

  -- Metadata
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by TEXT DEFAULT 'onboarding' CHECK (created_by IN ('onboarding', 'ai', 'system'))
);

CREATE INDEX IF NOT EXISTS idx_personalized_letters_user ON personalized_letters(user_id);
CREATE INDEX IF NOT EXISTS idx_personalized_letters_unlocked ON personalized_letters(user_id, is_unlocked);

ALTER TABLE personalized_letters ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own letters" ON personalized_letters
  FOR SELECT USING (auth.uid() = user_id);

-- Black box observations (hidden from user, used by AI)
CREATE TABLE IF NOT EXISTS black_box_observations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,

  -- Observation type
  observation_type TEXT NOT NULL CHECK (observation_type IN (
    'pattern', 'correlation', 'resistance', 'breakthrough',
    'hidden_strength', 'blind_spot', 'prediction', 'intervention_needed'
  )),

  -- Content
  title TEXT NOT NULL,
  observation TEXT NOT NULL,
  confidence DECIMAL(3,2) DEFAULT 0.5, -- 0-1 confidence score

  -- Related data
  related_domains TEXT[],
  related_entries TEXT[], -- entry IDs
  data_points JSONB DEFAULT '{}',

  -- AI action
  suggested_action TEXT,
  action_taken BOOLEAN DEFAULT FALSE,
  action_result TEXT,

  -- Timestamps
  observed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ, -- some observations are time-sensitive

  -- Internal flags
  is_active BOOLEAN DEFAULT TRUE,
  priority INTEGER DEFAULT 5 CHECK (priority >= 1 AND priority <= 10)
);

CREATE INDEX IF NOT EXISTS idx_black_box_user ON black_box_observations(user_id, is_active);
CREATE INDEX IF NOT EXISTS idx_black_box_type ON black_box_observations(user_id, observation_type);

ALTER TABLE black_box_observations ENABLE ROW LEVEL SECURITY;

-- Users cannot see black box observations directly
CREATE POLICY "Black box is hidden" ON black_box_observations
  FOR SELECT USING (FALSE);

-- AI conversation history for context
CREATE TABLE IF NOT EXISTS ai_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,

  -- Conversation context
  context_type TEXT NOT NULL CHECK (context_type IN ('prescription', 'reflection', 'insight', 'question', 'celebration')),

  -- Messages
  user_input TEXT,
  ai_response TEXT NOT NULL,

  -- Metadata
  model_used TEXT DEFAULT 'claude-3-5-sonnet',
  tokens_used INTEGER,

  -- Related
  related_entry_id TEXT,
  related_domain TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_conversations_user ON ai_conversations(user_id, created_at DESC);

ALTER TABLE ai_conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own conversations" ON ai_conversations
  FOR SELECT USING (auth.uid() = user_id);

-- Variable reinforcement schedule (for black box)
CREATE TABLE IF NOT EXISTS reinforcement_schedule (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,

  -- Schedule type
  reinforcement_type TEXT NOT NULL CHECK (reinforcement_type IN (
    'surprise_celebration', 'hidden_unlock', 'bonus_insight',
    'mystery_challenge', 'easter_egg', 'callback_reference'
  )),

  -- Trigger conditions
  trigger_probability DECIMAL(3,2) DEFAULT 0.1, -- base probability
  trigger_conditions JSONB DEFAULT '{}',

  -- Content
  content JSONB NOT NULL,

  -- State
  is_triggered BOOLEAN DEFAULT FALSE,
  triggered_at TIMESTAMPTZ,

  -- Schedule
  earliest_trigger TIMESTAMPTZ,
  latest_trigger TIMESTAMPTZ,
  cooldown_hours INTEGER DEFAULT 24,
  last_triggered TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reinforcement_user ON reinforcement_schedule(user_id, is_triggered);

ALTER TABLE reinforcement_schedule ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Reinforcement is hidden" ON reinforcement_schedule
  FOR SELECT USING (FALSE);
