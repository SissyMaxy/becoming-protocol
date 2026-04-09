-- Migration 167: Create all missing tables causing failed queries
-- Also patches existing tables with missing columns where schema drifted from code

-- ============================================
-- 1. DENIAL_STATE — already exists (020), patch missing columns
-- Code uses: current_denial_day, is_locked, lock_started_at, last_release_at,
--            total_denial_days, longest_streak
-- ============================================
-- (table exists, no action needed — schema matches code)

-- ============================================
-- 2. SKILL_LEVELS
-- Queried by: wardrobe-system.ts, feminization-mandate.ts, progressive-exposure.ts
-- Columns: user_id, domain, current_level
-- ============================================
CREATE TABLE IF NOT EXISTS skill_levels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  domain TEXT NOT NULL,
  current_level INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, domain)
);

ALTER TABLE skill_levels ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "skill_levels_select" ON skill_levels;
CREATE POLICY "skill_levels_select" ON skill_levels FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "skill_levels_insert" ON skill_levels;
CREATE POLICY "skill_levels_insert" ON skill_levels FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "skill_levels_update" ON skill_levels;
CREATE POLICY "skill_levels_update" ON skill_levels FOR UPDATE USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_skill_levels_user_domain ON skill_levels(user_id, domain);

-- ============================================
-- 3. EXPOSURE_HISTORY
-- Queried by: progressive-exposure.ts (insert + select by user+level)
-- Columns: user_id, level, task, completed_at, evidence
-- ============================================
CREATE TABLE IF NOT EXISTS exposure_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  level INTEGER NOT NULL,
  task TEXT,
  completed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  evidence TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE exposure_history ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "exposure_history_select" ON exposure_history;
CREATE POLICY "exposure_history_select" ON exposure_history FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "exposure_history_insert" ON exposure_history;
CREATE POLICY "exposure_history_insert" ON exposure_history FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "exposure_history_update" ON exposure_history;
CREATE POLICY "exposure_history_update" ON exposure_history FOR UPDATE USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_exposure_history_user ON exposure_history(user_id);
CREATE INDEX IF NOT EXISTS idx_exposure_history_user_level ON exposure_history(user_id, level);

-- ============================================
-- 4. IDENTITY_JOURNAL — already exists (151), patch column names
-- Code inserts: entry_text, prompt_category, prompt_text, word_count
-- Code reads: entry_text, word_count, identity_signals, emotional_tone, consecutive_days, prompt_category, created_at
-- Existing schema uses 'content' and 'prompt' — add aliases
-- ============================================
ALTER TABLE identity_journal ADD COLUMN IF NOT EXISTS entry_text TEXT;
ALTER TABLE identity_journal ADD COLUMN IF NOT EXISTS prompt_text TEXT;

-- Backfill if old columns have data
UPDATE identity_journal SET entry_text = content WHERE entry_text IS NULL AND content IS NOT NULL;
UPDATE identity_journal SET prompt_text = prompt WHERE prompt_text IS NULL AND prompt IS NOT NULL;

-- Drop the NOT NULL + CHECK constraints that block inserts using new column names
-- The code does NOT send entry_date (it lets created_at handle dates), so make entry_date nullable
ALTER TABLE identity_journal ALTER COLUMN entry_date DROP NOT NULL;
ALTER TABLE identity_journal ALTER COLUMN prompt DROP NOT NULL;
ALTER TABLE identity_journal ALTER COLUMN content DROP NOT NULL;

-- ============================================
-- 5. FEMINIZATION_TARGETS — already exists (119), verify columns
-- Code uses: target_domain, target_description, target_metric, target_intensity,
--            exposure_level, comfort_zone_edge, last_boundary_pushed, last_boundary_pushed_at,
--            status, completed_at, replaced_by
-- ============================================
-- Patch any missing columns (table exists from 119)
ALTER TABLE feminization_targets ADD COLUMN IF NOT EXISTS exposure_level INTEGER DEFAULT 1;
ALTER TABLE feminization_targets ADD COLUMN IF NOT EXISTS comfort_zone_edge TEXT;
ALTER TABLE feminization_targets ADD COLUMN IF NOT EXISTS last_boundary_pushed TEXT;
ALTER TABLE feminization_targets ADD COLUMN IF NOT EXISTS last_boundary_pushed_at TIMESTAMPTZ;
ALTER TABLE feminization_targets ADD COLUMN IF NOT EXISTS replaced_by UUID;

