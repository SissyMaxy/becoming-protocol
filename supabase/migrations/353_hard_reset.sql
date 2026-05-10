-- Migration 301: Hard Reset / Emergency Wipe
-- One-shot user-initiated nuke of all kink/personal data.
-- Auth account stays. Audit log stays. Everything else under user_id goes.

-- =============================================
-- user_state: cooldown column
-- =============================================
ALTER TABLE user_state
  ADD COLUMN IF NOT EXISTS last_hard_reset_at TIMESTAMPTZ;

COMMENT ON COLUMN user_state.last_hard_reset_at IS
  'Timestamp of the last successful hard reset. Server-side 24h cooldown reads this.';

-- =============================================
-- Enums
-- =============================================
DO $$ BEGIN
  CREATE TYPE hard_reset_trigger AS ENUM ('settings_button', 'panic_gesture', 'scheduled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE hard_reset_confirmation AS ENUM ('typed_phrase', 'pin', 'both');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- =============================================
-- hard_reset_audit
-- Append-only. Survives the wipe (it is the only persistent trace).
-- Owner can read; only service role inserts/updates.
-- =============================================
CREATE TABLE IF NOT EXISTS hard_reset_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  triggered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  triggered_via hard_reset_trigger NOT NULL,
  confirmed_via hard_reset_confirmation NOT NULL,
  tables_cleared JSONB NOT NULL DEFAULT '{}'::jsonb,
  storage_objects_cleared JSONB NOT NULL DEFAULT '{}'::jsonb,
  completed_at TIMESTAMPTZ,
  error TEXT
);

CREATE INDEX IF NOT EXISTS idx_hard_reset_audit_user_id
  ON hard_reset_audit (user_id, triggered_at DESC);

ALTER TABLE hard_reset_audit ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Owner can read own hard reset audit" ON hard_reset_audit;
CREATE POLICY "Owner can read own hard reset audit"
  ON hard_reset_audit FOR SELECT
  USING (auth.uid() = user_id);

-- No INSERT/UPDATE/DELETE policy: only service role bypasses RLS.
-- Append-only enforced by absence of UPDATE/DELETE policy + revokes below.

REVOKE INSERT, UPDATE, DELETE ON hard_reset_audit FROM authenticated, anon;
GRANT SELECT ON hard_reset_audit TO authenticated;

-- =============================================
-- Tables explicitly EXCLUDED from hard reset
-- (the wipe must never touch these)
-- =============================================
-- - hard_reset_audit: the audit trail itself (only persistent trace)
-- - user_state: handled separately by RESET-TO-DEFAULTS, not delete
-- - schema_migrations: framework table
-- - any pg_cron / supabase internals: filtered by schema name

CREATE OR REPLACE FUNCTION hard_reset_excluded_tables()
RETURNS TEXT[]
LANGUAGE SQL
IMMUTABLE
AS $$
  SELECT ARRAY[
    'hard_reset_audit',
    'user_state',
    'schema_migrations'
  ]::TEXT[];
$$;

-- =============================================
-- hard_reset_user_data(p_user_id uuid)
-- Returns the count of rows deleted per table.
-- Iterates information_schema for every public.* table with a user_id column,
-- excluding the safe-list. SECURITY DEFINER so it bypasses RLS for cleanup.
-- =============================================
CREATE OR REPLACE FUNCTION hard_reset_user_data(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_table_name TEXT;
  v_deleted INTEGER;
  v_result JSONB := '{}'::jsonb;
  v_excluded TEXT[] := hard_reset_excluded_tables();
  v_sql TEXT;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'hard_reset_user_data: p_user_id is required';
  END IF;

  FOR v_table_name IN
    SELECT c.table_name
    FROM information_schema.columns c
    JOIN information_schema.tables t
      ON t.table_schema = c.table_schema AND t.table_name = c.table_name
    WHERE c.table_schema = 'public'
      AND c.column_name = 'user_id'
      AND t.table_type = 'BASE TABLE'
      AND NOT (c.table_name = ANY(v_excluded))
    ORDER BY c.table_name
  LOOP
    BEGIN
      v_sql := format('DELETE FROM public.%I WHERE user_id = $1', v_table_name);
      EXECUTE v_sql USING p_user_id;
      GET DIAGNOSTICS v_deleted = ROW_COUNT;
      IF v_deleted > 0 THEN
        v_result := v_result || jsonb_build_object(v_table_name, v_deleted);
      END IF;
    EXCEPTION WHEN OTHERS THEN
      v_result := v_result || jsonb_build_object(
        v_table_name,
        jsonb_build_object('error', SQLERRM)
      );
    END;
  END LOOP;

  RETURN v_result;
END $$;

REVOKE EXECUTE ON FUNCTION hard_reset_user_data(UUID) FROM PUBLIC, anon, authenticated;

-- =============================================
-- hard_reset_user_state(p_user_id uuid)
-- Resets user_state row to defaults instead of deleting it.
-- Re-creates if missing. Sets onboarding_completed_at to NULL so user re-onboards.
-- =============================================
CREATE OR REPLACE FUNCTION hard_reset_user_state(p_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_pre_existed BOOLEAN;
  v_last_reset TIMESTAMPTZ;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'hard_reset_user_state: p_user_id is required';
  END IF;

  SELECT TRUE, last_hard_reset_at INTO v_pre_existed, v_last_reset
  FROM user_state WHERE user_id = p_user_id;

  -- Wipe and reset to defaults; preserve only user_id and the new
  -- last_hard_reset_at = NOW() (so cooldown is enforced post-reset).
  DELETE FROM user_state WHERE user_id = p_user_id;
  INSERT INTO user_state (user_id, last_hard_reset_at)
  VALUES (p_user_id, NOW());
END $$;

REVOKE EXECUTE ON FUNCTION hard_reset_user_state(UUID) FROM PUBLIC, anon, authenticated;

-- =============================================
-- hard_reset_check_cooldown(p_user_id uuid)
-- Returns NULL if the user may reset; returns seconds remaining if blocked.
-- =============================================
CREATE OR REPLACE FUNCTION hard_reset_check_cooldown(p_user_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_last TIMESTAMPTZ;
  v_remaining INTEGER;
BEGIN
  IF p_user_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT last_hard_reset_at INTO v_last FROM user_state WHERE user_id = p_user_id;

  IF v_last IS NULL THEN
    RETURN NULL;
  END IF;

  v_remaining := EXTRACT(EPOCH FROM (v_last + INTERVAL '24 hours' - NOW()))::INTEGER;

  IF v_remaining <= 0 THEN
    RETURN NULL;
  END IF;

  RETURN v_remaining;
END $$;

GRANT EXECUTE ON FUNCTION hard_reset_check_cooldown(UUID) TO authenticated;
