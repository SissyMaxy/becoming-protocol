-- Becoming Protocol V3 Schema - AI Adaptive Coaching
-- Run this in Supabase SQL Editor

-- Add AI coaching fields to user_progress
ALTER TABLE user_progress
ADD COLUMN IF NOT EXISTS ai_mode TEXT DEFAULT 'build' CHECK (ai_mode IN ('build', 'protect', 'recover')),
ADD COLUMN IF NOT EXISTS baseline_domains JSONB DEFAULT '[]',
ADD COLUMN IF NOT EXISTS domain_stats JSONB DEFAULT '{}',
ADD COLUMN IF NOT EXISTS pattern_data JSONB DEFAULT '{}',
ADD COLUMN IF NOT EXISTS level_locks JSONB DEFAULT '{}',
ADD COLUMN IF NOT EXISTS last_analysis_at TIMESTAMPTZ;

-- Add AI context to daily entries
ALTER TABLE daily_entries
ADD COLUMN IF NOT EXISTS ai_mode TEXT CHECK (ai_mode IN ('build', 'protect', 'recover')),
ADD COLUMN IF NOT EXISTS ai_reasoning TEXT,
ADD COLUMN IF NOT EXISTS prescription_note TEXT,
ADD COLUMN IF NOT EXISTS completion_rate DECIMAL(5,2);

-- Create table for tracking domain practice history (for decay/baseline calculations)
CREATE TABLE IF NOT EXISTS domain_practice_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  domain TEXT NOT NULL,
  date DATE NOT NULL,
  tasks_assigned INTEGER NOT NULL DEFAULT 0,
  tasks_completed INTEGER NOT NULL DEFAULT 0,
  completion_rate DECIMAL(5,2),
  time_block TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, domain, date)
);

CREATE INDEX IF NOT EXISTS idx_domain_practice_user_date ON domain_practice_log(user_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_domain_practice_domain ON domain_practice_log(user_id, domain, date DESC);

ALTER TABLE domain_practice_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own domain practice" ON domain_practice_log
  FOR ALL USING (auth.uid() = user_id);

-- Create table for AI insights/observations
CREATE TABLE IF NOT EXISTS ai_insights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  date DATE NOT NULL,
  insight_type TEXT NOT NULL CHECK (insight_type IN ('pattern', 'warning', 'celebration', 'recommendation')),
  category TEXT, -- e.g., 'streak', 'domain', 'alignment', 'phase'
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  data JSONB DEFAULT '{}',
  acknowledged BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_insights_user ON ai_insights(user_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_ai_insights_type ON ai_insights(user_id, insight_type);

ALTER TABLE ai_insights ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own insights" ON ai_insights
  FOR ALL USING (auth.uid() = user_id);

-- Create table for level/phase history (for ratchet protection)
CREATE TABLE IF NOT EXISTS progression_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN ('level_up', 'level_down', 'phase_up', 'phase_down')),
  domain TEXT, -- null for phase events
  from_value INTEGER NOT NULL,
  to_value INTEGER NOT NULL,
  protected_until DATE, -- for level lock
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_progression_user ON progression_history(user_id, created_at DESC);

ALTER TABLE progression_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own progression" ON progression_history
  FOR ALL USING (auth.uid() = user_id);

-- Create table for storing analysis snapshots (for pattern detection)
CREATE TABLE IF NOT EXISTS user_analytics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  analysis_date DATE NOT NULL,
  -- Completion patterns
  completion_by_domain JSONB DEFAULT '{}',
  completion_by_time_block JSONB DEFAULT '{}',
  completion_by_day_type JSONB DEFAULT '{}',
  completion_by_weekday JSONB DEFAULT '{}',
  -- Alignment patterns
  alignment_trend TEXT CHECK (alignment_trend IN ('rising', 'stable', 'falling')),
  alignment_avg_7d DECIMAL(3,1),
  alignment_avg_14d DECIMAL(3,1),
  -- Streak data
  current_streak INTEGER,
  streak_status TEXT CHECK (streak_status IN ('stable', 'at_risk', 'broken')),
  -- Domain health
  neglected_domains JSONB DEFAULT '[]',
  strong_domains JSONB DEFAULT '[]',
  baseline_domains JSONB DEFAULT '[]',
  domains_at_risk JSONB DEFAULT '[]',
  -- Detected patterns
  skip_patterns JSONB DEFAULT '{}',
  euphoria_correlations JSONB DEFAULT '{}',
  dysphoria_correlations JSONB DEFAULT '{}',
  -- Mode recommendation
  recommended_mode TEXT CHECK (recommended_mode IN ('build', 'protect', 'recover')),
  mode_reasoning TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, analysis_date)
);

CREATE INDEX IF NOT EXISTS idx_user_analytics_user ON user_analytics(user_id, analysis_date DESC);

ALTER TABLE user_analytics ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own analytics" ON user_analytics
  FOR ALL USING (auth.uid() = user_id);
