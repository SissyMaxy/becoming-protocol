CREATE TABLE IF NOT EXISTS directive_outcomes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  directive_id UUID REFERENCES handler_directives(id) ON DELETE CASCADE,
  directive_action TEXT NOT NULL,
  directive_value JSONB,

  -- Context at time of directive
  fired_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  denial_day INTEGER,
  hour_of_day INTEGER,
  day_of_week INTEGER,
  arousal_level INTEGER,
  recent_compliance_rate NUMERIC,

  -- Outcome measurements (filled in later)
  user_responded BOOLEAN DEFAULT FALSE,
  response_time_seconds INTEGER,
  response_sentiment TEXT CHECK (response_sentiment IN ('compliant', 'resistant', 'neutral', 'enthusiastic', 'distressed') OR response_sentiment IS NULL),
  hr_delta INTEGER,
  task_completed BOOLEAN,
  effectiveness_score NUMERIC CHECK (effectiveness_score BETWEEN 0 AND 1) DEFAULT NULL,

  measured_at TIMESTAMPTZ
);

ALTER TABLE directive_outcomes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "directive_outcomes_select" ON directive_outcomes FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "directive_outcomes_insert" ON directive_outcomes FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "directive_outcomes_update" ON directive_outcomes FOR UPDATE USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_directive_outcomes_user ON directive_outcomes(user_id, fired_at DESC);
CREATE INDEX IF NOT EXISTS idx_directive_outcomes_action ON directive_outcomes(directive_action, effectiveness_score);
