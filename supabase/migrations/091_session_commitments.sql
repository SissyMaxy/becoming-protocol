-- Migration 091: Session Commitments
-- Auction commitments made during edge sessions

CREATE TABLE IF NOT EXISTS session_commitments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) NOT NULL,
  session_id UUID REFERENCES edge_sessions(id),
  commitment_type TEXT NOT NULL,       -- edges | denial | lock | content | task
  commitment_value TEXT NOT NULL,      -- e.g. "+3 edges", "+1 day denial"
  label TEXT NOT NULL,                 -- display label
  description TEXT,                    -- full description shown in modal
  edge_number INTEGER,                 -- edge at which auction triggered
  arousal_level INTEGER,               -- arousal at time of commitment
  denial_day INTEGER,                  -- denial day at time of commitment
  fulfilled BOOLEAN DEFAULT FALSE,
  fulfilled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_session_commitments_user ON session_commitments(user_id);
CREATE INDEX IF NOT EXISTS idx_session_commitments_session ON session_commitments(session_id);
CREATE INDEX IF NOT EXISTS idx_session_commitments_unfulfilled ON session_commitments(user_id, fulfilled) WHERE fulfilled = FALSE;

ALTER TABLE session_commitments ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'session_commitments' AND policyname = 'Users manage own session commitments'
  ) THEN
    CREATE POLICY "Users manage own session commitments" ON session_commitments
      FOR ALL USING (auth.uid() = user_id);
  END IF;
END $$;
