-- 263 — Verification photo UI surfaces.
--
-- Adds the columns the PhotoUploadWidget + VerificationVault need:
--   * directive_id / directive_kind: polymorphic link back to whatever
--     directive prompted the proof (handler_decrees, arousal_touch_tasks,
--     body_feminization_directives, daily_outfit_mandates). NO foreign key —
--     the same row id can collide across tables and we don't want to
--     cascade-delete proof when a directive is purged.
--   * verification_type: the user-spec'd taxonomy
--     (wardrobe_acquisition / posture_check / mirror_affirmation /
--      mantra_recitation / pose_hold / freeform). Coexists with task_type;
--     task_type stays for backward-compat with the existing analyze-photo
--     prompt selector. UI prefers verification_type when present.
--   * redo_requested_at / redo_reason / review_state: lets Mama choose
--     approve / deny / request_redo; UI surfaces the state and a redo CTA.
--
-- Also relaxes the task_type CHECK to include values the existing code
-- already inserts (daily_mirror_selfie via DailyMirrorSelfieCard, progress_photo
-- + gina_text via UnifiedCaptureCard / analyze-photo prompts) which would have
-- failed the original CHECK at runtime. Sibling-bug fix per the standing
-- "fix completely" rule — no point shipping new types if existing inserts
-- silently 23514.

-- 1. New columns ────────────────────────────────────────────────────────────
ALTER TABLE verification_photos
  ADD COLUMN IF NOT EXISTS directive_id UUID,
  ADD COLUMN IF NOT EXISTS directive_kind TEXT,
  ADD COLUMN IF NOT EXISTS directive_snippet TEXT,
  ADD COLUMN IF NOT EXISTS verification_type TEXT,
  ADD COLUMN IF NOT EXISTS review_state TEXT,
  ADD COLUMN IF NOT EXISTS redo_requested_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS redo_reason TEXT;

-- 2. CHECK constraints ──────────────────────────────────────────────────────
-- task_type: include legacy + already-in-flight values
ALTER TABLE verification_photos DROP CONSTRAINT IF EXISTS verification_photos_task_type_check;
ALTER TABLE verification_photos ADD CONSTRAINT verification_photos_task_type_check
  CHECK (task_type IN (
    'outfit', 'mirror_check', 'pose', 'makeup', 'nails', 'general',
    'daily_mirror_selfie', 'progress_photo', 'gina_text'
  ));

-- verification_type: the user-facing kink taxonomy
ALTER TABLE verification_photos DROP CONSTRAINT IF EXISTS verification_photos_verification_type_check;
ALTER TABLE verification_photos ADD CONSTRAINT verification_photos_verification_type_check
  CHECK (verification_type IS NULL OR verification_type IN (
    'wardrobe_acquisition', 'posture_check', 'mirror_affirmation',
    'mantra_recitation', 'pose_hold', 'freeform'
  ));

-- directive_kind: which table directive_id refers to
ALTER TABLE verification_photos DROP CONSTRAINT IF EXISTS verification_photos_directive_kind_check;
ALTER TABLE verification_photos ADD CONSTRAINT verification_photos_directive_kind_check
  CHECK (directive_kind IS NULL OR directive_kind IN (
    'handler_decree', 'arousal_touch_task', 'body_feminization_directive',
    'daily_outfit_mandate', 'wardrobe_item', 'mommy_mantra', 'freeform'
  ));

-- review_state: tri-state Mama-approval surface (NULL = pre-analysis,
-- 'pending' = analyzed but no explicit approve/deny, 'approved' / 'denied'
-- / 'redo_requested' = explicit Mama judgment)
ALTER TABLE verification_photos DROP CONSTRAINT IF EXISTS verification_photos_review_state_check;
ALTER TABLE verification_photos ADD CONSTRAINT verification_photos_review_state_check
  CHECK (review_state IS NULL OR review_state IN (
    'pending', 'approved', 'denied', 'redo_requested'
  ));

-- 3. Backfill review_state from existing approved BOOLEAN ──────────────────
-- approved=TRUE → 'approved', approved=FALSE → 'denied', NULL → 'pending'
-- Safe to re-run; only updates rows where review_state IS NULL.
UPDATE verification_photos
SET review_state = CASE
  WHEN approved IS TRUE THEN 'approved'
  WHEN approved IS FALSE THEN 'denied'
  ELSE 'pending'
END
WHERE review_state IS NULL;

-- 4. Indexes for vault gallery + directive linkback ────────────────────────
CREATE INDEX IF NOT EXISTS idx_verification_photos_directive
  ON verification_photos(directive_kind, directive_id)
  WHERE directive_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_verification_photos_review_state
  ON verification_photos(user_id, review_state, created_at DESC)
  WHERE review_state IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_verification_photos_verification_type
  ON verification_photos(user_id, verification_type, created_at DESC)
  WHERE verification_type IS NOT NULL;

-- 5. Vault privacy settings (per-user, single-row) ─────────────────────────
-- Soft-modal default until feature/stealth-mode-2026-04-30 lands; the PIN
-- gate it ships will read from the same row. Coexists by design.
CREATE TABLE IF NOT EXISTS vault_privacy_settings (
  user_id UUID PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  blur_thumbnails BOOLEAN NOT NULL DEFAULT TRUE,
  -- pin_lock_enabled / pin_hash live on the future stealth_settings table
  -- (sibling branch). Until then, vault uses a soft "are you sure" modal
  -- and a session-scoped reveal flag (in-memory, not persisted).
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE vault_privacy_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS vault_privacy_settings_owner ON vault_privacy_settings;
CREATE POLICY vault_privacy_settings_owner
  ON vault_privacy_settings FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
