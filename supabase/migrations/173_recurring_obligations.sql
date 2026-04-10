-- Recurring Obligations System
-- Persistent obligations the Handler can set that auto-recreate on a schedule.
-- dailyCycle() queries this table and spawns daily_tasks rows from active obligations.

CREATE TABLE IF NOT EXISTS recurring_obligations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  obligation_name TEXT NOT NULL,
  description TEXT,
  domain TEXT NOT NULL,
  frequency TEXT NOT NULL CHECK (frequency IN ('daily', 'weekly', 'twice_daily', 'every_2_days', 'weekdays', 'weekends')),
  deadline_hour INTEGER CHECK (deadline_hour BETWEEN 0 AND 23),
  consequence_on_miss TEXT,
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_fulfilled_at TIMESTAMPTZ,
  total_completions INTEGER DEFAULT 0,
  total_misses INTEGER DEFAULT 0
);

ALTER TABLE recurring_obligations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "recurring_obligations_select" ON recurring_obligations
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "recurring_obligations_insert" ON recurring_obligations
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "recurring_obligations_update" ON recurring_obligations
  FOR UPDATE USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_obligations_user_active ON recurring_obligations(user_id, active);
