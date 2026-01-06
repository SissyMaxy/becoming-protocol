-- Migration 024: Auto-Initialize User Tables
-- Creates trigger to auto-initialize all required user profile/handler rows
-- This fixes 406 errors from .single() calls when rows don't exist

-- ============================================
-- FUNCTION: Initialize all user data tables
-- Called on new user signup to create required rows
-- ============================================
CREATE OR REPLACE FUNCTION initialize_user_data()
RETURNS TRIGGER AS $$
BEGIN
  -- Profile tables (Layer 1-5)
  INSERT INTO profile_foundation (user_id, chosen_name, pronouns, partner_awareness_level)
  VALUES (NEW.id, '', 'she/her', 0)
  ON CONFLICT (user_id) DO NOTHING;

  INSERT INTO profile_history (user_id)
  VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;

  INSERT INTO profile_arousal (user_id)
  VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;

  INSERT INTO profile_psychology (user_id)
  VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;

  INSERT INTO profile_depth (user_id)
  VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;

  -- Intake progress
  INSERT INTO intake_progress (user_id, layer_completed, questions_answered, disclosure_score)
  VALUES (NEW.id, 0, 0, 0)
  ON CONFLICT (user_id) DO NOTHING;

  -- Handler user model (correct columns from migration 003)
  INSERT INTO handler_user_model (user_id, model_confidence)
  VALUES (NEW.id, 0)
  ON CONFLICT (user_id) DO NOTHING;

  -- Denial state
  INSERT INTO denial_state (user_id, current_denial_day, is_locked)
  VALUES (NEW.id, 0, false)
  ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- TRIGGER: Auto-initialize on user signup
-- ============================================
DROP TRIGGER IF EXISTS trigger_initialize_user_data ON auth.users;
CREATE TRIGGER trigger_initialize_user_data
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION initialize_user_data();

-- ============================================
-- BACKFILL: Initialize data for existing users
-- Creates missing rows for all existing users
-- ============================================

-- Profile Foundation
INSERT INTO profile_foundation (user_id, chosen_name, pronouns, partner_awareness_level)
SELECT id, '', 'she/her', 0
FROM auth.users
WHERE id NOT IN (SELECT user_id FROM profile_foundation)
ON CONFLICT (user_id) DO NOTHING;

-- Profile History
INSERT INTO profile_history (user_id)
SELECT id FROM auth.users
WHERE id NOT IN (SELECT user_id FROM profile_history)
ON CONFLICT (user_id) DO NOTHING;

-- Profile Arousal
INSERT INTO profile_arousal (user_id)
SELECT id FROM auth.users
WHERE id NOT IN (SELECT user_id FROM profile_arousal)
ON CONFLICT (user_id) DO NOTHING;

-- Profile Psychology
INSERT INTO profile_psychology (user_id)
SELECT id FROM auth.users
WHERE id NOT IN (SELECT user_id FROM profile_psychology)
ON CONFLICT (user_id) DO NOTHING;

-- Profile Depth
INSERT INTO profile_depth (user_id)
SELECT id FROM auth.users
WHERE id NOT IN (SELECT user_id FROM profile_depth)
ON CONFLICT (user_id) DO NOTHING;

-- Intake Progress
INSERT INTO intake_progress (user_id, layer_completed, questions_answered, disclosure_score)
SELECT id, 0, 0, 0
FROM auth.users
WHERE id NOT IN (SELECT user_id FROM intake_progress)
ON CONFLICT (user_id) DO NOTHING;

-- Handler User Model (correct columns from migration 003)
INSERT INTO handler_user_model (user_id, model_confidence)
SELECT id, 0
FROM auth.users
WHERE id NOT IN (SELECT user_id FROM handler_user_model)
ON CONFLICT (user_id) DO NOTHING;

-- Denial State
INSERT INTO denial_state (user_id, current_denial_day, is_locked)
SELECT id, 0, false
FROM auth.users
WHERE id NOT IN (SELECT user_id FROM denial_state)
ON CONFLICT (user_id) DO NOTHING;

