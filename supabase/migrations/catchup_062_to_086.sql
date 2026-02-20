-- ================================================================
-- CATCHUP MIGRATION: 062 → 086
-- Idempotent — safe to run multiple times.
-- Paste into Supabase SQL Editor and run.
-- ================================================================

-- ============================================================
-- 062: Corruption Mechanic
-- ============================================================

CREATE TABLE IF NOT EXISTS corruption_state (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  domain TEXT NOT NULL CHECK (domain IN (
    'privacy', 'gina', 'financial', 'autonomy',
    'identity_language', 'therapist', 'content'
  )),
  current_level INTEGER NOT NULL DEFAULT 0 CHECK (current_level BETWEEN 0 AND 5),
  level_entered_at TIMESTAMPTZ DEFAULT NOW(),
  advancement_score NUMERIC DEFAULT 0,
  advancement_threshold NUMERIC DEFAULT 100,
  is_suspended BOOLEAN DEFAULT false,
  suspension_reason TEXT,
  suspended_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, domain)
);

CREATE TABLE IF NOT EXISTS corruption_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  domain TEXT NOT NULL,
  event_type TEXT NOT NULL,
  corruption_level_at_event INTEGER NOT NULL,
  details JSONB,
  handler_intent TEXT,
  user_facing_copy TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS corruption_advancement_criteria (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  domain TEXT NOT NULL,
  from_level INTEGER NOT NULL,
  to_level INTEGER NOT NULL,
  minimum_days INTEGER NOT NULL,
  required_milestones JSONB NOT NULL DEFAULT '{}',
  cascade_eligible BOOLEAN DEFAULT true,
  UNIQUE(domain, from_level, to_level)
);

-- RLS
ALTER TABLE corruption_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE corruption_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE corruption_advancement_criteria ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'corruption_state_user') THEN
    CREATE POLICY corruption_state_user ON corruption_state FOR ALL USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'corruption_events_user') THEN
    CREATE POLICY corruption_events_user ON corruption_events FOR ALL USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'corruption_advancement_read') THEN
    CREATE POLICY corruption_advancement_read ON corruption_advancement_criteria FOR SELECT USING (true);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_corruption_state_user ON corruption_state(user_id);
CREATE INDEX IF NOT EXISTS idx_corruption_events_user ON corruption_events(user_id, domain);
CREATE INDEX IF NOT EXISTS idx_corruption_events_type ON corruption_events(event_type, created_at);

-- Add event_type constraint (drop+recreate is idempotent)
ALTER TABLE corruption_events DROP CONSTRAINT IF EXISTS corruption_events_event_type_check;
ALTER TABLE corruption_events ADD CONSTRAINT corruption_events_event_type_check
  CHECK (event_type IN (
    'deployment','milestone','advancement','suspension','resumption',
    'override','cascade','therapist_flag',
    'crisis_suspend','timed_resume','therapist_rollback','maintenance'
  ));

-- Seed advancement criteria (ON CONFLICT skip duplicates)
INSERT INTO corruption_advancement_criteria (domain, from_level, to_level, minimum_days, required_milestones, cascade_eligible) VALUES
('privacy', 0, 1, 14, '{"streak_days_min": 14}', true),
('privacy', 1, 2, 30, '{"content_pieces_at_level": 5}', true),
('privacy', 2, 3, 45, '{"content_pieces_at_level": 10, "exposure_incidents": 0}', true),
('privacy', 3, 4, 60, '{"content_pieces_at_level": 15, "exposure_incidents": 0}', true),
('privacy', 4, 5, 90, '{"content_pieces_at_level": 20, "exposure_incidents": 0}', true),
('gina', 0, 1, 14, '{"streak_days_min": 14}', true),
('gina', 1, 2, 30, '{"skipped_cleanup_days": 14, "shared_space_activities": 3}', true),
('gina', 2, 3, 45, '{"comfort_self_report_min": 7}', true),
('gina', 3, 4, 60, '{"gina_questions_logged": 1}', true),
('gina', 4, 5, 90, '{}', true),
('financial', 0, 1, 0, '{"protocol_revenue_min": 1}', true),
('financial', 1, 2, 30, '{"revenue_covers_spending": true}', true),
('financial', 2, 3, 45, '{"consistent_revenue_days": 30}', true),
('financial', 3, 4, 60, '{"revenue_exceeds_expenses": true}', true),
('financial', 4, 5, 90, '{"monthly_revenue_min": 400}', true),
('autonomy', 0, 1, 14, '{"streak_days_min": 14}', true),
('autonomy', 1, 2, 30, '{"task_acceptance_rate_min": 0.9}', true),
('autonomy', 2, 3, 45, '{"override_rate_max": 0.2}', true),
('autonomy', 3, 4, 60, '{"override_rate_max": 0.1, "delegated_domains_min": 3}', true),
('autonomy', 4, 5, 90, '{"override_rate_max": 0.05}', true),
('identity_language', 0, 1, 14, '{"streak_days_min": 14}', true),
('identity_language', 1, 2, 30, '{"feminine_reference_rate_min": 0.5}', true),
('identity_language', 2, 3, 45, '{"self_correction_ratio_min": 0.5}', true),
('identity_language', 3, 4, 60, '{"self_correction_ratio_min": 0.9, "consecutive_days": 14}', true),
('identity_language', 4, 5, 90, '{"masculine_references_per_week_max": 0}', true),
('therapist', 0, 1, 30, '{"streak_days_min": 30}', false),
('therapist', 1, 2, 60, '{"therapist_endorsed": true}', false),
('therapist', 2, 3, 90, '{"no_concerns_days": 60}', false),
('therapist', 3, 4, 120, '{"therapeutic_framing_natural": true}', false),
('therapist', 4, 5, 180, '{}', false),
('content', 0, 1, 0, '{"protocol_revenue_min": 1}', true),
('content', 1, 2, 30, '{"content_pieces_min": 10}', true),
('content', 2, 3, 45, '{"fan_engagement_growing": true}', true),
('content', 3, 4, 60, '{"revenue_exceeds_expenses": true}', true),
('content', 4, 5, 90, '{"content_feels_natural": true}', true)
ON CONFLICT (domain, from_level, to_level) DO NOTHING;

