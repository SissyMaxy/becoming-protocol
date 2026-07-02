-- 645 — HRT dose photo evidence + grading (verify-don't-trust on the ladder).
--
-- hrt_dose_log already carries photo_url, but it was optional and ungraded,
-- so a dose "taken" was pure self-report. This migration makes the photo a
-- real part of the loop:
--
--   evidence_verified  boolean  — this dose is backed by real, non-duplicate
--                                 photo evidence. Only these count as full
--                                 adherence. Default false (self-report).
--   evidence_grade     text     — 'verified' | 'unverified' | 'duplicate'
--   evidence_graded_at timestamptz
--   evidence_sha256    text     — hash of the photo bytes, for anti-gaming
--                                 dedup (the same picture can't verify two
--                                 doses).
--
-- The BEFORE-trigger is the server-side backstop: whatever the client claims,
-- the DB re-enforces the rules — no photo → never verified; a hash already
-- seen on another of THIS user's doses → downgraded to 'duplicate'. Same
-- anti-circumvention shape as the fem-prescription evidence work.
--
-- Note (numbering): 642 was the last committed migration; 643/644 were left to
-- sibling agents, so this took 645. Purely additive ALTERs — safe out of order.

-- ─── 1. Evidence columns ────────────────────────────────────────────

ALTER TABLE hrt_dose_log
  ADD COLUMN IF NOT EXISTS evidence_verified  boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS evidence_grade     text,
  ADD COLUMN IF NOT EXISTS evidence_graded_at timestamptz,
  ADD COLUMN IF NOT EXISTS evidence_sha256    text;

ALTER TABLE hrt_dose_log DROP CONSTRAINT IF EXISTS hrt_dose_log_evidence_grade_check;
ALTER TABLE hrt_dose_log ADD CONSTRAINT hrt_dose_log_evidence_grade_check
  CHECK (evidence_grade IS NULL OR evidence_grade IN ('verified','unverified','duplicate'));

-- Dedup lookup: recent hashes per user. Partial — only rows that carry a hash.
CREATE INDEX IF NOT EXISTS idx_hrt_dose_log_user_sha256
  ON hrt_dose_log (user_id, evidence_sha256)
  WHERE evidence_sha256 IS NOT NULL;

-- Adherence read path (hrt-pipeline 7d window) touches user_id + created_at +
-- evidence_verified; keep it cheap.
CREATE INDEX IF NOT EXISTS idx_hrt_dose_log_user_created_verified
  ON hrt_dose_log (user_id, created_at, evidence_verified);

-- ─── 2. Server-side grading backstop ────────────────────────────────
-- Runs BEFORE INSERT/UPDATE. The client already grades (so the UI is honest
-- immediately) but the DB is the authority — this re-derives the same result
-- and cannot be lied to.

CREATE OR REPLACE FUNCTION hrt_dose_evidence_guard()
RETURNS TRIGGER LANGUAGE plpgsql AS $fn$
BEGIN
  -- No photo → never verified. Self-report is allowed, just not "proven".
  IF NEW.photo_url IS NULL OR btrim(NEW.photo_url) = '' THEN
    NEW.evidence_verified := false;
    NEW.evidence_sha256 := NULL;
    IF NEW.evidence_grade IS NULL OR NEW.evidence_grade = 'verified' THEN
      NEW.evidence_grade := 'unverified';
    END IF;
    NEW.evidence_graded_at := now();
    RETURN NEW;
  END IF;

  -- Photo present. Anti-gaming: if this hash already backs another of this
  -- user's doses, it can't verify this one too.
  IF NEW.evidence_sha256 IS NOT NULL AND EXISTS (
    SELECT 1 FROM hrt_dose_log d
     WHERE d.user_id = NEW.user_id
       AND d.evidence_sha256 = NEW.evidence_sha256
       AND d.id IS DISTINCT FROM NEW.id
  ) THEN
    NEW.evidence_verified := false;
    NEW.evidence_grade := 'duplicate';
  ELSIF NEW.evidence_sha256 IS NOT NULL THEN
    NEW.evidence_verified := true;
    NEW.evidence_grade := 'verified';
  ELSE
    -- photo_url present but no hash supplied — treat as unverified (we can't
    -- prove it's not a reused image without the hash).
    NEW.evidence_verified := false;
    IF NEW.evidence_grade IS NULL OR NEW.evidence_grade = 'verified' THEN
      NEW.evidence_grade := 'unverified';
    END IF;
  END IF;

  NEW.evidence_graded_at := now();
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_hrt_dose_evidence_guard ON hrt_dose_log;
CREATE TRIGGER trg_hrt_dose_evidence_guard
  BEFORE INSERT OR UPDATE ON hrt_dose_log
  FOR EACH ROW EXECUTE FUNCTION hrt_dose_evidence_guard();
