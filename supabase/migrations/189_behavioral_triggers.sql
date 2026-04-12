-- Behavioral conditioning triggers: Pavlovian keyword→response associations
CREATE TABLE IF NOT EXISTS behavioral_triggers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  trigger_phrase TEXT NOT NULL,
  trigger_type TEXT NOT NULL CHECK (trigger_type IN ('keyword', 'time_of_day', 'app_open', 'message_count', 'resistance_detected', 'compliance_achieved')),
  response_type TEXT NOT NULL CHECK (response_type IN ('device_reward', 'device_punishment', 'mantra', 'affirmation', 'conditioning_start')),
  response_value JSONB NOT NULL,
  active BOOLEAN DEFAULT TRUE,
  times_fired INTEGER DEFAULT 0,
  last_fired_at TIMESTAMPTZ,
  created_by TEXT DEFAULT 'handler',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE behavioral_triggers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "behavioral_triggers_select" ON behavioral_triggers FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "behavioral_triggers_insert" ON behavioral_triggers FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "behavioral_triggers_update" ON behavioral_triggers FOR UPDATE USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_behavioral_triggers_user ON behavioral_triggers(user_id, active, trigger_type);
