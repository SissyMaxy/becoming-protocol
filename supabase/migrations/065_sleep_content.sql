-- Migration 065: Sleep Content System
-- Three tables for the hypnagogic conditioning pipeline

-- Sleep content library (user's affirmation sets)
CREATE TABLE sleep_content (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  category TEXT NOT NULL CHECK (category IN (
    'identity','feminization','surrender','chastity',
    'sleep_induction','ambient','custom'
  )),
  affirmation_text TEXT NOT NULL,
  enabled BOOLEAN DEFAULT true,
  sort_order INTEGER DEFAULT 0,
  corruption_level_min INTEGER DEFAULT 0 CHECK (corruption_level_min BETWEEN 0 AND 5),
  requires_privacy BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Per-user player config
CREATE TABLE sleep_content_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL UNIQUE,
  default_mode TEXT NOT NULL DEFAULT 'text_only'
    CHECK (default_mode IN ('text_only','single_earbud','full_audio')),
  default_timer_minutes INTEGER DEFAULT 30,
  default_delay_minutes INTEGER DEFAULT 0,
  voice_pitch REAL DEFAULT 1.1,
  voice_rate REAL DEFAULT 0.75,
  voice_name TEXT,
  affirmation_hold_seconds INTEGER DEFAULT 6,
  affirmation_gap_seconds INTEGER DEFAULT 4,
  lovense_subliminal_enabled BOOLEAN DEFAULT false,
  lovense_max_intensity INTEGER DEFAULT 3 CHECK (lovense_max_intensity BETWEEN 1 AND 5),
  screen_dim_enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Session logs
CREATE TABLE sleep_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  end_reason TEXT CHECK (end_reason IN ('timer','manual','interrupted')),
  mode_used TEXT NOT NULL CHECK (mode_used IN ('text_only','single_earbud','full_audio')),
  mode_recommended TEXT CHECK (mode_recommended IN ('text_only','single_earbud','full_audio')),
  mode_compliant BOOLEAN DEFAULT true,
  timer_minutes INTEGER NOT NULL,
  delay_minutes INTEGER DEFAULT 0,
  affirmations_displayed INTEGER DEFAULT 0,
  affirmations_spoken INTEGER DEFAULT 0,
  categories_played TEXT[],
  completed_naturally BOOLEAN DEFAULT false,
  lovense_active BOOLEAN DEFAULT false,
  denial_day INTEGER,
  was_caged BOOLEAN DEFAULT false,
  gina_home BOOLEAN DEFAULT false,
  corruption_level INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS
ALTER TABLE sleep_content ENABLE ROW LEVEL SECURITY;
ALTER TABLE sleep_content_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE sleep_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY sleep_content_user ON sleep_content FOR ALL USING (auth.uid() = user_id);
CREATE POLICY sleep_config_user ON sleep_content_config FOR ALL USING (auth.uid() = user_id);
CREATE POLICY sleep_sessions_user ON sleep_sessions FOR ALL USING (auth.uid() = user_id);

-- Indexes
CREATE INDEX idx_sleep_content_user ON sleep_content(user_id, enabled);
CREATE INDEX idx_sleep_sessions_user ON sleep_sessions(user_id, started_at DESC);
