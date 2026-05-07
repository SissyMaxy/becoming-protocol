-- Migration 204: Hard Mode + Slip Accumulation + Punishment Queue
-- Idempotent: survives partial prior runs.

-- ============================================================================
-- Hard Mode state — on user_state
-- ============================================================================

ALTER TABLE user_state
  ADD COLUMN IF NOT EXISTS hard_mode_active BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS hard_mode_entered_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS hard_mode_reason TEXT,
  ADD COLUMN IF NOT EXISTS hard_mode_exit_task_id UUID,
  ADD COLUMN IF NOT EXISTS slip_points_current INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS slip_points_rolling_24h INTEGER DEFAULT 0;

-- ============================================================================
-- Slip log
-- ============================================================================

CREATE TABLE IF NOT EXISTS slip_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE
);

ALTER TABLE slip_log
  ADD COLUMN IF NOT EXISTS slip_type TEXT,
  ADD COLUMN IF NOT EXISTS slip_points INTEGER DEFAULT 1,
  ADD COLUMN IF NOT EXISTS source_text TEXT,
  ADD COLUMN IF NOT EXISTS source_table TEXT,
  ADD COLUMN IF NOT EXISTS source_id UUID,
  ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS triggered_hard_mode BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS triggered_punishment_id UUID,
  ADD COLUMN IF NOT EXISTS handler_acknowledged BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS detected_at TIMESTAMPTZ DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'slip_log_type_check') THEN
    ALTER TABLE slip_log ADD CONSTRAINT slip_log_type_check
      CHECK (slip_type IS NULL OR slip_type IN (
        'masculine_self_reference', 'david_name_use', 'task_avoided',
        'directive_refused', 'arousal_gating_refused', 'mantra_missed',
        'confession_missed', 'hrt_dose_missed', 'chastity_unlocked_early',
        'immersion_session_broken', 'disclosure_deadline_missed',
        'voice_masculine_pitch', 'resistance_statement', 'handler_ignored', 'other'
      ));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'slip_log_points_check') THEN
    ALTER TABLE slip_log ADD CONSTRAINT slip_log_points_check
      CHECK (slip_points BETWEEN 1 AND 10);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_slip_log_user_recent ON slip_log(user_id, detected_at DESC);
CREATE INDEX IF NOT EXISTS idx_slip_log_user_type ON slip_log(user_id, slip_type);
CREATE INDEX IF NOT EXISTS idx_slip_log_unacknowledged ON slip_log(user_id, handler_acknowledged) WHERE handler_acknowledged = FALSE;

ALTER TABLE slip_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users own slips" ON slip_log;
CREATE POLICY "Users own slips" ON slip_log FOR ALL USING (auth.uid() = user_id);

-- ============================================================================
-- Punishment queue
-- ============================================================================

CREATE TABLE IF NOT EXISTS punishment_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE
);

ALTER TABLE punishment_queue
  ADD COLUMN IF NOT EXISTS punishment_type TEXT,
  ADD COLUMN IF NOT EXISTS severity INTEGER DEFAULT 1,
  ADD COLUMN IF NOT EXISTS title TEXT,
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS parameters JSONB DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'queued',
  ADD COLUMN IF NOT EXISTS due_by TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS dodge_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS completion_evidence JSONB,
  ADD COLUMN IF NOT EXISTS triggered_by_slip_ids UUID[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS triggered_by_hard_mode BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'punishment_queue_type_check') THEN
    ALTER TABLE punishment_queue ADD CONSTRAINT punishment_queue_type_check
      CHECK (punishment_type IS NULL OR punishment_type IN (
        'denial_extension', 'humiliation_task', 'public_post',
        'gina_confession', 'public_shame_log', 'mantra_recitation',
        'writing_lines', 'confession_extended', 'edge_session_no_release',
        'kneel_ritual', 'other'
      ));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'punishment_queue_severity_check') THEN
    ALTER TABLE punishment_queue ADD CONSTRAINT punishment_queue_severity_check
      CHECK (severity BETWEEN 1 AND 5);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'punishment_queue_status_check') THEN
    ALTER TABLE punishment_queue ADD CONSTRAINT punishment_queue_status_check
      CHECK (status IN ('queued', 'active', 'completed', 'dodged', 'escalated'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_punishment_queue_user_status ON punishment_queue(user_id, status);
CREATE INDEX IF NOT EXISTS idx_punishment_queue_due ON punishment_queue(user_id, due_by) WHERE status = 'queued';

ALTER TABLE punishment_queue ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users own punishments" ON punishment_queue;
CREATE POLICY "Users own punishments" ON punishment_queue FOR ALL USING (auth.uid() = user_id);

-- ============================================================================
-- Hard Mode transition log
-- ============================================================================

CREATE TABLE IF NOT EXISTS hard_mode_transitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE
);

ALTER TABLE hard_mode_transitions
  ADD COLUMN IF NOT EXISTS transition TEXT,
  ADD COLUMN IF NOT EXISTS reason TEXT,
  ADD COLUMN IF NOT EXISTS slip_points_at_transition INTEGER,
  ADD COLUMN IF NOT EXISTS triggering_slip_ids UUID[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS exit_task_completed_id UUID,
  ADD COLUMN IF NOT EXISTS transitioned_at TIMESTAMPTZ DEFAULT NOW();

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'hard_mode_transitions_transition_check') THEN
    ALTER TABLE hard_mode_transitions ADD CONSTRAINT hard_mode_transitions_transition_check
      CHECK (transition IS NULL OR transition IN ('entered', 'exited', 'distress_override'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_hmt_user_recent ON hard_mode_transitions(user_id, transitioned_at DESC);
ALTER TABLE hard_mode_transitions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users own transitions" ON hard_mode_transitions;
CREATE POLICY "Users own transitions" ON hard_mode_transitions FOR ALL USING (auth.uid() = user_id);

NOTIFY pgrst, 'reload schema';
