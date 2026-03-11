-- Weekend awareness: pre-commitment tracking and release pattern learning
-- weekend_mode_active already exists on user_state (migration 034)

ALTER TABLE user_state
ADD COLUMN IF NOT EXISTS last_pre_commitment_at TIMESTAMPTZ;

ALTER TABLE user_state
ADD COLUMN IF NOT EXISTS weekend_release_pattern JSONB DEFAULT '{"friday": 0, "saturday": 0, "sunday": 0, "total_tracked": 0}'::jsonb;
