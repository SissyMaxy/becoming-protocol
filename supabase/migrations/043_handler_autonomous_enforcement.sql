-- Migration 043: Handler Autonomous Enforcement System
-- Transforms the Handler from passive observer to autonomous enforcer.
-- Adds tables for enforcement tracking, daily runs, narrations, and financial consequences.

-- ============================================
-- ENFORCEMENT CONFIGURATION (per user)
-- ============================================
CREATE TABLE IF NOT EXISTS enforcement_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL UNIQUE,
  enabled BOOLEAN DEFAULT false,

  -- Enforcement thresholds
  morning_hour INTEGER DEFAULT 7,           -- Local hour for morning enforcement (EST)
  evening_hour INTEGER DEFAULT 21,          -- Local hour for evening enforcement (EST)
  timezone TEXT DEFAULT 'America/New_York',

  -- Escalation settings
  warning_threshold INTEGER DEFAULT 1,      -- Days of non-compliance before warning
  gate_threshold INTEGER DEFAULT 2,         -- Days before compliance gate
  punishment_threshold INTEGER DEFAULT 3,   -- Days before punishment
  denial_extension_threshold INTEGER DEFAULT 5, -- Days before denial extension
  content_lock_threshold INTEGER DEFAULT 7,     -- Days before content restriction
  compulsory_add_threshold INTEGER DEFAULT 10,  -- Days before new compulsory
  narration_threshold INTEGER DEFAULT 14,       -- Days before handler narration

  -- Financial consequence settings (if enabled)
  financial_consequences_enabled BOOLEAN DEFAULT false,
  financial_target_org TEXT,                -- Anti-charity org name
  financial_amounts JSONB DEFAULT '{"tier1": 50, "tier2": 100, "tier3": 250, "tier4": 500}',
  stripe_customer_id TEXT,

  -- Lovense proactive control
  lovense_proactive_enabled BOOLEAN DEFAULT false,
  lovense_summon_enabled BOOLEAN DEFAULT false,

  -- Narration settings
  narration_enabled BOOLEAN DEFAULT false,
  narration_platform TEXT DEFAULT 'internal', -- internal, reddit, etc.

  -- External integrations
  reddit_enabled BOOLEAN DEFAULT false,
  reddit_subreddit TEXT,
  reddit_access_token TEXT,
  reddit_refresh_token TEXT,
  reddit_token_expires_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- ENFORCEMENT LOG
-- All automated enforcement actions
-- ============================================
CREATE TABLE IF NOT EXISTS enforcement_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,

  enforcement_type TEXT NOT NULL,  -- warning, gate, punishment, denial_extension, content_lock, compulsory_add, narration, financial, lovense_activation
  tier INTEGER NOT NULL DEFAULT 1, -- 1-7 escalation tier

  trigger_reason TEXT NOT NULL,    -- What compliance failure triggered this
  action_taken TEXT NOT NULL,      -- What was actually done
  details JSONB DEFAULT '{}',      -- Extra context (gate ID, punishment ID, amount, etc.)

  -- Response tracking
  user_acknowledged BOOLEAN DEFAULT false,
  acknowledged_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- DAILY ENFORCEMENT RUNS
-- Tracks when enforcement ran and results
-- ============================================
CREATE TABLE IF NOT EXISTS daily_enforcement_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  run_type TEXT NOT NULL,            -- morning, evening
  run_date DATE NOT NULL DEFAULT CURRENT_DATE,

  -- Results
  compliance_score REAL,             -- 0-100 overall compliance
  actions_taken INTEGER DEFAULT 0,
  warnings_issued INTEGER DEFAULT 0,
  gates_created INTEGER DEFAULT 0,
  punishments_applied INTEGER DEFAULT 0,

  -- Context gathered
  context_snapshot JSONB DEFAULT '{}', -- User state at time of run
  ai_assessment TEXT,                  -- Claude's assessment (if generated)

  created_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(user_id, run_type, run_date)
);

-- ============================================
-- HANDLER NARRATIONS
-- AI-generated narrations about user's journey
-- ============================================
CREATE TABLE IF NOT EXISTS handler_narrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,

  narration_type TEXT NOT NULL,      -- progress_report, enforcement_narrative, weekly_summary, milestone, warning
  title TEXT NOT NULL,
  body TEXT NOT NULL,

  -- Source data that informed this narration
  source_data JSONB DEFAULT '{}',

  -- Publishing
  published BOOLEAN DEFAULT false,
  published_at TIMESTAMPTZ,
  platform TEXT,                     -- internal, reddit
  external_post_id TEXT,             -- Reddit post ID, etc.

  -- Engagement
  user_read BOOLEAN DEFAULT false,
  user_read_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- FINANCIAL CONSEQUENCES
