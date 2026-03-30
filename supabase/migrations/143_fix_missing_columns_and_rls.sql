-- Migration 143: Fix missing columns and RLS policies
-- Addresses 400 (missing columns) and 406 (missing RLS) errors

-- ============================================
-- 1. user_state — add missing columns
-- ============================================
ALTER TABLE user_state ADD COLUMN IF NOT EXISTS opacity_level INTEGER DEFAULT 1;
ALTER TABLE user_state ADD COLUMN IF NOT EXISTS opacity_level_set_at TIMESTAMPTZ;
ALTER TABLE user_state ADD COLUMN IF NOT EXISTS opacity_level_history JSONB DEFAULT '[]';
ALTER TABLE user_state ADD COLUMN IF NOT EXISTS gina_asleep BOOLEAN DEFAULT FALSE;

-- ============================================
-- 2. Create subscriber_polls if missing (404)
-- ============================================
CREATE TABLE IF NOT EXISTS subscriber_polls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  question TEXT NOT NULL,
  options JSONB DEFAULT '[]',
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'approved', 'active', 'closed')),
  votes JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  closed_at TIMESTAMPTZ
);
ALTER TABLE subscriber_polls ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'subscriber_polls' AND policyname = 'Users own subscriber_polls') THEN
    CREATE POLICY "Users own subscriber_polls" ON subscriber_polls FOR ALL USING (auth.uid() = user_id);
  END IF;
END $$;

-- ============================================
-- 3. Create journal_entries if missing (404)
-- ============================================
CREATE TABLE IF NOT EXISTS journal_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  content JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, date)
);
ALTER TABLE journal_entries ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'journal_entries' AND policyname = 'Users own journal_entries') THEN
    CREATE POLICY "Users own journal_entries" ON journal_entries FOR ALL USING (auth.uid() = user_id);
  END IF;
END $$;

-- ============================================
-- 4. Add missing columns on other 400 tables
-- ============================================

-- user_profiles — missing columns
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS preferred_name TEXT;
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS pronouns TEXT;
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS goals JSONB DEFAULT '[]';
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS preferences JSONB DEFAULT '{}';

-- mood_checkins — missing columns
ALTER TABLE mood_checkins ADD COLUMN IF NOT EXISTS score INTEGER;

-- service_progression — missing columns
ALTER TABLE service_progression ADD COLUMN IF NOT EXISTS current_stage TEXT;
ALTER TABLE service_progression ADD COLUMN IF NOT EXISTS stage_entered_at TIMESTAMPTZ;

-- daily_entries — missing columns
ALTER TABLE daily_entries ADD COLUMN IF NOT EXISTS alignment_score INTEGER;
ALTER TABLE daily_entries ADD COLUMN IF NOT EXISTS handler_notes TEXT;
ALTER TABLE daily_entries ADD COLUMN IF NOT EXISTS tasks_completed INTEGER DEFAULT 0;
ALTER TABLE daily_entries ADD COLUMN IF NOT EXISTS points_earned INTEGER DEFAULT 0;
ALTER TABLE daily_entries ADD COLUMN IF NOT EXISTS domains_practiced TEXT[];

-- fan_messages — missing columns
ALTER TABLE fan_messages ADD COLUMN IF NOT EXISTS fan_name TEXT;
ALTER TABLE fan_messages ADD COLUMN IF NOT EXISTS platform TEXT;
ALTER TABLE fan_messages ADD COLUMN IF NOT EXISTS content TEXT;
ALTER TABLE fan_messages ADD COLUMN IF NOT EXISTS direction TEXT DEFAULT 'inbound';

-- fan_interactions — missing columns
ALTER TABLE fan_interactions ADD COLUMN IF NOT EXISTS sentiment TEXT;
ALTER TABLE fan_interactions ADD COLUMN IF NOT EXISTS handler_action TEXT;
ALTER TABLE fan_interactions ADD COLUMN IF NOT EXISTS response_approved BOOLEAN;
ALTER TABLE fan_interactions ADD COLUMN IF NOT EXISTS tip_amount_cents INTEGER;

-- ============================================
-- 5. Notify PostgREST to reload schema cache
-- ============================================
NOTIFY pgrst, 'reload schema';

-- ============================================
-- 6. Fix RLS policies on tables returning 406
-- These tables exist but may lack SELECT policies
-- ============================================

