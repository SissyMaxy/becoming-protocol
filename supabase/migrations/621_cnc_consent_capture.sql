-- 621: CNC pre-consent capture (Constitution Art. IX).
--
-- Records advance consent to consensual-non-consent so the scenes (temptation,
-- the force, goon descent, the "make me" framing) can escalate WITHOUT per-
-- instance checks, up to the hard-limits, with the safeword as the override.
--
-- SCOPE IS FANTASY/CONDITIONING ONLY. cnc_scope defaults to and is intended as
-- 'fantasy_conditioning_only'. This flag can NEVER gate real-world procurement
-- or a real non-consensual encounter (Art. II floor): CNC cannot consent on a
-- third party's behalf, and removing live consent in a real encounter is assault,
-- not play.
--
-- Applied 2026-06-28 via the Management API (token now in env).

ALTER TABLE life_as_woman_settings
  ADD COLUMN IF NOT EXISTS cnc_approved boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS cnc_intensity int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cnc_hard_limits text,
  ADD COLUMN IF NOT EXISTS cnc_scope text NOT NULL DEFAULT 'fantasy_conditioning_only';
