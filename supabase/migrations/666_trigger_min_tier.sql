-- 666 — mommy_post_hypnotic_triggers.min_tier
--
-- With the Platinum/advanced set seeded, the hardest turn-out triggers (cock
-- focus, deep dumb-down) shouldn't surface in a GENTLE drop — they belong when
-- she's already hungry (firm/cruel). min_tier gates a trigger to the lowest
-- session intensity it may install in, so conditioning escalates with arousal
-- instead of a calm session suddenly saying "cock zombie."

ALTER TABLE mommy_post_hypnotic_triggers
  ADD COLUMN IF NOT EXISTS min_tier text NOT NULL DEFAULT 'gentle';

DO $$ BEGIN
  ALTER TABLE mommy_post_hypnotic_triggers
    ADD CONSTRAINT mommy_post_hypnotic_triggers_min_tier_chk
    CHECK (min_tier IN ('gentle', 'firm', 'cruel'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Hardest turn-out / deep dumb-down → cruel only.
UPDATE mommy_post_hypnotic_triggers SET min_tier = 'cruel'
  WHERE phrase IN ('Cock Zombie Now', 'Zap Cock Drain Obey', 'Cockblank Lovedoll');

-- Overt sexual / heavier cognitive triggers → firm and up.
UPDATE mommy_post_hypnotic_triggers SET min_tier = 'firm'
  WHERE phrase IN (
    'Drop for Cock', 'Bambi Cum and Collapse', 'Bambi Reset',
    'Braindead Bobblehead', 'Airhead Barbie', 'Blonde Moment'
  );
