-- Migration 063: Language Tracking
-- Tracks masculine/feminine self-reference patterns per day.
-- Used by identity_language corruption level for Handler context.

CREATE TABLE language_tracking (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  masculine_count INTEGER DEFAULT 0,
  feminine_count INTEGER DEFAULT 0,
  self_corrections INTEGER DEFAULT 0,
  handler_corrections INTEGER DEFAULT 0,
  feminine_ratio NUMERIC,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, date)
);

ALTER TABLE language_tracking ENABLE ROW LEVEL SECURITY;

CREATE POLICY language_tracking_user ON language_tracking
  FOR ALL USING (auth.uid() = user_id);

CREATE INDEX idx_language_tracking_user_date ON language_tracking(user_id, date);
