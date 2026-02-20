-- Sprint 4: Opacity Slider System
-- Add opacity level columns to user_state table

ALTER TABLE user_state
  ADD COLUMN IF NOT EXISTS opacity_level INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS opacity_level_set_at TIMESTAMPTZ DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS opacity_level_history JSONB DEFAULT '[]'::jsonb;

-- Constraint: opacity level must be 0-3
ALTER TABLE user_state
  ADD CONSTRAINT check_opacity_level CHECK (opacity_level >= 0 AND opacity_level <= 3);
