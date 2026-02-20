-- ============================================
-- 076: Passive Voice Analysis
-- Background pitch monitoring, daily aggregation, interventions.
-- No audio stored — only numeric pitch metrics.
-- ============================================

-- ============================================
-- passive_voice_samples: Individual analysis windows
-- ============================================

CREATE TABLE IF NOT EXISTS passive_voice_samples (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,

  avg_pitch_hz FLOAT NOT NULL,
  min_pitch_hz FLOAT,
  max_pitch_hz FLOAT,
  duration_seconds FLOAT NOT NULL,

  voice_context TEXT DEFAULT 'unknown' CHECK (voice_context IN (
    'solo', 'conversation', 'phone', 'video', 'practice', 'cam', 'unknown'
  )),
  confidence FLOAT,
  sample_date DATE NOT NULL DEFAULT CURRENT_DATE,

  sampled_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_passive_voice_user_date ON passive_voice_samples(user_id, sample_date DESC);
CREATE INDEX IF NOT EXISTS idx_passive_voice_sampled ON passive_voice_samples(user_id, sampled_at DESC);

-- ============================================
-- voice_daily_aggregates: Per-day rollups
-- ============================================

CREATE TABLE IF NOT EXISTS voice_daily_aggregates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  aggregate_date DATE NOT NULL,

  total_samples INTEGER DEFAULT 0,
  total_duration_seconds FLOAT DEFAULT 0,

  avg_pitch_hz FLOAT,
  median_pitch_hz FLOAT,
  min_pitch_hz FLOAT,
  max_pitch_hz FLOAT,
  pitch_std_dev FLOAT,

  time_in_target_pct FLOAT,

  by_context JSONB,

  created_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(user_id, aggregate_date)
);

CREATE INDEX IF NOT EXISTS idx_voice_agg_user_date ON voice_daily_aggregates(user_id, aggregate_date DESC);

-- ============================================
-- voice_interventions: Triggered responses
-- ============================================

CREATE TABLE IF NOT EXISTS voice_interventions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,

  trigger_type TEXT NOT NULL CHECK (trigger_type IN (
    'pitch_drop', 'extended_low', 'context_switch', 'milestone', 'streak_break'
  )),
  trigger_data JSONB,

  intervention_type TEXT NOT NULL CHECK (intervention_type IN (
    'haptic', 'notification', 'task_inject', 'gentle_reminder', 'celebration'
  )),
  intervention_data JSONB,

  acknowledged BOOLEAN DEFAULT false,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_voice_interventions_user ON voice_interventions(user_id, created_at DESC);

-- ============================================
-- RLS policies
-- ============================================

ALTER TABLE passive_voice_samples ENABLE ROW LEVEL SECURITY;
ALTER TABLE voice_daily_aggregates ENABLE ROW LEVEL SECURITY;
ALTER TABLE voice_interventions ENABLE ROW LEVEL SECURITY;

CREATE POLICY passive_voice_samples_user ON passive_voice_samples
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY voice_daily_aggregates_user ON voice_daily_aggregates
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY voice_interventions_user ON voice_interventions
  FOR ALL USING (auth.uid() = user_id);