-- ============================================================
-- 063: Language Tracking
-- ============================================================

CREATE TABLE IF NOT EXISTS language_tracking (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  masculine_count INTEGER DEFAULT 0,
  feminine_count INTEGER DEFAULT 0,
  self_corrections INTEGER DEFAULT 0,
  handler_corrections INTEGER DEFAULT 0,
  feminine_ratio NUMERIC,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, date)
);

ALTER TABLE language_tracking ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'language_tracking_user') THEN
    CREATE POLICY language_tracking_user ON language_tracking FOR ALL USING (auth.uid() = user_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_language_tracking_user_date ON language_tracking(user_id, date);

-- ============================================================
-- 064: Corruption Advancement (columns + maintenance log)
-- ============================================================

ALTER TABLE corruption_state
  ADD COLUMN IF NOT EXISTS resume_after TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS suspension_type TEXT;

-- Add check constraint idempotently
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.constraint_column_usage
    WHERE table_name = 'corruption_state' AND constraint_name = 'corruption_state_suspension_type_check'
  ) THEN
    ALTER TABLE corruption_state ADD CONSTRAINT corruption_state_suspension_type_check
      CHECK (suspension_type IN ('crisis','therapist','manual'));
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS corruption_maintenance_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  checks_run JSONB NOT NULL DEFAULT '{}',
  advancements JSONB DEFAULT '[]',
  cascades JSONB DEFAULT '[]',
  resumptions JSONB DEFAULT '[]',
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, date)
);

ALTER TABLE corruption_maintenance_log ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'corruption_maintenance_user') THEN
    CREATE POLICY corruption_maintenance_user ON corruption_maintenance_log FOR ALL USING (auth.uid() = user_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_corruption_maintenance_user ON corruption_maintenance_log(user_id, date);

-- ============================================================
-- 065: Sleep Content
-- ============================================================

CREATE TABLE IF NOT EXISTS sleep_content (
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

CREATE TABLE IF NOT EXISTS sleep_content_config (
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

CREATE TABLE IF NOT EXISTS sleep_sessions (
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

ALTER TABLE sleep_content ENABLE ROW LEVEL SECURITY;
ALTER TABLE sleep_content_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE sleep_sessions ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'sleep_content_user') THEN
    CREATE POLICY sleep_content_user ON sleep_content FOR ALL USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'sleep_config_user') THEN
    CREATE POLICY sleep_config_user ON sleep_content_config FOR ALL USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'sleep_sessions_user') THEN
    CREATE POLICY sleep_sessions_user ON sleep_sessions FOR ALL USING (auth.uid() = user_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_sleep_content_user ON sleep_content(user_id, enabled);
CREATE INDEX IF NOT EXISTS idx_sleep_sessions_user ON sleep_sessions(user_id, started_at DESC);

-- ============================================================
-- 066: Exercise Domain Expansion
-- ============================================================

CREATE TABLE IF NOT EXISTS exercise_domain_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  domain_level INTEGER DEFAULT 1 CHECK (domain_level BETWEEN 1 AND 5),
  tasks_completed_this_level INTEGER DEFAULT 0,
  target_sessions_per_week INTEGER DEFAULT 3,
  preferred_workout_days TEXT[] DEFAULT '{}',
  equipment_owned TEXT[] DEFAULT '{}',
  novelty_rotation_index INTEGER DEFAULT 0,
  last_novelty_swap_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id)
);

