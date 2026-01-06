-- Becoming Protocol Schema v8: Onboarding Inventory Fields
-- Run this in Supabase SQL Editor after v7 schema

-- ============================================
-- ADD INVENTORY COLUMNS TO INVESTMENTS
-- ============================================

-- Add columns for tracking estimate and onboarding sources
ALTER TABLE investments ADD COLUMN IF NOT EXISTS is_estimate BOOLEAN DEFAULT FALSE;
ALTER TABLE investments ADD COLUMN IF NOT EXISTS from_onboarding BOOLEAN DEFAULT FALSE;

-- Make purchase_date nullable for onboarding entries (often unknown)
ALTER TABLE investments ALTER COLUMN purchase_date DROP NOT NULL;

-- ============================================
-- ADD INVENTORY SKIP TRACKING TO USER PROFILES
-- ============================================

-- Add column to track if user skipped inventory during onboarding
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS onboarding_inventory_skipped BOOLEAN DEFAULT FALSE;
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS onboarding_inventory_completed_at TIMESTAMPTZ;

-- ============================================
-- INDEXES
-- ============================================

CREATE INDEX IF NOT EXISTS idx_investments_from_onboarding ON investments(user_id, from_onboarding);
CREATE INDEX IF NOT EXISTS idx_investments_is_estimate ON investments(user_id, is_estimate);

-- ============================================
-- COMMENTS
-- ============================================

COMMENT ON COLUMN investments.is_estimate IS 'True if amount was estimated from a range during onboarding';
COMMENT ON COLUMN investments.from_onboarding IS 'True if entry was created during onboarding inventory step';
COMMENT ON COLUMN user_profiles.onboarding_inventory_skipped IS 'True if user skipped the inventory step during onboarding';
COMMENT ON COLUMN user_profiles.onboarding_inventory_completed_at IS 'When user completed the inventory step';