-- ============================================
-- 6. HANDLER_DAILY_PLANS — already exists (003/010/025), patch columns
-- daily-plan.ts upserts: target_domains, interventions, escalation_targets,
--   vulnerability_windows, task_cap, task_cap_reason, intensity, intensity_reason,
--   planned_sessions, morning_briefing, generated_at, decisions_applied
-- useHandler.ts upserts: planned_interventions, planned_experiments, focus_areas,
--   trigger_reinforcement_schedule, vulnerability_windows, executed, execution_notes
-- ============================================
ALTER TABLE handler_daily_plans ADD COLUMN IF NOT EXISTS target_domains JSONB DEFAULT '[]';
ALTER TABLE handler_daily_plans ADD COLUMN IF NOT EXISTS interventions JSONB DEFAULT '[]';
ALTER TABLE handler_daily_plans ADD COLUMN IF NOT EXISTS escalation_targets JSONB DEFAULT '[]';
ALTER TABLE handler_daily_plans ADD COLUMN IF NOT EXISTS vulnerability_windows JSONB DEFAULT '[]';
ALTER TABLE handler_daily_plans ADD COLUMN IF NOT EXISTS task_cap INTEGER;
ALTER TABLE handler_daily_plans ADD COLUMN IF NOT EXISTS task_cap_reason TEXT;
ALTER TABLE handler_daily_plans ADD COLUMN IF NOT EXISTS intensity TEXT;
ALTER TABLE handler_daily_plans ADD COLUMN IF NOT EXISTS intensity_reason TEXT;
ALTER TABLE handler_daily_plans ADD COLUMN IF NOT EXISTS planned_sessions JSONB DEFAULT '[]';
ALTER TABLE handler_daily_plans ADD COLUMN IF NOT EXISTS morning_briefing TEXT;
ALTER TABLE handler_daily_plans ADD COLUMN IF NOT EXISTS generated_at TIMESTAMPTZ;
ALTER TABLE handler_daily_plans ADD COLUMN IF NOT EXISTS decisions_applied JSONB DEFAULT '[]';
ALTER TABLE handler_daily_plans ADD COLUMN IF NOT EXISTS planned_interventions JSONB DEFAULT '[]';
ALTER TABLE handler_daily_plans ADD COLUMN IF NOT EXISTS planned_experiments JSONB DEFAULT '[]';
ALTER TABLE handler_daily_plans ADD COLUMN IF NOT EXISTS focus_areas JSONB DEFAULT '[]';
ALTER TABLE handler_daily_plans ADD COLUMN IF NOT EXISTS trigger_reinforcement_schedule JSONB DEFAULT '[]';
ALTER TABLE handler_daily_plans ADD COLUMN IF NOT EXISTS executed BOOLEAN DEFAULT FALSE;
ALTER TABLE handler_daily_plans ADD COLUMN IF NOT EXISTS execution_notes TEXT;

-- ============================================
-- 7. DEVICE_SCHEDULE — already exists (133/158), patch columns
-- Code uses: schedule_date, scheduled_at, intensity, duration_seconds, pattern,
--            paired_message, fired, fired_at
-- ============================================
ALTER TABLE device_schedule ADD COLUMN IF NOT EXISTS paired_message TEXT;
ALTER TABLE device_schedule ADD COLUMN IF NOT EXISTS fired_at TIMESTAMPTZ;

-- ============================================
-- 8. OUTFIT_PRESCRIPTIONS
-- Queried by: outfit-control.ts
-- Columns: user_id, date, underwear, top, bottom, accessories, shoes, scent,
--          context, photo_required, deadline, verified, verified_at, photo_id,
--          escalation_level
-- ============================================
CREATE TABLE IF NOT EXISTS outfit_prescriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  date DATE NOT NULL,
  underwear TEXT,
  top TEXT,
  bottom TEXT,
  accessories TEXT[],
  shoes TEXT,
  scent TEXT,
  context TEXT DEFAULT 'home',
  photo_required BOOLEAN DEFAULT FALSE,
  deadline TIMESTAMPTZ,
  verified BOOLEAN DEFAULT FALSE,
  verified_at TIMESTAMPTZ,
  photo_id UUID,
  escalation_level INTEGER DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, date)
);

