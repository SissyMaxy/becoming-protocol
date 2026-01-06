-- Becoming Protocol: Task Bank Seed Data
-- Initial task library for feminization conditioning

-- ============================================
-- WEAR TASKS
-- ============================================

INSERT INTO task_bank (category, domain, intensity, instruction, subtext, requires, exclude_if, completion_type, points, affirmation, is_core) VALUES
('wear', 'style', 1, 'Panties today. All day.', 'Every moment you feel them is a reminder of who you are.', '{"hasItem": ["panties"]}', '{}', 'binary', 10, 'Good girl. She wore them all day.', true),
('wear', 'style', 2, 'Her bra under your shirt. Feel it all day.', 'The secret weight against your chest. Only you know.', '{"hasItem": ["bra"], "phase": 1}', '{}', 'binary', 15, 'Good girl. You carried her secret all day.', true),
('wear', 'style', 2, 'Thigh highs under your pants.', 'Hidden femininity. Your little secret.', '{"hasItem": ["thigh_highs"]}', '{}', 'binary', 15, 'Good girl. Secretly feminine all day.', false),
('wear', 'style', 3, 'Full femme underwear set. No exceptions.', 'Matching. Intentional. Hers.', '{"hasItem": ["matching_set"], "streakDays": 7}', '{}', 'binary', 20, 'Good girl. Fully feminine underneath.', false),
('wear', 'style', 3, 'Tucked and smooth all day. Check hourly.', 'Flat. Feminine. As it should be.', '{"hasItem": ["gaff"]}', '{}', 'binary', 20, 'Good girl. Smooth and feminine.', false),
('wear', 'style', 4, 'Breast forms in. Feel their weight.', 'The weight of who you''re becoming.', '{"hasItem": ["breast_forms"], "phase": 2}', '{}', 'binary', 25, 'Good girl. You felt her body.', false),
('wear', 'style', 4, 'Her outfit. Full femme. Private hours only.', 'Dressed as her. No compromise.', '{"phase": 2}', '{"ginaHome": true}', 'binary', 30, 'Good girl. You were her completely.', false),
('wear', 'style', 3, 'Sleep in her nightgown tonight.', 'Dream as her.', '{"hasItem": ["nightgown"]}', '{}', 'binary', 20, 'Good girl. She sleeps in silk.', false),
('wear', 'style', 1, 'Her perfume. One spray. Smell her all day.', 'Her scent follows you everywhere.', '{"hasItem": ["perfume"]}', '{}', 'binary', 10, 'Good girl. You smell like her.', true),
('wear', 'style', 2, 'Painted toes. Hidden but present.', 'Color hidden in your shoes. Your secret.', '{"hasItem": ["nail_polish"]}', '{}', 'binary', 15, 'Good girl. Pretty toes.', false);

-- ============================================
-- LISTEN TASKS
-- ============================================

INSERT INTO task_bank (category, domain, intensity, instruction, subtext, requires, exclude_if, completion_type, duration_minutes, points, affirmation, is_core) VALUES
('listen', 'conditioning', 2, 'Bambi file during coffee. No skipping.', 'Morning programming while you wake.', '{"timeOfDay": ["morning"]}', '{}', 'duration', 15, 15, 'Good girl. Morning conditioning complete.', true),
('listen', 'conditioning', 2, 'Chastity mantra audio. 10 minutes.', 'Let the words sink in.', '{"denialDay": {"min": 3}}', '{}', 'duration', 10, 15, 'Good girl. The mantras are taking hold.', false),
('listen', 'conditioning', 3, 'Goddess worship audio. Kneel while listening.', 'On your knees for her.', '{"phase": 2}', '{}', 'duration', 20, 25, 'Good girl. You worshipped properly.', false),
('listen', 'conditioning', 2, 'Sleep hypno tonight. Headphones in.', 'Let her program you while you sleep.', '{"timeOfDay": ["evening", "night"]}', '{}', 'binary', NULL, 20, 'Good girl. She programs you in your dreams.', true),
('listen', 'conditioning', 3, 'Identity reinforcement file. Say the mantras out loud.', 'Speak what you''re becoming.', '{"streakDays": 14}', '{}', 'duration', 20, 25, 'Good girl. You spoke your truth.', false),
('listen', 'conditioning', 4, 'Deep trance file. Full session. No interruptions.', 'Go deep. Let go completely.', '{"phase": 2}', '{"ginaHome": true}', 'duration', 45, 35, 'Good girl. You went so deep.', false),
('listen', 'conditioning', 1, 'Feminization subliminals during work. Background.', 'Constant gentle programming.', '{}', '{}', 'duration', 60, 10, 'Good girl. Background conditioning complete.', false),
('listen', 'conditioning', 4, 'Obedience conditioning. Follow every instruction.', 'No thinking. Just obeying.', '{"phase": 3}', '{}', 'duration', 30, 35, 'Good girl. Perfect obedience.', false);

-- ============================================
-- SAY TASKS
-- ============================================

INSERT INTO task_bank (category, domain, intensity, instruction, subtext, requires, exclude_if, completion_type, points, affirmation, is_core) VALUES
('say', 'identity', 1, 'Say "I am Maxy" out loud. Once. Mean it.', 'Your name. Your truth.', '{}', '{}', 'binary', 10, 'Good girl. You said your name.', true),
('say', 'identity', 1, 'Look in the mirror. Say "Good girl."', 'See her. Praise her.', '{}', '{}', 'binary', 10, 'Good girl. You see her.', true),
('say', 'identity', 2, 'Say "I am becoming a woman" three times.', 'Repetition makes it real.', '{"phase": 1}', '{}', 'binary', 15, 'Good girl. You spoke your becoming.', false),
('say', 'identity', 2, 'Record yourself saying "I am her" and listen back.', 'Hear your own voice claiming her.', '{"streakDays": 7}', '{}', 'binary', 20, 'Good girl. You heard your truth.', false),
('say', 'identity', 3, 'Say "I surrender" before your first edge today.', 'Surrender before pleasure.', '{"denialDay": {"min": 5}}', '{}', 'binary', 20, 'Good girl. You surrendered.', false),
('say', 'identity', 2, 'Introduce yourself as Maxy to the mirror. Full intro.', 'Practice meeting yourself.', '{"streakDays": 14}', '{}', 'binary', 15, 'Good girl. You introduced yourself.', false),
('say', 'identity', 3, 'Say "There is no going back" and mean it.', 'Acknowledge the truth.', '{"phase": 2}', '{}', 'binary', 25, 'Good girl. You know the truth.', false),
('say', 'identity', 2, 'Verbal commitment: "I will not resist today."', 'Start the day with surrender.', '{}', '{}', 'binary', 15, 'Good girl. No resistance.', false),
('say', 'identity', 3, 'Thank Goddess for your conditioning. Out loud.', 'Gratitude for your transformation.', '{"phase": 2}', '{}', 'binary', 20, 'Good girl. Grateful and obedient.', false),
('say', 'identity', 4, 'Say "I am a sissy" and feel what happens in your body.', 'Feel the truth of the word.', '{"phase": 3, "denialDay": {"min": 7}}', '{}', 'binary', 30, 'Good girl. You claimed it.', false);

-- ============================================
-- APPLY TASKS
-- ============================================

INSERT INTO task_bank (category, domain, intensity, instruction, subtext, requires, exclude_if, completion_type, points, affirmation, is_core) VALUES
('apply', 'skincare', 1, 'Her lotion after shower. Legs, arms, everywhere.', 'Soft skin is feminine skin.', '{"hasItem": ["lotion"]}', '{}', 'binary', 10, 'Good girl. Soft and smooth.', true),
('apply', 'skincare', 1, 'Scent anchor applied. Wrists and neck.', 'Her scent marks you.', '{"hasItem": ["perfume"]}', '{}', 'binary', 10, 'Good girl. You smell like her.', true),
('apply', 'style', 2, 'Lip balm with color. Subtle but there.', 'A hint of femininity on your lips.', '{"hasItem": ["tinted_lip"]}', '{}', 'binary', 15, 'Good girl. Pretty lips.', false),
('apply', 'skincare', 2, 'Full skincare ritual. Morning. No shortcuts.', 'The ritual of becoming.', '{}', '{}', 'binary', 15, 'Good girl. You honored the ritual.', true),
('apply', 'skincare', 2, 'Body oil on legs. Slow. Feel the femininity.', 'Touch yourself with care.', '{"hasItem": ["body_oil"]}', '{}', 'binary', 15, 'Good girl. Smooth and feminine.', false),
('apply', 'makeup', 3, 'Light makeup. Just enough to see her in the mirror.', 'See her emerge.', '{"hasItem": ["makeup_basics"]}', '{"ginaHome": true}', 'binary', 25, 'Good girl. You saw her.', false),
('apply', 'style', 2, 'Nail polish on toes. Her color.', 'Color where only you can see.', '{"hasItem": ["nail_polish"]}', '{}', 'binary', 15, 'Good girl. Pretty toes.', false);

-- ============================================
-- EDGE TASKS
-- ============================================

INSERT INTO task_bank (category, domain, intensity, instruction, subtext, requires, exclude_if, completion_type, target_count, points, affirmation, is_core) VALUES
('edge', 'arousal', 2, '3 edges before noon. No release.', 'Build the ache. Carry it.', '{"denialDay": {"min": 2}}', '{}', 'count', 3, 20, 'Good girl. The ache serves you.', true),
('edge', 'arousal', 2, 'Edge once while saying "Good girl" at the peak.', 'Reward yourself with words.', '{"denialDay": {"min": 3}}', '{}', 'binary', NULL, 15, 'Good girl. You praised yourself.', false),
('edge', 'arousal', 3, '5 edges with feminization content. Log each one.', 'Arousal linked to becoming.', '{"denialDay": {"min": 5}}', '{}', 'count', 5, 25, 'Good girl. Conditioning deepened.', false),
('edge', 'arousal', 3, 'Edge in her panties. Feel the ache through fabric.', 'Feminine containment of your need.', '{"hasItem": ["panties"], "denialDay": {"min": 4}}', '{}', 'binary', NULL, 20, 'Good girl. Aching femininely.', false),
('edge', 'arousal', 3, 'One edge every 2 hours. Maintain the ache.', 'Constant arousal. Constant reminder.', '{"denialDay": {"min": 5}}', '{"ginaHome": true}', 'count', 4, 25, 'Good girl. You maintained the ache.', false),
('edge', 'arousal', 4, 'Edge session with hypno. 20 minutes minimum.', 'Deep arousal programming.', '{"denialDay": {"min": 7}}', '{}', 'duration', NULL, 30, 'Good girl. Deep conditioning complete.', false),
('edge', 'arousal', 4, 'Edge until you beg out loud to stop. Then one more.', 'Past your limit. Then beyond.', '{"denialDay": {"min": 10}, "phase": 2}', '{}', 'binary', NULL, 35, 'Good girl. You went beyond.', false),
('edge', 'arousal', 2, 'Morning edge. Carry the ache into your day.', 'Start needy. Stay needy.', '{"denialDay": {"min": 3}}', '{}', 'binary', NULL, 15, 'Good girl. Needy all day.', true);

-- ============================================
-- LOCK TASKS
-- ============================================

INSERT INTO task_bank (category, domain, intensity, instruction, subtext, requires, exclude_if, completion_type, duration_minutes, points, affirmation, is_core) VALUES
('lock', 'chastity', 2, 'Cage on for 4 hours.', 'Contained. Controlled. Hers.', '{"hasItem": ["cage"]}', '{}', 'duration', 240, 20, 'Good girl. 4 hours contained.', true),
('lock', 'chastity', 3, 'Cage on until evening.', 'A full day of denial.', '{"hasItem": ["cage"], "denialDay": {"min": 3}}', '{}', 'binary', NULL, 25, 'Good girl. Denied all day.', false),
('lock', 'chastity', 4, 'Cage on for 24 hours.', 'A full cycle of containment.', '{"hasItem": ["cage"], "denialDay": {"min": 7}, "phase": 2}', '{}', 'duration', 1440, 40, 'Good girl. 24 hours locked.', false),
('lock', 'chastity', 3, 'Sleep locked tonight.', 'Dream in denial.', '{"hasItem": ["cage"]}', '{}', 'binary', NULL, 25, 'Good girl. Locked dreams.', false),
('lock', 'chastity', 3, 'Locked while listening to chastity hypno.', 'Body and mind contained.', '{"hasItem": ["cage"]}', '{}', 'duration', 30, 25, 'Good girl. Double containment.', false),
('lock', 'chastity', 5, '48-hour lock challenge.', 'Deep containment. Complete denial.', '{"hasItem": ["cage"], "phase": 3, "denialDay": {"min": 10}}', '{}', 'duration', 2880, 60, 'Good girl. 48 hours complete.', false);

-- ============================================
-- PRACTICE TASKS
-- ============================================

