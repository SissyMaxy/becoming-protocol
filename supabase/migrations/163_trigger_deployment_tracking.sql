-- Migration 163: Trigger Deployment Tracking + Missing Tables
-- Adds adaptive trigger tracking, fixes missing arousal_pulses/exposure_mandates/handler_directives columns

-- ══════════════════════════════════════════════════════════════
-- 1. trigger_deployments — per-deployment history with context + biometrics
-- ══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS trigger_deployments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  trigger_id UUID REFERENCES conditioned_triggers(id) ON DELETE SET NULL,
  trigger_phrase TEXT NOT NULL,

  deployment_context TEXT NOT NULL CHECK (deployment_context IN (
    'conversation', 'ambush', 'session', 'morning_briefing',
    'evening_debrief', 'sleep_conditioning', 'micro_pulse', 'proactive_outreach'
  )),

  -- Biometric capture
  hr_at_deployment INTEGER,
  hr_after_30s INTEGER,

  -- Response tracking
  response_detected BOOLEAN DEFAULT FALSE,
  response_type TEXT CHECK (response_type IN ('behavioral', 'biometric', 'none')),
  effectiveness_score SMALLINT CHECK (effectiveness_score BETWEEN 1 AND 10),

  -- Linking
  message_id UUID,

  deployed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_trigger_deployments_user
  ON trigger_deployments(user_id, deployed_at DESC);
CREATE INDEX IF NOT EXISTS idx_trigger_deployments_trigger
  ON trigger_deployments(trigger_id, deployed_at DESC);
CREATE INDEX IF NOT EXISTS idx_trigger_deployments_context
  ON trigger_deployments(user_id, deployment_context);

ALTER TABLE trigger_deployments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users own trigger deployments" ON trigger_deployments;
CREATE POLICY "Users own trigger deployments" ON trigger_deployments
  FOR ALL USING (auth.uid() = user_id);

-- ══════════════════════════════════════════════════════════════
-- 2. ALTER conditioned_triggers — add missing + optimization columns
-- ══════════════════════════════════════════════════════════════

ALTER TABLE conditioned_triggers
  ADD COLUMN IF NOT EXISTS times_deployed INTEGER DEFAULT 0;
ALTER TABLE conditioned_triggers
  ADD COLUMN IF NOT EXISTS last_deployed_at TIMESTAMPTZ;
ALTER TABLE conditioned_triggers
  ADD COLUMN IF NOT EXISTS optimal_interval_hours NUMERIC(6,2);
ALTER TABLE conditioned_triggers
  ADD COLUMN IF NOT EXISTS habituation_risk NUMERIC(3,2) DEFAULT 0;
ALTER TABLE conditioned_triggers
  ADD COLUMN IF NOT EXISTS installation_started_at TIMESTAMPTZ;

-- ══════════════════════════════════════════════════════════════
-- 3. arousal_pulses — fixes 404 (referenced in arousal-maintenance.ts)
-- ══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS arousal_pulses (
  id TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  pulse_date DATE NOT NULL,
  pulse_type TEXT NOT NULL,
  content TEXT,
  intensity INTEGER,
  scheduled_for TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}',
  fired BOOLEAN DEFAULT FALSE,
  fired_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_arousal_pulses_user
  ON arousal_pulses(user_id, pulse_date, fired);

ALTER TABLE arousal_pulses ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users own arousal pulses" ON arousal_pulses;
CREATE POLICY "Users own arousal pulses" ON arousal_pulses
  FOR ALL USING (auth.uid() = user_id);

-- ══════════════════════════════════════════════════════════════
-- 4. exposure_mandates — fixes 404 (referenced in progressive-exposure.ts)
-- ══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS exposure_mandates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  level INTEGER NOT NULL,
  task TEXT NOT NULL,
  verification TEXT NOT NULL,
  frequency TEXT NOT NULL,
  due_date DATE,
  completed BOOLEAN DEFAULT FALSE,
  completed_at TIMESTAMPTZ,
  evidence TEXT,
  consequence_fired BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_exposure_mandates_user
  ON exposure_mandates(user_id, completed, level);

ALTER TABLE exposure_mandates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users own exposure mandates" ON exposure_mandates;
CREATE POLICY "Users own exposure mandates" ON exposure_mandates
  FOR ALL USING (auth.uid() = user_id);

-- ══════════════════════════════════════════════════════════════
-- 5. ALTER handler_directives — add directive_type + payload (fixes 400s)
-- ══════════════════════════════════════════════════════════════

ALTER TABLE handler_directives
  ADD COLUMN IF NOT EXISTS directive_type TEXT;
ALTER TABLE handler_directives
  ADD COLUMN IF NOT EXISTS payload JSONB;

CREATE INDEX IF NOT EXISTS idx_handler_directives_type
  ON handler_directives(user_id, directive_type, status);
