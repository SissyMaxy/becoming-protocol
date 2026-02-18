-- Add time-of-day filtering to goals
-- Prevents goals like "Embody Feminine Presence" from showing at 1am

-- Add suitable_times column to goals table
-- Array of: 'morning', 'afternoon', 'evening', 'night', 'any'
ALTER TABLE goals
ADD COLUMN IF NOT EXISTS suitable_times TEXT[] DEFAULT ARRAY['any'];

-- Add suitable_times column to goal_templates table
ALTER TABLE goal_templates
ADD COLUMN IF NOT EXISTS suitable_times TEXT[] DEFAULT ARRAY['any'];

-- Update "Embody Feminine Presence" to only show during daytime hours
UPDATE goal_templates
SET suitable_times = ARRAY['morning', 'afternoon', 'evening']
WHERE name = 'Embody Feminine Presence';

-- Also update any existing user goals created from this template
UPDATE goals
SET suitable_times = ARRAY['morning', 'afternoon', 'evening']
WHERE name = 'Embody Feminine Presence';

-- Comment for reference
COMMENT ON COLUMN goals.suitable_times IS 'Time windows when this goal should be shown: morning (5-12), afternoon (12-17), evening (17-21), night (21-5), any';
COMMENT ON COLUMN goal_templates.suitable_times IS 'Time windows when this goal should be shown: morning (5-12), afternoon (12-17), evening (17-21), night (21-5), any';
