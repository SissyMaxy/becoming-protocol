-- 101b: Add last_task_id column to user_state for anti-repetition tracking
-- The anti-repetition rule now blocks specific task IDs instead of category+domain combos.

ALTER TABLE user_state ADD COLUMN IF NOT EXISTS last_task_id TEXT DEFAULT NULL;
