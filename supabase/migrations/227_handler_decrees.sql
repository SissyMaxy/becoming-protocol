CREATE TABLE IF NOT EXISTS handler_decrees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  decree_type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  evidence_required TEXT NOT NULL DEFAULT 'photo'
    CHECK (evidence_required IN ('photo', 'receipt', 'screenshot', 'voice_note', 'witness_quote', 'admission_text', 'measurement', 'none')),
  evidence_payload JSONB,
  due_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'completed', 'missed', 'extended', 'refused', 'voided')),
  completed_at TIMESTAMPTZ,
  miss_consequence JSONB NOT NULL DEFAULT '{}'::jsonb,
  consequence_applied_at TIMESTAMPTZ,
  source_context JSONB NOT NULL DEFAULT '{}'::jsonb,
  parent_decree_id UUID REFERENCES handler_decrees(id) ON DELETE SET NULL,
  issued_by TEXT NOT NULL DEFAULT 'handler_auto',
  irreversibility_band INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_handler_decrees_user_open
  ON handler_decrees (user_id, due_at ASC) WHERE status = 'open';
CREATE INDEX IF NOT EXISTS idx_handler_decrees_user_recent
  ON handler_decrees (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS handler_compliance (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  total_issued INTEGER NOT NULL DEFAULT 0,
  total_completed INTEGER NOT NULL DEFAULT 0,
  total_missed INTEGER NOT NULL DEFAULT 0,
  total_on_time INTEGER NOT NULL DEFAULT 0,
  total_late INTEGER NOT NULL DEFAULT 0,
  current_streak_days INTEGER NOT NULL DEFAULT 0,
  longest_streak_days INTEGER NOT NULL DEFAULT 0,
  last_completion_at TIMESTAMPTZ,
  last_miss_at TIMESTAMPTZ,
  compliance_band TEXT NOT NULL DEFAULT 'unset'
    CHECK (compliance_band IN ('high', 'medium', 'low', 'critical', 'unset')),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE handler_decrees ENABLE ROW LEVEL SECURITY;
ALTER TABLE handler_compliance ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users own decrees" ON handler_decrees
  FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users own compliance" ON handler_compliance
  FOR ALL USING (auth.uid() = user_id);