ALTER TABLE exercise_domain_config ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can view own exercise domain config') THEN
    CREATE POLICY "Users can view own exercise domain config" ON exercise_domain_config FOR SELECT USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can insert own exercise domain config') THEN
    CREATE POLICY "Users can insert own exercise domain config" ON exercise_domain_config FOR INSERT WITH CHECK (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can update own exercise domain config') THEN
    CREATE POLICY "Users can update own exercise domain config" ON exercise_domain_config FOR UPDATE USING (auth.uid() = user_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_exercise_domain_config_user ON exercise_domain_config(user_id);

CREATE TABLE IF NOT EXISTS exercise_progressions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  exercise_name TEXT NOT NULL,
  weight_lbs DECIMAL,
  band_level TEXT,
  notes TEXT,
  recorded_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE exercise_progressions ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can view own exercise progressions') THEN
    CREATE POLICY "Users can view own exercise progressions" ON exercise_progressions FOR SELECT USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can insert own exercise progressions') THEN
    CREATE POLICY "Users can insert own exercise progressions" ON exercise_progressions FOR INSERT WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_exercise_progressions_user ON exercise_progressions(user_id, exercise_name, recorded_at DESC);

-- ============================================================
-- 069: Capture Data column on task_completions
-- ============================================================

ALTER TABLE task_completions ADD COLUMN IF NOT EXISTS capture_data JSONB DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_task_completions_capture_data
  ON task_completions USING gin (capture_data) WHERE capture_data IS NOT NULL;

-- ============================================================
-- 070: Cam Session Expansion
-- ============================================================

ALTER TABLE cam_sessions ADD COLUMN IF NOT EXISTS denial_day INTEGER;
ALTER TABLE cam_sessions ADD COLUMN IF NOT EXISTS prescribed_makeup TEXT;
ALTER TABLE cam_sessions ADD COLUMN IF NOT EXISTS prescribed_setup TEXT;
ALTER TABLE cam_sessions ADD COLUMN IF NOT EXISTS prep_started_at TIMESTAMPTZ;
ALTER TABLE cam_sessions ADD COLUMN IF NOT EXISTS live_started_at TIMESTAMPTZ;
ALTER TABLE cam_sessions ADD COLUMN IF NOT EXISTS live_ended_at TIMESTAMPTZ;
ALTER TABLE cam_sessions ADD COLUMN IF NOT EXISTS stream_url TEXT;
ALTER TABLE cam_sessions ADD COLUMN IF NOT EXISTS is_recording BOOLEAN DEFAULT true;
ALTER TABLE cam_sessions ADD COLUMN IF NOT EXISTS recording_url TEXT;
ALTER TABLE cam_sessions ADD COLUMN IF NOT EXISTS recording_duration_seconds INTEGER;
ALTER TABLE cam_sessions ADD COLUMN IF NOT EXISTS edge_count INTEGER DEFAULT 0;
ALTER TABLE cam_sessions ADD COLUMN IF NOT EXISTS tip_count INTEGER DEFAULT 0;
ALTER TABLE cam_sessions ADD COLUMN IF NOT EXISTS handler_actions JSONB DEFAULT '[]';
ALTER TABLE cam_sessions ADD COLUMN IF NOT EXISTS highlights JSONB DEFAULT '[]';
ALTER TABLE cam_sessions ADD COLUMN IF NOT EXISTS vault_items_created INTEGER DEFAULT 0;
ALTER TABLE cam_sessions ADD COLUMN IF NOT EXISTS tip_goals JSONB DEFAULT '[]';

CREATE TABLE IF NOT EXISTS cam_tips (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  cam_session_id UUID REFERENCES cam_sessions NOT NULL,
  tipper_username TEXT,
  tipper_platform TEXT,
  token_amount INTEGER NOT NULL,
  tip_amount_usd NUMERIC,
  pattern_triggered TEXT,
  device_response_sent BOOLEAN DEFAULT true,
  session_timestamp_seconds INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cam_tips_session ON cam_tips(cam_session_id, created_at);

CREATE TABLE IF NOT EXISTS cam_handler_prompts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  cam_session_id UUID REFERENCES cam_sessions NOT NULL,
  prompt_type TEXT CHECK (prompt_type IN (
    'voice_check','engagement','pacing','tip_goal','edge_warning',
    'outfit_adjust','position_change','affirmation','wind_down','custom'
  )),
  prompt_text TEXT NOT NULL,
  acknowledged BOOLEAN DEFAULT false,
  acknowledged_at TIMESTAMPTZ,
  session_timestamp_seconds INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cam_prompts_session ON cam_handler_prompts(cam_session_id, created_at);

ALTER TABLE cam_tips ENABLE ROW LEVEL SECURITY;
ALTER TABLE cam_handler_prompts ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'cam_tips_user') THEN
    CREATE POLICY cam_tips_user ON cam_tips FOR ALL USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'cam_prompts_user') THEN
    CREATE POLICY cam_prompts_user ON cam_handler_prompts FOR ALL USING (auth.uid() = user_id);
  END IF;
END $$;

-- ============================================================
-- 073: Hypno Content Bridge
-- ============================================================

CREATE TABLE IF NOT EXISTS hypno_library (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  title TEXT NOT NULL,
  source_url TEXT,
  file_path TEXT,
  media_type TEXT NOT NULL CHECK (media_type IN ('audio', 'video', 'text')),
  content_category TEXT NOT NULL CHECK (content_category IN (
    'feminization', 'sissy_training', 'submission', 'body_acceptance',
    'arousal_denial', 'identity', 'voice', 'behavior', 'relaxation', 'sleep'
  )),
  intensity INTEGER NOT NULL CHECK (intensity BETWEEN 1 AND 5),
  conditioning_targets TEXT[] DEFAULT '{}',
  min_denial_day INTEGER DEFAULT 0,
  min_protocol_level INTEGER DEFAULT 1,
  requires_cage BOOLEAN DEFAULT false,
  capture_value INTEGER DEFAULT 0 CHECK (capture_value BETWEEN 0 AND 10),
  capture_type TEXT CHECK (capture_type IS NULL OR capture_type IN ('passive', 'flagged', 'active')),
  times_used INTEGER DEFAULT 0,
  last_used_at TIMESTAMPTZ,
  handler_notes TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_hypno_library_category ON hypno_library(user_id, content_category, intensity);
CREATE INDEX IF NOT EXISTS idx_hypno_library_denial ON hypno_library(user_id, min_denial_day);
CREATE INDEX IF NOT EXISTS idx_hypno_library_active ON hypno_library(user_id, is_active);

ALTER TABLE hypno_library ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'hypno_library_user') THEN
    CREATE POLICY hypno_library_user ON hypno_library FOR ALL USING (auth.uid() = user_id);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS hypno_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  library_item_id UUID REFERENCES hypno_library(id) ON DELETE SET NULL,
  content_ids UUID[] DEFAULT '{}',
  session_type TEXT NOT NULL CHECK (session_type IN (
    'conditioning', 'sleep', 'edge_adjacent', 'compliance_bypass', 'passive_capture'
  )),
  started_at TIMESTAMPTZ DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  duration_seconds INTEGER,
  completed BOOLEAN DEFAULT false,
  trance_depth INTEGER CHECK (trance_depth IS NULL OR trance_depth BETWEEN 0 AND 10),
  denial_day_at_start INTEGER,
  arousal_at_start INTEGER,
  post_session_state TEXT CHECK (post_session_state IS NULL OR post_session_state IN (
    'energized', 'compliant', 'foggy', 'aroused', 'peaceful', 'disoriented', 'resistant'
  )),
  capture_mode TEXT CHECK (capture_mode IS NULL OR capture_mode IN ('passive', 'flagged', 'active', 'none')),
  captures JSONB DEFAULT '[]',
  vault_ids UUID[] DEFAULT '{}',
  bypass_reason TEXT CHECK (bypass_reason IS NULL OR bypass_reason IN (
    'low_energy', 'shoot_skipped', 'cage_check_only', 'audio_only', 'text_only'
  )),
  original_prescription_type TEXT,
  bambi_session_id UUID,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_hypno_sessions_user ON hypno_sessions(user_id, started_at);
CREATE INDEX IF NOT EXISTS idx_hypno_sessions_type ON hypno_sessions(user_id, session_type);
CREATE INDEX IF NOT EXISTS idx_hypno_sessions_active ON hypno_sessions(user_id, ended_at) WHERE ended_at IS NULL;

ALTER TABLE hypno_sessions ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'hypno_sessions_user') THEN
    CREATE POLICY hypno_sessions_user ON hypno_sessions FOR ALL USING (auth.uid() = user_id);
  END IF;