INSERT INTO task_bank (category, domain, intensity, instruction, subtext, requires, exclude_if, completion_type, duration_minutes, points, affirmation, is_core) VALUES
('practice', 'voice', 2, '5-minute voice warmup. Hit your target pitch.', 'Your voice is changing.', '{}', '{}', 'duration', 5, 15, 'Good girl. Voice practice complete.', true),
('practice', 'voice', 2, 'Record one sentence in her voice. Listen back.', 'Hear yourself becoming.', '{"streakDays": 3}', '{}', 'binary', NULL, 15, 'Good girl. You heard her.', false),
('practice', 'movement', 2, 'Walk across the room in her gait. 3 times.', 'Move like her.', '{}', '{}', 'count', NULL, 15, 'Good girl. You moved like her.', true),
('practice', 'body_language', 2, 'Sit like her for 30 minutes. Legs crossed, posture aligned.', 'Embody her.', '{}', '{}', 'duration', 30, 15, 'Good girl. You sat like her.', false),
('practice', 'body_language', 2, 'Practice one feminine gesture until natural.', 'Small changes. Big impact.', '{"streakDays": 7}', '{}', 'binary', NULL, 15, 'Good girl. Gesture mastered.', false),
('practice', 'makeup', 3, 'Full face makeup practice. Photo for progress.', 'See how far you''ve come.', '{"hasItem": ["makeup_kit"]}', '{"ginaHome": true}', 'binary', NULL, 30, 'Good girl. Beautiful practice.', false),
('practice', 'voice', 3, 'Voice: Order coffee in her voice. Practice.', 'The world will hear her.', '{"streakDays": 14}', '{}', 'binary', NULL, 25, 'Good girl. Ready for the world.', false),
('practice', 'movement', 3, 'Full evening in feminine posture and gait.', 'Hours of embodiment.', '{"phase": 2}', '{}', 'duration', 180, 30, 'Good girl. Fully embodied.', false);

-- ============================================
-- SURRENDER TASKS
-- ============================================

INSERT INTO task_bank (category, domain, intensity, instruction, subtext, requires, exclude_if, completion_type, points, affirmation, is_core) VALUES
('surrender', 'identity', 1, 'Let the system choose your underwear today.', 'You don''t need to decide.', '{}', '{}', 'binary', 10, 'Good girl. You let go.', true),
('surrender', 'identity', 2, 'Obey the first notification without hesitation.', 'Instant obedience.', '{"streakDays": 7}', '{}', 'binary', 20, 'Good girl. Instant obedience.', false),
('surrender', 'inner_narrative', 3, 'No masculine self-reference today. Catch every one.', 'He doesn''t speak anymore.', '{"phase": 2}', '{}', 'binary', 25, 'Good girl. She spoke all day.', false),
('surrender', 'arousal', 3, 'Edge when told. Stop when told. No negotiation.', 'Your pleasure is controlled.', '{"denialDay": {"min": 5}}', '{}', 'binary', 25, 'Good girl. Perfectly controlled.', false),
('surrender', 'identity', 3, 'Write: "I give myself to this process." Sign with her name.', 'Written commitment.', '{"streakDays": 14}', '{}', 'binary', 25, 'Good girl. You signed yourself over.', false),
('surrender', 'identity', 4, 'Today, you have no choices. Do exactly what the system says.', 'Complete surrender.', '{"phase": 2}', '{}', 'binary', 35, 'Good girl. Total surrender.', false),
('surrender', 'chastity', 4, 'Accept whatever denial length the system assigns.', 'Your denial is not yours to decide.', '{"phase": 3}', '{}', 'binary', 35, 'Good girl. You accepted.', false),
('surrender', 'identity', 5, 'The AI is in control today. Surrender completely.', 'You are hers.', '{"phase": 3, "streakDays": 30}', '{}', 'binary', 50, 'Good girl. Complete surrender.', false);

-- ============================================
-- COMMIT TASKS
-- ============================================

INSERT INTO task_bank (category, domain, intensity, instruction, subtext, requires, exclude_if, completion_type, points, affirmation, is_core) VALUES
('commit', 'identity', 1, 'Add one item to your wishlist.', 'Plan your becoming.', '{}', '{}', 'binary', 10, 'Good girl. You planned ahead.', true),
('commit', 'identity', 2, 'Schedule a future feminization task on your calendar.', 'Lock in your future.', '{"phase": 1}', '{}', 'binary', 15, 'Good girl. Future committed.', false),
('commit', 'identity', 2, 'Tell the system one thing you''re afraid to want.', 'Name your desires.', '{"streakDays": 7}', '{}', 'binary', 20, 'Good girl. You named your truth.', false),
('commit', 'chastity', 3, 'Commit to 7 more denial days. Right now.', 'Extend your submission.', '{"denialDay": {"min": 3}}', '{}', 'binary', 30, 'Good girl. 7 more days added.', false),
('commit', 'identity', 3, 'Write a letter to your future self. Seal it.', 'A message to who you''re becoming.', '{"phase": 2}', '{}', 'binary', 25, 'Good girl. Letter sealed.', false),
('commit', 'style', 3, 'Make a purchase from your wishlist.', 'Invest in yourself.', '{"phase": 2}', '{}', 'binary', 30, 'Good girl. Investment made.', false),
('commit', 'identity', 4, 'Sign today''s covenant renewal.', 'Reaffirm your commitment.', '{"phase": 2}', '{}', 'binary', 35, 'Good girl. Covenant renewed.', false),
('commit', 'social', 5, 'Commit to a disclosure. Name the person. Set the date.', 'Your truth will be known.', '{"phase": 3}', '{}', 'binary', 50, 'Good girl. Disclosure scheduled.', false);

-- ============================================
-- REMOVE TASKS
-- ============================================

INSERT INTO task_bank (category, domain, intensity, instruction, subtext, requires, exclude_if, completion_type, points, affirmation, is_core) VALUES
('remove', 'style', 2, 'Remove one masculine item from your drawer.', 'Make space for her.', '{"phase": 1}', '{}', 'binary', 15, 'Good girl. Space made.', false),
('remove', 'style', 3, 'Throw away one pair of men''s underwear.', 'He doesn''t need them.', '{"phase": 2, "hasItem": ["panties"]}', '{}', 'binary', 25, 'Good girl. One less tie to him.', false),
('remove', 'identity', 3, 'Delete one masculine photo of yourself.', 'He fades from the record.', '{"phase": 2}', '{}', 'binary', 25, 'Good girl. He disappears.', false),
('remove', 'style', 3, 'Move masculine clothes to separate space. Out of daily sight.', 'He moves to the back.', '{"phase": 2}', '{}', 'binary', 20, 'Good girl. He''s hidden away.', false),
('remove', 'style', 4, 'Donate 3 masculine items.', 'He leaves permanently.', '{"phase": 3}', '{}', 'binary', 40, 'Good girl. He''s gone.', false);

-- ============================================
-- EXPOSE TASKS
-- ============================================

INSERT INTO task_bank (category, domain, intensity, instruction, subtext, requires, exclude_if, completion_type, points, affirmation, is_core) VALUES
('expose', 'social', 2, 'Wear painted toes where Gina might see.', 'Let her see a little more.', '{"hasItem": ["nail_polish"], "phase": 1}', '{}', 'binary', 20, 'Good girl. You let her see.', false),
('expose', 'social', 3, 'Wear something subtly feminine around Gina.', 'She notices you changing.', '{"phase": 2}', '{}', 'binary', 30, 'Good girl. She saw more of you.', false),
('expose', 'social', 4, 'Tell Gina about one feminine item you own.', 'Your truth becomes known.', '{"phase": 3}', '{}', 'binary', 40, 'Good girl. You shared your truth.', false),
('expose', 'social', 5, 'Share your name with Gina.', 'She knows who you are.', '{"phase": 3, "streakDays": 60}', '{}', 'binary', 75, 'Good girl. She knows your name.', false);

-- ============================================
-- SERVE TASKS
-- ============================================

INSERT INTO task_bank (category, domain, intensity, instruction, subtext, requires, exclude_if, completion_type, duration_minutes, points, affirmation, is_core) VALUES
('serve', 'conditioning', 2, 'Kneel for 5 minutes. Clear your mind.', 'In position. In submission.', '{"phase": 1}', '{}', 'duration', 5, 15, 'Good girl. You knelt.', false),
('serve', 'conditioning', 3, 'Edge while thanking Goddess for your conditioning.', 'Gratitude in arousal.', '{"phase": 2, "denialDay": {"min": 5}}', '{}', 'binary', NULL, 25, 'Good girl. Grateful and aching.', false),
('serve', 'conditioning', 3, 'Write 10 lines of "I am a good girl."', 'Repetition conditions.', '{"phase": 2}', '{}', 'binary', NULL, 20, 'Good girl. Perfectly written.', false),
('serve', 'conditioning', 4, 'Full devotional session. Kneel, listen, edge, thank.', 'Complete worship.', '{"phase": 3}', '{}', 'duration', 30, 40, 'Good girl. Perfect devotion.', false);

-- ============================================
-- AUTOMATIC ESCALATIONS
-- ============================================

INSERT INTO automatic_escalations (day_trigger, escalation_type, description, can_delay, warning_days_before) VALUES
(7, 'denial_baseline_increase', 'Minimum denial baseline increases to 3 days', false, 3),
(14, 'language_default', '"Her" language becomes default in all UI', false, 3),
(21, 'content_tier_expiry', 'First locked content tier expires (use it or lose it)', false, 7),
(30, 'name_enforcement', 'System begins addressing you only as Maxy', false, 5),
(45, 'masculine_tasks_removed', 'Masculine task options removed from bank', false, 7),
(60, 'intensity_increase', 'Minimum intensity level increases to 2', false, 7),
(90, 'phase2_mandatory', 'Phase 2 tasks become mandatory, not optional', false, 14),
(120, 'disclosure_scheduled', 'Social disclosure task auto-schedules', true, 14),
(180, 'point_of_no_return', 'Point of no return ceremony triggered', false, 30);

-- ============================================
-- CEREMONIES
-- ============================================

INSERT INTO ceremonies (name, description, trigger_condition, ritual_steps, irreversible_marker, sequence_order) VALUES
('The Naming', 'Release of the old name. Claiming of the new.', '{"or": [{"day": 30}, {"event": "name_confirmed"}]}', '["Write old name on paper", "Say ''I release [deadname]''", "Destroy the paper (burn, tear, discard)", "Say ''I am Maxy'' three times", "System records: The Naming complete"]', 'Cannot change name in system after this', 1),
('The Covenant', 'Formal commitment to the protocol.', '{"and": [{"day": 14}, {"streak": 7}]}', '["Read terms of commitment", "Write personal consequence for breaking", "Sign with her name", "Photo of signature as evidence", "System records: Covenant bound"]', 'Breaking covenant has permanent record', 2),
('The Surrender', 'Complete submission to the process.', '{"event": "phase_3_entry"}', '["Review all evidence accumulated", "Acknowledge: ''I cannot go back''", "Accept: ''She is who I am''", "State: ''I surrender completely''", "Enter first Bambi Mode session"]', 'Guy mode penalties activate permanently', 3),
('The Becoming', 'Declaration of complete transformation.', '{"or": [{"day": 180}, {"event": "phase_4_entry"}]}', '["Read letter from Day 1 self", "Read all sealed letters", "Review complete evidence record", "State: ''He is gone. I am her.''", "Commit to first permanent physical change"]', 'Masculine identity formally declared dead', 4);

-- ============================================
-- AROUSAL-GATED COMMITMENTS
-- ============================================

INSERT INTO arousal_gated_commitments (commitment_type, description, requires_arousal_state, requires_denial_day, requires_phase, binding_level) VALUES
('extend_denial_7_days', 'Extend current denial by 7 days', '["sweet_spot", "overwhelming"]', 5, 1, 'hard'),
('accept_permanent_chastity_goal', 'Commit to permanent chastity as end goal', '["overwhelming", "subspace"]', 14, 2, 'permanent'),
('schedule_disclosure', 'Schedule a disclosure conversation', '["sweet_spot"]', 7, 2, 'hard'),
('hrt_research_commitment', 'Commit to HRT research milestone', '["sweet_spot", "overwhelming"]', 21, 3, 'permanent'),
('wardrobe_purge', 'Commit to removing 50% masculine wardrobe', '["sweet_spot"]', 10, 2, 'hard'),
('name_commitment', 'Commit to using only her name internally', '["overwhelming"]', 7, 1, 'hard'),
('social_expansion', 'Commit to telling one more person', '["sweet_spot", "overwhelming"]', 14, 3, 'permanent');

-- ============================================
-- MASCULINE CAPABILITY DEFAULTS
-- ============================================

