-- 366 — Photo verification → feminization feedback loop.
--
-- Before this migration, non-wardrobe photo verifications (mirror_check,
-- pose, makeup, progress_photo, etc.) were a one-shot vision call: the
-- analysis showed in the upload modal and a `approved` boolean landed on
-- the verification_photos row, but nothing entered Mommy's continuous-
-- presence rhythm. Photo evidence got logged, then disappeared.
--
-- This migration adds the user_state counters that the analyze-photo
-- handler bumps on each approved verification, so:
--   - Mommy's recall surfaces ("you sent me 7 photos this week, baby")
--     have real numbers to draw from instead of fabricating
--   - future progression gates (phase advance, prescription cadence) can
--     read verified_photo_count instead of running their own count(*)
--   - the Today dashboard can surface photo-verification momentum
--
-- The matching outreach insert ("Mama just looked at you, baby — …") is
-- the responsibility of analyze-photo-action.ts. This migration only
-- creates the state to count against.

-- ─── user_state counters ─────────────────────────────────────────────────
ALTER TABLE user_state
  ADD COLUMN IF NOT EXISTS verified_photo_count INTEGER
    NOT NULL DEFAULT 0
    CHECK (verified_photo_count >= 0);

ALTER TABLE user_state
  ADD COLUMN IF NOT EXISTS last_verified_photo_at TIMESTAMPTZ;

COMMENT ON COLUMN user_state.verified_photo_count IS
  'Lifetime count of approved verification_photos rows. Bumped by analyze-photo-action on each approval. Read-only from app code.';
COMMENT ON COLUMN user_state.last_verified_photo_at IS
  'Most-recent approved-photo timestamp. Drives Today momentum cards and Mommy recall ("3 days since you showed Mama anything, baby").';

-- ─── Atomic bump helper ──────────────────────────────────────────────────
-- Avoids the read-then-write race when two photos approve nearly
-- simultaneously. analyze-photo-action calls this rpc with the user id
-- and increments by 1 every time.
CREATE OR REPLACE FUNCTION public.bump_verified_photo_count(p_user UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new INTEGER;
BEGIN
  UPDATE user_state
  SET verified_photo_count = verified_photo_count + 1,
      last_verified_photo_at = now()
  WHERE user_id = p_user
  RETURNING verified_photo_count INTO v_new;
  RETURN COALESCE(v_new, 0);
END;
$$;

GRANT EXECUTE ON FUNCTION public.bump_verified_photo_count(UUID) TO service_role;
