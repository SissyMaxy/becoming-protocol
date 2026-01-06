-- Becoming Protocol v11: Arousal State Management & Intimate Exploration
-- This schema adds arousal tracking, denial streaks, and intimate seed planting

-- ============================================
-- TABLE: arousal_states
-- Daily arousal state tracking
-- ============================================

CREATE TABLE IF NOT EXISTS arousal_states (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  date DATE NOT NULL,

  -- Current state (enum)
  state TEXT NOT NULL CHECK (state IN (
    'baseline',
    'building',
    'sweet_spot',
    'overload',
    'post_release',
    'recovery'
  )),

  -- Subjective measures (1-10)
  arousal_level INTEGER CHECK (arousal_level BETWEEN 1 AND 10),
  feminization_receptivity INTEGER CHECK (feminization_receptivity BETWEEN 1 AND 10),
  aching_intensity INTEGER CHECK (aching_intensity BETWEEN 1 AND 10),

  -- Behavioral
  edge_count INTEGER DEFAULT 0,

  -- Physical signs (JSON array)
  physical_signs JSONB DEFAULT '[]',

  notes TEXT,
  logged_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(user_id, date),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_arousal_states_user_date ON arousal_states(user_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_arousal_states_user_state ON arousal_states(user_id, state);

-- ============================================
-- TABLE: orgasm_log
-- Tracks all release events
-- ============================================

CREATE TABLE IF NOT EXISTS orgasm_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,

  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Type of release
  release_type TEXT NOT NULL CHECK (release_type IN (
    'full',
    'ruined',
    'prostate',
    'sissygasm',
    'edge_only',
    'wet_dream',
    'accident'
  )),

  -- Context
  context TEXT NOT NULL CHECK (context IN (
    'solo',
    'with_partner',
    'during_content',
    'during_practice',
    'sleep'
  )),

  -- Intentionality
  planned BOOLEAN NOT NULL DEFAULT false,

  -- State tracking
  state_before TEXT,
  days_since_last INTEGER,

  -- Qualitative (1-10)
  intensity INTEGER CHECK (intensity BETWEEN 1 AND 10),
  satisfaction INTEGER CHECK (satisfaction BETWEEN 1 AND 10),
  regret_level INTEGER CHECK (regret_level BETWEEN 1 AND 10),

  trigger TEXT,
  notes TEXT,

  -- Partner involvement
  partner_initiated BOOLEAN DEFAULT false,
  partner_controlled BOOLEAN DEFAULT false,
  partner_aware BOOLEAN DEFAULT false,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_orgasm_log_user_date ON orgasm_log(user_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_orgasm_log_user_type ON orgasm_log(user_id, release_type);

-- ============================================
-- TABLE: denial_streaks
-- Tracks denial/chastity streaks
-- ============================================

CREATE TABLE IF NOT EXISTS denial_streaks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,

  started_at TIMESTAMPTZ NOT NULL,
  ended_at TIMESTAMPTZ,

  ended_by TEXT CHECK (ended_by IN (
    'full_release',
    'ruined',
    'accident',
    'wet_dream',
    'planned_release',
    'ongoing'
  )),
  ending_orgasm_id UUID REFERENCES orgasm_log(id),

  days_completed INTEGER,
  edges_during INTEGER DEFAULT 0,
  prostate_orgasms_during INTEGER DEFAULT 0,
  sweet_spot_days INTEGER DEFAULT 0,

  is_personal_record BOOLEAN DEFAULT false,
  notes TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Only one ongoing streak per user
CREATE UNIQUE INDEX IF NOT EXISTS idx_denial_streaks_ongoing
ON denial_streaks(user_id)
WHERE ended_at IS NULL;

-- ============================================
-- TABLE: arousal_metrics
-- Computed/cached metrics
-- ============================================

CREATE TABLE IF NOT EXISTS arousal_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,

  -- Current
  current_streak_days INTEGER DEFAULT 0,
  current_state TEXT,
  days_in_current_state INTEGER DEFAULT 0,

  -- Averages
  average_cycle_length DECIMAL(5,2),
  average_sweet_spot_entry_day DECIMAL(5,2),
  average_overload_day DECIMAL(5,2),

  -- Percentages (last 30 days)
  sweet_spot_percentage DECIMAL(5,2),
  post_release_percentage DECIMAL(5,2),

  -- Optimal range (learned)
  optimal_min_days INTEGER,
  optimal_max_days INTEGER,

  -- Patterns
  slip_rate DECIMAL(5,2),
  average_days_to_slip DECIMAL(5,2),
  high_risk_contexts JSONB DEFAULT '[]',

  -- Records
  longest_streak INTEGER DEFAULT 0,
  longest_sweet_spot_streak INTEGER DEFAULT 0,

  -- Correlations
  arousal_practice_correlation DECIMAL(5,4),

  last_computed_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- TABLE: intimate_seeds
-- Tracks seeds planted for intimate exploration
-- ============================================

CREATE TABLE IF NOT EXISTS intimate_seeds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,

  title TEXT NOT NULL,
  description TEXT,

  category TEXT NOT NULL CHECK (category IN (
    'power_dynamics',
    'feminization_intimate',
    'sensation_physical',
    'psychological_verbal',
    'new_activities',
    'service_devotion',
    'denial_control',
    'body_exploration',
    'roleplay',
    'other'
  )),

  intensity_level INTEGER CHECK (intensity_level BETWEEN 1 AND 10),

  current_phase TEXT NOT NULL DEFAULT 'identified' CHECK (current_phase IN (
    'identified',
    'distant_mention',
    'positive_assoc',
    'adjacent_exp',
    'soft_offer',
    'first_attempt',
    'establishing',
    'established',
    'abandoned',
    'paused'
  )),

  phase_history JSONB DEFAULT '[]',

  last_reception TEXT CHECK (last_reception IN (
    'positive', 'neutral', 'hesitant', 'negative', 'unknown'
  )),
  reception_notes TEXT,

  best_timing_context TEXT,
  avoid_contexts TEXT,

  prerequisites JSONB DEFAULT '[]',
  enables JSONB DEFAULT '[]',
  related_breakthroughs JSONB DEFAULT '[]',
  seed_scripts JSONB DEFAULT '{}',

  source TEXT DEFAULT 'user',
  priority INTEGER DEFAULT 5,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_intimate_seeds_user ON intimate_seeds(user_id);
CREATE INDEX IF NOT EXISTS idx_intimate_seeds_phase ON intimate_seeds(user_id, current_phase);

-- ============================================
-- TABLE: intimate_seed_actions
-- Log of actions taken on seeds
-- ============================================

CREATE TABLE IF NOT EXISTS intimate_seed_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  seed_id UUID REFERENCES intimate_seeds(id) ON DELETE CASCADE,

  action_type TEXT NOT NULL CHECK (action_type IN (
    'mention',
    'tested_waters',
    'soft_offer',
    'attempted',
    'succeeded',
    'partial',
    'rejected',
    'postponed',
    'she_initiated',
    'she_expanded',
    'abandoned',
    'note'
  )),

  occurred_at TIMESTAMPTZ DEFAULT NOW(),
  arousal_state TEXT,
  partner_mood TEXT,
  context TEXT,

  what_happened TEXT,
  her_reaction TEXT,
  your_feeling TEXT,
  what_worked TEXT,
  what_didnt TEXT,
  next_step TEXT,

  phase_change_to TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_seed_actions_seed ON intimate_seed_actions(seed_id, occurred_at DESC);

-- ============================================
-- TABLE: kink_inventory
-- Private inventory of desires and boundaries
-- ============================================

CREATE TABLE IF NOT EXISTS kink_inventory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,

  name TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL,

  status TEXT NOT NULL CHECK (status IN (
    'established',
    'active',
    'curious',
    'with_partner',
    'partner_potential',
    'private_only',
    'uncertain',
    'soft_limit',
    'hard_limit'
  )),

  interest_level INTEGER CHECK (interest_level BETWEEN 0 AND 10),
  experience_level INTEGER CHECK (experience_level BETWEEN 0 AND 10),
  partner_likelihood INTEGER CHECK (partner_likelihood BETWEEN 0 AND 10),

  feminization_connection TEXT,
  related_seeds JSONB DEFAULT '[]',

  fantasy_notes TEXT,
  experience_notes TEXT,
  partner_notes TEXT,

  share_with_partner BOOLEAN DEFAULT false,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_kink_inventory_user ON kink_inventory(user_id);

-- ============================================
-- TABLE: intimate_journal
-- Free-form capture of arousal-state insights
-- ============================================

CREATE TABLE IF NOT EXISTS intimate_journal (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,

  entry_date TIMESTAMPTZ DEFAULT NOW(),

  arousal_state TEXT,
  arousal_level INTEGER,
  during_or_after TEXT CHECK (during_or_after IN ('during', 'after', 'reflecting')),

  activity_type TEXT,
  activity_description TEXT,

  what_got_you_most TEXT,
  what_it_means TEXT,
  connection_to_feminization TEXT,
  connection_to_partner TEXT,

  shame_present BOOLEAN DEFAULT false,
  shame_notes TEXT,
  shame_useful BOOLEAN,

  action_items JSONB DEFAULT '[]',
  tags JSONB DEFAULT '[]',

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_intimate_journal_user ON intimate_journal(user_id, entry_date DESC);

-- ============================================
-- TABLE: ai_intimate_suggestions
-- AI-generated suggestions
-- ============================================

CREATE TABLE IF NOT EXISTS ai_intimate_suggestions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,

  suggestion_type TEXT NOT NULL CHECK (suggestion_type IN (
    'new_seed',
    'advance_seed',
    'timing',
    'script',
    'connection',
    'warning',
    'celebration'
  )),

  title TEXT NOT NULL,
  content TEXT NOT NULL,

  based_on JSONB DEFAULT '{}',
  related_seed_id UUID REFERENCES intimate_seeds(id),
  related_kink_ids JSONB DEFAULT '[]',
  optimal_arousal_states JSONB DEFAULT '[]',

  priority INTEGER DEFAULT 5,
  valid_until TIMESTAMPTZ,
  best_timing TEXT,

  status TEXT DEFAULT 'pending' CHECK (status IN (
    'pending', 'viewed', 'accepted', 'rejected', 'completed', 'expired'
  )),
  user_response TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_suggestions_user ON ai_intimate_suggestions(user_id, status);

-- ============================================
-- RLS POLICIES
-- ============================================

ALTER TABLE arousal_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE orgasm_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE denial_streaks ENABLE ROW LEVEL SECURITY;
ALTER TABLE arousal_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE intimate_seeds ENABLE ROW LEVEL SECURITY;
ALTER TABLE intimate_seed_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE kink_inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE intimate_journal ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_intimate_suggestions ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users own arousal_states" ON arousal_states;
DROP POLICY IF EXISTS "Users own orgasm_log" ON orgasm_log;
DROP POLICY IF EXISTS "Users own denial_streaks" ON denial_streaks;
DROP POLICY IF EXISTS "Users own arousal_metrics" ON arousal_metrics;
DROP POLICY IF EXISTS "Users own intimate_seeds" ON intimate_seeds;
DROP POLICY IF EXISTS "Users own seed_actions" ON intimate_seed_actions;
DROP POLICY IF EXISTS "Users own kink_inventory" ON kink_inventory;
DROP POLICY IF EXISTS "Users own intimate_journal" ON intimate_journal;
DROP POLICY IF EXISTS "Users own ai_suggestions" ON ai_intimate_suggestions;

-- Create policies
CREATE POLICY "Users own arousal_states" ON arousal_states FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users own orgasm_log" ON orgasm_log FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users own denial_streaks" ON denial_streaks FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users own arousal_metrics" ON arousal_metrics FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users own intimate_seeds" ON intimate_seeds FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users own seed_actions" ON intimate_seed_actions FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users own kink_inventory" ON kink_inventory FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users own intimate_journal" ON intimate_journal FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users own ai_suggestions" ON ai_intimate_suggestions FOR ALL USING (auth.uid() = user_id);

-- ============================================
-- HELPER FUNCTIONS
-- ============================================

-- Function to get current streak days
CREATE OR REPLACE FUNCTION get_current_streak_days(p_user_id UUID)
RETURNS INTEGER AS $$
DECLARE
  streak_start TIMESTAMPTZ;
  days INTEGER;
BEGIN
  SELECT started_at INTO streak_start
  FROM denial_streaks
  WHERE user_id = p_user_id AND ended_at IS NULL
  LIMIT 1;

  IF streak_start IS NULL THEN
    RETURN 0;
  END IF;

  days := EXTRACT(DAY FROM (NOW() - streak_start));
  RETURN COALESCE(days, 0);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to end current streak
CREATE OR REPLACE FUNCTION end_current_streak(
  p_user_id UUID,
  p_ended_by TEXT,
  p_orgasm_id UUID DEFAULT NULL
)
RETURNS VOID AS $$
DECLARE
  streak_record RECORD;
  days_count INTEGER;
  sweet_spot_count INTEGER;
  longest INTEGER;
BEGIN
  -- Get current streak
  SELECT * INTO streak_record
  FROM denial_streaks
  WHERE user_id = p_user_id AND ended_at IS NULL
  LIMIT 1;

  IF streak_record IS NULL THEN
    RETURN;
  END IF;

  -- Calculate days
  days_count := EXTRACT(DAY FROM (NOW() - streak_record.started_at));

  -- Count sweet spot days
  SELECT COUNT(*) INTO sweet_spot_count
  FROM arousal_states
  WHERE user_id = p_user_id
    AND date >= streak_record.started_at::DATE
    AND state = 'sweet_spot';

  -- Get longest streak
  SELECT COALESCE(MAX(days_completed), 0) INTO longest
  FROM denial_streaks
  WHERE user_id = p_user_id AND ended_at IS NOT NULL;

  -- Update streak
  UPDATE denial_streaks
  SET
    ended_at = NOW(),
    ended_by = p_ended_by,
    ending_orgasm_id = p_orgasm_id,
    days_completed = days_count,
    sweet_spot_days = sweet_spot_count,
    is_personal_record = days_count > longest,
    updated_at = NOW()
  WHERE id = streak_record.id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to start new streak
CREATE OR REPLACE FUNCTION start_new_streak(p_user_id UUID)
RETURNS UUID AS $$
DECLARE
  new_id UUID;
BEGIN
  INSERT INTO denial_streaks (user_id, started_at)
  VALUES (p_user_id, NOW())
  RETURNING id INTO new_id;

  RETURN new_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
