-- P12.4: Handler Personality Evolution
-- Tracks learned handler personality calibration per user

CREATE TABLE IF NOT EXISTS handler_personality_state (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Mode preferences by time of day
  preferred_mode_morning TEXT DEFAULT 'director',
  preferred_mode_afternoon TEXT DEFAULT 'director',
  preferred_mode_evening TEXT DEFAULT 'handler',
  preferred_mode_night TEXT DEFAULT 'dominant',

  -- Tone calibration (0 = maximally warm, 10 = maximally direct)
  directness_level FLOAT DEFAULT 5,
  warmth_level FLOAT DEFAULT 5,

  -- Learned preferences
  favorite_interventions TEXT[] DEFAULT '{}',
  avoided_interventions TEXT[] DEFAULT '{}',
  effective_phrases TEXT[] DEFAULT '{}',

  -- Relationship evolution
  familiarity_level FLOAT DEFAULT 1,  -- 1-10, increases over time
  trust_score FLOAT DEFAULT 5,        -- based on commitment honor rate

  -- Language calibration
  uses_pet_names BOOLEAN DEFAULT TRUE,
  preferred_pet_name TEXT DEFAULT 'good girl',
  humor_level FLOAT DEFAULT 3,        -- 0-10

  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id)
);

ALTER TABLE handler_personality_state ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'handler_personality_state' AND policyname = 'Users own their data'
  ) THEN
    CREATE POLICY "Users own their data" ON handler_personality_state FOR ALL USING (auth.uid() = user_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_personality_state_user ON handler_personality_state (user_id);
