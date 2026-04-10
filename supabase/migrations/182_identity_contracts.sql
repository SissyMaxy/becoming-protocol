CREATE TABLE IF NOT EXISTS identity_contracts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  contract_title TEXT NOT NULL,
  contract_text TEXT NOT NULL,
  commitment_duration_days INTEGER NOT NULL,
  signed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  signature_text TEXT NOT NULL,
  signature_typed_phrase TEXT,
  conditions TEXT[],
  consequences_on_break TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'fulfilled', 'broken', 'expired')),
  broken_at TIMESTAMPTZ,
  broken_reason TEXT,
  fulfilled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE identity_contracts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "identity_contracts_select" ON identity_contracts FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "identity_contracts_insert" ON identity_contracts FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "identity_contracts_update" ON identity_contracts FOR UPDATE USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_contracts_user_status ON identity_contracts(user_id, status);