ALTER TABLE outfit_prescriptions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "outfit_prescriptions_select" ON outfit_prescriptions;
CREATE POLICY "outfit_prescriptions_select" ON outfit_prescriptions FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "outfit_prescriptions_insert" ON outfit_prescriptions;
CREATE POLICY "outfit_prescriptions_insert" ON outfit_prescriptions FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "outfit_prescriptions_update" ON outfit_prescriptions;
CREATE POLICY "outfit_prescriptions_update" ON outfit_prescriptions FOR UPDATE USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_outfit_prescriptions_user_date ON outfit_prescriptions(user_id, date);

-- ============================================
-- 9. POST_HYPNOTIC_TRACKING — already exists (140), patch columns
-- Code uses: script_id, session_id, context, suggestion, activation_time,
--            activation_expected_at, activation_detected, detection_method
-- ============================================
ALTER TABLE post_hypnotic_tracking ADD COLUMN IF NOT EXISTS script_id TEXT;
ALTER TABLE post_hypnotic_tracking ADD COLUMN IF NOT EXISTS session_id TEXT;
ALTER TABLE post_hypnotic_tracking ADD COLUMN IF NOT EXISTS context TEXT;
ALTER TABLE post_hypnotic_tracking ADD COLUMN IF NOT EXISTS suggestion TEXT;
ALTER TABLE post_hypnotic_tracking ADD COLUMN IF NOT EXISTS activation_time TEXT;
ALTER TABLE post_hypnotic_tracking ADD COLUMN IF NOT EXISTS activation_expected_at TIMESTAMPTZ;
ALTER TABLE post_hypnotic_tracking ADD COLUMN IF NOT EXISTS activation_detected BOOLEAN;
ALTER TABLE post_hypnotic_tracking ADD COLUMN IF NOT EXISTS detection_method TEXT;

-- ============================================
-- 10. HANDLER_PROTOCOLS — already exists (156), patch columns
-- Code uses: name, protocol_type, status, steps (JSONB), current_step,
--            step_history (JSONB), step_started_at, completed_at
-- ============================================
ALTER TABLE handler_protocols ADD COLUMN IF NOT EXISTS name TEXT;
ALTER TABLE handler_protocols ADD COLUMN IF NOT EXISTS protocol_type TEXT;
ALTER TABLE handler_protocols ADD COLUMN IF NOT EXISTS steps JSONB DEFAULT '[]';
ALTER TABLE handler_protocols ADD COLUMN IF NOT EXISTS current_step INTEGER DEFAULT 0;
ALTER TABLE handler_protocols ADD COLUMN IF NOT EXISTS step_history JSONB DEFAULT '[]';
ALTER TABLE handler_protocols ADD COLUMN IF NOT EXISTS step_started_at TIMESTAMPTZ;
ALTER TABLE handler_protocols ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;