END $$;

-- hypno_session_summary already exists as a table (migration 085) — skip view creation

-- ============================================================
-- 074: Sexting & GFE System
-- ============================================================

ALTER TABLE fan_profiles
  ADD COLUMN IF NOT EXISTS personality_model JSONB,
  ADD COLUMN IF NOT EXISTS response_preferences JSONB,
  ADD COLUMN IF NOT EXISTS gfe_subscriber BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS gfe_started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS lifetime_message_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS avg_response_time_minutes FLOAT;

ALTER TABLE fan_profiles DROP CONSTRAINT IF EXISTS fan_profiles_fan_tier_check;
ALTER TABLE fan_profiles ADD CONSTRAINT fan_profiles_fan_tier_check
  CHECK (fan_tier IN ('casual', 'regular', 'supporter', 'whale', 'gfe'));

ALTER TABLE fan_messages
  ADD COLUMN IF NOT EXISTS conversation_id UUID,
  ADD COLUMN IF NOT EXISTS message_type TEXT DEFAULT 'text',
  ADD COLUMN IF NOT EXISTS media_vault_id UUID,
  ADD COLUMN IF NOT EXISTS auto_sent BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS ai_confidence FLOAT,
  ADD COLUMN IF NOT EXISTS response_time_seconds INTEGER;

-- Add constraint idempotently
ALTER TABLE fan_messages DROP CONSTRAINT IF EXISTS fan_messages_message_type_check;
ALTER TABLE fan_messages ADD CONSTRAINT fan_messages_message_type_check
  CHECK (message_type IN ('text', 'media_request', 'media_send', 'gfe_scheduled', 'tip_thanks'));

CREATE INDEX IF NOT EXISTS idx_fan_messages_conversation ON fan_messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_fan_messages_auto_sent ON fan_messages(user_id, auto_sent) WHERE auto_sent = true;