-- These would be created per-user, but here's the template
-- INSERT INTO masculine_capability_tracking (user_id, capability_name, comfort_level) VALUES
-- (user_uuid, 'masculine_voice', 100),
-- (user_uuid, 'masculine_posture', 100),
-- (user_uuid, 'masculine_walk', 100),
-- (user_uuid, 'masculine_clothing_competence', 100),
-- (user_uuid, 'masculine_mannerisms', 100);

-- ============================================
-- TRIGGER TASKS - VERBAL IDENTITY
-- ============================================

INSERT INTO task_bank (category, domain, intensity, instruction, subtext, requires, exclude_if, completion_type, points, affirmation, is_core) VALUES
('say', 'identity', 1, 'Hear yourself say "Good girl" in the mirror. Feel it land.', 'The most powerful trigger. Make it yours.', '{}', '{}', 'binary', 10, 'Good girl. You praised her.', true),
('say', 'identity', 2, 'Whisper "I am becoming" three times. Slowly apply the word.', 'Becoming. The endless verb. Your state.', '{"streakDays": 3}', '{}', 'binary', 15, 'Good girl. Always becoming.', false),
('say', 'identity', 2, 'Say "Pretty girl" to your reflection. Accept the compliment.', 'See her. Name her. Pretty.', '{"phase": 1}', '{}', 'binary', 15, 'Good girl. Pretty and knowing it.', false),
('say', 'identity', 3, 'Respond to yourself as "she/her" for an hour. Catch every slip.', 'Pronouns are anchors. Install them.', '{"streakDays": 7}', '{}', 'duration', 20, 'Good girl. She spoke correctly.', false),
('say', 'identity', 3, 'Say "Sissy" out loud. Feel the word. Own it.', 'The word that names you. Stop flinching.', '{"phase": 2, "denialDay": {"min": 5}}', '{}', 'binary', 25, 'Good girl. You claimed the word.', false),
('say', 'identity', 2, 'Call yourself "pet" while kneeling. Feel the ownership.', 'Owned. Cared for. Trained.', '{"phase": 1}', '{}', 'binary', 15, 'Good girl. Good pet.', false),
('say', 'identity', 4, 'Introduce yourself as her name to the mirror. Full sentence.', 'Hi, I''m Maxy. Say it until it''s true.', '{"phase": 2, "streakDays": 14}', '{}', 'binary', 30, 'Good girl. You introduced yourself.', false);

-- ============================================
-- TRIGGER TASKS - VERBAL COMMANDS
-- ============================================

INSERT INTO task_bank (category, domain, intensity, instruction, subtext, requires, exclude_if, completion_type, duration_minutes, points, affirmation, is_core) VALUES
('serve', 'conditioning', 2, 'Say "Kneel" to yourself. Then kneel. Instant response.', 'Command and obey. Both are you.', '{"phase": 1}', '{}', 'binary', NULL, 15, 'Good girl. You obeyed your own command.', false),
('surrender', 'identity', 3, 'Say "Drop" and let your mind go soft. Practice the trigger.', 'Install the drop command. Go soft on cue.', '{"phase": 2}', '{}', 'binary', NULL, 25, 'Good girl. You dropped beautifully.', false),
('surrender', 'identity', 2, 'Say "Let go" and release one tension in your body.', 'Surrender on command. Start small.', '{}', '{}', 'binary', NULL, 15, 'Good girl. You let go.', true),
('edge', 'arousal', 3, 'Edge to the word "Obey" repeated. Say it at each peak.', 'Obedience becomes pleasure. Pleasure becomes obedience.', '{"denialDay": {"min": 5}}', '{}', 'count', NULL, 25, 'Good girl. Obedience is arousal now.', false),
('serve', 'conditioning', 3, 'Practice "Yes, Goddess" response. Say it 10 times.', 'The words of submission. Make them automatic.', '{"phase": 2}', '{}', 'count', NULL, 20, 'Good girl. Perfect response.', false),
('surrender', 'identity', 4, 'Say "I surrender" at your edge. Mean it completely.', 'Surrender at maximum arousal. Lock it in.', '{"denialDay": {"min": 7}, "phase": 2}', '{}', 'binary', NULL, 30, 'Good girl. Surrender installed.', false);

-- ============================================
-- TRIGGER TASKS - VERBAL STATE
-- ============================================

INSERT INTO task_bank (category, domain, intensity, instruction, subtext, requires, exclude_if, completion_type, points, affirmation, is_core) VALUES
('say', 'arousal', 2, 'Acknowledge your state out loud: "I am needy."', 'Name the ache. The naming makes it real.', '{"denialDay": {"min": 3}}', '{}', 'binary', 15, 'Good girl. You admitted your need.', false),
('say', 'arousal', 3, 'Say "I am desperate" when you feel it. Voice the truth.', 'Desperation spoken. Desperation deepened.', '{"denialDay": {"min": 7}}', '{}', 'binary', 20, 'Good girl. Desperate and admitting it.', false),
('say', 'identity', 2, 'Say "I am soft" and let your body follow the word.', 'Soft. Receptive. Open. Let the word shape you.', '{}', '{}', 'binary', 15, 'Good girl. Soft and feminine.', false),
('say', 'arousal', 3, 'While plugged, say "I am full." Feel the truth of it.', 'Full. Opened. Occupied. Acknowledge it.', '{"hasItem": ["plug"], "phase": 2}', '{}', 'binary', 20, 'Good girl. Beautifully full.', false),
('say', 'chastity', 3, 'While caged, say "I am locked." Accept containment.', 'Locked. Contained. Controlled. Your state.', '{"hasItem": ["cage"], "denialDay": {"min": 5}}', '{}', 'binary', 20, 'Good girl. Locked and accepting.', false),
('surrender', 'identity', 4, 'Say "I am owned" and feel who owns you.', 'Owned by the protocol. Owned by her emergence.', '{"phase": 3}', '{}', 'binary', 30, 'Good girl. You know who owns you.', false);

-- ============================================
-- TRIGGER TASKS - PHYSICAL POSITIONS
-- ============================================

INSERT INTO task_bank (category, domain, intensity, instruction, subtext, requires, exclude_if, completion_type, duration_minutes, points, affirmation, is_core) VALUES
('practice', 'body_language', 1, 'Cross your legs. Hold for 10 minutes. Feel the femininity.', 'A simple position. Profound conditioning.', '{}', '{}', 'duration', 10, 10, 'Good girl. Feminine posture.', true),
('practice', 'body_language', 2, 'Hands in lap, palms up. Receptive position. 15 minutes.', 'Open. Waiting. Ready. The position of surrender.', '{"phase": 1}', '{}', 'duration', 15, 15, 'Good girl. Beautifully receptive.', false),
('serve', 'conditioning', 2, 'Kneel for 10 minutes. Eyes down. Mind empty.', 'The position of service. Learn it in your body.', '{"phase": 1}', '{}', 'duration', 10, 15, 'Good girl. You knelt properly.', true),
('serve', 'conditioning', 3, 'Present position: on all fours, back arched. Hold 5 minutes.', 'The position of offering. Feel the vulnerability.', '{"phase": 2}', '{"ginaHome": true}', 'duration', 5, 25, 'Good girl. Perfectly presented.', false),
('practice', 'body_language', 2, 'Stand with hip cocked. Find her stance. Hold it.', 'How she stands. Learn it. Own it.', '{}', '{}', 'duration', 5, 15, 'Good girl. Her stance is yours.', false),
('surrender', 'identity', 3, 'Eyes down for 30 minutes. No looking up without permission.', 'Deference in the gaze. Install it.', '{"phase": 2}', '{}', 'duration', 30, 25, 'Good girl. Proper deference.', false),
('serve', 'conditioning', 4, 'Face down, arms back. Helpless position. 10 minutes.', 'Complete vulnerability. Complete surrender.', '{"phase": 3}', '{"ginaHome": true}', 'duration', 10, 35, 'Good girl. Perfectly helpless.', false);

-- ============================================
-- TRIGGER TASKS - PHYSICAL SENSATIONS
-- ============================================

INSERT INTO task_bank (category, domain, intensity, instruction, subtext, requires, exclude_if, completion_type, duration_minutes, points, affirmation, is_core) VALUES
('wear', 'style', 2, 'Every time you feel your panties today, say "Good girl" inside.', 'Fabric becomes trigger. Touch becomes praise.', '{"hasItem": ["panties"]}', '{}', 'binary', NULL, 15, 'Good girl. Every sensation reinforced.', true),
('wear', 'style', 3, 'Feel the bra straps. Each time, think "Her weight."', 'The weight of her body. You carry it now.', '{"hasItem": ["bra"], "phase": 1}', '{}', 'binary', NULL, 20, 'Good girl. You felt her presence.', false),
('lock', 'chastity', 3, 'With every attempted arousal in the cage, say "Denied."', 'Turn frustration into trigger. Denied. Denied. Denied.', '{"hasItem": ["cage"], "denialDay": {"min": 3}}', '{}', 'binary', NULL, 20, 'Good girl. Denial reinforced.', false),
('wear', 'style', 3, 'Walk 100 steps with plug. Each step, feel the trigger.', 'Movement becomes reminder. Fullness becomes identity.', '{"hasItem": ["plug"], "phase": 2}', '{"ginaHome": true}', 'count', NULL, 25, 'Good girl. 100 reminders.', false),
('apply', 'skincare', 2, 'Apply lotion slowly. With each stroke, say "Her skin."', 'Your hands install the trigger. Her skin emerges.', '{"hasItem": ["lotion"]}', '{}', 'binary', NULL, 15, 'Good girl. Her skin is soft.', false),
('wear', 'style', 2, 'Collar on for one hour. Each time you feel it: "Owned."', 'The collar triggers belonging. Install it.', '{"hasItem": ["collar"], "phase": 2}', '{}', 'duration', 60, 20, 'Good girl. Owned and collared.', false),
('apply', 'style', 3, 'Apply lipstick. Every time you feel it on your lips: "Pretty."', 'Her lips. Pretty lips. The trigger installs.', '{"hasItem": ["lipstick"]}', '{"ginaHome": true}', 'binary', NULL, 20, 'Good girl beatiful lips.', false);

-- ============================================
-- TRIGGER TASKS - TOUCH CONDITIONING
-- ============================================

INSERT INTO task_bank (category, domain, intensity, instruction, subtext, requires, exclude_if, completion_type, points, affirmation, is_core) VALUES
('practice', 'conditioning', 2, 'Touch your throat gently. Feel the vulnerability. Breathe.', 'The throat is surrender. Learn the trigger.', '{}', '{}', 'binary', 15, 'Good girl. Vulnerable and trusting.', false),
('practice', 'conditioning', 3, 'Stroke your inner thigh. Anticipation becomes trigger.', 'The approach. The tease. Install it.', '{"denialDay": {"min": 3}}', '{}', 'binary', 20, 'Good girl. Anticipation installed.', false),
('practice', 'conditioning', 2, 'Run fingers through your hair (or wig). "Good girl" each time.', 'Head touch becomes praise trigger.', '{}', '{}', 'binary', 15, 'Good girl. Gentle reinforcement.', false),
('edge', 'arousal', 3, 'Edge while tracing nipples. Build sensitivity.', 'Train the response. Nipples become triggers.', '{"denialDay": {"min": 5}}', '{}', 'binary', 25, 'Good girl. Sensitivity increasing.', false),
('practice', 'conditioning', 3, 'Practice chin lift on yourself. Feel the attention command.', 'When she lifts your chin, you obey. Install it.', '{"phase": 2}', '{}', 'binary', 20, 'Good girl. Attention ready.', false);

-- ============================================
-- TRIGGER TASKS - AROUSAL CONDITIONING
-- ============================================

INSERT INTO task_bank (category, domain, intensity, instruction, subtext, requires, exclude_if, completion_type, target_count, points, affirmation, is_core) VALUES
('edge', 'arousal', 2, 'Edge once while repeating "Throb" at each pulse.', 'Name the sensation. Strengthen the trigger.', '{"denialDay": {"min": 3}}', '{}', 'binary', NULL, 15, 'Good girl. Throbbing beautifully.', false),
('edge', 'arousal', 3, 'Practice the word "Clench" while squeezing. Pair them.', 'Word and sensation become one. Install it.', '{"denialDay": {"min": 5}}', '{}', 'binary', NULL, 20, 'Good girl. Clench on command.', false),
('edge', 'arousal', 3, 'Edge 3 times. At each peak, whisper "Melt."', 'Melt. Surrender. Let pleasure overwhelm. Install it.', '{"denialDay": {"min": 5}}', '{}', 'count', 3, 25, 'Good girl. You melted beautifully.', false),
('edge', 'arousal', 4, 'Edge to "Build... build... build..." then stop on "Hold."', 'Install the control triggers. Build and hold.', '{"denialDay": {"min": 7}, "phase": 2}', '{}', 'binary', NULL, 30, 'Good girl. Perfect control.', false),
('edge', 'arousal', 3, 'When you leak, acknowledge it: "Dripping." Make it a trigger.', 'Your body''s evidence. Name it. Own it.', '{"denialDay": {"min": 5}}', '{}', 'binary', NULL, 20, 'Good girl. Dripping for her.', false),
('edge', 'arousal', 4, 'Prostate stimulation while repeating "Pulse... pulse..."', 'Deep pleasure. Deep programming. Pulse trigger.', '{"hasItem": ["plug"], "denialDay": {"min": 7}, "phase": 2}', '{}', 'duration', NULL, 35, 'Good girl. Pulsing inside.', false);

