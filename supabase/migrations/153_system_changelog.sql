-- System changelog — Handler reads this to know about new capabilities

CREATE TABLE IF NOT EXISTS system_changelog (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deploy_id TEXT,
  commit_sha TEXT,
  commit_message TEXT NOT NULL,
  environment TEXT DEFAULT 'production',
  features TEXT[] DEFAULT '{}',
  deployed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_changelog_deployed ON system_changelog(deployed_at DESC);

-- No RLS — this is system-level data readable by all authenticated users
ALTER TABLE system_changelog ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can read changelog" ON system_changelog
  FOR SELECT USING (auth.role() = 'authenticated');
-- Service role inserts via deploy hook
