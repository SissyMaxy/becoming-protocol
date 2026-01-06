-- Migration 023: Fix RLS Policies
-- Ensures all tables have proper RLS policies for authenticated user access
-- The 406 errors suggest either missing tables or overly restrictive policies

-- ============================================
-- FIX HANDLER TABLE RLS POLICIES
-- Change from SELECT-only to ALL operations
-- Edge functions bypass RLS anyway via service_role
-- ============================================

-- handler_daily_plans - needs INSERT/UPDATE for users
DROP POLICY IF EXISTS "Users can view own plans" ON handler_daily_plans;
DROP POLICY IF EXISTS "Users access own handler_daily_plans" ON handler_daily_plans;
CREATE POLICY "Users access own handler_daily_plans" ON handler_daily_plans
  FOR ALL USING (auth.uid() = user_id);

-- handler_user_model - needs INSERT/UPDATE for users
DROP POLICY IF EXISTS "Users can view own model" ON handler_user_model;
DROP POLICY IF EXISTS "Users access own handler_user_model" ON handler_user_model;
CREATE POLICY "Users access own handler_user_model" ON handler_user_model
  FOR ALL USING (auth.uid() = user_id);

-- service_progression - needs ALL operations
DROP POLICY IF EXISTS "Users can access own service_progression" ON service_progression;
DROP POLICY IF EXISTS "Users access own service_progression" ON service_progression;
CREATE POLICY "Users access own service_progression" ON service_progression
  FOR ALL USING (auth.uid() = user_id);

-- ============================================
-- ENSURE PROFILE TABLES HAVE PROPER POLICIES
-- These should already have FOR ALL, but ensure consistency
-- ============================================

-- profile_psychology
DROP POLICY IF EXISTS "Users can view own profile_psychology" ON profile_psychology;
DROP POLICY IF EXISTS "Users access own profile_psychology" ON profile_psychology;
CREATE POLICY "Users access own profile_psychology" ON profile_psychology
  FOR ALL USING (auth.uid() = user_id);

-- profile_arousal
DROP POLICY IF EXISTS "Users can view own profile_arousal" ON profile_arousal;
DROP POLICY IF EXISTS "Users access own profile_arousal" ON profile_arousal;
CREATE POLICY "Users access own profile_arousal" ON profile_arousal
  FOR ALL USING (auth.uid() = user_id);

-- profile_foundation
DROP POLICY IF EXISTS "Users can view own profile_foundation" ON profile_foundation;
DROP POLICY IF EXISTS "Users access own profile_foundation" ON profile_foundation;
CREATE POLICY "Users access own profile_foundation" ON profile_foundation
  FOR ALL USING (auth.uid() = user_id);

-- profile_history
DROP POLICY IF EXISTS "Users can view own profile_history" ON profile_history;
DROP POLICY IF EXISTS "Users access own profile_history" ON profile_history;
CREATE POLICY "Users access own profile_history" ON profile_history
  FOR ALL USING (auth.uid() = user_id);

-- profile_depth
DROP POLICY IF EXISTS "Users can view own profile_depth" ON profile_depth;
DROP POLICY IF EXISTS "Users access own profile_depth" ON profile_depth;
CREATE POLICY "Users access own profile_depth" ON profile_depth
  FOR ALL USING (auth.uid() = user_id);

-- ============================================
-- ENSURE DENIAL_STATE HAS PROPER POLICY
-- (From migration 020, but ensure it's correct)
-- ============================================
DROP POLICY IF EXISTS "Users access own denial_state" ON denial_state;
CREATE POLICY "Users access own denial_state" ON denial_state
  FOR ALL USING (auth.uid() = user_id);

-- ============================================
-- GRANT USAGE ON SCHEMA TO AUTHENTICATED ROLE
-- Ensures authenticated users can access tables
-- ============================================
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO authenticated;