-- ============================================
-- 11. DAILY_MANDATES
-- Queried by: feminization-mandate.ts
-- Columns: id (TEXT PK), user_id, mandate_date, category, instruction, deadline,
--          verification_type, verified, verified_at, evidence,
--          consequence_on_miss, consequence_fired, escalation_level
-- ============================================
CREATE TABLE IF NOT EXISTS daily_mandates (
  id TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  mandate_date DATE NOT NULL,
  category TEXT NOT NULL,
  instruction TEXT NOT NULL,
  deadline TIMESTAMPTZ NOT NULL,
  verification_type TEXT,
  verified BOOLEAN DEFAULT FALSE,
  verified_at TIMESTAMPTZ,
  evidence TEXT,
  consequence_on_miss TEXT,
  consequence_fired BOOLEAN DEFAULT FALSE,
  escalation_level INTEGER DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE daily_mandates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "daily_mandates_select" ON daily_mandates;
CREATE POLICY "daily_mandates_select" ON daily_mandates FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "daily_mandates_insert" ON daily_mandates;
CREATE POLICY "daily_mandates_insert" ON daily_mandates FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "daily_mandates_update" ON daily_mandates;
CREATE POLICY "daily_mandates_update" ON daily_mandates FOR UPDATE USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_daily_mandates_user_date ON daily_mandates(user_id, mandate_date);
CREATE INDEX IF NOT EXISTS idx_daily_mandates_deadline ON daily_mandates(user_id, mandate_date, verified, deadline);

-- ============================================
-- 12. VOICE_PRACTICE_LOG
-- Queried by: denial-engine.ts (count by user + date range)
-- Columns: user_id, duration_seconds, avg_pitch_hz, created_at
-- ============================================
CREATE TABLE IF NOT EXISTS voice_practice_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  duration_seconds INTEGER,
  avg_pitch_hz REAL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE voice_practice_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "voice_practice_log_select" ON voice_practice_log;
CREATE POLICY "voice_practice_log_select" ON voice_practice_log FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "voice_practice_log_insert" ON voice_practice_log;
CREATE POLICY "voice_practice_log_insert" ON voice_practice_log FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "voice_practice_log_update" ON voice_practice_log;
CREATE POLICY "voice_practice_log_update" ON voice_practice_log FOR UPDATE USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_voice_practice_log_user ON voice_practice_log(user_id);
CREATE INDEX IF NOT EXISTS idx_voice_practice_log_created ON voice_practice_log(user_id, created_at DESC);

-- ============================================
-- 13. CONSUMPTION_MANDATES
-- Queried by: consumption-mandates.ts
-- Columns: id (TEXT PK), user_id, date, consumption_type, description,
--          minimum_minutes, deadline, completed, completed_at, evidence,
--          consequence_fired
-- ============================================
CREATE TABLE IF NOT EXISTS consumption_mandates (
  id TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  date DATE NOT NULL,
  consumption_type TEXT NOT NULL,
  description TEXT,
  minimum_minutes INTEGER DEFAULT 0,
  deadline TIMESTAMPTZ,
  completed BOOLEAN DEFAULT FALSE,
  completed_at TIMESTAMPTZ,
  evidence TEXT,
  consequence_fired BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE consumption_mandates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "consumption_mandates_select" ON consumption_mandates;
CREATE POLICY "consumption_mandates_select" ON consumption_mandates FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "consumption_mandates_insert" ON consumption_mandates;
CREATE POLICY "consumption_mandates_insert" ON consumption_mandates FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "consumption_mandates_update" ON consumption_mandates;
CREATE POLICY "consumption_mandates_update" ON consumption_mandates FOR UPDATE USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_consumption_mandates_user_date ON consumption_mandates(user_id, date);

-- ============================================
-- 14. EXERCISE_PRESCRIPTIONS
-- Queried by: exercise-prescriptions.ts
-- Columns: user_id, prescribed_date, recovery_zone, estimated_minutes,
--          exercises (JSONB), warmup, cooldown, verified, strain_delta,
--          verification_evidence, verified_at
-- ============================================
CREATE TABLE IF NOT EXISTS exercise_prescriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  prescribed_date DATE NOT NULL,
  recovery_zone TEXT,
  estimated_minutes INTEGER,
  exercises JSONB DEFAULT '[]',
  warmup TEXT,
  cooldown TEXT,
  verified BOOLEAN,
  strain_delta REAL,
  verification_evidence TEXT,
  verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, prescribed_date)
);

ALTER TABLE exercise_prescriptions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "exercise_prescriptions_select" ON exercise_prescriptions;
CREATE POLICY "exercise_prescriptions_select" ON exercise_prescriptions FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "exercise_prescriptions_insert" ON exercise_prescriptions;
CREATE POLICY "exercise_prescriptions_insert" ON exercise_prescriptions FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "exercise_prescriptions_update" ON exercise_prescriptions;
CREATE POLICY "exercise_prescriptions_update" ON exercise_prescriptions FOR UPDATE USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_exercise_prescriptions_user_date ON exercise_prescriptions(user_id, prescribed_date);

-- ============================================
-- 15. FAILURE_RECOVERY_EVENTS
-- Queried by: failure-recovery.ts
-- Columns: user_id, recovery_type, detected_at, resolved_at, signals (JSONB)
-- ============================================
CREATE TABLE IF NOT EXISTS failure_recovery_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  recovery_type TEXT NOT NULL,
  detected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ,
  signals JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE failure_recovery_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "failure_recovery_events_select" ON failure_recovery_events;
CREATE POLICY "failure_recovery_events_select" ON failure_recovery_events FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "failure_recovery_events_insert" ON failure_recovery_events;
CREATE POLICY "failure_recovery_events_insert" ON failure_recovery_events FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "failure_recovery_events_update" ON failure_recovery_events;
CREATE POLICY "failure_recovery_events_update" ON failure_recovery_events FOR UPDATE USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_failure_recovery_user ON failure_recovery_events(user_id);
CREATE INDEX IF NOT EXISTS idx_failure_recovery_active ON failure_recovery_events(user_id, resolved_at) WHERE resolved_at IS NULL;

