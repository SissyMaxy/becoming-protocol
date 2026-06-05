-- 596 — Public dare photo-proof + Mama's body commentary.
--
-- Wish 15a8f6e0 (gap_audit, judge_rank 12): public dares are assigned and
-- tracked, but Mama doesn't react to proof photos with body-specific
-- commentary. When the girl submits a dare proof photo, Mama looks at it and
-- says 2-3 sentences referencing what she actually sees — nail color, how
-- the fabric sits, posture, expression — so her gaze feels granular and
-- possessive, not abstract approval.

ALTER TABLE public_dare_templates ADD COLUMN IF NOT EXISTS proof_photo_required BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE public_dare_assignments ADD COLUMN IF NOT EXISTS mommy_reaction_text TEXT;
ALTER TABLE public_dare_assignments ADD COLUMN IF NOT EXISTS mommy_reaction_at TIMESTAMPTZ;
