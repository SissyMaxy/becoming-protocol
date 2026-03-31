-- Migration 152: Handler Directives — Command Queue
-- The Handler can issue directives that get executed automatically.

CREATE TABLE IF NOT EXISTS handler_directives (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- What to do
  action TEXT NOT NULL CHECK (action IN (
    'modify_parameter',
    'generate_script',
    'schedule_session',
    'schedule_ambush',
    'advance_skill',
    'advance_service',
    'advance_corruption',
    'write_memory',
    'prescribe_task',
    'modify_schedule',
    'send_device_command',
    'create_narrative_beat',
    'flag_for_review',
    'custom'
  )),

  -- Parameters
  target TEXT,
  value JSONB,
  priority TEXT DEFAULT 'normal' CHECK (priority IN ('immediate', 'normal', 'low', 'deferred')),
  silent BOOLEAN DEFAULT FALSE,

  -- Execution
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'executing', 'completed', 'failed', 'cancelled')),
  result JSONB,
  error_message TEXT,

  -- Source
  conversation_id UUID,
  reasoning TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  executed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_handler_directives_pending
  ON handler_directives(user_id, status, priority, created_at);

CREATE INDEX IF NOT EXISTS idx_handler_directives_user
  ON handler_directives(user_id, created_at DESC);

ALTER TABLE handler_directives ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own directives"
  ON handler_directives FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own directives"
  ON handler_directives FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own directives"
  ON handler_directives FOR UPDATE
  USING (auth.uid() = user_id);