-- handler_user_model
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'handler_user_model' AND policyname = 'Users read handler_user_model') THEN
    CREATE POLICY "Users read handler_user_model" ON handler_user_model FOR SELECT USING (auth.uid() = user_id);
  END IF;
END $$;

-- narrative_arcs
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'narrative_arcs' AND policyname = 'Users read narrative_arcs') THEN
    CREATE POLICY "Users read narrative_arcs" ON narrative_arcs FOR SELECT USING (auth.uid() = user_id);
  END IF;
END $$;

-- hypno_session_summary
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'hypno_session_summary' AND policyname = 'Users read hypno_session_summary') THEN
    CREATE POLICY "Users read hypno_session_summary" ON hypno_session_summary FOR SELECT USING (auth.uid() = user_id);
  END IF;
END $$;

-- voice_daily_aggregates
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'voice_daily_aggregates' AND policyname = 'Users read voice_daily_aggregates') THEN
    CREATE POLICY "Users read voice_daily_aggregates" ON voice_daily_aggregates FOR SELECT USING (auth.uid() = user_id);
  END IF;
END $$;

-- evidence
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'evidence' AND policyname = 'Users read evidence') THEN
    CREATE POLICY "Users read evidence" ON evidence FOR SELECT USING (auth.uid() = user_id);
  END IF;
END $$;

-- feminization_targets
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'feminization_targets' AND policyname = 'Users read feminization_targets') THEN
    CREATE POLICY "Users read feminization_targets" ON feminization_targets FOR SELECT USING (auth.uid() = user_id);
  END IF;
END $$;

-- content_strategy_state
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'content_strategy_state' AND policyname = 'Users read content_strategy_state') THEN
    CREATE POLICY "Users read content_strategy_state" ON content_strategy_state FOR SELECT USING (auth.uid() = user_id);
  END IF;
END $$;

-- task_completions
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'task_completions' AND policyname = 'Users read task_completions') THEN
    CREATE POLICY "Users read task_completions" ON task_completions FOR SELECT USING (auth.uid() = user_id);
  END IF;
END $$;

-- cam_sessions
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'cam_sessions' AND policyname = 'Users read cam_sessions') THEN
    CREATE POLICY "Users read cam_sessions" ON cam_sessions FOR SELECT USING (auth.uid() = user_id);
  END IF;
END $$;

-- denial_state
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'denial_state' AND policyname = 'Users read denial_state') THEN
    CREATE POLICY "Users read denial_state" ON denial_state FOR SELECT USING (auth.uid() = user_id);
  END IF;
END $$;

-- conditioning_sessions_v2
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'conditioning_sessions_v2' AND policyname = 'Users read conditioning_sessions_v2') THEN
    CREATE POLICY "Users read conditioning_sessions_v2" ON conditioning_sessions_v2 FOR SELECT USING (auth.uid() = user_id);
  END IF;
END $$;

-- trance_progression
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'trance_progression' AND policyname = 'Users read trance_progression') THEN
    CREATE POLICY "Users read trance_progression" ON trance_progression FOR SELECT USING (auth.uid() = user_id);
  END IF;
END $$;

-- scent_conditioning
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'scent_conditioning' AND policyname = 'Users read scent_conditioning') THEN
    CREATE POLICY "Users read scent_conditioning" ON scent_conditioning FOR SELECT USING (auth.uid() = user_id);
  END IF;
END $$;

-- post_hypnotic_tracking
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'post_hypnotic_tracking' AND policyname = 'Users read post_hypnotic_tracking') THEN
    CREATE POLICY "Users read post_hypnotic_tracking" ON post_hypnotic_tracking FOR SELECT USING (auth.uid() = user_id);
  END IF;
END $$;

-- hidden_operations
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'hidden_operations' AND policyname = 'Users read hidden_operations') THEN
    CREATE POLICY "Users read hidden_operations" ON hidden_operations FOR SELECT USING (auth.uid() = user_id);
  END IF;
END $$;

-- generated_scripts
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'generated_scripts' AND policyname = 'Users read generated_scripts') THEN
    CREATE POLICY "Users read generated_scripts" ON generated_scripts FOR SELECT USING (auth.uid() = user_id);
  END IF;
END $$;

-- content_curriculum
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'content_curriculum' AND policyname = 'Users read content_curriculum') THEN
    CREATE POLICY "Users read content_curriculum" ON content_curriculum FOR SELECT USING (auth.uid() = user_id);
  END IF;
END $$;