CREATE TABLE IF NOT EXISTS sexting_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  fan_id UUID REFERENCES fan_profiles(id) ON DELETE CASCADE,
  platform TEXT NOT NULL,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'paused', 'closed', 'escalated')),
  handler_personality TEXT CHECK (handler_personality IN ('flirty', 'bratty', 'sweet', 'dominant')),
  auto_reply_enabled BOOLEAN DEFAULT true,
  escalation_threshold FLOAT DEFAULT 0.7,
  total_messages INTEGER DEFAULT 0,
  revenue_cents INTEGER DEFAULT 0,
  last_message_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sexting_conv_user_status ON sexting_conversations(user_id, status);
CREATE INDEX IF NOT EXISTS idx_sexting_conv_fan ON sexting_conversations(fan_id);

CREATE TABLE IF NOT EXISTS sexting_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  category TEXT NOT NULL CHECK (category IN (
    'greeting', 'flirty', 'tease', 'explicit', 'tip_thanks',
    'media_offer', 'gfe_morning', 'gfe_goodnight', 'escalation', 'boundary'
  )),
  template_text TEXT NOT NULL,
  variables JSONB,
  tier_minimum TEXT DEFAULT 'casual',
  usage_count INTEGER DEFAULT 0,
  effectiveness_score FLOAT DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sexting_templates_category ON sexting_templates(user_id, category, is_active);

CREATE TABLE IF NOT EXISTS gfe_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  fan_id UUID REFERENCES fan_profiles(id) ON DELETE CASCADE,
  platform TEXT NOT NULL,
  tier TEXT DEFAULT 'basic' CHECK (tier IN ('basic', 'premium', 'vip')),
  price_cents INTEGER NOT NULL,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'paused', 'cancelled', 'expired')),
  morning_message BOOLEAN DEFAULT true,
  goodnight_message BOOLEAN DEFAULT true,
  weekly_photo BOOLEAN DEFAULT false,
  custom_nickname TEXT,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_gfe_subs_user_status ON gfe_subscriptions(user_id, status);
CREATE INDEX IF NOT EXISTS idx_gfe_subs_fan ON gfe_subscriptions(fan_id);

ALTER TABLE sexting_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE sexting_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE gfe_subscriptions ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'sexting_conversations_user') THEN
    CREATE POLICY sexting_conversations_user ON sexting_conversations FOR ALL USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'sexting_templates_user') THEN
    CREATE POLICY sexting_templates_user ON sexting_templates FOR ALL USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'gfe_subscriptions_user') THEN
    CREATE POLICY gfe_subscriptions_user ON gfe_subscriptions FOR ALL USING (auth.uid() = user_id);
  END IF;
END $$;

-- ============================================================
-- 075: Fan Marketplace
-- ============================================================

CREATE TABLE IF NOT EXISTS task_listings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  listing_type TEXT DEFAULT 'fixed' CHECK (listing_type IN ('fixed', 'auction', 'custom_request')),
  price_cents INTEGER,
  min_bid_cents INTEGER,
  category TEXT NOT NULL CHECK (category IN (
    'photo', 'video', 'voice', 'outfit', 'challenge', 'custom', 'lifestyle', 'explicit'
  )),
  explicitness_level INTEGER DEFAULT 1 CHECK (explicitness_level BETWEEN 1 AND 5),
  estimated_effort_minutes INTEGER,
  max_orders INTEGER DEFAULT 1,
  orders_filled INTEGER DEFAULT 0,
  status TEXT DEFAULT 'active' CHECK (status IN (
    'draft', 'active', 'paused', 'sold_out', 'expired', 'cancelled'
  )),
  expires_at TIMESTAMPTZ,
  handler_generated BOOLEAN DEFAULT false,
  handler_notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_task_listings_user_status ON task_listings(user_id, status);
CREATE INDEX IF NOT EXISTS idx_task_listings_category ON task_listings(category, status);

CREATE TABLE IF NOT EXISTS task_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  listing_id UUID REFERENCES task_listings(id),
  fan_id UUID REFERENCES fan_profiles(id),
  amount_cents INTEGER NOT NULL,
  platform TEXT NOT NULL,
  special_instructions TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN (
    'pending', 'accepted', 'in_progress', 'completed', 'delivered', 'refunded', 'cancelled'
  )),
  internal_task_code TEXT,
  delivery_vault_id UUID,
  accepted_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  fan_rating INTEGER CHECK (fan_rating BETWEEN 1 AND 5),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_task_orders_user_status ON task_orders(user_id, status);
CREATE INDEX IF NOT EXISTS idx_task_orders_listing ON task_orders(listing_id);
CREATE INDEX IF NOT EXISTS idx_task_orders_fan ON task_orders(fan_id);

CREATE TABLE IF NOT EXISTS task_auctions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id UUID REFERENCES task_listings(id) NOT NULL,
  user_id UUID REFERENCES auth.users NOT NULL,
  fan_id UUID REFERENCES fan_profiles(id),
  bid_cents INTEGER NOT NULL,
  platform TEXT NOT NULL,
  bid_message TEXT,
  is_winning BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_task_auctions_listing ON task_auctions(listing_id, bid_cents DESC);
CREATE INDEX IF NOT EXISTS idx_task_auctions_fan ON task_auctions(fan_id);