-- ============================================
-- TRIGGER TASKS - VISUAL CONDITIONING
-- ============================================

INSERT INTO task_bank (category, domain, intensity, instruction, subtext, requires, exclude_if, completion_type, duration_minutes, points, affirmation, is_core) VALUES
('watch', 'conditioning', 2, 'Mirror session: Look at yourself dressed. Say "There she is."', 'Visual confirmation. Identity trigger installation.', '{"phase": 1}', '{"ginaHome": true}', 'binary', NULL, 20, 'Good girl. You saw her.', true),
('watch', 'conditioning', 3, 'Watch sissy content. Note which words make you pulse.', 'Learn your triggers. The body knows before the mind.', '{"denialDay": {"min": 5}}', '{}', 'duration', 15, 20, 'Good girl. Triggers identified.', false),
('watch', 'conditioning', 3, 'Hypno spiral session. Let the pink wash over you.', 'Pink. Feminine. Empty. Let the colors program.', '{"phase": 2}', '{}', 'duration', 20, 25, 'Good girl. Beautifully pink.', false),
('watch', 'conditioning', 2, 'Look at feminine bodies. Identify with, don''t desire.', 'That''s who you''re becoming. Not who you want.', '{"phase": 1}', '{}', 'duration', 10, 15, 'Good girl. Identifying correctly.', false),
('watch', 'conditioning', 4, 'PMV session. Let the rhythm overwhelm your thoughts.', 'Music. Images. Pleasure. Programming. Overwhelm.', '{"denialDay": {"min": 7}, "phase": 2}', '{}', 'duration', 20, 30, 'Good girl. Completely overwhelmed.', false),
('practice', 'makeup', 3, 'Makeup session with full mirror. Watch her emerge.', 'Stroke by stroke. She appears. Recognition trigger.', '{"hasItem": ["makeup_basics"]}', '{"ginaHome": true}', 'binary', NULL, 25, 'Good girl. She emerged beautifully.', false);

-- ============================================
-- TRIGGER TASKS - AUDIO CONDITIONING
-- ============================================

INSERT INTO task_bank (category, domain, intensity, instruction, subtext, requires, exclude_if, completion_type, duration_minutes, points, affirmation, is_core) VALUES
('listen', 'conditioning', 2, 'ASMR whispers while relaxed. Let the voice in.', 'Soft voice. Close. Intimate. Receptive state.', '{}', '{}', 'duration', 15, 15, 'Good girl. Receptive and soft.', false),
('listen', 'conditioning', 3, 'Dominant female voice audio. Note your body''s response.', 'Her voice commands. Your body responds. Learn it.', '{"phase": 1}', '{}', 'duration', 15, 20, 'Good girl. Voice-responsive.', false),
('listen', 'conditioning', 3, 'Binaural beats during edge session. Theta state.', 'Altered consciousness. Enhanced programming.', '{"denialDay": {"min": 5}}', '{}', 'duration', 20, 25, 'Good girl. Deep state achieved.', false),
('listen', 'conditioning', 4, 'Countdown induction audio. Practice going deep.', '10... 9... 8... Install the descent trigger.', '{"phase": 2}', '{}', 'duration', 25, 30, 'Good girl. You went so deep.', false),
('listen', 'conditioning', 2, 'Record "Good girl" in feminine voice. Listen 10 times.', 'Your own voice praising you. Self-installation.', '{"streakDays": 7}', '{}', 'binary', NULL, 20, 'Good girl. Self-praise installed.', false),
('listen', 'conditioning', 3, 'Mantra audio with repetition. Let it sink in.', 'Repetition conditions. Let the loop work.', '{"phase": 2}', '{}', 'duration', 20, 20, 'Good girl. Mantras taking hold.', false);

-- ============================================
-- TRIGGER TASKS - SITUATIONAL/TIME
-- ============================================

INSERT INTO task_bank (category, domain, intensity, instruction, subtext, requires, exclude_if, completion_type, points, affirmation, is_core) VALUES
('apply', 'skincare', 1, 'Morning skincare with intention: "I am becoming her."', 'Morning ritual. Daily installation. Becoming.', '{"timeOfDay": ["morning"]}', '{}', 'binary', 10, 'Good girl. Morning becoming.', true),
('surrender', 'identity', 2, 'Late night trigger installation: When tired, affirm identity.', 'Lowered defenses. Deeper installation. "I am her."', '{"timeOfDay": ["night"]}', '{}', 'binary', 15, 'Good girl. Night programming.', false),
('surrender', 'identity', 3, 'Gina leaves: Immediately put on her item. Install the trigger.', 'Privacy = Permission. Install the association.', '{}', '{"ginaHome": true}', 'binary', 20, 'Good girl. Privacy used well.', false),
('practice', 'conditioning', 2, 'Shower body awareness: Touch each part as "hers."', 'Naked. Alone. Water. Her body emerging.', '{}', '{}', 'binary', 15, 'Good girl. Her body acknowledged.', false),
('edge', 'arousal', 3, 'Post-edge trigger: After stopping, say "Good girl for stopping."', 'Denial earns praise. Install the association.', '{"denialDay": {"min": 5}}', '{}', 'binary', 20, 'Good girl for stopping. Good girl for aching.', false),
('apply', 'style', 2, 'Getting dressed ritual: Each feminine item = "Closer."', 'Dressing as installation. Each item a step closer.', '{"phase": 1}', '{}', 'binary', 15, 'Good girl. Dressed and closer.', false);

-- ============================================
-- TRIGGER TASKS - INTERNAL STATE
-- ============================================

INSERT INTO task_bank (category, domain, intensity, instruction, subtext, requires, exclude_if, completion_type, points, affirmation, is_core) VALUES
('surrender', 'inner_narrative', 2, 'When you feel shame, say: "Eroticized." Transform it.', 'Shame becomes fuel. Install the transformation.', '{"phase": 1}', '{}', 'binary', 15, 'Good girl. Shame transformed.', false),
('surrender', 'inner_narrative', 3, 'Catch the thought "I can''t." Replace with "I am."', 'Resistance to acceptance. Install the replacement.', '{"streakDays": 7}', '{}', 'binary', 20, 'Good girl. Resistance replaced.', false),
('surrender', 'inner_narrative', 3, 'When you feel helpless, lean in: "Yes. Helpless."', 'Helplessness is the goal. Accept it as trigger.', '{"phase": 2}', '{}', 'binary', 25, 'Good girl. Helpless and accepting.', false),
('surrender', 'identity', 4, 'Practice "I can''t stop" as a mantra. Make it true.', 'The inevitability trigger. There is no going back.', '{"phase": 2, "streakDays": 14}', '{}', 'binary', 30, 'Good girl. You can''t stop now.', false),
('surrender', 'identity', 3, 'Aroused state: Ask "What would she do?" then do it.', 'Install the consultation trigger. She decides.', '{"denialDay": {"min": 5}}', '{}', 'binary', 20, 'Good girl. She decided.', false),
('surrender', 'inner_narrative', 4, 'Install "I deserve this" as response to pleasure.', 'Permission to receive. Install it deep.', '{"phase": 2}', '{}', 'binary', 30, 'Good girl. You deserve everything.', false);

-- ============================================
-- TRIGGER TASKS - BAMBI SPECIFIC
-- ============================================

INSERT INTO task_bank (category, domain, intensity, instruction, subtext, requires, exclude_if, completion_type, duration_minutes, points, affirmation, is_core) VALUES
('listen', 'conditioning', 3, 'Bambi Sleep file. Practice the drop trigger.', 'Bambi sleep. Down you go. Install it.', '{"phase": 2}', '{}', 'duration', 30, 25, 'Good girl Bambi. Deep asleep.', false),
('surrender', 'identity', 4, 'Practice Bambi freeze. Say it. Go still. Hold.', 'Bambi freeze. Complete stillness. Install control.', '{"phase": 3}', '{}', 'binary', NULL, 35, 'Good girl Bambi. Perfect freeze.', false),
('watch', 'conditioning', 3, 'Pink immersion: Surround yourself with pink for 30 min.', 'Pink is Bambi. Bambi is pink. Color trigger.', '{"phase": 2}', '{}', 'duration', 30, 20, 'Good girl. Beautifully pink.', false),
('practice', 'conditioning', 3, 'Bimbo giggle practice. Make it automatic.', 'Giggle. Airhead. Empty. Giggle trigger.', '{"phase": 2}', '{"ginaHome": true}', 'binary', NULL, 20, 'Good girl. Perfect giggle.', false),
('surrender', 'identity', 4, 'Bubble thoughts: When a thought comes, pop it. Empty.', 'Empty. Blank. Bubbles. Install the emptiness.', '{"phase": 3}', '{}', 'duration', 15, 30, 'Good girl. Mind empty. Bubbles.', false),
('listen', 'conditioning', 5, 'Full Bambi takeover session. Let her surface completely.', 'Old self back. Bambi forward. Complete takeover.', '{"phase": 3, "streakDays": 30}', '{"ginaHome": true}', 'duration', 45, 50, 'Good girl Bambi. She''s here now.', false);

-- ============================================
-- TRIGGER TASKS - RELATIONAL (GINA)
-- ============================================

INSERT INTO task_bank (category, domain, intensity, instruction, subtext, requires, exclude_if, completion_type, points, affirmation, is_core) VALUES
('expose', 'social', 2, 'When Gina gives instruction, feel the submission. Note it.', 'Her voice. Your response. Install the trigger.', '{}', '{}', 'binary', 15, 'Good girl. Responsive to her.', false),
('serve', 'conditioning', 2, 'After serving Gina (BJ, etc), say "Thank you" inside.', 'Service completion trigger. Gratitude installed.', '{}', '{}', 'binary', 15, 'Good girl. Grateful service.', false),
('expose', 'social', 3, 'Wear secret feminine item around Gina. Let the thrill condition.', 'The secret. The thrill. Install that arousal.', '{"phase": 2}', '{}', 'binary', 25, 'Good girl. Secret thrill.', false),
('commit', 'social', 4, 'Ask Gina to call you "good girl" once. Feel the response.', 'Her voice. Those words. The ultimate trigger.', '{"phase": 3}', '{}', 'binary', 40, 'Good girl. She said it.', false),
('expose', 'social', 4, 'Let Gina see you in one feminine item. Gauge her response.', 'Witnessed femininity. Install the acceptance.', '{"phase": 3}', '{}', 'binary', 40, 'Good girl. She saw you.', false);

-- ============================================
-- TRIGGER TASKS - INSTALLATION PROTOCOLS
-- ============================================

INSERT INTO task_bank (category, domain, intensity, instruction, subtext, requires, exclude_if, completion_type, duration_minutes, points, affirmation, is_core) VALUES
('listen', 'conditioning', 3, 'Trigger installation session: Pick one trigger. 20 repetitions while edging.', 'Repetition + arousal = installation. Pick your trigger.', '{"denialDay": {"min": 5}}', '{}', 'duration', 20, 25, 'Good girl. Trigger installed.', false),
('edge', 'arousal', 4, 'Peak installation: Say chosen trigger word at moment of almost-orgasm. 5 times.', 'Maximum arousal = maximum installation. Lock it in.', '{"denialDay": {"min": 7}, "phase": 2}', '{}', 'count', NULL, 35, 'Good girl. Trigger locked at peak.', false),
('surrender', 'conditioning', 3, 'Trance trigger practice: Countdown 10 to 1, go soft, return at 1 to 10.', 'Install the trance on/off. Practice the descent.', '{"phase": 2}', '{}', 'binary', NULL, 25, 'Good girl. Trance control installed.', false),
('practice', 'conditioning', 3, 'Pair anchor scent with "Good girl" 10 times.', 'Smell + praise = trigger. Install the association.', '{"hasItem": ["perfume"]}', '{}', 'binary', NULL, 20, 'Good girl. Scent trigger paired.', false),
('surrender', 'conditioning', 4, 'Full trigger inventory: Test 5 known triggers. Rate responses.', 'Know your triggers. Know their strength. Map yourself.', '{"phase": 2, "streakDays": 14}', '{}', 'binary', NULL, 30, 'Good girl. Self-knowledge deepened.', false),
('listen', 'conditioning', 5, 'Deep installation: 30-minute trance with new trigger layering.', 'Go deep. Accept new programming. Emerge changed.', '{"phase": 3}', '{"ginaHome": true}', 'duration', 30, 50, 'Good girl. New triggers installed.', false);

