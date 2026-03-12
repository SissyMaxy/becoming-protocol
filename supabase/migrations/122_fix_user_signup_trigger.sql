-- Fix user signup trigger
-- The old initialize_user_data() may reference stale column expectations.
-- Recreate with explicit error handling per table so one failure doesn't block signup.

CREATE OR REPLACE FUNCTION initialize_user_data()
RETURNS TRIGGER AS $$
BEGIN
  -- Profile tables
  BEGIN
    INSERT INTO profile_foundation (user_id, chosen_name, pronouns, partner_awareness_level)
    VALUES (NEW.id, '', 'she/her', 0)
    ON CONFLICT (user_id) DO NOTHING;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'initialize_user_data: profile_foundation failed: %', SQLERRM;
  END;

  BEGIN
    INSERT INTO profile_history (user_id)
    VALUES (NEW.id)
    ON CONFLICT (user_id) DO NOTHING;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'initialize_user_data: profile_history failed: %', SQLERRM;
  END;

  BEGIN
    INSERT INTO profile_arousal (user_id)
    VALUES (NEW.id)
    ON CONFLICT (user_id) DO NOTHING;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'initialize_user_data: profile_arousal failed: %', SQLERRM;
  END;

  BEGIN
    INSERT INTO profile_psychology (user_id)
    VALUES (NEW.id)
    ON CONFLICT (user_id) DO NOTHING;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'initialize_user_data: profile_psychology failed: %', SQLERRM;
  END;

  BEGIN
    INSERT INTO profile_depth (user_id)
    VALUES (NEW.id)
    ON CONFLICT (user_id) DO NOTHING;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'initialize_user_data: profile_depth failed: %', SQLERRM;
  END;

  BEGIN
    INSERT INTO intake_progress (user_id, layer_completed, questions_answered, disclosure_score)
    VALUES (NEW.id, 0, 0, 0)
    ON CONFLICT (user_id) DO NOTHING;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'initialize_user_data: intake_progress failed: %', SQLERRM;
  END;

  BEGIN
    INSERT INTO handler_user_model (user_id, model_confidence)
    VALUES (NEW.id, 0)
    ON CONFLICT (user_id) DO NOTHING;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'initialize_user_data: handler_user_model failed: %', SQLERRM;
  END;

  BEGIN
    INSERT INTO denial_state (user_id, current_denial_day, is_locked)
    VALUES (NEW.id, 0, false)
    ON CONFLICT (user_id) DO NOTHING;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'initialize_user_data: denial_state failed: %', SQLERRM;
  END;

  -- user_state (from migration 033)
  BEGIN
    INSERT INTO user_state (user_id)
    VALUES (NEW.id)
    ON CONFLICT (user_id) DO NOTHING;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'initialize_user_data: user_state failed: %', SQLERRM;
  END;

  -- consequence_state (from migration 048)
  BEGIN
    INSERT INTO consequence_state (user_id, current_tier, days_noncompliant)
    VALUES (NEW.id, 0, 0)
    ON CONFLICT (user_id) DO NOTHING;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'initialize_user_data: consequence_state failed: %', SQLERRM;
  END;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Consolidate all three signup triggers into one.
-- Drop the other two since this function now handles all tables.
DROP TRIGGER IF EXISTS on_auth_user_created_state ON auth.users;
DROP TRIGGER IF EXISTS on_auth_user_created_consequence ON auth.users;
DROP TRIGGER IF EXISTS trigger_initialize_user_data ON auth.users;

CREATE TRIGGER trigger_initialize_user_data
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION initialize_user_data();