-- Tracks financial penalty events
-- ============================================
CREATE TABLE IF NOT EXISTS financial_consequences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,

  trigger_reason TEXT NOT NULL,       -- What caused this
  amount_cents INTEGER NOT NULL,      -- Amount in cents
  currency TEXT DEFAULT 'usd',

  target_org TEXT,                    -- Where the money goes

  -- Payment status
  status TEXT DEFAULT 'pending',      -- pending, processing, completed, failed, cancelled
  stripe_payment_id TEXT,
  processed_at TIMESTAMPTZ,
  error_message TEXT,

  -- Context
  enforcement_tier INTEGER,
  consecutive_days_noncompliant INTEGER,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- LOVENSE PROACTIVE COMMANDS
-- Server-initiated device activations
-- ============================================
CREATE TABLE IF NOT EXISTS lovense_proactive_commands (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,

  command_type TEXT NOT NULL,         -- summon, reward, punishment_buzz, tease, anchor_reinforcement
  trigger_reason TEXT NOT NULL,       -- What prompted this

  -- Command details
  pattern TEXT,                       -- Lovense pattern name
  intensity INTEGER DEFAULT 10,      -- 0-20
  duration_seconds INTEGER DEFAULT 5,

  -- Execution status
  status TEXT DEFAULT 'queued',       -- queued, sent, acknowledged, failed
  sent_at TIMESTAMPTZ,
  acknowledged_at TIMESTAMPTZ,
  error_message TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- NONCOMPLIANCE STREAKS
-- Tracks consecutive days of noncompliance per domain
-- ============================================
CREATE TABLE IF NOT EXISTS noncompliance_streaks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  domain TEXT NOT NULL,               -- 'overall', 'voice', 'movement', 'style', etc.

  consecutive_days INTEGER DEFAULT 0,
  last_compliant_date DATE,
  last_noncompliant_date DATE,
  current_tier INTEGER DEFAULT 0,     -- Current escalation tier for this domain

  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(user_id, domain)
);

-- ============================================
-- QUEUE TABLE FOR ENFORCEMENT TASKS
-- Extends handler_pending_tasks with enforcement types
-- ============================================
-- (handler_pending_tasks already exists from migration 018)
-- We just add new task_type values: 'evaluate_compliance', 'morning_enforcement', 'evening_enforcement', 'generate_narration'

-- ============================================
-- RLS POLICIES
-- ============================================
ALTER TABLE enforcement_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE enforcement_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_enforcement_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE handler_narrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE financial_consequences ENABLE ROW LEVEL SECURITY;
ALTER TABLE lovense_proactive_commands ENABLE ROW LEVEL SECURITY;
ALTER TABLE noncompliance_streaks ENABLE ROW LEVEL SECURITY;