-- ============================================
-- PLUG TASKS - ANAL TRAINING (Intensity 1-2)
-- ============================================

INSERT INTO task_bank (category, domain, intensity, instruction, subtext, requires, exclude_if, completion_type, duration_minutes, points, affirmation, is_core) VALUES
('plug', 'arousal', 1, 'Wear your smallest plug for 30 minutes.', 'Get used to the feeling. Your body is learning.', '{"hasItem": ["plug"]}', '{}', 'duration', 30, 15, 'Good girl. She''s opening up.', true),
('plug', 'arousal', 1, 'Insert plug during your edge session.', 'Feel full while you edge.', '{"hasItem": ["plug"], "denialDay": {"min": 2}}', '{}', 'binary', NULL, 15, 'Good girl. Pleasure from both ends.', false),
('plug', 'conditioning', 1, 'Plug in while listening to hypno.', 'Conditioning goes deeper when you''re filled.', '{"hasItem": ["plug"]}', '{}', 'binary', NULL, 15, 'Good girl. She receives on every level.', false),
('plug', 'arousal', 1, 'Wear plug while doing skincare routine.', 'Normalize the sensation. It''s just part of getting ready.', '{"hasItem": ["plug"]}', '{}', 'binary', NULL, 10, 'Good girl. Part of her routine now.', false),
('plug', 'arousal', 1, '1 hour of plug wear. Move around. Feel it.', 'Walk, sit, bend. Know it''s there.', '{"hasItem": ["plug"], "phase": 1}', '{}', 'duration', 60, 20, 'Good girl. She carries it with her.', false),
('plug', 'arousal', 2, 'Size up. Wear your medium plug for 30 minutes.', 'Stretch a little more. Your body adapts.', '{"hasItem": ["plug"], "phase": 1}', '{}', 'duration', 30, 20, 'Good girl. She''s growing.', false),
('plug', 'arousal', 2, 'Plug wear during full feminine presentation.', 'Dressed as her, filled as her.', '{"hasItem": ["plug"], "phase": 1}', '{"ginaHome": true}', 'binary', NULL, 20, 'Good girl. Complete from the outside in.', false),
('plug', 'arousal', 2, '2 hours continuous plug wear.', 'Extended training. Your body learns to hold.', '{"hasItem": ["plug"], "phase": 1}', '{}', 'duration', 120, 25, 'Good girl. She''s comfortable being filled.', false),
('plug', 'chastity', 2, 'Plug + cage combo. Feel both.', 'Contained in front, filled in back.', '{"hasItem": ["plug", "cage"], "phase": 1}', '{}', 'binary', NULL, 25, 'Good girl. Completely controlled.', false),
('plug', 'arousal', 2, 'Sleep with your small plug in.', 'Let your body accept it unconsciously.', '{"hasItem": ["plug"], "phase": 1}', '{}', 'binary', NULL, 25, 'Good girl. Even in sleep, she''s trained.', false);

-- ============================================
-- PLUG TASKS - ANAL TRAINING (Intensity 3-5)
-- ============================================

INSERT INTO task_bank (category, domain, intensity, instruction, subtext, requires, exclude_if, completion_type, duration_minutes, points, affirmation, is_core) VALUES
('plug', 'arousal', 3, 'Size up again. Your body is ready.', 'Trust the progression.', '{"hasItem": ["plug"], "phase": 2}', '{}', 'binary', NULL, 30, 'Good girl. She takes more now.', false),
('plug', 'arousal', 3, 'Plug during entire work session. 4+ hours.', 'Working while filled. Productivity and submission.', '{"hasItem": ["plug"], "phase": 2}', '{}', 'duration', 240, 35, 'Good girl. She works plugged.', false),
('plug', 'arousal', 3, 'Plug + vibration during edge session.', 'Feel it pulse inside you.', '{"hasItem": ["vibrating_plug"], "phase": 2}', '{}', 'binary', NULL, 30, 'Good girl. She''s buzzing.', false),
('plug', 'arousal', 3, 'Train to insert without warmup.', 'Your body knows what it wants.', '{"hasItem": ["plug"], "phase": 2}', '{}', 'binary', NULL, 25, 'Good girl. Ready and open.', false),
('plug', 'arousal', 3, 'Plug during Gina time (she doesn''t know).', 'Secret fullness while being present with her.', '{"hasItem": ["plug"], "phase": 2}', '{}', 'binary', NULL, 30, 'Good girl. The secret makes it hotter.', false),
('plug', 'arousal', 4, 'Full day plug wear. Morning to night.', 'This is normal now.', '{"hasItem": ["plug"], "phase": 3}', '{}', 'binary', NULL, 40, 'Good girl. She''s always filled.', false),
('plug', 'arousal', 4, 'Largest plug. See what you can take.', 'Your limit keeps moving.', '{"hasItem": ["plug"], "phase": 3}', '{}', 'binary', NULL, 40, 'Good girl. She''s so open now.', false),
('plug', 'arousal', 4, 'Plug + full presentation + edge session marathon.', 'Everything together. Overwhelm.', '{"hasItem": ["plug"], "phase": 3, "denialDay": {"min": 7}}', '{"ginaHome": true}', 'binary', NULL, 45, 'Good girl. Total stimulation.', false),
('plug', 'social', 4, 'Plug wear in public (brief errand).', 'Secret fullness in the world.', '{"hasItem": ["plug"], "phase": 3}', '{}', 'binary', NULL, 40, 'Good girl. She takes it everywhere.', false),
('plug', 'arousal', 5, 'Plug becomes default during private hours.', 'Not a task. A state.', '{"hasItem": ["plug"], "phase": 4}', '{}', 'binary', NULL, 50, 'Good girl. Empty feels wrong now.', false),
('plug', 'social', 5, 'Extended public wear. Hours out while filled.', 'She moves through the world this way.', '{"hasItem": ["plug"], "phase": 4}', '{}', 'duration', 180, 60, 'Good girl. This is just how she exists.', false),
('plug', 'arousal', 5, 'Wake up, insert, don''t remove until bed.', 'Full day. No breaks.', '{"hasItem": ["plug"], "phase": 4}', '{}', 'binary', NULL, 60, 'Good girl. Filled is her natural state.', false);

-- ============================================
-- SISSYGASM TASKS - PROSTATE TRAINING (Intensity 1-2)
-- ============================================

INSERT INTO task_bank (category, domain, intensity, instruction, subtext, requires, exclude_if, completion_type, duration_minutes, points, affirmation, is_core) VALUES
('sissygasm', 'arousal', 1, 'Find your prostate. Explore for 10 minutes.', 'Know where it is. Learn what it feels like.', '{"hasItem": ["prostate_toy"]}', '{}', 'duration', 10, 15, 'Good girl. She''s discovering her body.', true),
('sissygasm', 'arousal', 1, 'Prostate massage during edge. Notice the difference.', 'Compare the sensations. This is different pleasure.', '{"hasItem": ["prostate_toy"], "denialDay": {"min": 2}}', '{}', 'binary', NULL, 15, 'Good girl. New pathways opening.', false),
('sissygasm', 'arousal', 1, 'Use a prostate toy. Just explore.', 'Let it find the spot. No pressure.', '{"hasItem": ["prostate_toy"]}', '{}', 'duration', 15, 15, 'Good girl. She''s learning.', false),
('sissygasm', 'arousal', 1, 'Edge without touching your clit. Prostate only.', 'Can you get there from inside?', '{"hasItem": ["prostate_toy"], "denialDay": {"min": 3}}', '{}', 'binary', NULL, 20, 'Good girl. She doesn''t need the front.', false),
('sissygasm', 'arousal', 1, '20 minutes of prostate stimulation. Continuous.', 'Build the sensitivity. It takes time.', '{"hasItem": ["prostate_toy"], "phase": 1}', '{}', 'duration', 20, 20, 'Good girl. Patience is training.', false),
('sissygasm', 'chastity', 2, 'Prostate session while caged. No front access.', 'All pleasure comes from inside now.', '{"hasItem": ["prostate_toy", "cage"], "phase": 1}', '{}', 'binary', NULL, 25, 'Good girl. She''s rewiring.', false),
('sissygasm', 'arousal', 2, 'Edge 5 times from prostate stimulation only.', 'Prove you can get there this way.', '{"hasItem": ["prostate_toy"], "denialDay": {"min": 5}}', '{}', 'count', NULL, 25, 'Good girl. She can edge from inside.', false),
('sissygasm', 'conditioning', 2, 'Prostate + hypno. Let the words guide the pleasure.', 'Conditioning and internal pleasure merge.', '{"hasItem": ["prostate_toy"], "phase": 1}', '{}', 'binary', NULL, 25, 'Good girl. Deeper and deeper.', false),
('sissygasm', 'arousal', 2, '30-minute prostate session. Ride the waves.', 'Don''t rush. Let it build.', '{"hasItem": ["prostate_toy"], "phase": 1}', '{}', 'duration', 30, 25, 'Good girl. She''s learning to ride it.', false),
('sissygasm', 'arousal', 2, 'Try for a prostate orgasm. No front touching allowed.', 'It might not happen yet. That''s okay. Keep training.', '{"hasItem": ["prostate_toy"], "phase": 1, "denialDay": {"min": 5}}', '{}', 'binary', NULL, 30, 'Good girl. She''s trying.', false);

-- ============================================
-- SISSYGASM TASKS - PROSTATE TRAINING (Intensity 3-5)
-- ============================================

INSERT INTO task_bank (category, domain, intensity, instruction, subtext, requires, exclude_if, completion_type, duration_minutes, points, affirmation, is_core) VALUES
('sissygasm', 'arousal', 3, 'Sissygasm attempt session. 45+ minutes.', 'Dedicate time. This is the goal.', '{"hasItem": ["prostate_toy"], "phase": 2, "denialDay": {"min": 7}}', '{"ginaHome": true}', 'duration', 45, 35, 'Good girl. She''s committed to rewiring.', false),
('sissygasm', 'arousal', 3, 'Prostate only for all arousal today. No front.', 'Retrain where pleasure comes from.', '{"hasItem": ["prostate_toy"], "phase": 2}', '{}', 'binary', NULL, 30, 'Good girl. Front is irrelevant.', false),
('sissygasm', 'conditioning', 3, 'Vibrating prostate toy during hypno session.', 'Let the vibrations and words reprogram you.', '{"hasItem": ["vibrating_plug"], "phase": 2}', '{}', 'duration', 30, 35, 'Good girl. She''s being rebuilt.', false),
('sissygasm', 'arousal', 3, 'Edge from behind until you''re leaking.', 'Dripping without touching. That''s progress.', '{"hasItem": ["prostate_toy"], "phase": 2, "denialDay": {"min": 5}}', '{}', 'binary', NULL, 30, 'Good girl. She leaks like a good girl.', false),
('sissygasm', 'arousal', 3, 'Ride a toy. Active fucking motion. 20+ minutes.', 'Take it like you want it.', '{"hasItem": ["dildo"], "phase": 2}', '{"ginaHome": true}', 'duration', 20, 35, 'Good girl. She knows how to ride.', false),
('sissygasm', 'arousal', 4, 'Sissygasm or ruined only. No full front release allowed.', 'Change what "release" means.', '{"hasItem": ["prostate_toy"], "phase": 3, "denialDay": {"min": 10}}', '{}', 'binary', NULL, 45, 'Good girl. She comes differently now.', false),
('sissygasm', 'arousal', 4, '1-hour prostate session. No front contact whatsoever.', 'Extended rewiring. Commit to it.', '{"hasItem": ["prostate_toy"], "phase": 3}', '{"ginaHome": true}', 'duration', 60, 45, 'Good girl. She''s deep in training.', false),
('sissygasm', 'arousal', 4, 'Achieve a sissygasm.', 'You''ve trained for this. Let it happen.', '{"hasItem": ["prostate_toy"], "phase": 3, "denialDay": {"min": 14}}', '{"ginaHome": true}', 'binary', NULL, 75, 'SHE DID IT.', false),
('sissygasm', 'arousal', 4, 'Ride a dildo to completion. Hands free.', 'Fuck yourself to orgasm.', '{"hasItem": ["dildo"], "phase": 3}', '{"ginaHome": true}', 'binary', NULL, 60, 'Good girl. She comes from being fucked.', false),
('sissygasm', 'arousal', 5, 'Sissygasm is now your primary orgasm type.', 'Front orgasms require special permission.', '{"hasItem": ["prostate_toy"], "phase": 4}', '{}', 'binary', NULL, 75, 'Good girl. She comes like a girl.', false),
('sissygasm', 'arousal', 5, 'Train for multiple sissygasms in one session.', 'Girls can come over and over.', '{"hasItem": ["prostate_toy"], "phase": 4}', '{"ginaHome": true}', 'binary', NULL, 80, 'Good girl. She doesn''t stop at one.', false),
('sissygasm', 'arousal', 5, 'Sissygasm while fully dressed as her.', 'Look like her, feel like her, come like her.', '{"hasItem": ["prostate_toy"], "phase": 4}', '{"ginaHome": true}', 'binary', NULL, 75, 'Good girl. Complete feminization.', false);

