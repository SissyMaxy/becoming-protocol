CREATE TABLE IF NOT EXISTS commitment_floors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  domain TEXT NOT NULL,
  metric_name TEXT NOT NULL,
  current_floor NUMERIC NOT NULL DEFAULT 0,
  established_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  established_evidence TEXT,
  total_lifts INTEGER NOT NULL DEFAULT 0,
  UNIQUE(user_id, domain, metric_name)
);

ALTER TABLE commitment_floors ENABLE ROW LEVEL SECURITY;
CREATE POLICY "commitment_floors_select" ON commitment_floors FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "commitment_floors_insert" ON commitment_floors FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "commitment_floors_update" ON commitment_floors FOR UPDATE USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_floors_user ON commitment_floors(user_id, domain);