-- User can read their own data (idempotent)
DO $$ BEGIN CREATE POLICY "Users read own enforcement_config" ON enforcement_config FOR SELECT USING (auth.uid() = user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "Users read own enforcement_log" ON enforcement_log FOR SELECT USING (auth.uid() = user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "Users read own enforcement_runs" ON daily_enforcement_runs FOR SELECT USING (auth.uid() = user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "Users read own narrations" ON handler_narrations FOR SELECT USING (auth.uid() = user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "Users read own financial" ON financial_consequences FOR SELECT USING (auth.uid() = user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "Users read own lovense_commands" ON lovense_proactive_commands FOR SELECT USING (auth.uid() = user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "Users read own noncompliance" ON noncompliance_streaks FOR SELECT USING (auth.uid() = user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- User can update their enforcement config (idempotent)
DO $$ BEGIN CREATE POLICY "Users update own enforcement_config" ON enforcement_config FOR UPDATE USING (auth.uid() = user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "Users insert own enforcement_config" ON enforcement_config FOR INSERT WITH CHECK (auth.uid() = user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- User can acknowledge enforcement log entries and mark narrations as read
DO $$ BEGIN CREATE POLICY "Users update own enforcement_log" ON enforcement_log FOR UPDATE USING (auth.uid() = user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "Users update own narrations" ON handler_narrations FOR UPDATE USING (auth.uid() = user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Service role full access on all tables (idempotent)
DO $$ BEGIN CREATE POLICY "Service full access enforcement_config" ON enforcement_config FOR ALL USING (auth.role() = 'service_role'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "Service full access enforcement_log" ON enforcement_log FOR ALL USING (auth.role() = 'service_role'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "Service full access enforcement_runs" ON daily_enforcement_runs FOR ALL USING (auth.role() = 'service_role'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "Service full access narrations" ON handler_narrations FOR ALL USING (auth.role() = 'service_role'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "Service full access financial" ON financial_consequences FOR ALL USING (auth.role() = 'service_role'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "Service full access lovense_commands" ON lovense_proactive_commands FOR ALL USING (auth.role() = 'service_role'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "Service full access noncompliance" ON noncompliance_streaks FOR ALL USING (auth.role() = 'service_role'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================
-- INDEXES
-- ============================================
CREATE INDEX IF NOT EXISTS idx_enforcement_log_user ON enforcement_log(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_enforcement_log_type ON enforcement_log(enforcement_type);
CREATE INDEX IF NOT EXISTS idx_enforcement_runs_user_date ON daily_enforcement_runs(user_id, run_date DESC);
CREATE INDEX IF NOT EXISTS idx_narrations_user ON handler_narrations(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_narrations_unread ON handler_narrations(user_id) WHERE user_read = false;
CREATE INDEX IF NOT EXISTS idx_financial_user ON financial_consequences(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_financial_pending ON financial_consequences(status) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_lovense_commands_queued ON lovense_proactive_commands(user_id, status) WHERE status = 'queued';
CREATE INDEX IF NOT EXISTS idx_noncompliance_user ON noncompliance_streaks(user_id);

-- ============================================
-- HELPER FUNCTIONS
-- ============================================

-- Function to evaluate compliance and determine escalation tier
CREATE OR REPLACE FUNCTION get_noncompliance_tier(
  p_user_id UUID,
  p_domain TEXT DEFAULT 'overall'
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_consecutive_days INTEGER;
  v_config RECORD;
BEGIN
  -- Get streak
  SELECT consecutive_days INTO v_consecutive_days
  FROM noncompliance_streaks
  WHERE user_id = p_user_id AND domain = p_domain;

  IF v_consecutive_days IS NULL THEN
    RETURN 0;
  END IF;

  -- Get config
  SELECT * INTO v_config
  FROM enforcement_config
  WHERE user_id = p_user_id;

  IF v_config IS NULL THEN
    RETURN 0;
  END IF;

  -- Determine tier based on thresholds
  IF v_consecutive_days >= v_config.narration_threshold THEN
    RETURN 7;
  ELSIF v_consecutive_days >= v_config.compulsory_add_threshold THEN
    RETURN 6;
  ELSIF v_consecutive_days >= v_config.content_lock_threshold THEN
    RETURN 5;
  ELSIF v_consecutive_days >= v_config.denial_extension_threshold THEN
    RETURN 4;
  ELSIF v_consecutive_days >= v_config.punishment_threshold THEN
    RETURN 3;
  ELSIF v_consecutive_days >= v_config.gate_threshold THEN
    RETURN 2;
  ELSIF v_consecutive_days >= v_config.warning_threshold THEN
    RETURN 1;
  ELSE
    RETURN 0;
  END IF;
END;
$$;

-- Function to queue enforcement tasks for all active enforcement users
CREATE OR REPLACE FUNCTION trigger_enforcement_run(p_run_type TEXT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  user_record RECORD;
BEGIN
  FOR user_record IN
    SELECT ec.user_id
    FROM enforcement_config ec
    WHERE ec.enabled = true
  LOOP
    INSERT INTO handler_pending_tasks (user_id, task_type, status, payload, created_at)
    VALUES (
      user_record.user_id,
      p_run_type,
      'pending',
      jsonb_build_object('run_type', p_run_type, 'run_date', CURRENT_DATE::TEXT),
      NOW()
    )
    ON CONFLICT (user_id, task_type)
    WHERE status = 'pending'
    DO NOTHING;
  END LOOP;
END;
$$;

-- Function to update noncompliance streak
CREATE OR REPLACE FUNCTION update_noncompliance_streak(
  p_user_id UUID,
  p_domain TEXT,
  p_is_compliant BOOLEAN
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF p_is_compliant THEN
    -- Reset streak
    INSERT INTO noncompliance_streaks (user_id, domain, consecutive_days, last_compliant_date, current_tier, updated_at)
    VALUES (p_user_id, p_domain, 0, CURRENT_DATE, 0, NOW())
    ON CONFLICT (user_id, domain)
    DO UPDATE SET
      consecutive_days = 0,
      last_compliant_date = CURRENT_DATE,
      current_tier = 0,
      updated_at = NOW();
  ELSE
    -- Increment streak
    INSERT INTO noncompliance_streaks (user_id, domain, consecutive_days, last_noncompliant_date, updated_at)
    VALUES (p_user_id, p_domain, 1, CURRENT_DATE, NOW())
    ON CONFLICT (user_id, domain)
    DO UPDATE SET
      consecutive_days = noncompliance_streaks.consecutive_days + 1,
      last_noncompliant_date = CURRENT_DATE,
      current_tier = get_noncompliance_tier(p_user_id, p_domain),
      updated_at = NOW();
  END IF;
END;
$$;