-- ============================================
-- 16. GINA_STATE — already exists (041), no changes needed
-- Schema matches code (is_home, emergence_stage, etc.)
-- ============================================

-- ============================================
-- 17. CONTENT_STRATEGY_STATE — already exists (120), patch columns
-- Code upserts: platform_performance, content_type_performance, timing_performance,
--   denial_day_performance, recommended_platform_mix, recommended_shoot_frequency,
--   recommended_posting_times, weekly_revenue, monthly_revenue, revenue_trend,
--   last_analyzed_at, skip_patterns
-- ============================================
ALTER TABLE content_strategy_state ADD COLUMN IF NOT EXISTS platform_performance JSONB;
ALTER TABLE content_strategy_state ADD COLUMN IF NOT EXISTS timing_performance JSONB;
ALTER TABLE content_strategy_state ADD COLUMN IF NOT EXISTS denial_day_performance JSONB;
ALTER TABLE content_strategy_state ADD COLUMN IF NOT EXISTS recommended_platform_mix JSONB;
ALTER TABLE content_strategy_state ADD COLUMN IF NOT EXISTS recommended_shoot_frequency TEXT;
ALTER TABLE content_strategy_state ADD COLUMN IF NOT EXISTS recommended_posting_times JSONB;
ALTER TABLE content_strategy_state ADD COLUMN IF NOT EXISTS weekly_revenue NUMERIC DEFAULT 0;
ALTER TABLE content_strategy_state ADD COLUMN IF NOT EXISTS monthly_revenue NUMERIC DEFAULT 0;
ALTER TABLE content_strategy_state ADD COLUMN IF NOT EXISTS revenue_trend TEXT;
ALTER TABLE content_strategy_state ADD COLUMN IF NOT EXISTS last_analyzed_at TIMESTAMPTZ;
ALTER TABLE content_strategy_state ADD COLUMN IF NOT EXISTS skip_patterns JSONB;

-- ============================================
-- 18. VOICE_DAILY_AGGREGATES — already exists (076), patch columns
-- Code upserts: total_samples, total_duration_seconds, avg_pitch_hz,
--   median_pitch_hz, min_pitch_hz, max_pitch_hz, pitch_std_dev,
--   time_in_target_pct, by_context
-- ============================================
ALTER TABLE voice_daily_aggregates ADD COLUMN IF NOT EXISTS total_samples INTEGER DEFAULT 0;
ALTER TABLE voice_daily_aggregates ADD COLUMN IF NOT EXISTS total_duration_seconds REAL DEFAULT 0;
ALTER TABLE voice_daily_aggregates ADD COLUMN IF NOT EXISTS median_pitch_hz REAL;
ALTER TABLE voice_daily_aggregates ADD COLUMN IF NOT EXISTS min_pitch_hz REAL;
ALTER TABLE voice_daily_aggregates ADD COLUMN IF NOT EXISTS max_pitch_hz REAL;
ALTER TABLE voice_daily_aggregates ADD COLUMN IF NOT EXISTS pitch_std_dev REAL;
ALTER TABLE voice_daily_aggregates ADD COLUMN IF NOT EXISTS time_in_target_pct REAL;
ALTER TABLE voice_daily_aggregates ADD COLUMN IF NOT EXISTS by_context JSONB;

-- ============================================
-- 19. TURNING_OUT_PROGRESSION — already exists (147), no changes needed
-- Code reads: current_stage by user_id
-- ============================================

-- ============================================
-- 20. RELEASE_EVENTS
-- Queried by: failure-recovery.ts, predictive-engine.ts
-- Columns: user_id, release_type, context, created_at
-- ============================================
CREATE TABLE IF NOT EXISTS release_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  release_type TEXT,
  context TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE release_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "release_events_select" ON release_events;
CREATE POLICY "release_events_select" ON release_events FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "release_events_insert" ON release_events;
CREATE POLICY "release_events_insert" ON release_events FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "release_events_update" ON release_events;
CREATE POLICY "release_events_update" ON release_events FOR UPDATE USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_release_events_user ON release_events(user_id);
CREATE INDEX IF NOT EXISTS idx_release_events_created ON release_events(user_id, created_at DESC);

