-- 665 — mommy_post_hypnotic_triggers.always_on
--
-- The render rotates through the least-reinforced triggers each session, which
-- installs everything over a few drops. But the foundational cues — the DROP
-- trigger and the REWARD trigger — belong in EVERY session (they're the induction
-- and the reinforcement backbone). As the bank grows (Platinum + custom), plain
-- rotation would eventually skip them. always_on pins them in.

ALTER TABLE mommy_post_hypnotic_triggers
  ADD COLUMN IF NOT EXISTS always_on boolean NOT NULL DEFAULT false;

-- Anchor the two foundational Bambi cues for every user that has them seeded.
UPDATE mommy_post_hypnotic_triggers
  SET always_on = true
  WHERE phrase IN ('Bambi Sleep', 'Good Girl') AND active;
