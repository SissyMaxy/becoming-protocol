-- ============================================
-- Vault Approval Workflow Columns
-- Adds status, handler recommendation, and approval tracking
-- to existing content_vault table (created in 048)
-- ============================================

ALTER TABLE content_vault
  ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected')),
  ADD COLUMN IF NOT EXISTS quality_rating INTEGER
    CHECK (quality_rating BETWEEN 1 AND 5),
  ADD COLUMN IF NOT EXISTS content_category TEXT,
  ADD COLUMN IF NOT EXISTS explicitness_level INTEGER
    CHECK (explicitness_level BETWEEN 1 AND 5),
  ADD COLUMN IF NOT EXISTS handler_recommendation TEXT,
  ADD COLUMN IF NOT EXISTS platform_suitability JSONB,
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS rejected_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS posted_to JSONB;

CREATE INDEX IF NOT EXISTS idx_vault_status
  ON content_vault(user_id, status);

CREATE INDEX IF NOT EXISTS idx_vault_pending
  ON content_vault(user_id, created_at DESC)
  WHERE status = 'pending';
