-- Becoming Protocol: Movement Task Bank Seed Data
-- Feminine movement, posture, and body language tasks

-- ============================================
-- MOVEMENT TASKS - POSTURE
-- ============================================

INSERT INTO task_bank (category, domain, intensity, instruction, subtext, requires, exclude_if, completion_type, duration_minutes, target_count, points, affirmation, is_core) VALUES

-- Posture basics (intensity 1-2)
('practice', 'movement', 1, 'Feminine posture reset. Hold for 60 seconds.', 'Feet together, hips shifted, shoulders back and down.', '{}', '{}', 'duration', 1, NULL, 10, 'Good girl. Posture aligned.', true),
('practice', 'movement', 1, 'Check your posture right now. Correct it.', 'Are you standing like her?', '{}', '{}', 'binary', NULL, NULL, 5, 'Good girl. She stands tall.', true),
('practice', 'movement', 1, 'Hip pop practice. Shift weight to one hip. Hold 30 seconds each side.', 'The classic feminine silhouette.', '{}', '{}', 'duration', 1, NULL, 10, 'Good girl. Hips aligned.', false),
('practice', 'movement', 2, '5-minute posture hold. Full feminine alignment.', 'Feel your body learning her shape.', '{}', '{}', 'duration', 5, NULL, 15, 'Good girl. Body memory building.', false),
('practice', 'movement', 2, 'Posture check every hour today. Correct each time.', 'Constant awareness becomes automatic.', '{}', '{}', 'count', NULL, 8, 15, 'Good girl. You stayed aware all day.', false),

-- Posture advanced (intensity 3-4)
('practice', 'movement', 3, 'Maintain feminine posture for 30 minutes while doing tasks.', 'Let it become unconscious.', '{"streakDays": 7}', '{}', 'duration', 30, NULL, 25, 'Good girl. Posture becoming natural.', false),
('practice', 'movement', 4, 'Full day feminine posture. No masculine relapses.', 'She moves through the whole day.', '{"phase": 2}', '{}', 'binary', NULL, NULL, 35, 'Good girl. A full day as her.', false);

-- ============================================
-- MOVEMENT TASKS - WALKING/GAIT
-- ============================================

INSERT INTO task_bank (category, domain, intensity, instruction, subtext, requires, exclude_if, completion_type, duration_minutes, target_count, points, affirmation, is_core) VALUES

-- Walking basics (intensity 1-2)
('practice', 'movement', 1, 'Walk across the room in her gait. Narrow steps, hips moving.', 'One foot almost in front of the other.', '{}', '{}', 'count', NULL, 3, 10, 'Good girl. You walked like her.', true),
('practice', 'movement', 1, 'Practice the narrow track walk. 10 steps.', 'Imagine a line. Walk on it.', '{}', '{}', 'count', NULL, 10, 10, 'Good girl. Graceful steps.', false),
('practice', 'movement', 2, '2-minute continuous feminine walk practice.', 'Back and forth. Let the hips flow.', '{}', '{}', 'duration', 2, NULL, 15, 'Good girl. Movement flowing.', false),
('practice', 'movement', 2, 'Walk to the bathroom femininely. Every time today.', 'Every trip is practice.', '{}', '{}', 'binary', NULL, NULL, 15, 'Good girl. Automatic feminine movement.', false),
('practice', 'movement', 2, 'Slow feminine walk. Half your normal speed. Feel each step.', 'Feminine movement is unhurried.', '{}', '{}', 'duration', 3, NULL, 15, 'Good girl. Graceful and unhurried.', false),

-- Walking intermediate (intensity 3)
('practice', 'movement', 3, '5-minute gait practice with full posture alignment.', 'Posture + gait + awareness.', '{"streakDays": 7}', '{}', 'duration', 5, NULL, 20, 'Good girl. Full body femininity.', false),
('practice', 'movement', 3, 'Practice walking while holding something. Purse position.', 'How does she carry things?', '{"streakDays": 14}', '{}', 'duration', 5, NULL, 20, 'Good girl. Natural and feminine.', false),
('practice', 'movement', 3, 'Walk in heels for 10 minutes. Let them teach your hips.', 'Heels force feminine gait.', '{"hasItem": ["heels"]}', '{}', 'duration', 10, NULL, 25, 'Good girl. Heels mastered.', false),

-- Walking advanced (intensity 4-5)
('practice', 'movement', 4, 'Walk femininely in public. Short errand.', 'She exists in the world now.', '{"phase": 2}', '{}', 'binary', NULL, NULL, 35, 'Good girl. Brave and feminine.', false),
('practice', 'movement', 5, 'Full day feminine gait. No masculine walking.', 'Complete transformation of movement.', '{"phase": 3}', '{}', 'binary', NULL, NULL, 50, 'Good girl. She walked all day.', false);

