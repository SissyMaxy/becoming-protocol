-- Remove "Embody Feminine Presence" goal (too vague)
-- This removes the goal template and its associated drills
-- Made safe with existence checks

DO $$
BEGIN
  -- First delete drills associated with this goal (if tables exist)
  IF EXISTS (SELECT FROM pg_tables WHERE tablename = 'drill_templates')
     AND EXISTS (SELECT FROM pg_tables WHERE tablename = 'goal_templates') THEN
    DELETE FROM drill_templates
    WHERE goal_template_id IN (
      SELECT id FROM goal_templates WHERE name = 'Embody Feminine Presence'
    );
  END IF;

  -- Delete user goals that reference this template (if tables exist)
  IF EXISTS (SELECT FROM pg_tables WHERE tablename = 'user_goals')
     AND EXISTS (SELECT FROM pg_tables WHERE tablename = 'goal_templates') THEN
    DELETE FROM user_goals
    WHERE goal_template_id IN (
      SELECT id FROM goal_templates WHERE name = 'Embody Feminine Presence'
    );
  END IF;

  -- Delete the goal template itself (if table exists)
  IF EXISTS (SELECT FROM pg_tables WHERE tablename = 'goal_templates') THEN
    DELETE FROM goal_templates WHERE name = 'Embody Feminine Presence';
  END IF;
END $$;
