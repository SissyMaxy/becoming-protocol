-- Migration 156: P11.1-P11.3 — Proactive Handler, Conversation Agenda, Predictive Interventions
-- Tables: handler_outreach_queue, handler_conversation_agenda, predictive_interventions, handler_protocols

-- ============================================
-- 1. handler_outreach_queue
-- ============================================
CREATE TABLE IF NOT EXISTS handler_outreach_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Message content
  message TEXT NOT NULL,
  urgency TEXT DEFAULT 'normal' CHECK (urgency IN ('low', 'normal', 'high', 'critical')),
  trigger_reason TEXT,

  -- Scheduling
  scheduled_for TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ,

  -- Delivery
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'delivered', 'expired', 'cancelled')),
  delivered_at TIMESTAMPTZ,

  -- Source
  source TEXT DEFAULT 'system',

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_outreach_queue ON handler_outreach_queue(user_id, status, scheduled_for);
ALTER TABLE handler_outreach_queue ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'handler_outreach_queue' AND policyname = 'Users own their data'
  ) THEN
    CREATE POLICY "Users own their data" ON handler_outreach_queue FOR ALL USING (auth.uid() = user_id);
  END IF;
END $$;

-- ============================================
-- 2. handler_conversation_agenda
-- ============================================
CREATE TABLE IF NOT EXISTS handler_conversation_agenda (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Agenda
  primary_objective TEXT NOT NULL,
  secondary_objectives TEXT[],
  approach TEXT,
  talking_points TEXT[],

  -- Context
  based_on JSONB,

  -- Status
  active BOOLEAN DEFAULT TRUE,
  outcome TEXT,
  completed_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Partial unique index: only one active agenda per user
CREATE UNIQUE INDEX IF NOT EXISTS idx_agenda_active_unique ON handler_conversation_agenda(user_id) WHERE active = TRUE;
CREATE INDEX IF NOT EXISTS idx_agenda_active ON handler_conversation_agenda(user_id) WHERE active = TRUE;
ALTER TABLE handler_conversation_agenda ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'handler_conversation_agenda' AND policyname = 'Users own their data'
  ) THEN
    CREATE POLICY "Users own their data" ON handler_conversation_agenda FOR ALL USING (auth.uid() = user_id);
  END IF;
END $$;

-- ============================================
-- 3. predictive_interventions
-- ============================================
CREATE TABLE IF NOT EXISTS predictive_interventions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  prediction_type TEXT NOT NULL,
  probability FLOAT NOT NULL,
  confidence FLOAT,

  -- What triggered the prediction
  factors JSONB NOT NULL,

  -- Recommended intervention
  recommended_action TEXT,
  recommended_timing TEXT,

  -- Outcome tracking
  intervention_taken BOOLEAN DEFAULT FALSE,
  actual_outcome TEXT,
  prediction_accurate BOOLEAN,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_predictions ON predictive_interventions(user_id, created_at DESC);
ALTER TABLE predictive_interventions ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'predictive_interventions' AND policyname = 'Users own their data'
  ) THEN
    CREATE POLICY "Users own their data" ON predictive_interventions FOR ALL USING (auth.uid() = user_id);
  END IF;
END $$;

-- ============================================
-- 4. handler_protocols
-- ============================================
CREATE TABLE IF NOT EXISTS handler_protocols (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  protocol_name TEXT NOT NULL,
  protocol_type TEXT NOT NULL CHECK (protocol_type IN (
    'trust_building', 'escalation', 'recovery', 'breakthrough',
    'commitment_sequence', 'social_exposure', 'encounter_prep',
    'custom'
  )),

  steps JSONB NOT NULL,
  current_step INTEGER DEFAULT 1,
  total_steps INTEGER NOT NULL,

  -- State
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'paused', 'completed', 'abandoned')),
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  step_entered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,

  -- Tracking
  step_history JSONB DEFAULT '[]',
  notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_protocols ON handler_protocols(user_id, status);
ALTER TABLE handler_protocols ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'handler_protocols' AND policyname = 'Users own their data'
  ) THEN
    CREATE POLICY "Users own their data" ON handler_protocols FOR ALL USING (auth.uid() = user_id);
  END IF;
END $$;
