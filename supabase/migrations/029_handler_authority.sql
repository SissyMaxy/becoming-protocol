-- Handler Authority System
-- Removes choice. Handler decides. You comply.

-- Authority level tracking
CREATE TABLE IF NOT EXISTS handler_authority (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  level INTEGER NOT NULL DEFAULT 1 CHECK (level >= 1 AND level <= 5),
  increased_at TIMESTAMPTZ,
  increase_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Automatic decisions log (what Handler decided without asking)
CREATE TABLE IF NOT EXISTS automatic_decisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  description TEXT NOT NULL,
  was_notified BOOLEAN DEFAULT FALSE,
  can_revert BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Assigned tasks (not suggestions - assignments)
CREATE TABLE IF NOT EXISTS assigned_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  task TEXT NOT NULL,
  domain TEXT NOT NULL,
  deadline TIMESTAMPTZ,
  is_required BOOLEAN DEFAULT TRUE,
  consequence TEXT,
  assigned_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  skipped_at TIMESTAMPTZ
);

-- Scheduled sessions (Handler sets your schedule)
CREATE TABLE IF NOT EXISTS scheduled_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_type TEXT NOT NULL,
  scheduled_for TIMESTAMPTZ NOT NULL,
  duration INTEGER NOT NULL, -- minutes
  is_required BOOLEAN DEFAULT TRUE,
  parameters JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  missed BOOLEAN DEFAULT FALSE
);

-- Required interventions (cannot be dismissed)
CREATE TABLE IF NOT EXISTS required_interventions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  intervention_type TEXT NOT NULL,
  content TEXT NOT NULL,
  required_action TEXT NOT NULL, -- 'complete', 'acknowledge', 'respond'
  minimum_engagement INTEGER, -- seconds required
  created_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

-- Automatic commitments (captured during arousal, binding)
CREATE TABLE IF NOT EXISTS automatic_commitments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  statement TEXT NOT NULL,
  arousal_at_capture INTEGER NOT NULL,
  context TEXT,
  captured_at TIMESTAMPTZ DEFAULT NOW(),
  is_binding BOOLEAN DEFAULT TRUE,
  acknowledged_at TIMESTAMPTZ
);

-- Add handler_decided column to daily_arousal_plans
ALTER TABLE daily_arousal_plans
ADD COLUMN IF NOT EXISTS handler_decided BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS intensity_reason TEXT;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_assigned_tasks_user_pending
  ON assigned_tasks(user_id)
  WHERE completed_at IS NULL AND skipped_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_scheduled_sessions_user_upcoming
  ON scheduled_sessions(user_id, scheduled_for)
  WHERE completed_at IS NULL AND missed = FALSE;

CREATE INDEX IF NOT EXISTS idx_required_interventions_user_pending
  ON required_interventions(user_id)
  WHERE completed_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_automatic_decisions_user_recent
  ON automatic_decisions(user_id, created_at DESC);

-- RLS Policies
ALTER TABLE handler_authority ENABLE ROW LEVEL SECURITY;
ALTER TABLE automatic_decisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE assigned_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE scheduled_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE required_interventions ENABLE ROW LEVEL SECURITY;
ALTER TABLE automatic_commitments ENABLE ROW LEVEL SECURITY;

-- Users can read their own data
CREATE POLICY "Users can view own authority" ON handler_authority
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can view own decisions" ON automatic_decisions
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can view own tasks" ON assigned_tasks
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can update own tasks" ON assigned_tasks
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can view own sessions" ON scheduled_sessions
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can update own sessions" ON scheduled_sessions
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can view own interventions" ON required_interventions
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can update own interventions" ON required_interventions
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can view own commitments" ON automatic_commitments
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can update own commitments" ON automatic_commitments
  FOR UPDATE USING (auth.uid() = user_id);

-- Service role can do everything (for Handler AI)
CREATE POLICY "Service can manage authority" ON handler_authority
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Service can manage decisions" ON automatic_decisions
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Service can manage tasks" ON assigned_tasks
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Service can manage sessions" ON scheduled_sessions
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Service can manage interventions" ON required_interventions
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Service can manage commitments" ON automatic_commitments
  FOR ALL USING (true) WITH CHECK (true);
