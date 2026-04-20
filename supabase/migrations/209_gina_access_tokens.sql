-- Migration 209: Gina access tokens (idempotent)

CREATE TABLE IF NOT EXISTS gina_access_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE
);

ALTER TABLE gina_access_tokens
  ADD COLUMN IF NOT EXISTS token TEXT,
  ADD COLUMN IF NOT EXISTS capability TEXT,
  ADD COLUMN IF NOT EXISTS issued_at TIMESTAMPTZ DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS revoked_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_used_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS use_count INTEGER DEFAULT 0;

CREATE UNIQUE INDEX IF NOT EXISTS idx_gina_tokens_token ON gina_access_tokens(token) WHERE token IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_gina_tokens_user ON gina_access_tokens(user_id, capability);

ALTER TABLE gina_access_tokens ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users see own tokens" ON gina_access_tokens;
CREATE POLICY "Users see own tokens" ON gina_access_tokens FOR ALL USING (auth.uid() = user_id);

NOTIFY pgrst, 'reload schema';
