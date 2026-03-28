-- Migration 144: Session biometrics table for WHOOP integration
-- Stores per-session strain, heart rate, and energy data

CREATE TABLE IF NOT EXISTS session_biometrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id UUID NOT NULL,
  strain_current NUMERIC,
  strain_delta NUMERIC,
  session_strain_baseline NUMERIC,
  avg_heart_rate INTEGER,
  max_heart_rate INTEGER,
  kilojoules NUMERIC,
  raw_response JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_session_biometrics_session ON session_biometrics(session_id, created_at);
CREATE INDEX IF NOT EXISTS idx_session_biometrics_user ON session_biometrics(user_id, created_at DESC);

ALTER TABLE session_biometrics ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'session_biometrics' AND policyname = 'Users own session_biometrics') THEN
    CREATE POLICY "Users own session_biometrics" ON session_biometrics FOR ALL USING (auth.uid() = user_id);
  END IF;
END $$;