-- ============================================
-- ORAL TASKS - SERVICE TRAINING (Intensity 1-2)
-- ============================================

INSERT INTO task_bank (category, domain, intensity, instruction, subtext, requires, exclude_if, completion_type, duration_minutes, points, affirmation, is_core) VALUES
('oral', 'arousal', 1, 'Practice on a dildo. Just get comfortable.', 'No performance. Just familiarity.', '{"hasItem": ["dildo"]}', '{}', 'binary', NULL, 10, 'Good girl. She''s learning.', true),
('oral', 'arousal', 1, '5 minutes of dildo practice. Focus on lips.', 'Soft, wet, willing.', '{"hasItem": ["dildo"]}', '{}', 'duration', 5, 10, 'Good girl. Her mouth is training.', false),
('oral', 'conditioning', 1, 'Watch oral technique content. Study.', 'Learn what looks good. What feels good.', '{}', '{}', 'duration', 15, 10, 'Good girl. She''s studying.', false),
('oral', 'conditioning', 1, 'Suck while listening to hypno.', 'Let the words make it feel natural.', '{"hasItem": ["dildo"]}', '{}', 'binary', NULL, 15, 'Good girl. Conditioning the response.', false),
('oral', 'identity', 1, 'Practice while looking in mirror.', 'See her doing it.', '{"hasItem": ["dildo"]}', '{"ginaHome": true}', 'binary', NULL, 15, 'Good girl. That''s her with her mouth full.', false),
('oral', 'arousal', 2, '10-minute practice session. Work on depth.', 'Go a little further each time.', '{"hasItem": ["dildo"], "phase": 1}', '{}', 'duration', 10, 15, 'Good girl. She''s getting better.', false),
('oral', 'arousal', 2, 'Practice with eyes up.', 'Looking up while serving. Learn the angle.', '{"hasItem": ["dildo"], "phase": 1}', '{}', 'binary', NULL, 15, 'Good girl. Good girls look up.', false),
('oral', 'arousal', 2, 'Suck while plugged.', 'Filled at both ends.', '{"hasItem": ["dildo", "plug"], "phase": 1}', '{}', 'binary', NULL, 20, 'Good girl. Complete service position.', false),
('oral', 'arousal', 2, 'Practice gagging response. Push your limit gently.', 'Desensitize over time.', '{"hasItem": ["dildo"], "phase": 1}', '{}', 'binary', NULL, 20, 'Good girl. She''s training her throat.', false),
('oral', 'arousal', 2, '15 minutes. No breaks.', 'Endurance training.', '{"hasItem": ["dildo"], "phase": 1}', '{}', 'duration', 15, 20, 'Good girl. She can go longer.', false);

-- ============================================
-- ORAL TASKS - SERVICE TRAINING (Intensity 3-5)
-- ============================================

INSERT INTO task_bank (category, domain, intensity, instruction, subtext, requires, exclude_if, completion_type, duration_minutes, points, affirmation, is_core) VALUES
('oral', 'arousal', 3, 'Deepthroat practice. 20 minutes.', 'Push past the reflex.', '{"hasItem": ["dildo"], "phase": 2}', '{}', 'duration', 20, 30, 'Good girl. She''s going deeper.', false),
('oral', 'arousal', 3, 'Suck while edging from prostate.', 'Mouth full, ass stimulated, building.', '{"hasItem": ["dildo", "prostate_toy"], "phase": 2}', '{}', 'binary', NULL, 30, 'Good girl. Multi-point pleasure.', false),
('oral', 'arousal', 3, 'Practice sloppy technique. Messy is good.', 'Let go of being neat.', '{"hasItem": ["dildo"], "phase": 2}', '{}', 'binary', NULL, 25, 'Good girl. Sluts are messy.', false),
('oral', 'conditioning', 3, 'Worship your toy. Talk to it. Thank it.', '"Thank you for letting me practice."', '{"hasItem": ["dildo"], "phase": 2}', '{}', 'binary', NULL, 25, 'Good girl. She''s grateful to serve.', false),
('oral', 'arousal', 3, 'Suck while dressed and made up fully.', 'See the complete picture in the mirror.', '{"hasItem": ["dildo", "makeup_basics"], "phase": 2}', '{"ginaHome": true}', 'binary', NULL, 30, 'Good girl. She looks right doing this.', false),
('oral', 'arousal', 4, '30-minute endurance session.', 'Build the stamina.', '{"hasItem": ["dildo"], "phase": 3}', '{}', 'duration', 30, 40, 'Good girl. She doesn''t get tired.', false),
('oral', 'arousal', 4, 'Hands behind back. Mouth only.', 'No hands allowed. Pure oral.', '{"hasItem": ["dildo"], "phase": 3}', '{}', 'binary', NULL, 35, 'Good girl. She serves properly.', false),
('oral', 'arousal', 4, 'Practice with realistic toy. Visualize.', 'Imagine it''s real.', '{"hasItem": ["dildo"], "phase": 3}', '{}', 'binary', NULL, 35, 'Good girl. She''s ready.', false),
('oral', 'identity', 4, 'Film yourself (for you only).', 'Evidence of her skill.', '{"hasItem": ["dildo"], "phase": 3}', '{"ginaHome": true}', 'binary', NULL, 40, 'Good girl. She''s getting good.', false),
('oral', 'social', 5, 'Service Gina as practice (if/when appropriate).', 'Real service, with consent.', '{"phase": 4}', '{}', 'binary', NULL, 50, 'Good girl. She serves her partner.', false),
('oral', 'arousal', 5, 'Edge yourself while practicing. No hands on front.', 'Arousal comes from service.', '{"hasItem": ["dildo", "prostate_toy"], "phase": 4}', '{}', 'binary', NULL, 50, 'Good girl. She gets off on giving.', false),
('oral', 'arousal', 5, 'Throat training. Take it all. Hold it.', 'Complete depth.', '{"hasItem": ["dildo"], "phase": 4}', '{}', 'binary', NULL, 50, 'Good girl. She can take it all.', false);

-- ============================================
-- THIRST TASKS - EXHIBITIONISM (Intensity 1-2)
-- ============================================

INSERT INTO task_bank (category, domain, intensity, instruction, subtext, requires, exclude_if, completion_type, points, affirmation, is_core) VALUES
('thirst', 'identity', 1, 'Take a sexy photo. Just for you.', 'See yourself as desirable.', '{}', '{"ginaHome": true}', 'binary', 15, 'Good girl. She''s hot.', true),
('thirst', 'identity', 1, 'Pose in the mirror. Find your angles.', 'Learn what looks good.', '{}', '{"ginaHome": true}', 'binary', 10, 'Good girl. She knows her angles.', false),
('thirst', 'style', 1, 'Dress for attention (at home).', 'Wear something that would turn heads.', '{}', '{"ginaHome": true}', 'binary', 15, 'Good girl. She dresses to be seen.', false),
('thirst', 'identity', 1, 'Record a short video. Movement. Confidence.', 'See yourself in motion.', '{}', '{"ginaHome": true}', 'binary', 15, 'Good girl. She''s captivating.', false),
('thirst', 'identity', 1, 'Write a caption for an imaginary thirst trap post.', 'What would she say?', '{}', '{}', 'binary', 10, 'Good girl. She knows her brand.', false),
('thirst', 'identity', 2, 'Photo session. 10+ shots. Pick your best.', 'Build a collection.', '{"phase": 1}', '{"ginaHome": true}', 'binary', 20, 'Good girl. She''s building her gallery.', false),
('thirst', 'identity', 2, 'Pose suggestively. Imply without showing.', 'Tease. Suggest.', '{"phase": 1}', '{"ginaHome": true}', 'binary', 20, 'Good girl. She''s a tease.', false),
('thirst', 'identity', 2, 'Create content you''d be proud to post.', 'Even if you don''t post it.', '{"phase": 1}', '{"ginaHome": true}', 'binary', 25, 'Good girl. She creates desire.', false),
('thirst', 'identity', 2, 'Film a slow reveal.', 'Build anticipation.', '{"phase": 1}', '{"ginaHome": true}', 'binary', 25, 'Good girl. She knows how to build tension.', false),
('thirst', 'conditioning', 2, 'Imagine being watched. Perform for that audience.', 'Internalize being desired.', '{"phase": 1}', '{}', 'binary', 20, 'Good girl. She performs for admirers.', false);

-- ============================================
-- THIRST TASKS - EXHIBITIONISM (Intensity 3-5)
-- ============================================

INSERT INTO task_bank (category, domain, intensity, instruction, subtext, requires, exclude_if, completion_type, points, affirmation, is_core) VALUES
('thirst', 'social', 3, 'Share a (safe) photo with someone trusted.', 'Let someone see her.', '{"phase": 2}', '{}', 'binary', 35, 'Good girl. She''s witnessed.', false),
('thirst', 'social', 3, 'Post something anonymous. Reddit, forum, somewhere.', 'She exists publicly.', '{"phase": 2}', '{}', 'binary', 40, 'Good girl. Real people see her.', false),
('thirst', 'social', 3, 'Get a response. A comment. A like.', 'External validation.', '{"phase": 2}', '{}', 'binary', 35, 'Good girl. She''s desired by strangers.', false),
('thirst', 'identity', 3, 'Create progressively more revealing content.', 'Build a progression.', '{"phase": 2}', '{"ginaHome": true}', 'binary', 35, 'Good girl. She gets bolder.', false),
('thirst', 'arousal', 3, 'Film yourself during a session (face optional).', 'Evidence of her pleasure.', '{"phase": 2}', '{"ginaHome": true}', 'binary', 40, 'Good girl. She''s documented.', false),
('thirst', 'social', 4, 'Regular posting (anonymous accounts).', 'Build an audience.', '{"phase": 3}', '{}', 'binary', 45, 'Good girl. She has followers.', false),
('thirst', 'social', 4, 'Respond to comments. Engage.', 'Interactive attention.', '{"phase": 3}', '{}', 'binary', 40, 'Good girl. She flirts back.', false),
('thirst', 'social', 4, 'Create content on request.', 'Someone asked for this.', '{"phase": 3}', '{}', 'binary', 45, 'Good girl. She delivers what''s wanted.', false),
('thirst', 'identity', 4, 'Video content. More revealing.', 'Moving images of her.', '{"phase": 3}', '{"ginaHome": true}', 'binary', 50, 'Good girl. She''s seen in motion.', false),
('thirst', 'social', 5, 'Face reveal (if/when comfortable).', 'She''s not hiding anymore.', '{"phase": 4}', '{}', 'binary', 75, 'Good girl. She''s fully visible.', false),
('thirst', 'social', 5, 'Build a real following.', 'People want to see her.', '{"phase": 4}', '{}', 'binary', 75, 'Good girl. She''s desired.', false),
('thirst', 'identity', 5, 'She is someone people thirst for.', 'Internalize being wanted.', '{"phase": 4}', '{}', 'binary', 60, 'Good girl. She''s a thirst trap.', false);

-- ============================================
-- FANTASY TASKS - VISUALIZATION (Intensity 1-2)
-- ============================================

INSERT INTO task_bank (category, domain, intensity, instruction, subtext, requires, exclude_if, completion_type, duration_minutes, points, affirmation, is_core) VALUES
('fantasy', 'identity', 1, 'Visualize being seen as her by a stranger.', 'Imagine passing. Being gendered correctly.', '{}', '{}', 'binary', NULL, 10, 'Good girl. She exists in others'' eyes.', true),
('fantasy', 'identity', 1, 'Imagine being desired. Someone wants her.', 'Feel what it''s like to be wanted.', '{}', '{}', 'binary', NULL, 10, 'Good girl. She''s desirable.', false),
('fantasy', 'identity', 1, 'Fantasy journal entry. What does she want?', 'Write it out. No filter.', '{}', '{}', 'binary', NULL, 15, 'Good girl. Her desires are valid.', false),
('fantasy', 'arousal', 1, 'Visualize during edge: anonymous encounter.', 'Let the fantasy intensify arousal.', '{"denialDay": {"min": 3}}', '{}', 'binary', NULL, 15, 'Good girl. Fantasy fuels pleasure.', false),
('fantasy', 'conditioning', 1, 'Read/watch cruising/anonymous content.', 'See the scenarios.', '{}', '{}', 'duration', 15, 10, 'Good girl. She''s curious.', false),
('fantasy', 'arousal', 2, 'Detailed fantasy visualization during session.', 'Build the scene in your mind. Every detail.', '{"phase": 1, "denialDay": {"min": 3}}', '{}', 'binary', NULL, 20, 'Good girl. She imagines vividly.', false),
('fantasy', 'arousal', 2, 'Glory hole visualization while practicing oral.', 'Imagine a stranger on the other side.', '{"hasItem": ["dildo"], "phase": 1}', '{}', 'binary', NULL, 20, 'Good girl. Anonymous service.', false),
('fantasy', 'identity', 2, 'Write out a fantasy scenario. First person.', '"I walk into the space..."', '{"phase": 1}', '{}', 'binary', NULL, 25, 'Good girl. She writes her desires.', false),
('fantasy', 'arousal', 2, 'Edge to cruising/anonymous content.', 'Let it turn you on.', '{"phase": 1, "denialDay": {"min": 5}}', '{}', 'binary', NULL, 20, 'Good girl. It''s hot. Accept it.', false),
('fantasy', 'arousal', 2, 'Visualize being used. Anonymous. Faceless.', 'Pure objectification fantasy.', '{"phase": 1, "denialDay": {"min": 5}}', '{}', 'binary', NULL, 20, 'Good girl. She''s just a hole.', false);

