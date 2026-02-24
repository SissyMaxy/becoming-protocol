-- 105: Add owned_items column to user_state for equipment tracking
-- Used by rules engine to filter tasks requiring specific items.

ALTER TABLE user_state ADD COLUMN IF NOT EXISTS owned_items TEXT[] DEFAULT '{}';
