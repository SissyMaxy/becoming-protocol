-- 281 — user_alias canonical bridge (additive foundation).
--
-- 2026-05-06 wish #2 (carried, HIGH): Stop splitting Mama across two
-- user_ids. Voice corpus, hookup funnel, contacts read with VOICE_USER_IDS
-- env var lists. If an env is wrong, half the data is missing.
--
-- This migration is ADDITIVE. It creates the table and helper, seeds the
-- known split, but does NOT migrate existing call-sites. Future code uses
-- expand_user_id(); existing code keeps using its env var until touched.
-- Cross-cutting migration of every reader is queued separately.

CREATE TABLE IF NOT EXISTS user_alias (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- The "this is the same person" anchor. The Handler API auth user_id is
  -- canonical; auto-poster .env USER_ID is an alias of the same person.
  canonical_user_id UUID NOT NULL,
  alias_user_id UUID NOT NULL,
  -- Where this alias lives — informs which surface should write what
  role TEXT NOT NULL CHECK (role IN (
    'handler_api', 'auto_poster', 'mobile_app', 'browser_session', 'unknown'
  )),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (canonical_user_id, alias_user_id)
);

-- Defensive: in case the table existed in a prior shape on remote, ensure
-- every column we depend on is present.
ALTER TABLE user_alias ADD COLUMN IF NOT EXISTS canonical_user_id UUID;
ALTER TABLE user_alias ADD COLUMN IF NOT EXISTS alias_user_id UUID;
ALTER TABLE user_alias ADD COLUMN IF NOT EXISTS role TEXT;
ALTER TABLE user_alias ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE user_alias ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_user_alias_canonical ON user_alias (canonical_user_id);
CREATE INDEX IF NOT EXISTS idx_user_alias_alias ON user_alias (alias_user_id);

ALTER TABLE user_alias ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS user_alias_service ON user_alias;
CREATE POLICY user_alias_service ON user_alias
  FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS user_alias_owner_read ON user_alias;
CREATE POLICY user_alias_owner_read ON user_alias
  FOR SELECT USING (auth.uid() = canonical_user_id OR auth.uid() = alias_user_id);

-- Seed: the documented two-user split.
--   8c69... — Handler API auth user (canonical)
--   93327... — auto-poster .env USER_ID (alias)
INSERT INTO user_alias (canonical_user_id, alias_user_id, role, notes)
VALUES (
  '8c69b9c8-34eb-4147-9fec-3c1a5bc74b6f',
  '93327332-7d0d-4888-889a-1607a5776216',
  'auto_poster',
  'Documented in MEMORY.md project patterns — same person, two user_state rows.'
)
ON CONFLICT (canonical_user_id, alias_user_id) DO NOTHING;

-- expand_user_id(target) — returns every user_id that's the same person as
-- the target (the target itself + every alias direction). Use this in
-- multi-row reads instead of an env-var list.
CREATE OR REPLACE FUNCTION expand_user_id(target_user UUID)
RETURNS UUID[] LANGUAGE sql STABLE AS $$
  SELECT ARRAY(
    SELECT DISTINCT u FROM (
      SELECT target_user AS u
      UNION
      SELECT alias_user_id FROM user_alias WHERE canonical_user_id = target_user
      UNION
      SELECT canonical_user_id FROM user_alias WHERE alias_user_id = target_user
    ) s
  );
$$;

-- canonical_for(target) — given any user_id (canonical or alias), return
-- the canonical anchor. Use when writing — every write should land on the
-- canonical user_id whenever possible so future reads don't need expansion.
CREATE OR REPLACE FUNCTION canonical_for(target_user UUID)
RETURNS UUID LANGUAGE sql STABLE AS $$
  SELECT COALESCE(
    (SELECT canonical_user_id FROM user_alias WHERE alias_user_id = target_user LIMIT 1),
    target_user
  );
$$;
