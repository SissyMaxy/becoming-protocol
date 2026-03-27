-- Migration 140: Conditioning Engine
-- Tables: content_curriculum, generated_scripts, conditioning_sessions_v2,
--         trance_progression, post_hypnotic_tracking, scent_conditioning, hidden_operations

-- ============================================
-- 1. content_curriculum
-- ============================================
CREATE TABLE IF NOT EXISTS content_curriculum (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  creator TEXT,
  series TEXT,
  media_type TEXT NOT NULL CHECK (media_type IN ('audio','video','audio_video','text','custom_handler')),
  source_url TEXT,
  audio_storage_url TEXT,
  category TEXT NOT NULL CHECK (category IN (
    'identity','feminization','surrender','chastity','desire_installation',
    'dumbification','compliance','trigger_installation','amnesia',
    'resistance_reduction','sleep_induction','morning_ritual','ambient',
    'trance_deepening','shame_inversion','arousal_binding'
  )),
  intensity INTEGER NOT NULL CHECK (intensity BETWEEN 1 AND 5),
  tier INTEGER NOT NULL DEFAULT 1 CHECK (tier BETWEEN 1 AND 4),
  fantasy_level INTEGER CHECK (fantasy_level BETWEEN 1 AND 5),
  duration_minutes INTEGER,
  best_denial_range INT[],
  best_time TEXT[],
  session_contexts TEXT[] DEFAULT '{}',
  binaural_frequency TEXT,
  binaural_mixed BOOLEAN DEFAULT FALSE,
  trigger_phrases TEXT[],
  times_prescribed INTEGER DEFAULT 0,
  times_completed INTEGER DEFAULT 0,
  avg_trance_depth FLOAT,
  avg_arousal_during FLOAT,
  effectiveness_score FLOAT,
  generation_prompt TEXT,
  script_text TEXT,
  memories_used UUID[],
  conditioning_phase INTEGER,
  conditioning_target TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE content_curriculum ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'content_curriculum' AND policyname = 'Users own their data'
  ) THEN
    CREATE POLICY "Users own their data" ON content_curriculum FOR ALL USING (auth.uid() = user_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_curriculum ON content_curriculum (user_id, category, tier, media_type);

-- ============================================
-- 2. generated_scripts
-- ============================================
CREATE TABLE IF NOT EXISTS generated_scripts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  script_text TEXT NOT NULL,
  conditioning_phase INTEGER NOT NULL,
  conditioning_target TEXT NOT NULL,
  memories_used JSONB,
  generation_prompt TEXT,
  audio_url TEXT,
  audio_duration_seconds INTEGER,
  voice_id TEXT,
  binaural_frequency TEXT,
  binaural_mixed BOOLEAN DEFAULT FALSE,
  scent_anchor TEXT,
  post_hypnotic_scripts JSONB,
  subliminal_words TEXT[],
  curriculum_id UUID REFERENCES content_curriculum(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE generated_scripts ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'generated_scripts' AND policyname = 'Users own their data'
  ) THEN
    CREATE POLICY "Users own their data" ON generated_scripts FOR ALL USING (auth.uid() = user_id);
  END IF;
END $$;

-- ============================================
-- 3. conditioning_sessions_v2
-- ============================================
CREATE TABLE IF NOT EXISTS conditioning_sessions_v2 (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_type TEXT NOT NULL CHECK (session_type IN (
    'trance','goon','edge','combined','sleep','background','morning','micro_drop'
  )),
  content_ids UUID[],
  content_sequence JSONB,
  avg_hr FLOAT,
  min_hr FLOAT,
  max_hr FLOAT,
  avg_hrv FLOAT,
  trance_depth_estimated FLOAT,
  arousal_level_estimated FLOAT,
  phases JSONB,
  scent_anchor_active BOOLEAN DEFAULT FALSE,
  scent_type TEXT,
  device_active BOOLEAN DEFAULT FALSE,
  device_patterns JSONB,
  post_hypnotic_scripts JSONB,
  duration_minutes INTEGER,
  completed BOOLEAN DEFAULT FALSE,
  confession_extracted BOOLEAN DEFAULT FALSE,
  commitment_extracted BOOLEAN DEFAULT FALSE,
  adaptations JSONB,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  ended_at TIMESTAMPTZ
);

ALTER TABLE conditioning_sessions_v2 ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'conditioning_sessions_v2' AND policyname = 'Users own their data'
  ) THEN
    CREATE POLICY "Users own their data" ON conditioning_sessions_v2 FOR ALL USING (auth.uid() = user_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_sessions_v2 ON conditioning_sessions_v2 (user_id, session_type, started_at DESC);

-- ============================================
-- 4. trance_progression
-- ============================================
CREATE TABLE IF NOT EXISTS trance_progression (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id UUID REFERENCES conditioning_sessions_v2(id),
  induction_time_seconds INTEGER,
  peak_depth FLOAT,
  sustained_depth_minutes FLOAT,
  trigger_tests JSONB,
  recorded_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE trance_progression ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'trance_progression' AND policyname = 'Users own their data'
  ) THEN
    CREATE POLICY "Users own their data" ON trance_progression FOR ALL USING (auth.uid() = user_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_trance ON trance_progression (user_id, recorded_at DESC);

-- ============================================
-- 5. post_hypnotic_tracking
-- ============================================
CREATE TABLE IF NOT EXISTS post_hypnotic_tracking (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  script_id UUID REFERENCES generated_scripts(id),
  session_id UUID REFERENCES conditioning_sessions_v2(id),
  context TEXT NOT NULL,
  suggestion TEXT NOT NULL,
  activation_time TEXT,
  delivered_at TIMESTAMPTZ,
  activation_expected_at TIMESTAMPTZ,
  activation_detected BOOLEAN,
  detection_method TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE post_hypnotic_tracking ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'post_hypnotic_tracking' AND policyname = 'Users own their data'
  ) THEN
    CREATE POLICY "Users own their data" ON post_hypnotic_tracking FOR ALL USING (auth.uid() = user_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_post_hypnotic ON post_hypnotic_tracking (user_id, activation_expected_at);

-- ============================================
-- 6. scent_conditioning
-- ============================================
CREATE TABLE IF NOT EXISTS scent_conditioning (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  scent_name TEXT NOT NULL,
  scent_product TEXT,
  sessions_paired INTEGER DEFAULT 0,
  association_strength TEXT DEFAULT 'none' CHECK (association_strength IN (
    'none','weak','forming','established','strong'
  )),
  covert_deployments INTEGER DEFAULT 0,
  last_covert_deployment TIMESTAMPTZ,
  covert_effectiveness_notes TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE scent_conditioning ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'scent_conditioning' AND policyname = 'Users own their data'
  ) THEN
    CREATE POLICY "Users own their data" ON scent_conditioning FOR ALL USING (auth.uid() = user_id);
  END IF;
END $$;

-- ============================================
-- 7. hidden_operations
-- ============================================
CREATE TABLE IF NOT EXISTS hidden_operations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  parameter TEXT NOT NULL,
  current_value FLOAT NOT NULL,
  base_value FLOAT NOT NULL,
  increment_rate FLOAT,
  increment_interval TEXT,
  last_incremented_at TIMESTAMPTZ,
  UNIQUE (user_id, parameter)
);

ALTER TABLE hidden_operations ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'hidden_operations' AND policyname = 'Users own their data'
  ) THEN
    CREATE POLICY "Users own their data" ON hidden_operations FOR ALL USING (auth.uid() = user_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_hidden_ops ON hidden_operations (user_id, parameter);