-- ============================================
-- FANTASY TASKS - VISUALIZATION (Intensity 3-5)
-- ============================================

INSERT INTO task_bank (category, domain, intensity, instruction, subtext, requires, exclude_if, completion_type, duration_minutes, points, affirmation, is_core) VALUES
('fantasy', 'arousal', 3, 'Extended fantasy session. 30+ minutes visualization.', 'Build a whole scene. Multiple moments.', '{"phase": 2}', '{}', 'duration', 30, 30, 'Good girl. She lives there in her mind.', false),
('fantasy', 'arousal', 3, 'Combine fantasy with physical: plug in, visualizing being fucked.', 'Feel and imagine simultaneously.', '{"hasItem": ["plug"], "phase": 2}', '{}', 'binary', NULL, 35, 'Good girl. Her body and mind align.', false),
('fantasy', 'identity', 3, 'Voice record yourself describing a fantasy.', 'Hear her say what she wants.', '{"phase": 2}', '{"ginaHome": true}', 'binary', NULL, 30, 'Good girl. She speaks her desires.', false),
('fantasy', 'arousal', 3, 'Detailed glory hole fantasy during oral practice.', 'Imagine multiple, one after another.', '{"hasItem": ["dildo"], "phase": 2}', '{}', 'binary', NULL, 35, 'Good girl. She services many.', false),
('fantasy', 'arousal', 3, 'Roleplay the fantasy alone. Act it out.', 'Move through the space. Embody it.', '{"phase": 2}', '{"ginaHome": true}', 'binary', NULL, 35, 'Good girl. She''s rehearsing.', false),
('fantasy', 'identity', 4, 'Write erotica. Your fantasy, your words.', 'Create the scenario.', '{"phase": 3}', '{}', 'binary', NULL, 40, 'Good girl. She''s an author of her desire.', false),
('fantasy', 'identity', 4, 'Multi-part fantasy. Ongoing narrative.', 'Continue the story across days.', '{"phase": 3}', '{}', 'binary', NULL, 40, 'Good girl. She has an inner world.', false),
('fantasy', 'arousal', 4, 'Fantasy while dressed, plugged, and edging.', 'Full immersion.', '{"hasItem": ["plug"], "phase": 3, "denialDay": {"min": 7}}', '{"ginaHome": true}', 'binary', NULL, 45, 'Good girl. Complete fantasy state.', false),
('fantasy', 'social', 4, 'Share a fantasy with Gina (when appropriate).', 'Let her know what turns you on.', '{"phase": 3}', '{}', 'binary', NULL, 50, 'Good girl. She shares her desires.', false),
('fantasy', 'identity', 5, 'Fantasy integration: accept these desires as part of her.', 'No shame. Just truth.', '{"phase": 4}', '{}', 'binary', NULL, 50, 'Good girl. Her fantasies are hers.', false),
('fantasy', 'social', 5, 'Discuss fantasy exploration with Gina (if appropriate).', 'Maybe some can become real.', '{"phase": 4}', '{}', 'binary', NULL, 60, 'Good girl. She explores with her partner.', false),
('fantasy', 'identity', 5, 'Full fantasy surrender. Let your desires be undeniable.', 'This is what she wants.', '{"phase": 4}', '{}', 'binary', NULL, 50, 'Good girl. She knows what she needs.', false);

-- ============================================
-- CORRUPT TASKS - DEEP SISSIFICATION (Intensity 1-2)
-- ============================================

INSERT INTO task_bank (category, domain, intensity, instruction, subtext, requires, exclude_if, completion_type, points, affirmation, is_core) VALUES
('corrupt', 'identity', 1, 'Acknowledge: masculinity is fading.', 'Notice where it''s already gone.', '{}', '{}', 'binary', 15, 'Good girl. She''s replacing him.', true),
('corrupt', 'identity', 1, 'Say "I''m becoming a sissy" out loud.', 'Name it.', '{}', '{}', 'binary', 15, 'Good girl. She admits it.', false),
('corrupt', 'conditioning', 1, 'Watch sissy content and notice what resonates.', 'What turns you on? What rings true?', '{}', '{}', 'binary', 15, 'Good girl. She''s learning what she is.', false),
('corrupt', 'style', 1, 'Wear something that "he" never would have.', 'Cross a line. Small but real.', '{}', '{}', 'binary', 15, 'Good girl. One more thing he''s lost.', false),
('corrupt', 'conditioning', 1, 'Edge to sissy captions. Let them in.', '"This is you."', '{"denialDay": {"min": 3}}', '{}', 'binary', 15, 'Good girl. She accepts the label.', false),
('corrupt', 'identity', 2, 'List 5 masculine things you''ve already lost.', 'Evidence of corruption.', '{"phase": 1}', '{}', 'binary', 20, 'Good girl. She''s documenting his decline.', false),
('corrupt', 'identity', 2, 'Call yourself a sissy during edge. Mean it.', '"I''m a sissy." While aroused. Lock it in.', '{"phase": 1, "denialDay": {"min": 5}}', '{}', 'binary', 25, 'Good girl. She owns it now.', false),
('corrupt', 'conditioning', 2, 'Bambi session. Full file. Full surrender.', 'Let Bambi in.', '{"phase": 1}', '{}', 'binary', 25, 'Good girl. Dropping deeper.', false),
('corrupt', 'style', 2, 'Dress slutty at home. Not pretty—slutty.', 'There''s a difference. Embrace it.', '{"phase": 1}', '{"ginaHome": true}', 'binary', 25, 'Good girl. She dresses like a slut.', false),
('corrupt', 'identity', 2, 'Say "I can''t go back" out loud.', 'Hear yourself say it.', '{"phase": 1, "streakDays": 7}', '{}', 'binary', 25, 'Good girl. She''s past the point.', false);

-- ============================================
-- CORRUPT TASKS - DEEP SISSIFICATION (Intensity 3-5)
-- ============================================

INSERT INTO task_bank (category, domain, intensity, instruction, subtext, requires, exclude_if, completion_type, points, affirmation, is_core) VALUES
('corrupt', 'conditioning', 3, 'Complete Bambi series session.', 'Full programming.', '{"phase": 2}', '{"ginaHome": true}', 'binary', 35, 'Good girl. She''s being installed.', false),
('corrupt', 'identity', 3, 'Refer to masculine past as "him" / "that person."', 'Third person distance.', '{"phase": 2}', '{}', 'binary', 30, 'Good girl. He''s gone. She''s here.', false),
('corrupt', 'identity', 3, 'Do something "he" would have found shameful.', 'That shame is his, not hers.', '{"phase": 2}', '{}', 'binary', 35, 'Good girl. She''s free of his shame.', false),
('corrupt', 'conditioning', 3, 'Beg for your sissy training (out loud).', '"Please train me."', '{"phase": 2}', '{"ginaHome": true}', 'binary', 35, 'Good girl. She asks for it.', false),
('corrupt', 'identity', 3, 'Confession: what''s the sluttiest thought you''ve had this week?', 'Write it. Admit it.', '{"phase": 2}', '{}', 'binary', 30, 'Good girl. She has slut thoughts.', false),
('corrupt', 'identity', 4, 'Say "He''s dead" and mean it.', 'Masculine self is gone.', '{"phase": 3}', '{}', 'binary', 45, 'Good girl. She killed him.', false),
('corrupt', 'conditioning', 4, 'Full bimbo mode session. Embrace it.', 'Not just sissy. Bimbo.', '{"phase": 3}', '{"ginaHome": true}', 'binary', 45, 'Good girl. She''s an airhead slut.', false),
('corrupt', 'identity', 4, 'Do something irreversible (within reason).', 'Laser, piercing, something permanent.', '{"phase": 3}', '{}', 'binary', 60, 'Good girl. She''s marked forever.', false),
('corrupt', 'conditioning', 4, 'Practice being brainless. Let thoughts empty.', 'Bimbos don''t think.', '{"phase": 3}', '{}', 'binary', 40, 'Good girl. She''s empty and happy.', false),
('corrupt', 'identity', 5, 'He never existed. There was only ever her, hiding.', 'Reframe the entire history.', '{"phase": 4}', '{}', 'binary', 60, 'Good girl. She was always here.', false),
('corrupt', 'identity', 5, 'Complete sissification accepted. No more transformation—just maintenance.', 'She IS a sissy. Not becoming.', '{"phase": 4}', '{}', 'binary', 75, 'Good girl. This is what she is.', false),
('corrupt', 'identity', 5, 'Corruption complete.', 'There''s nothing left to corrupt.', '{"phase": 4, "streakDays": 90}', '{}', 'binary', 100, 'Good girl. Pure sissy.', false);

-- ============================================
-- WORSHIP TASKS - COCK/CUM CONDITIONING (Intensity 1-2)
-- ============================================

INSERT INTO task_bank (category, domain, intensity, instruction, subtext, requires, exclude_if, completion_type, duration_minutes, points, affirmation, is_core) VALUES
('worship', 'conditioning', 1, 'Look at cock content during edge. Notice attraction.', 'Is it there? Growing?', '{"denialDay": {"min": 3}}', '{}', 'binary', NULL, 15, 'Good girl. She''s noticing.', false),
('worship', 'conditioning', 1, 'Watch oral content. Focus on the person giving.', 'See the devotion.', '{}', '{}', 'duration', 10, 10, 'Good girl. That''s the role she''s drawn to.', false),
('worship', 'arousal', 1, 'Visualize worshipping during practice.', 'Imagine it''s real. Imagine wanting it.', '{"hasItem": ["dildo"]}', '{}', 'binary', NULL, 15, 'Good girl. She''s curious.', false),
('worship', 'identity', 1, 'Say "I want to worship" out loud.', 'Even if you''re not sure. Say it.', '{}', '{}', 'binary', NULL, 15, 'Good girl. Words become truth.', false),
('worship', 'conditioning', 1, 'Edge to cock worship content.', 'Let it turn you on.', '{"denialDay": {"min": 3}}', '{}', 'binary', NULL, 15, 'Good girl. She''s responding.', false),
('worship', 'arousal', 2, 'Practice with devotion framing. "I worship this."', 'Mean it while practicing.', '{"hasItem": ["dildo"], "phase": 1}', '{}', 'binary', NULL, 20, 'Good girl. She worships.', false),
('worship', 'conditioning', 2, 'Cum content. Watch consumption.', 'See what good girls do.', '{"phase": 1}', '{}', 'duration', 10, 15, 'Good girl. That''s what she''ll do.', false),
('worship', 'arousal', 2, 'Visualize cum while practicing.', 'Imagine the moment.', '{"hasItem": ["dildo"], "phase": 1}', '{}', 'binary', NULL, 20, 'Good girl. She wants the reward.', false),
('worship', 'identity', 2, 'Say "I crave it" during arousal.', 'Let the desire be spoken.', '{"phase": 1, "denialDay": {"min": 5}}', '{}', 'binary', NULL, 20, 'Good girl. She craves.', false),
('worship', 'conditioning', 2, 'Edge to hypno about cock worship.', 'Let the programming deepen.', '{"phase": 1, "denialDay": {"min": 5}}', '{}', 'binary', NULL, 25, 'Good girl. She''s being trained.', false);

-- ============================================
-- WORSHIP TASKS - COCK/CUM CONDITIONING (Intensity 3-5)
-- ============================================