-- ============================================
-- 21. HANDLER_MEMORIES
-- Queried by: goon-engine.ts, entry-processor.ts
-- Columns: user_id, memory_type, importance, content, source, context (JSONB), tags (TEXT[])
-- ============================================
CREATE TABLE IF NOT EXISTS handler_memories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  memory_type TEXT NOT NULL,
  importance TEXT DEFAULT 'normal',
  content TEXT NOT NULL,
  source TEXT,
  context JSONB,
  tags TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE handler_memories ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "handler_memories_select" ON handler_memories;
CREATE POLICY "handler_memories_select" ON handler_memories FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "handler_memories_insert" ON handler_memories;
CREATE POLICY "handler_memories_insert" ON handler_memories FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "handler_memories_update" ON handler_memories;
CREATE POLICY "handler_memories_update" ON handler_memories FOR UPDATE USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_handler_memories_user ON handler_memories(user_id);
CREATE INDEX IF NOT EXISTS idx_handler_memories_type ON handler_memories(user_id, memory_type);
CREATE INDEX IF NOT EXISTS idx_handler_memories_created ON handler_memories(user_id, created_at DESC);

-- ============================================
-- 22. LANGUAGE_DRIFT_SNAPSHOTS
-- Queried by: predictive-engine.ts
-- Columns: user_id, feminine_ratio, feminine_pronoun_count, masculine_pronoun_count,
--          regression_marker_count, created_at
-- ============================================
CREATE TABLE IF NOT EXISTS language_drift_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  feminine_ratio REAL DEFAULT 0,
  feminine_pronoun_count INTEGER DEFAULT 0,
  masculine_pronoun_count INTEGER DEFAULT 0,
  regression_marker_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE language_drift_snapshots ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "language_drift_snapshots_select" ON language_drift_snapshots;
CREATE POLICY "language_drift_snapshots_select" ON language_drift_snapshots FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "language_drift_snapshots_insert" ON language_drift_snapshots;
CREATE POLICY "language_drift_snapshots_insert" ON language_drift_snapshots FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "language_drift_snapshots_update" ON language_drift_snapshots;
CREATE POLICY "language_drift_snapshots_update" ON language_drift_snapshots FOR UPDATE USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_language_drift_user ON language_drift_snapshots(user_id);
CREATE INDEX IF NOT EXISTS idx_language_drift_created ON language_drift_snapshots(user_id, created_at DESC);

-- ============================================
-- 23. USER_CONDITIONING_STATE
-- Queried by: library-growth.ts
-- Columns: user_id, current_phase, updated_at
-- ============================================
CREATE TABLE IF NOT EXISTS user_conditioning_state (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE UNIQUE,
  current_phase INTEGER DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE user_conditioning_state ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "user_conditioning_state_select" ON user_conditioning_state;
CREATE POLICY "user_conditioning_state_select" ON user_conditioning_state FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "user_conditioning_state_insert" ON user_conditioning_state;
CREATE POLICY "user_conditioning_state_insert" ON user_conditioning_state FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "user_conditioning_state_update" ON user_conditioning_state;
CREATE POLICY "user_conditioning_state_update" ON user_conditioning_state FOR UPDATE USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_user_conditioning_state_user ON user_conditioning_state(user_id);

-- ============================================
-- 24. WHOOP_DAILY
-- Queried by: predictive-engine.ts
-- Columns: user_id, date, strain, recovery, sleep_performance
-- ============================================
CREATE TABLE IF NOT EXISTS whoop_daily (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  date DATE NOT NULL,
  strain REAL,
  recovery REAL,
  sleep_performance REAL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, date)
);

ALTER TABLE whoop_daily ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "whoop_daily_select" ON whoop_daily;
CREATE POLICY "whoop_daily_select" ON whoop_daily FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "whoop_daily_insert" ON whoop_daily;
CREATE POLICY "whoop_daily_insert" ON whoop_daily FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "whoop_daily_update" ON whoop_daily;
CREATE POLICY "whoop_daily_update" ON whoop_daily FOR UPDATE USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_whoop_daily_user_date ON whoop_daily(user_id, date DESC);

-- ============================================
-- EXPOSURE_MANDATES — patch missing columns from code
-- Already exists (163), but code uses: consequence_fired, evidence, completed_at
-- ============================================
ALTER TABLE exposure_mandates ADD COLUMN IF NOT EXISTS consequence_fired BOOLEAN DEFAULT FALSE;
ALTER TABLE exposure_mandates ADD COLUMN IF NOT EXISTS evidence TEXT;
ALTER TABLE exposure_mandates ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;
