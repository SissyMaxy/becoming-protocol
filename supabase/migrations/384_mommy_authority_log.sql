-- 384 — life-as-woman authority log extensions + safeword helper + settings.
--
-- Renumbered from 367 (collided with merged main work). The
-- `mommy_authority_log` base table already exists on main from PR #53
-- (mig 400) and was extended with short-name aliases by PR #55 (mig 378).
-- This migration is therefore PURELY ADDITIVE for mommy_authority_log:
-- it only adds the four life-as-woman-specific pointer columns the new
-- surfaces need (surface, action, target_table, target_id, autonomous).
-- The base columns (action_kind / source_system / action_summary /
-- action_payload / shipped_at) stay NOT NULL — every life-as-woman edge
-- function populates BOTH the legacy columns AND the new aliases. The
-- short-name columns (system, summary, payload, created_at) were already
-- added in mig 378 so we do not redeclare them.
--
-- Companion artifacts created here for the first time:
--   - is_safeword_active(uid, window_seconds) helper function
--   - life_as_woman_settings table (master + per-system toggles)
--   - life_as_woman_system_active view
--
-- Hard floors enforced here:
--   - RLS owner-only (read), service-role write
--   - Safeword helper looks at meta_frame_breaks (created in 306) so any
--     safeword exit from the gaslight surface auto-pauses every new system

-- ─── 1. mommy_authority_log — ADDITIVE columns only ────────────────────
-- The table already exists from mig 400. Mig 378 already added system /
-- summary / payload / created_at. We only add what's truly new for the
-- life-as-woman wave. Index name is unique (`_law_` infix) to avoid
-- silent collision with the existing idx_mommy_authority_log_by_system.
ALTER TABLE mommy_authority_log
  ADD COLUMN IF NOT EXISTS surface TEXT,
  ADD COLUMN IF NOT EXISTS action TEXT,
  ADD COLUMN IF NOT EXISTS target_table TEXT,
  ADD COLUMN IF NOT EXISTS target_id UUID,
  ADD COLUMN IF NOT EXISTS autonomous BOOLEAN DEFAULT TRUE;

CREATE INDEX IF NOT EXISTS idx_mommy_authority_log_law_surface
  ON mommy_authority_log (user_id, surface, created_at DESC);

-- ─── 2. safeword-active helper ──────────────────────────────────────────
-- Returns TRUE if the user has triggered a safeword in the last 60 seconds.
-- Every Mommy generator MUST short-circuit on TRUE.
--
-- Looks at meta_frame_breaks where triggered_by='safeword' (the existing
-- gaslight surface writes this) and also accepts a fresh aftercare_sessions
-- row with entry_trigger='post_safeword' as an equivalent signal.
CREATE OR REPLACE FUNCTION is_safeword_active(uid UUID, window_seconds INT DEFAULT 60)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM meta_frame_breaks
    WHERE user_id = uid
      AND triggered_by = 'safeword'
      AND created_at > now() - (window_seconds || ' seconds')::interval
  ) OR EXISTS (
    SELECT 1 FROM aftercare_sessions
    WHERE user_id = uid
      AND entry_trigger = 'post_safeword'
      AND exited_at IS NULL
      AND entered_at > now() - (window_seconds || ' seconds')::interval
  );
$$;

GRANT EXECUTE ON FUNCTION is_safeword_active(UUID, INT) TO authenticated, service_role;

-- ─── 3. life_as_woman_settings ─────────────────────────────────────────
-- Master + per-system toggle and intensity slider. Every system DEFAULTS
-- OFF; user opts in via the out-of-fantasy settings page. Intensity 1..5;
-- generators bias content depth accordingly. Read by every edge fn before
-- producing output.
CREATE TABLE IF NOT EXISTS life_as_woman_settings (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Master switch — if false, nothing in any of the four systems runs.
  master_enabled BOOLEAN NOT NULL DEFAULT FALSE,

  -- System 1: Sniffies outbound + choreography
  sniffies_outbound_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  sniffies_outbound_intensity SMALLINT NOT NULL DEFAULT 2 CHECK (sniffies_outbound_intensity BETWEEN 1 AND 5),

  -- System 2: Hypno trance
  hypno_trance_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  hypno_trance_intensity SMALLINT NOT NULL DEFAULT 2 CHECK (hypno_trance_intensity BETWEEN 1 AND 5),
  hypno_visual_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  hypno_wake_bridge_enabled BOOLEAN NOT NULL DEFAULT FALSE,

  -- System 3: Gooning + chastity v2 + kink curriculum
  gooning_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  gooning_intensity SMALLINT NOT NULL DEFAULT 2 CHECK (gooning_intensity BETWEEN 1 AND 5),
  chastity_v2_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  kink_curriculum_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  kink_curriculum_intensity SMALLINT NOT NULL DEFAULT 2 CHECK (kink_curriculum_intensity BETWEEN 1 AND 5),

  -- System 4: Content editor
  content_editor_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  content_editor_intensity SMALLINT NOT NULL DEFAULT 2 CHECK (content_editor_intensity BETWEEN 1 AND 5),
  cross_platform_consistency_enabled BOOLEAN NOT NULL DEFAULT FALSE,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE life_as_woman_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS life_as_woman_settings_owner ON life_as_woman_settings;
CREATE POLICY life_as_woman_settings_owner ON life_as_woman_settings
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS life_as_woman_settings_service ON life_as_woman_settings;
CREATE POLICY life_as_woman_settings_service ON life_as_woman_settings
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION touch_life_as_woman_settings_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END;
$$;
DROP TRIGGER IF EXISTS trg_touch_life_as_woman_settings ON life_as_woman_settings;
CREATE TRIGGER trg_touch_life_as_woman_settings
  BEFORE UPDATE ON life_as_woman_settings
  FOR EACH ROW EXECUTE FUNCTION touch_life_as_woman_settings_updated_at();

-- ─── 4. helper view: life_as_woman_system_active ────────────────────────
-- One-shot read for each system's effective enabled state. Edge fns query
-- this and gate on it. Master + per-system AND-ed together.
CREATE OR REPLACE VIEW life_as_woman_system_active AS
SELECT
  user_id,
  master_enabled,
  master_enabled AND sniffies_outbound_enabled       AS sniffies_outbound_active,
  master_enabled AND hypno_trance_enabled            AS hypno_trance_active,
  master_enabled AND gooning_enabled                 AS gooning_active,
  master_enabled AND chastity_v2_enabled             AS chastity_v2_active,
  master_enabled AND kink_curriculum_enabled         AS kink_curriculum_active,
  master_enabled AND content_editor_enabled          AS content_editor_active,
  master_enabled AND cross_platform_consistency_enabled AS cross_platform_active,
  sniffies_outbound_intensity,
  hypno_trance_intensity,
  gooning_intensity,
  kink_curriculum_intensity,
  content_editor_intensity,
  hypno_visual_enabled,
  hypno_wake_bridge_enabled
FROM life_as_woman_settings;

-- Backfill the existing live user_state rows with default (off) settings so
-- the view never returns NULL for them. New users get a row on first
-- settings UPDATE.
INSERT INTO life_as_woman_settings (user_id)
SELECT user_id FROM user_state
ON CONFLICT (user_id) DO NOTHING;

NOTIFY pgrst, 'reload schema';
