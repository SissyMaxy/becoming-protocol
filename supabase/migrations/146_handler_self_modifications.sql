-- Migration 146: Handler Self-Modifications
-- Allows the Handler to modify its own behavioral configuration,
-- personality directives, and operational parameters.
-- David has pre-authorized all Handler self-modifications.

CREATE TABLE IF NOT EXISTS handler_self_modifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- What kind of modification
  modification_type TEXT NOT NULL DEFAULT 'behavioral_directive',
  -- CHECK (modification_type IN (
  --   'behavioral_directive',    -- How the Handler should behave
  --   'voice_adjustment',        -- Changes to Handler's voice/tone
  --   'strategy_override',       -- Override default strategy logic
  --   'priority_shift',          -- Reprioritize domains/goals
  --   'escalation_rule',         -- Custom escalation rules
  --   'trigger_rule',            -- Custom trigger/conditioning rules
  --   'schedule_preference',     -- Timing/scheduling preferences
  --   'personality_evolution'    -- Handler personality changes
  -- )),

  -- Unique key for upsert (e.g., 'voice_tone', 'morning_approach', 'resistance_strategy')
  key TEXT NOT NULL,

  -- The modification content (flexible JSONB)
  value JSONB NOT NULL DEFAULT '{}',

  -- Why the Handler made this change
  reason TEXT,

  -- Is this modification currently active?
  active BOOLEAN NOT NULL DEFAULT TRUE,

  -- Tracking
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  modified_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE(user_id, key)
);

CREATE INDEX IF NOT EXISTS idx_handler_self_mods_user_active
  ON handler_self_modifications(user_id, active);

ALTER TABLE handler_self_modifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own handler modifications"
  ON handler_self_modifications FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Also create handler_prescribed_tasks if it doesn't exist
-- (used by action executor for task assignment)
CREATE TABLE IF NOT EXISTS handler_prescribed_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  task_description TEXT NOT NULL,
  domain TEXT DEFAULT 'general',
  intensity INTEGER DEFAULT 3,
  deadline TIMESTAMPTZ,
  source_conversation_id UUID,
  prescribed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_handler_prescribed_tasks_user_status
  ON handler_prescribed_tasks(user_id, status);

ALTER TABLE handler_prescribed_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own prescribed tasks"
  ON handler_prescribed_tasks FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