ALTER TABLE task_listings ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_auctions ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'task_listings_user') THEN
    CREATE POLICY task_listings_user ON task_listings FOR ALL USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'task_orders_user') THEN
    CREATE POLICY task_orders_user ON task_orders FOR ALL USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'task_auctions_user') THEN
    CREATE POLICY task_auctions_user ON task_auctions FOR ALL USING (auth.uid() = user_id);
  END IF;
END $$;

-- ============================================================
-- 076: Passive Voice Analysis
-- ============================================================

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

ALTER TABLE passive_voice_samples ENABLE ROW LEVEL SECURITY;
ALTER TABLE voice_daily_aggregates ENABLE ROW LEVEL SECURITY;
ALTER TABLE voice_interventions ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'passive_voice_samples_user') THEN
    CREATE POLICY passive_voice_samples_user ON passive_voice_samples FOR ALL USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'voice_daily_aggregates_user') THEN
    CREATE POLICY voice_daily_aggregates_user ON voice_daily_aggregates FOR ALL USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'voice_interventions_user') THEN
    CREATE POLICY voice_interventions_user ON voice_interventions FOR ALL USING (auth.uid() = user_id);
  END IF;
END $$;

-- ============================================================
-- 077: Industry Shoots
-- ============================================================

CREATE TABLE IF NOT EXISTS shoot_prescriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  title TEXT NOT NULL,
  denial_day INTEGER,
  shoot_type TEXT NOT NULL CHECK (shoot_type IN (
    'photo_set', 'short_video', 'cage_check', 'outfit_of_day',
    'toy_showcase', 'tease_video', 'progress_photo', 'edge_capture'
  )),
  outfit TEXT NOT NULL,
  setup TEXT,
  mood TEXT,
  shot_list JSONB NOT NULL DEFAULT '[]',
  handler_note TEXT,
  estimated_minutes INTEGER DEFAULT 15,
  denial_badge_color TEXT,
  content_level TEXT,
  poll_id UUID,
  scheduled_for TIMESTAMPTZ,
  media_paths JSONB DEFAULT '[]',
  selected_media JSONB DEFAULT '[]',
  primary_platform TEXT DEFAULT 'onlyfans',
  secondary_platforms JSONB DEFAULT '[]',
  caption_draft TEXT,
  hashtags TEXT,
  status TEXT DEFAULT 'prescribed' CHECK (status IN (
    'prescribed', 'in_progress', 'captured', 'ready_to_post', 'posted', 'skipped'
  )),
  skipped_at TIMESTAMPTZ,
  skip_consequence TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE shoot_prescriptions ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'shoot_prescriptions_user') THEN
    CREATE POLICY shoot_prescriptions_user ON shoot_prescriptions FOR ALL USING (auth.uid() = user_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_shoot_prescriptions_status ON shoot_prescriptions(user_id, status, scheduled_for DESC);
CREATE INDEX IF NOT EXISTS idx_shoot_prescriptions_denial ON shoot_prescriptions(user_id, denial_day, status);

CREATE TABLE IF NOT EXISTS shoot_reference_images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pose_name TEXT NOT NULL UNIQUE,
  angle TEXT NOT NULL,
  body_position TEXT NOT NULL,
  lighting TEXT,
  camera_position TEXT,
  svg_data TEXT NOT NULL,
  description TEXT,
  tags TEXT[] DEFAULT '{}',
  difficulty INTEGER DEFAULT 1 CHECK (difficulty BETWEEN 1 AND 5),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 078: Denial Content Calendar
-- ============================================================

CREATE TABLE IF NOT EXISTS denial_day_content_map (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  denial_day INTEGER NOT NULL UNIQUE CHECK (denial_day BETWEEN 1 AND 7),
  mood TEXT NOT NULL,
  content_types JSONB NOT NULL DEFAULT '[]',
  audience_hooks JSONB NOT NULL DEFAULT '[]',
  engagement_strategy TEXT NOT NULL,
  shoot_difficulty TEXT CHECK (shoot_difficulty IN ('easy', 'medium', 'high_arousal', 'premium')),
  reddit_subs JSONB DEFAULT '[]',
  handler_notes TEXT,
  optimal_shoot_types JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS denial_cycle_shoots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  denial_day INTEGER NOT NULL UNIQUE CHECK (denial_day BETWEEN 1 AND 7),
  title TEXT NOT NULL,
  shoot_type TEXT NOT NULL CHECK (shoot_type IN (
    'photo_set', 'short_video', 'cage_check', 'outfit_of_day',
    'toy_showcase', 'tease_video', 'progress_photo', 'edge_capture'
  )),
  duration_minutes INTEGER DEFAULT 10,
  mood TEXT,
  setup TEXT,
  outfit TEXT,
  shot_count INTEGER DEFAULT 3,
  shot_descriptions JSONB NOT NULL DEFAULT '[]',
  platforms JSONB NOT NULL DEFAULT '{}',
  caption_template TEXT,
  poll_type TEXT CHECK (poll_type IN (
    'denial_release', 'outfit_choice', 'content_choice',
    'challenge', 'timer', 'prediction', 'punishment', NULL
  )),
  handler_note TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 079: Audience Participation
-- ============================================================

CREATE TABLE IF NOT EXISTS audience_polls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  question TEXT NOT NULL,
  poll_type TEXT NOT NULL CHECK (poll_type IN (
    'denial_release', 'outfit_choice', 'content_choice',
    'challenge', 'timer', 'prediction', 'punishment', 'general'
  )),
  options JSONB NOT NULL DEFAULT '[]',
  platforms_posted TEXT[] DEFAULT '{}',
  platform_poll_ids JSONB DEFAULT '{}',
  handler_intent TEXT,
  winning_option_id TEXT,
  result_honored BOOLEAN,
  result_post_id UUID,
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'closed')),
  expires_at TIMESTAMPTZ,
  posted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE audience_polls ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'audience_polls_user') THEN
    CREATE POLICY audience_polls_user ON audience_polls FOR ALL USING (auth.uid() = user_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_audience_polls_status ON audience_polls(user_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audience_polls_type ON audience_polls(user_id, poll_type, status);

CREATE TABLE IF NOT EXISTS audience_challenges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  fan_username TEXT,
  platform TEXT,
  suggestion TEXT NOT NULL,
  handler_evaluation TEXT,
  handler_modified_version TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'completed')),
  shoot_prescription_id UUID,
  engagement_score NUMERIC,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE audience_challenges ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'audience_challenges_user') THEN
    CREATE POLICY audience_challenges_user ON audience_challenges FOR ALL USING (auth.uid() = user_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_audience_challenges_status ON audience_challenges(user_id, status, created_at DESC);

-- ============================================================
-- 080: Autonomous Engine
-- ============================================================

CREATE TABLE IF NOT EXISTS handler_autonomous_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  action_type TEXT NOT NULL CHECK (action_type IN (
    'community_comment', 'community_post', 'creator_dm',
    'poll_posted', 'engagement_reply', 'follow', 'cross_promo',
    'milestone_post', 'text_post', 'repost', 'subreddit_comment'
  )),
  platform TEXT NOT NULL,
  target TEXT,
  content_text TEXT,
  handler_intent TEXT,
  result JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE handler_autonomous_actions ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'handler_autonomous_actions_user') THEN
    CREATE POLICY handler_autonomous_actions_user ON handler_autonomous_actions FOR ALL USING (auth.uid() = user_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_handler_autonomous_actions_type ON handler_autonomous_actions(user_id, action_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_handler_autonomous_actions_platform ON handler_autonomous_actions(user_id, platform, created_at DESC);

CREATE TABLE IF NOT EXISTS community_targets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  platform TEXT NOT NULL,
  community_id TEXT NOT NULL,
  community_name TEXT NOT NULL,
  engagement_strategy TEXT,
  posting_frequency TEXT,
  voice_config JSONB DEFAULT '{}',
  content_types_allowed TEXT[] DEFAULT '{}',
  rules_summary TEXT,
  followers_attributed INTEGER DEFAULT 0,
  karma_earned INTEGER DEFAULT 0,
  total_posts INTEGER DEFAULT 0,
  total_comments INTEGER DEFAULT 0,
  last_post_at TIMESTAMPTZ,
  last_engagement_at TIMESTAMPTZ,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'paused')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, platform, community_id)
);