-- ============================================
-- MOVEMENT TASKS - SITTING
-- ============================================

INSERT INTO task_bank (category, domain, intensity, instruction, subtext, requires, exclude_if, completion_type, duration_minutes, target_count, points, affirmation, is_core) VALUES

-- Sitting basics (intensity 1-2)
('practice', 'movement', 1, 'Sit with knees together for 5 minutes.', 'Basic feminine sitting.', '{}', '{}', 'duration', 5, NULL, 10, 'Good girl. Knees together.', true),
('practice', 'movement', 1, 'Cross your legs at the knee. Hold for 2 minutes.', 'The classic feminine sit.', '{}', '{}', 'duration', 2, NULL, 10, 'Good girl. Legs crossed elegantly.', true),
('practice', 'movement', 2, 'Ankles crossed, knees together. 10 minutes.', 'Polite feminine posture.', '{}', '{}', 'duration', 10, NULL, 15, 'Good girl. Elegant and contained.', false),
('practice', 'movement', 2, 'Practice sitting down and standing up gracefully. 5 times.', 'The transition matters too.', '{}', '{}', 'count', NULL, 5, 15, 'Good girl. Graceful transitions.', false),
('practice', 'movement', 2, 'Sit femininely for your entire work session.', 'Hours of practice.', '{}', '{}', 'binary', NULL, NULL, 20, 'Good girl. Feminine all session.', false),

-- Sitting intermediate (intensity 3)
('practice', 'movement', 3, 'Royal sit practice. Both feet on floor, knees angled to one side.', 'Elegant and intentional.', '{"streakDays": 7}', '{}', 'duration', 5, NULL, 20, 'Good girl. Regal posture.', false),
('practice', 'movement', 3, 'No manspreading today. Catch yourself every time.', 'Unlearn the old habit.', '{}', '{}', 'binary', NULL, NULL, 25, 'Good girl. Space contained.', false),
('practice', 'movement', 3, 'Sit in a skirt/dress for 30 minutes. Feel how it changes your posture.', 'Clothing teaches movement.', '{"hasItem": ["skirt"]}', '{}', 'duration', 30, NULL, 25, 'Good girl. Skirt awareness.', false),

-- Sitting advanced (intensity 4)
('practice', 'movement', 4, 'Full day feminine sitting. Every chair. Every moment.', 'Automatic feminine posture.', '{"phase": 2}', '{}', 'binary', NULL, NULL, 35, 'Good girl. She sat beautifully all day.', false);

-- ============================================
-- MOVEMENT TASKS - HANDS & GESTURES
-- ============================================

INSERT INTO task_bank (category, domain, intensity, instruction, subtext, requires, exclude_if, completion_type, duration_minutes, target_count, points, affirmation, is_core) VALUES

-- Hand basics (intensity 1-2)
('practice', 'movement', 1, 'Rest your hands in your lap gently. One on top of the other.', 'Soft hands. Feminine rest.', '{}', '{}', 'duration', 2, NULL, 10, 'Good girl. Hands at rest.', true),
('practice', 'movement', 1, 'Practice relaxed fingers. No fists. 5 minutes awareness.', 'Feminine hands are never clenched.', '{}', '{}', 'duration', 5, NULL, 10, 'Good girl. Soft and relaxed.', false),
('practice', 'movement', 2, 'Hand on hip practice. Fingers pointing down or back. Hold 1 minute each side.', 'The feminine hip hand.', '{}', '{}', 'duration', 2, NULL, 15, 'Good girl. Confident and feminine.', false),
('practice', 'movement', 2, 'Touch your hair or face 5 times while talking today.', 'Women touch their face and hair more.', '{}', '{}', 'count', NULL, 5, 15, 'Good girl. Natural gestures.', false),
('practice', 'movement', 2, 'Practice limp wrist gestures while speaking. 3 minutes.', 'Loose wrists. Flowing movement.', '{}', '{}', 'duration', 3, NULL, 15, 'Good girl. Wrists relaxed.', false),

-- Hand intermediate (intensity 3)
('practice', 'movement', 3, 'Speak for 5 minutes using only feminine gestures.', 'Open palms. Flowing wrists. Contained space.', '{"streakDays": 7}', '{}', 'duration', 5, NULL, 20, 'Good girl. Expressive and feminine.', false),
('practice', 'movement', 3, 'Practice holding objects femininely. Phone, cup, pen.', 'How does she hold things?', '{}', '{}', 'duration', 5, NULL, 20, 'Good girl. Feminine grip.', false),
('practice', 'movement', 3, 'Wave goodbye femininely. Practice 5 variations.', 'The feminine wave is smaller, fingers together or wiggling.', '{}', '{}', 'count', NULL, 5, 20, 'Good girl. Cute wave.', false),

