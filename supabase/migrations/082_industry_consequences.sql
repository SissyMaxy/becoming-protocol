-- Sprint 1: Industry Foundation — Skip Consequences
-- skip_consequences

-- ============================================================
-- skip_consequences: Escalating consequences for skipped shoots
-- ============================================================
CREATE TABLE skip_consequences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,

  shoot_prescription_id UUID REFERENCES shoot_prescriptions NOT NULL,
  skip_date DATE NOT NULL DEFAULT CURRENT_DATE,
  consecutive_skips INTEGER DEFAULT 1,

  -- Handler response
  consequence_type TEXT NOT NULL CHECK (consequence_type IN (
    'easier_tomorrow',
    'audience_poll',
    'handler_public_post',
    'full_accountability'
  )),

  consequence_executed BOOLEAN DEFAULT false,
  consequence_details TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE skip_consequences ENABLE ROW LEVEL SECURITY;
CREATE POLICY skip_consequences_user ON skip_consequences
  FOR ALL USING (auth.uid() = user_id);

CREATE INDEX idx_skip_consequences_date
  ON skip_consequences(user_id, skip_date DESC);
CREATE INDEX idx_skip_consequences_shoot
  ON skip_consequences(user_id, shoot_prescription_id);
