-- Sprint 1: Industry Foundation — Fan Memory Extension
-- Extends existing fan_profiles table (created in 067_content_pipeline.sql)

-- ============================================================
-- fan_profiles: Add memory + relationship columns
-- ============================================================
ALTER TABLE fan_profiles
  ADD COLUMN IF NOT EXISTS fan_preferences JSONB DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS trigger_content TEXT,
  ADD COLUMN IF NOT EXISTS communication_style TEXT,
  ADD COLUMN IF NOT EXISTS personal_details_shared JSONB DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS engagement_pattern TEXT,
  ADD COLUMN IF NOT EXISTS whale_status BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS handler_relationship_notes TEXT;

-- Index for whale identification
CREATE INDEX IF NOT EXISTS idx_fan_profiles_whale
  ON fan_profiles(user_id, whale_status) WHERE whale_status = true;