-- Hand advanced (intensity 4)
('practice', 'movement', 4, 'Full day feminine hand awareness. Catch every masculine gesture.', 'Hands reveal gender constantly.', '{"phase": 2}', '{}', 'binary', NULL, NULL, 35, 'Good girl. Hands were hers all day.', false);

-- ============================================
-- MOVEMENT TASKS - FULL BODY
-- ============================================

INSERT INTO task_bank (category, domain, intensity, instruction, subtext, requires, exclude_if, completion_type, duration_minutes, target_count, points, affirmation, is_core) VALUES

-- Full body basics (intensity 2)
('practice', 'movement', 2, 'Stretch like her. Gentle, contained, graceful movements.', 'Even stretching is gendered.', '{}', '{}', 'duration', 5, NULL, 15, 'Good girl. Graceful stretch.', false),
('practice', 'movement', 2, 'Move through a room without taking up extra space.', 'Feminine movement is contained.', '{}', '{}', 'binary', NULL, NULL, 15, 'Good girl. Space aware.', false),
('practice', 'movement', 2, 'Practice bending at the knees instead of waist to pick something up.', 'The feminine bend.', '{}', '{}', 'count', NULL, 5, 15, 'Good girl. Graceful bending.', false),

-- Full body intermediate (intensity 3)
('practice', 'movement', 3, 'Watch a YouTube video of feminine body language. Mirror it for 10 minutes.', 'Learn from examples.', '{}', '{}', 'duration', 10, NULL, 25, 'Good girl. Learning from her.', false),
('practice', 'movement', 3, 'Record yourself walking and sitting. Watch it back. Note improvements.', 'See what others see.', '{}', '{}', 'binary', NULL, NULL, 25, 'Good girl. Self-aware.', false),
('practice', 'movement', 3, 'Full feminine embodiment: posture + gait + sitting + hands. 15 minutes.', 'All elements together.', '{"streakDays": 14}', '{}', 'duration', 15, NULL, 30, 'Good girl. Fully embodied.', false),

-- Full body advanced (intensity 4-5)
('practice', 'movement', 4, '1 hour of complete feminine movement. Everything.', 'Sustained embodiment builds permanence.', '{"phase": 2}', '{}', 'duration', 60, NULL, 40, 'Good girl. One hour as her.', false),
('practice', 'movement', 4, 'Dance femininely to one song. Let your body flow.', 'Dancing reveals and trains movement.', '{}', '{"ginaHome": true}', 'binary', NULL, NULL, 30, 'Good girl. She danced.', false),
('practice', 'movement', 5, 'Full day feminine embodiment. Every movement. Every gesture.', 'She lives in this body now.', '{"phase": 3}', '{}', 'binary', NULL, NULL, 60, 'Good girl. A complete day as her.', false);

-- ============================================
-- MOVEMENT TASKS - SPECIFIC SCENARIOS
-- ============================================

INSERT INTO task_bank (category, domain, intensity, instruction, subtext, requires, exclude_if, completion_type, duration_minutes, target_count, points, affirmation, is_core) VALUES

-- Scenario tasks (intensity 2-4)
('practice', 'movement', 2, 'Practice getting into a car femininely. Sit first, then swing legs in.', 'The elegant entry.', '{}', '{}', 'count', NULL, 3, 15, 'Good girl. Graceful entry.', false),
('practice', 'movement', 2, 'Practice going up stairs femininely. One step at a time, hips swaying slightly.', 'Every stair is practice.', '{}', '{}', 'binary', NULL, NULL, 15, 'Good girl. Graceful ascent.', false),
('practice', 'movement', 3, 'Practice receiving something (package, coffee) with both hands, slight bow.', 'The polite feminine receive.', '{}', '{}', 'count', NULL, 3, 20, 'Good girl. Gracious receipt.', false),
('practice', 'movement', 3, 'Practice apologizing for bumping into something even if alone.', '"Oh, sorry!" - the feminine reflex.', '{}', '{}', 'count', NULL, 3, 15, 'Good girl. Socially feminine.', false),
('practice', 'movement', 4, 'Feminine movement during a video call. Posture, hands, head tilts.', 'Others see her now.', '{"phase": 2}', '{}', 'binary', NULL, NULL, 35, 'Good girl. Visible femininity.', false);

-- ============================================
-- VERIFY INSERTION
-- ============================================

SELECT
  intensity,
  COUNT(*) as task_count,
  STRING_AGG(SUBSTRING(instruction, 1, 40), ' | ') as sample_tasks
FROM task_bank
WHERE domain = 'movement'
GROUP BY intensity
ORDER BY intensity;
