CREATE TABLE IF NOT EXISTS handler_daily_agenda (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  agenda_date DATE NOT NULL,
  primary_goal TEXT NOT NULL,
  secondary_goals TEXT[],
  tactics TEXT[],
  opening_move TEXT,
  closing_assignment TEXT,
  goal_achieved BOOLEAN DEFAULT NULL,
  reflection TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, agenda_date)
);

ALTER TABLE handler_daily_agenda ENABLE ROW LEVEL SECURITY;
CREATE POLICY "agenda_select" ON handler_daily_agenda FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "agenda_insert" ON handler_daily_agenda FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "agenda_update" ON handler_daily_agenda FOR UPDATE USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_daily_agenda ON handler_daily_agenda(user_id, agenda_date DESC);