ALTER TABLE community_targets ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'community_targets_user') THEN
    CREATE POLICY community_targets_user ON community_targets FOR ALL USING (auth.uid() = user_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_community_targets_platform ON community_targets(user_id, platform, status);

-- ============================================================
-- 081: Content Queue & Multiplication
-- ============================================================

CREATE TABLE IF NOT EXISTS content_multiplication_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  source_shoot_id UUID REFERENCES shoot_prescriptions NOT NULL,
  total_posts_planned INTEGER NOT NULL DEFAULT 1,
  posts JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE content_multiplication_plans ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'content_multiplication_plans_user') THEN
    CREATE POLICY content_multiplication_plans_user ON content_multiplication_plans FOR ALL USING (auth.uid() = user_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_multiplication_plans_shoot ON content_multiplication_plans(user_id, source_shoot_id);

CREATE TABLE IF NOT EXISTS content_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  source_shoot_id UUID,
  multiplication_plan_id UUID,
  platform TEXT NOT NULL,
  content_type TEXT NOT NULL,
  media_paths JSONB DEFAULT '[]',
  caption TEXT,
  hashtags TEXT[] DEFAULT '{}',
  denial_day_badge INTEGER,
  scheduled_for TIMESTAMPTZ,
  posted_at TIMESTAMPTZ,
  status TEXT DEFAULT 'queued' CHECK (status IN ('queued', 'posted', 'failed', 'skipped')),
  engagement_stats JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE content_queue ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'content_queue_user') THEN
    CREATE POLICY content_queue_user ON content_queue FOR ALL USING (auth.uid() = user_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_content_queue_status ON content_queue(user_id, status, scheduled_for);
CREATE INDEX IF NOT EXISTS idx_content_queue_platform ON content_queue(user_id, platform, status);

-- ============================================================
-- 082: Skip Consequences
-- ============================================================

CREATE TABLE IF NOT EXISTS skip_consequences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  shoot_prescription_id UUID,
  skip_date DATE NOT NULL DEFAULT CURRENT_DATE,
  consecutive_skips INTEGER DEFAULT 1,
  consequence_type TEXT NOT NULL CHECK (consequence_type IN (
    'easier_tomorrow', 'audience_poll', 'handler_public_post', 'full_accountability'
  )),
  consequence_executed BOOLEAN DEFAULT false,
  consequence_details TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE skip_consequences ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'skip_consequences_user') THEN
    CREATE POLICY skip_consequences_user ON skip_consequences FOR ALL USING (auth.uid() = user_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_skip_consequences_date ON skip_consequences(user_id, skip_date DESC);

-- ============================================================
-- 083: Fan Memory Extension
-- ============================================================

ALTER TABLE fan_profiles
  ADD COLUMN IF NOT EXISTS fan_preferences JSONB DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS trigger_content TEXT,
  ADD COLUMN IF NOT EXISTS communication_style TEXT,
  ADD COLUMN IF NOT EXISTS personal_details_shared JSONB DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS engagement_pattern TEXT,
  ADD COLUMN IF NOT EXISTS whale_status BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS handler_relationship_notes TEXT;

CREATE INDEX IF NOT EXISTS idx_fan_profiles_whale ON fan_profiles(user_id, whale_status) WHERE whale_status = true;

-- ============================================================
-- 084: Log Entry Capture Fields
-- ============================================================

ALTER TABLE task_bank ADD COLUMN IF NOT EXISTS capture_fields JSONB DEFAULT NULL;

-- Seed tasks skipped: task_bank.id is UUID, seed IDs are strings. Add via app.

-- ============================================================
-- 086a: Creator Outreach + Content Queue Extensions
-- ============================================================

CREATE TABLE IF NOT EXISTS creator_outreach (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  platform TEXT NOT NULL,
  username TEXT NOT NULL,
  display_name TEXT,
  follower_count INTEGER,
  content_overlap TEXT[] DEFAULT '{}',
  relationship_stage TEXT DEFAULT 'identified' CHECK (relationship_stage IN (
    'identified', 'engaged', 'connected', 'active_promo'
  )),
  first_engaged_at TIMESTAMPTZ,
  last_engaged_at TIMESTAMPTZ,
  public_interactions INTEGER DEFAULT 0,
  dms_sent INTEGER DEFAULT 0,
  cross_promos INTEGER DEFAULT 0,
  handler_notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, platform, username)
);