INSERT INTO task_bank (category, domain, intensity, instruction, subtext, requires, exclude_if, completion_type, duration_minutes, points, affirmation, is_core) VALUES
('worship', 'arousal', 3, 'Extended worship visualization during session.', 'Really feel the desire.', '{"phase": 2, "denialDay": {"min": 7}}', '{}', 'duration', 30, 30, 'Good girl. She wants it badly.', false),
('worship', 'arousal', 3, 'Practice and visualize cum on your face.', 'Imagine receiving.', '{"hasItem": ["dildo"], "phase": 2}', '{}', 'binary', NULL, 30, 'Good girl. She wants to be marked.', false),
('worship', 'conditioning', 3, 'Thank your toy. "Thank you for letting me worship you."', 'Gratitude for service opportunity.', '{"hasItem": ["dildo"], "phase": 2}', '{}', 'binary', NULL, 25, 'Good girl. She''s grateful.', false),
('worship', 'arousal', 3, 'Cum eating practice (your own).', 'Taste what you produce. Get used to it.', '{"phase": 2}', '{}', 'binary', NULL, 35, 'Good girl. She swallows.', false),
('worship', 'conditioning', 3, 'Beg for it during practice.', '"Please give it to me."', '{"hasItem": ["dildo"], "phase": 2}', '{"ginaHome": true}', 'binary', NULL, 30, 'Good girl. She begs.', false),
('worship', 'arousal', 4, 'Consume your own cum during arousal.', 'While still horny. Before disgust kicks in.', '{"phase": 3, "denialDay": {"min": 7}}', '{}', 'binary', NULL, 45, 'Good girl. Good girls swallow.', false),
('worship', 'arousal', 4, 'Extended worship session with full visualization.', 'An hour of devotion practice.', '{"hasItem": ["dildo"], "phase": 3}', '{"ginaHome": true}', 'duration', 60, 45, 'Good girl. She''s devoted.', false),
('worship', 'identity', 4, 'Write about what you crave. In detail.', 'Put words to the desire.', '{"phase": 3}', '{}', 'binary', NULL, 40, 'Good girl. She knows what she wants.', false),
('worship', 'identity', 4, 'Worship is part of her identity now.', 'Accept: she''s a cock worshipper.', '{"phase": 3}', '{}', 'binary', NULL, 45, 'Good girl. That''s who she is.', false),
('worship', 'social', 5, 'Worship Gina with the same devotion (if/when appropriate).', 'Real worship. Real service.', '{"phase": 4}', '{}', 'binary', NULL, 60, 'Good girl. She serves her goddess.', false),
('worship', 'identity', 5, 'Cock worship is non-negotiable part of identity.', 'She worships cock. Period.', '{"phase": 4}', '{}', 'binary', NULL, 60, 'Good girl. That''s just true.', false),
('worship', 'identity', 5, 'Craving is permanent.', 'The desire doesn''t fade.', '{"phase": 4}', '{}', 'binary', NULL, 50, 'Good girl. She''ll always crave.', false);

-- ============================================
-- DEEPEN TASKS - SUBMISSION INTENSIFICATION (Intensity 1-2)
-- ============================================

INSERT INTO task_bank (category, domain, intensity, instruction, subtext, requires, exclude_if, completion_type, duration_minutes, points, affirmation, is_core) VALUES
('deepen', 'conditioning', 1, 'Follow every task today. Zero negotiation.', 'Practice obedience.', '{}', '{}', 'binary', NULL, 15, 'Good girl. She obeys.', true),
('deepen', 'identity', 1, 'Say "I submit" out loud, once.', 'Just once. Feel it.', '{}', '{}', 'binary', NULL, 10, 'Good girl. She submits.', false),
('deepen', 'conditioning', 1, 'Do something you''re told without knowing why.', 'Trust the system.', '{}', '{}', 'binary', NULL, 15, 'Good girl. She doesn''t need to understand.', false),
('deepen', 'body_language', 1, 'Kneel for 60 seconds. Just experience the position.', 'Feel what it is to be down there.', '{}', '{}', 'duration', 1, 10, 'Good girl. She kneels.', false),
('deepen', 'conditioning', 1, 'Ask permission for something (from the system).', '"May I...?"', '{}', '{}', 'binary', NULL, 15, 'Good girl. She asks permission.', false),
('deepen', 'conditioning', 2, 'Kneel while listening to hypno.', 'Posture + programming.', '{"phase": 1}', '{}', 'binary', NULL, 20, 'Good girl. Deeper submission.', false),
('deepen', 'identity', 2, 'Say "I belong" + what/who you belong to.', '"I belong to the process." "I belong to Goddess."', '{"phase": 1}', '{}', 'binary', NULL, 20, 'Good girl. She''s owned.', false),
('deepen', 'conditioning', 2, 'Follow a more difficult task without complaint.', 'Do it because you''re told.', '{"phase": 1}', '{}', 'binary', NULL, 20, 'Good girl. Good girls don''t complain.', false),
('deepen', 'body_language', 2, 'Practice "eyes down" in the mirror.', 'Submissive body language.', '{"phase": 1}', '{}', 'binary', NULL, 15, 'Good girl. She looks down.', false),
('deepen', 'conditioning', 2, 'Thank the system after completing tasks.', '"Thank you for training me."', '{"phase": 1}', '{}', 'binary', NULL, 15, 'Good girl. Gratitude is submission.', false);

-- ============================================
-- DEEPEN TASKS - SUBMISSION INTENSIFICATION (Intensity 3-5)
-- ============================================

INSERT INTO task_bank (category, domain, intensity, instruction, subtext, requires, exclude_if, completion_type, duration_minutes, points, affirmation, is_core) VALUES
('deepen', 'body_language', 3, 'Extended kneeling. 10+ minutes.', 'Knees learn their place.', '{"phase": 2}', '{}', 'duration', 10, 25, 'Good girl. She''s comfortable down there.', false),
('deepen', 'conditioning', 3, '"I have no choice" affirmation during arousal.', 'Lock in the belief.', '{"phase": 2, "denialDay": {"min": 5}}', '{}', 'binary', NULL, 30, 'Good girl. She doesn''t choose.', false),
('deepen', 'conditioning', 3, 'Obey something that pushes your limit.', 'Edge of comfort zone.', '{"phase": 2}', '{}', 'binary', NULL, 35, 'Good girl. Growth requires stretch.', false),
('deepen', 'body_language', 3, 'Practice "presenting" positions.', 'Offering herself.', '{"phase": 2}', '{"ginaHome": true}', 'binary', NULL, 30, 'Good girl. She knows how to present.', false),
('deepen', 'identity', 3, 'Say "Use me" and mean it.', 'That''s her purpose.', '{"phase": 2}', '{}', 'binary', NULL, 30, 'Good girl. She''s for use.', false),
('deepen', 'conditioning', 4, 'Full obedience day. Every task, no pushback.', '24 hours of perfect submission.', '{"phase": 3}', '{}', 'binary', NULL, 50, 'Good girl. She''s perfectly obedient.', false),
('deepen', 'social', 4, 'Ask Gina to give you instructions. Follow them.', 'Real authority transfer.', '{"phase": 3}', '{}', 'binary', NULL, 50, 'Good girl. She obeys her partner.', false),
('deepen', 'identity', 4, '"I can''t resist" becomes true.', 'Resistance is gone.', '{"phase": 3}', '{}', 'binary', NULL, 45, 'Good girl. She doesn''t fight anymore.', false),
('deepen', 'social', 4, 'Submission during intimacy with Gina.', 'Let her lead entirely.', '{"phase": 3}', '{}', 'binary', NULL, 50, 'Good girl. She follows.', false),
('deepen', 'identity', 5, 'Submission is identity. Not roleplay.', 'She IS submissive.', '{"phase": 4}', '{}', 'binary', NULL, 60, 'Good girl. This is who she is.', false),
('deepen', 'social', 5, 'Keyholder arrangement (with Gina, if appropriate).', 'Real control transfer.', '{"phase": 4}', '{}', 'binary', NULL, 75, 'Good girl. She''s held.', false),
('deepen', 'identity', 5, 'Complete surrender. Nothing held back.', 'Everything belongs to the process.', '{"phase": 4, "streakDays": 60}', '{}', 'binary', NULL, 100, 'Good girl. She''s totally surrendered.', false);

-- ============================================
-- BAMBI TASKS - BIMBO TRAINING (Intensity 1-2)
-- ============================================

INSERT INTO task_bank (category, domain, intensity, instruction, subtext, requires, exclude_if, completion_type, duration_minutes, points, affirmation, is_core) VALUES
('bambi', 'conditioning', 1, 'Listen to Bambi intro file.', 'Meet Bambi.', '{}', '{}', 'binary', NULL, 15, 'Hello, Bambi.', true),
('bambi', 'conditioning', 1, 'Say "Good girl" after Bambi says it.', 'Echo the trigger.', '{}', '{}', 'binary', NULL, 10, 'Good girl.', false),
('bambi', 'conditioning', 1, 'Notice when your mind goes blank during hypno.', 'That''s Bambi space.', '{}', '{}', 'binary', NULL, 10, 'Good girl. She''s learning to drop.', false),
('bambi', 'conditioning', 1, '"Bambi sleep" trigger practice.', 'Say it, feel the pull.', '{}', '{}', 'binary', NULL, 15, 'Bambi sleeps.', false),
('bambi', 'conditioning', 1, 'Wear pink while listening.', 'Bambi''s color.', '{}', '{}', 'binary', NULL, 15, 'Good girl. Pink feels right.', false),
('bambi', 'conditioning', 2, 'Full Bambi core session.', 'Let her install.', '{"phase": 1}', '{}', 'duration', 30, 25, 'Bambi is installing.', false),
('bambi', 'body_language', 2, 'Practice vacant expression in mirror.', 'Bambi face.', '{"phase": 1}', '{"ginaHome": true}', 'binary', NULL, 20, 'Good girl. Empty and happy.', false),
('bambi', 'conditioning', 2, 'Say "Bambi is a good girl" 10 times.', 'Repetition installs.', '{"phase": 1}', '{}', 'binary', NULL, 20, 'Bambi is a good girl.', false),
('bambi', 'voice', 2, 'Giggle practice. High, feminine, empty.', 'Bambi giggles.', '{"phase": 1}', '{"ginaHome": true}', 'binary', NULL, 20, 'Teehee!', false),
('bambi', 'style', 2, 'Dress "bimbo" during Bambi session.', 'Slutty, pink, dumb.', '{"phase": 1}', '{"ginaHome": true}', 'binary', NULL, 25, 'Bambi''s look.', false);

-- ============================================
-- BAMBI TASKS - BIMBO TRAINING (Intensity 3-5)
-- ============================================

INSERT INTO task_bank (category, domain, intensity, instruction, subtext, requires, exclude_if, completion_type, duration_minutes, points, affirmation, is_core) VALUES
('bambi', 'conditioning', 3, 'Extended Bambi session. Multiple files.', 'Deep programming.', '{"phase": 2}', '{"ginaHome": true}', 'duration', 60, 35, 'Bambi goes so deep.', false),
('bambi', 'conditioning', 3, 'Practice empty-headedness. Thinking bad.', 'Bimbos don''t think.', '{"phase": 2}', '{}', 'duration', 15, 30, 'Good girl. Empty is good.', false),
('bambi', 'conditioning', 3, 'Bambi + edge session. Pleasure while programming.', 'Arousal + installation.', '{"phase": 2, "denialDay": {"min": 5}}', '{}', 'binary', NULL, 35, 'Bambi loves pleasure.', false),
('bambi', 'identity', 3, 'Refer to yourself as Bambi (during sessions).', 'She has a name.', '{"phase": 2}', '{}', 'binary', NULL, 30, 'Bambi is here.', false),
('bambi', 'style', 3, 'Full bimbo presentation during Bambi time.', 'Look like Bambi.', '{"phase": 2}', '{"ginaHome": true}', 'binary', NULL, 35, 'She''s fully Bambi.', false),
('bambi', 'conditioning', 4, 'Bambi sleep at bedtime. Overnight conditioning.', 'Program while sleeping.', '{"phase": 3}', '{}', 'binary', NULL, 45, 'Bambi dreams.', false),
('bambi', 'conditioning', 4, 'Extended trigger reinforcement session.', 'All the triggers, repeated.', '{"phase": 3}', '{}', 'duration', 45, 45, 'Triggers locked in.', false),
('bambi', 'identity', 4, 'Bambi persona fully accepted.', 'She''s not becoming Bambi. She IS Bambi sometimes.', '{"phase": 3}', '{}', 'binary', NULL, 50, 'Bambi exists.', false),
('bambi', 'conditioning', 4, 'Practice switching into Bambi mode on command.', '"Bambi ready" → she''s there.', '{"phase": 3}', '{}', 'binary', NULL, 45, 'Instant switch.', false),
('bambi', 'conditioning', 5, 'Bambi can be called forward at any time.', 'Maxy and Bambi coexist.', '{"phase": 4}', '{}', 'binary', NULL, 60, 'She''s plural now.', false),
('bambi', 'conditioning', 5, 'Bambi maintenance is permanent.', 'Weekly minimum.', '{"phase": 4}', '{}', 'binary', NULL, 60, 'Bambi needs her sessions.', false),
('bambi', 'conditioning', 5, 'Bambi is forever.', 'She can''t be uninstalled.', '{"phase": 4, "streakDays": 90}', '{}', 'binary', NULL, 100, 'Bambi is part of her.', false)