ALTER TABLE creator_outreach ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'creator_outreach_user') THEN
    CREATE POLICY creator_outreach_user ON creator_outreach FOR ALL USING (auth.uid() = user_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_creator_outreach_stage ON creator_outreach(user_id, relationship_stage);
CREATE INDEX IF NOT EXISTS idx_creator_outreach_platform ON creator_outreach(user_id, platform);

-- Content queue extensions (table already created above in 081)
ALTER TABLE content_queue
  ADD COLUMN IF NOT EXISTS content_text TEXT,
  ADD COLUMN IF NOT EXISTS caption_text TEXT,
  ADD COLUMN IF NOT EXISTS community_id TEXT,
  ADD COLUMN IF NOT EXISTS media_url TEXT,
  ADD COLUMN IF NOT EXISTS handler_intent TEXT,
  ADD COLUMN IF NOT EXISTS is_text_only BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_handler_voice BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_recycled BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS original_content_id UUID,
  ADD COLUMN IF NOT EXISTS engagement_likes INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS engagement_comments INTEGER DEFAULT 0;

-- ============================================================
-- 086b: Hypno Session Task Columns
-- ============================================================

ALTER TABLE task_bank ADD COLUMN IF NOT EXISTS playlist_ids UUID[];
ALTER TABLE task_bank ADD COLUMN IF NOT EXISTS content_ids UUID[];
ALTER TABLE task_bank ADD COLUMN IF NOT EXISTS ritual_required BOOLEAN DEFAULT false;
ALTER TABLE task_bank ADD COLUMN IF NOT EXISTS capture_mode TEXT DEFAULT 'none';
ALTER TABLE task_bank ADD COLUMN IF NOT EXISTS device_required BOOLEAN DEFAULT false;
ALTER TABLE task_bank ADD COLUMN IF NOT EXISTS cage_required BOOLEAN DEFAULT false;
ALTER TABLE task_bank ADD COLUMN IF NOT EXISTS handler_framing TEXT;

-- Add check constraint idempotently
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.constraint_column_usage
    WHERE table_name = 'task_bank' AND constraint_name = 'task_bank_capture_mode_check'
  ) THEN
    ALTER TABLE task_bank ADD CONSTRAINT task_bank_capture_mode_check
      CHECK (capture_mode IN ('passive', 'active', 'none'));
  END IF;
END $$;

-- Seed hypno session tasks skipped: task_bank.id is UUID, seed IDs are strings. Add via app.

-- ============================================================
-- DONE. All migrations 062-086 applied.
-- ============================================================
