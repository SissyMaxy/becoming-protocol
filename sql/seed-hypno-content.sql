-- Seed Hypno Content for Becoming Protocol
-- Run this in Supabase SQL Editor after v10 schema

-- ============================================
-- AUDIO: INDUCTION FILES (24 files)
-- Entry-level trance induction - always available
-- ============================================

INSERT INTO reward_content (title, description, content_type, tier, content_url, tags, intensity_level, is_active) VALUES
('Induction 1', 'Gentle trance induction', 'hypno', 'daily', '/hypno/sissy/aud/Induction (1).mp3', ARRAY['induction', 'beginner', 'trance'], 1, true),
('Induction 2', 'Relaxation induction', 'hypno', 'daily', '/hypno/sissy/aud/Induction (2).mp3', ARRAY['induction', 'beginner', 'trance'], 1, true),
('Induction 3', 'Deep breathing induction', 'hypno', 'daily', '/hypno/sissy/aud/Induction (3).mp3', ARRAY['induction', 'beginner', 'trance'], 1, true),
('Induction 4', 'Progressive relaxation', 'hypno', 'daily', '/hypno/sissy/aud/Induction (4).mp3', ARRAY['induction', 'beginner', 'trance'], 1, true),
('Induction 5', 'Countdown induction', 'hypno', 'daily', '/hypno/sissy/aud/Induction (5).mp3', ARRAY['induction', 'beginner', 'trance'], 1, true),
('Induction 6', 'Visualization induction', 'hypno', 'daily', '/hypno/sissy/aud/Induction (6).mp3', ARRAY['induction', 'beginner', 'trance'], 1, true),
('Induction 7', 'Body scan induction', 'hypno', 'daily', '/hypno/sissy/aud/Induction (7).mp3', ARRAY['induction', 'beginner', 'trance'], 1, true),
('Induction 8', 'Floating induction', 'hypno', 'daily', '/hypno/sissy/aud/Induction (8).mp3', ARRAY['induction', 'beginner', 'trance'], 1, true),
('Induction 9', 'Staircase induction', 'hypno', 'daily', '/hypno/sissy/aud/Induction (9).mp3', ARRAY['induction', 'beginner', 'trance'], 2, true),
('Induction 10', 'Eye fixation induction', 'hypno', 'daily', '/hypno/sissy/aud/Induction (10).mp3', ARRAY['induction', 'beginner', 'trance'], 2, true),
('Induction 11', 'Spiral induction', 'hypno', 'daily', '/hypno/sissy/aud/Induction (11).mp3', ARRAY['induction', 'intermediate', 'trance'], 2, true),
('Induction 12', 'Confusion induction', 'hypno', 'daily', '/hypno/sissy/aud/Induction (12).mp3', ARRAY['induction', 'intermediate', 'trance'], 2, true),
('Induction 13', 'Rapid induction', 'hypno', 'earned', '/hypno/sissy/aud/Induction (13).mp3', ARRAY['induction', 'intermediate', 'trance'], 2, true),
('Induction 14', 'Fractionation induction', 'hypno', 'earned', '/hypno/sissy/aud/Induction (14).mp3', ARRAY['induction', 'intermediate', 'trance'], 2, true),
('Induction 15', 'Deepening induction', 'hypno', 'earned', '/hypno/sissy/aud/Induction (15).mp3', ARRAY['induction', 'intermediate', 'trance'], 2, true),
('Induction 16', 'Sleep induction', 'hypno', 'earned', '/hypno/sissy/aud/Induction (16).mp3', ARRAY['induction', 'intermediate', 'trance'], 3, true),
('Induction 17', 'Surrender induction', 'hypno', 'earned', '/hypno/sissy/aud/Induction (17).mp3', ARRAY['induction', 'advanced', 'trance'], 3, true),
('Induction 18', 'Deep trance induction', 'hypno', 'earned', '/hypno/sissy/aud/Induction (18).mp3', ARRAY['induction', 'advanced', 'trance'], 3, true),
('Induction 19', 'Layered induction', 'hypno', 'earned', '/hypno/sissy/aud/Induction (19).mp3', ARRAY['induction', 'advanced', 'trance'], 3, true),
('Induction 20', 'Intense induction', 'hypno', 'earned', '/hypno/sissy/aud/Induction (20).mp3', ARRAY['induction', 'advanced', 'trance'], 4, true),
('Induction 21', 'Advanced trance', 'hypno', 'premium', '/hypno/sissy/aud/Induction (21).mp3', ARRAY['induction', 'advanced', 'trance'], 4, true),
('Induction 22', 'Deep state induction', 'hypno', 'premium', '/hypno/sissy/aud/Induction (22).mp3', ARRAY['induction', 'advanced', 'trance'], 4, true),
('Induction 23', 'Expert induction', 'hypno', 'premium', '/hypno/sissy/aud/Induction (23).mp3', ARRAY['induction', 'expert', 'trance'], 5, true),
('Induction 24', 'Master induction', 'hypno', 'vault', '/hypno/sissy/aud/Induction (24).mp3', ARRAY['induction', 'expert', 'trance'], 5, true)
ON CONFLICT DO NOTHING;

-- ============================================
-- AUDIO: DEEPENER FILES (13 files)
-- Trance deepening - earned through sessions
-- ============================================

INSERT INTO reward_content (title, description, content_type, tier, content_url, tags, intensity_level, is_active) VALUES
('Deepener 1', 'Basic deepening', 'hypno', 'daily', '/hypno/sissy/aud/Deepener (1).mp3', ARRAY['deepener', 'beginner', 'trance'], 1, true),
('Deepener 2', 'Progressive deepening', 'hypno', 'daily', '/hypno/sissy/aud/Deepener (2).mp3', ARRAY['deepener', 'beginner', 'trance'], 1, true),
('Deepener 3', 'Countdown deepener', 'hypno', 'daily', '/hypno/sissy/aud/Deepener (3).mp3', ARRAY['deepener', 'beginner', 'trance'], 2, true),
('Deepener 4', 'Staircase deepener', 'hypno', 'earned', '/hypno/sissy/aud/Deepener (4).mp3', ARRAY['deepener', 'intermediate', 'trance'], 2, true),
('Deepener Extended 1', 'Extended deepening session', 'hypno', 'earned', '/hypno/sissy/aud/Deepener1 (1).mp3', ARRAY['deepener', 'intermediate', 'trance'], 2, true),
('Deepener Extended 2', 'Layered deepening', 'hypno', 'earned', '/hypno/sissy/aud/Deepener1 (2).mp3', ARRAY['deepener', 'intermediate', 'trance'], 2, true),
('Deepener Extended 3', 'Fractionation deepener', 'hypno', 'earned', '/hypno/sissy/aud/Deepener1 (3).mp3', ARRAY['deepener', 'intermediate', 'trance'], 3, true),
('Deepener Extended 4', 'Intense deepening', 'hypno', 'earned', '/hypno/sissy/aud/Deepener1 (4).mp3', ARRAY['deepener', 'advanced', 'trance'], 3, true),
('Deepener Extended 5', 'Deep state deepener', 'hypno', 'premium', '/hypno/sissy/aud/Deepener1 (5).mp3', ARRAY['deepener', 'advanced', 'trance'], 3, true),
('Deepener Extended 6', 'Advanced deepening', 'hypno', 'premium', '/hypno/sissy/aud/Deepener1 (6).mp3', ARRAY['deepener', 'advanced', 'trance'], 4, true),
('Deepener Extended 7', 'Expert deepening', 'hypno', 'premium', '/hypno/sissy/aud/Deepener1 (7).mp3', ARRAY['deepener', 'expert', 'trance'], 4, true),
('Deepener Extended 8', 'Master deepening', 'hypno', 'vault', '/hypno/sissy/aud/Deepener1 (8).mp3', ARRAY['deepener', 'expert', 'trance'], 5, true),
('Deepener Extended 9', 'Ultimate deepener', 'hypno', 'vault', '/hypno/sissy/aud/Deepener1 (9).mp3', ARRAY['deepener', 'expert', 'trance'], 5, true)
ON CONFLICT DO NOTHING;

-- ============================================
-- AUDIO: PROGRAMMING FILES (54 files)
-- Core conditioning content - tiered access
-- ============================================

INSERT INTO reward_content (title, description, content_type, tier, content_url, tags, intensity_level, is_active) VALUES
-- Beginner programming (1-15) - daily/earned
('Programming 1', 'Foundation conditioning', 'hypno', 'daily', '/hypno/sissy/aud/Programming (1).wav', ARRAY['programming', 'beginner', 'conditioning'], 1, true),
('Programming 2', 'Basic affirmations', 'hypno', 'daily', '/hypno/sissy/aud/Programming (2).wav', ARRAY['programming', 'beginner', 'conditioning'], 1, true),
('Programming 3', 'Identity seeds', 'hypno', 'daily', '/hypno/sissy/aud/Programming (3).wav', ARRAY['programming', 'beginner', 'conditioning'], 1, true),
('Programming 4', 'Gentle suggestions', 'hypno', 'daily', '/hypno/sissy/aud/Programming (4).wav', ARRAY['programming', 'beginner', 'conditioning'], 1, true),
('Programming 5', 'Early training', 'hypno', 'daily', '/hypno/sissy/aud/Programming (5).wav', ARRAY['programming', 'beginner', 'conditioning'], 2, true),
('Programming 6', 'Mindset foundation', 'hypno', 'daily', '/hypno/sissy/aud/Programming (6).wav', ARRAY['programming', 'beginner', 'conditioning'], 2, true),
('Programming 7', 'Core beliefs', 'hypno', 'daily', '/hypno/sissy/aud/Programming (7).wav', ARRAY['programming', 'beginner', 'conditioning'], 2, true),
('Programming 8', 'Basic triggers', 'hypno', 'earned', '/hypno/sissy/aud/Programming (8).wav', ARRAY['programming', 'beginner', 'conditioning', 'triggers'], 2, true),
('Programming 9', 'Acceptance training', 'hypno', 'earned', '/hypno/sissy/aud/Programming (9).wav', ARRAY['programming', 'beginner', 'conditioning'], 2, true),
('Programming 10', 'Desire building', 'hypno', 'earned', '/hypno/sissy/aud/Programming (10).wav', ARRAY['programming', 'intermediate', 'conditioning'], 2, true),
('Programming 11', 'Reinforcement loop', 'hypno', 'earned', '/hypno/sissy/aud/Programming (11).wav', ARRAY['programming', 'intermediate', 'conditioning'], 2, true),
('Programming 12', 'Behavior shaping', 'hypno', 'earned', '/hypno/sissy/aud/Programming (12).wav', ARRAY['programming', 'intermediate', 'conditioning'], 3, true),
('Programming 13', 'Identity building', 'hypno', 'earned', '/hypno/sissy/aud/Programming (13).wav', ARRAY['programming', 'intermediate', 'conditioning'], 3, true),
('Programming 14', 'Pleasure linking', 'hypno', 'earned', '/hypno/sissy/aud/Programming (14).wav', ARRAY['programming', 'intermediate', 'conditioning'], 3, true),
('Programming 15', 'Deep programming', 'hypno', 'earned', '/hypno/sissy/aud/Programming (15).wav', ARRAY['programming', 'intermediate', 'conditioning'], 3, true),

-- Intermediate programming (16-30) - earned/premium
('Programming 16', 'Advanced suggestions', 'hypno', 'earned', '/hypno/sissy/aud/Programming (16).wav', ARRAY['programming', 'intermediate', 'conditioning'], 3, true),
('Programming 17', 'Trigger training', 'hypno', 'earned', '/hypno/sissy/aud/Programming (17).wav', ARRAY['programming', 'intermediate', 'conditioning', 'triggers'], 3, true),
('Programming 18', 'Behavior modification', 'hypno', 'earned', '/hypno/sissy/aud/Programming (18).wav', ARRAY['programming', 'intermediate', 'conditioning'], 3, true),
('Programming 19', 'Desire amplification', 'hypno', 'earned', '/hypno/sissy/aud/Programming (19).wav', ARRAY['programming', 'intermediate', 'conditioning'], 3, true),
('Programming 20', 'Identity reinforcement', 'hypno', 'earned', '/hypno/sissy/aud/Programming (20).wav', ARRAY['programming', 'intermediate', 'conditioning'], 3, true),
('Programming 21', 'Obedience training', 'hypno', 'premium', '/hypno/sissy/aud/Programming (21).wav', ARRAY['programming', 'advanced', 'conditioning', 'obedience'], 3, true),
('Programming 22', 'Pleasure conditioning', 'hypno', 'premium', '/hypno/sissy/aud/Programming (22).wav', ARRAY['programming', 'advanced', 'conditioning'], 3, true),
('Programming 23', 'Deep identity work', 'hypno', 'premium', '/hypno/sissy/aud/Programming (23).wav', ARRAY['programming', 'advanced', 'conditioning'], 4, true),
('Programming 24', 'Compulsion building', 'hypno', 'premium', '/hypno/sissy/aud/Programming (24).wav', ARRAY['programming', 'advanced', 'conditioning'], 4, true),
('Programming 25', 'Automatic behaviors', 'hypno', 'premium', '/hypno/sissy/aud/Programming (25).wav', ARRAY['programming', 'advanced', 'conditioning'], 4, true),
('Programming 26', 'Mindset locking', 'hypno', 'premium', '/hypno/sissy/aud/Programming (26).wav', ARRAY['programming', 'advanced', 'conditioning'], 4, true),
('Programming 27', 'Intense conditioning', 'hypno', 'premium', '/hypno/sissy/aud/Programming (27).wav', ARRAY['programming', 'advanced', 'conditioning'], 4, true),
('Programming 28', 'Advanced triggers', 'hypno', 'premium', '/hypno/sissy/aud/Programming (28).wav', ARRAY['programming', 'advanced', 'conditioning', 'triggers'], 4, true),
('Programming 29', 'Permanent changes', 'hypno', 'premium', '/hypno/sissy/aud/Programming (29).wav', ARRAY['programming', 'advanced', 'conditioning'], 4, true),
('Programming 30', 'Deep programming', 'hypno', 'premium', '/hypno/sissy/aud/Programming (30).wav', ARRAY['programming', 'advanced', 'conditioning'], 4, true),

-- Advanced programming (31-45) - premium/vault
('Programming 31', 'Expert conditioning', 'hypno', 'premium', '/hypno/sissy/aud/Programming (31).wav', ARRAY['programming', 'expert', 'conditioning'], 4, true),
('Programming 32', 'Intense training', 'hypno', 'premium', '/hypno/sissy/aud/Programming (32).wav', ARRAY['programming', 'expert', 'conditioning'], 4, true),
('Programming 33', 'Advanced obedience', 'hypno', 'premium', '/hypno/sissy/aud/Programming (33).wav', ARRAY['programming', 'expert', 'conditioning', 'obedience'], 4, true),
('Programming 34', 'Deep compulsions', 'hypno', 'premium', '/hypno/sissy/aud/Programming (34).wav', ARRAY['programming', 'expert', 'conditioning'], 4, true),
('Programming 35', 'Permanent triggers', 'hypno', 'vault', '/hypno/sissy/aud/Programming (35).wav', ARRAY['programming', 'expert', 'conditioning', 'triggers'], 5, true),
('Programming 36', 'Master programming', 'hypno', 'vault', '/hypno/sissy/aud/Programming (36).wav', ARRAY['programming', 'expert', 'conditioning'], 5, true),
('Programming 37', 'Ultimate conditioning', 'hypno', 'vault', '/hypno/sissy/aud/Programming (37).wav', ARRAY['programming', 'expert', 'conditioning'], 5, true),
('Programming 38', 'Deep identity lock', 'hypno', 'vault', '/hypno/sissy/aud/Programming (38).wav', ARRAY['programming', 'expert', 'conditioning'], 5, true),
('Programming 39', 'Extreme training', 'hypno', 'vault', '/hypno/sissy/aud/Programming (39).wav', ARRAY['programming', 'expert', 'conditioning'], 5, true),
('Programming 40', 'Total programming', 'hypno', 'vault', '/hypno/sissy/aud/Programming (40).wav', ARRAY['programming', 'expert', 'conditioning'], 5, true),
('Programming 41', 'Advanced identity', 'hypno', 'vault', '/hypno/sissy/aud/Programming (41).wav', ARRAY['programming', 'expert', 'conditioning'], 5, true),
('Programming 42', 'Deep obedience', 'hypno', 'vault', '/hypno/sissy/aud/Programming (42).wav', ARRAY['programming', 'expert', 'conditioning', 'obedience'], 5, true),
('Programming 43', 'Permanent changes', 'hypno', 'vault', '/hypno/sissy/aud/Programming (43).wav', ARRAY['programming', 'expert', 'conditioning'], 5, true),
('Programming 44', 'Master training', 'hypno', 'vault', '/hypno/sissy/aud/Programming (44).wav', ARRAY['programming', 'expert', 'conditioning'], 5, true),
('Programming 45', 'Ultimate identity', 'hypno', 'vault', '/hypno/sissy/aud/Programming (45).wav', ARRAY['programming', 'expert', 'conditioning'], 5, true),

-- Expert programming (46-54) - vault only
('Programming 46', 'Expert level 1', 'hypno', 'vault', '/hypno/sissy/aud/Programming (46).wav', ARRAY['programming', 'expert', 'conditioning'], 5, true),
('Programming 47', 'Expert level 2', 'hypno', 'vault', '/hypno/sissy/aud/Programming (47).wav', ARRAY['programming', 'expert', 'conditioning'], 5, true),
('Programming 48', 'Expert level 3', 'hypno', 'vault', '/hypno/sissy/aud/Programming (48).wav', ARRAY['programming', 'expert', 'conditioning'], 5, true),
('Programming 49', 'Expert level 4', 'hypno', 'vault', '/hypno/sissy/aud/Programming (49).wav', ARRAY['programming', 'expert', 'conditioning'], 5, true),
('Programming 50', 'Expert level 5', 'hypno', 'vault', '/hypno/sissy/aud/Programming (50).wav', ARRAY['programming', 'expert', 'conditioning'], 5, true),
('Programming 51', 'Master level 1', 'hypno', 'vault', '/hypno/sissy/aud/Programming (51).mp3', ARRAY['programming', 'master', 'conditioning'], 5, true),
('Programming 52', 'Master level 2', 'hypno', 'vault', '/hypno/sissy/aud/Programming (52).mp3', ARRAY['programming', 'master', 'conditioning'], 5, true),
('Programming 53', 'Master level 3', 'hypno', 'vault', '/hypno/sissy/aud/Programming (53).mp3', ARRAY['programming', 'master', 'conditioning'], 5, true),
('Programming 54', 'Master level 4', 'hypno', 'vault', '/hypno/sissy/aud/Programming (54).mp3', ARRAY['programming', 'master', 'conditioning'], 5, true)
ON CONFLICT DO NOTHING;

-- ============================================
-- IMAGES: SESSION VISUALS (48 GIFs)
-- Visual content for sessions - tiered access
-- ============================================

INSERT INTO reward_content (title, description, content_type, tier, content_url, tags, intensity_level, is_active) VALUES
-- Induction visuals (always available)
('Visual: Agree', 'Induction agreement visual', 'image', 'daily', '/hypno/sissy/img/Induction_Agree.gif', ARRAY['visual', 'induction', 'session'], 1, true),
('Visual: Breathe', 'Breathing visualization', 'image', 'daily', '/hypno/sissy/img/Induction_Breathe.gif', ARRAY['visual', 'induction', 'session'], 1, true),
('Visual: Relax', 'Relaxation visual', 'image', 'daily', '/hypno/sissy/img/Induction_Relax.gif', ARRAY['visual', 'induction', 'session'], 1, true),
('Visual: Good Girl Flash', 'Reinforcement visual', 'image', 'daily', '/hypno/sissy/img/Induction_GoodGirlFlashFade.gif', ARRAY['visual', 'induction', 'session', 'reinforcement'], 2, true),
('Visual: Bambi Sleep', 'Sleep trigger visual', 'image', 'earned', '/hypno/sissy/img/Induction_BambiSleepFlashFade.gif', ARRAY['visual', 'induction', 'session', 'triggers'], 3, true),
('Visual: Bimbo Doll', 'Identity visual', 'image', 'earned', '/hypno/sissy/img/Induction_BimbDollFlashFade.gif', ARRAY['visual', 'induction', 'session'], 3, true),

-- Programming visuals (tiered)
('Visual: Programming 1', 'Session visual 1', 'image', 'daily', '/hypno/sissy/img/ProgrammingImg1.gif', ARRAY['visual', 'programming', 'session'], 1, true),
('Visual: Programming 2', 'Session visual 2', 'image', 'daily', '/hypno/sissy/img/ProgrammingImg2.gif', ARRAY['visual', 'programming', 'session'], 1, true),
('Visual: Programming 3', 'Session visual 3', 'image', 'daily', '/hypno/sissy/img/ProgrammingImg3.gif', ARRAY['visual', 'programming', 'session'], 2, true),
('Visual: Programming 4', 'Session visual 4', 'image', 'daily', '/hypno/sissy/img/ProgrammingImg4.gif', ARRAY['visual', 'programming', 'session'], 2, true),
('Visual: Programming 5', 'Session visual 5', 'image', 'earned', '/hypno/sissy/img/ProgrammingImg5.gif', ARRAY['visual', 'programming', 'session'], 2, true),
('Visual: Programming 6', 'Session visual 6', 'image', 'earned', '/hypno/sissy/img/ProgrammingImg6.gif', ARRAY['visual', 'programming', 'session'], 2, true),
('Visual: Programming 7', 'Session visual 7', 'image', 'earned', '/hypno/sissy/img/ProgrammingImg7.gif', ARRAY['visual', 'programming', 'session'], 3, true),
('Visual: Programming 8', 'Session visual 8', 'image', 'earned', '/hypno/sissy/img/ProgrammingImg8.gif', ARRAY['visual', 'programming', 'session'], 3, true),
('Visual: Programming 9', 'Session visual 9', 'image', 'premium', '/hypno/sissy/img/ProgrammingImg9.gif', ARRAY['visual', 'programming', 'session'], 3, true),
('Visual: Programming 10', 'Session visual 10', 'image', 'premium', '/hypno/sissy/img/ProgrammingImg10.gif', ARRAY['visual', 'programming', 'session'], 4, true),
('Visual: Programming 11', 'Session visual 11', 'image', 'premium', '/hypno/sissy/img/ProgrammingImg11.gif', ARRAY['visual', 'programming', 'session'], 4, true),
('Visual: Programming 12', 'Session visual 12', 'image', 'premium', '/hypno/sissy/img/ProgrammingImg12.gif', ARRAY['visual', 'programming', 'session'], 4, true),
('Visual: Programming 13', 'Session visual 13', 'image', 'vault', '/hypno/sissy/img/ProgrammingImg13.gif', ARRAY['visual', 'programming', 'session'], 5, true),
('Visual: Programming 14', 'Session visual 14', 'image', 'vault', '/hypno/sissy/img/ProgrammingImg14.gif', ARRAY['visual', 'programming', 'session'], 5, true),
('Visual: Programming 15', 'Session visual 15', 'image', 'vault', '/hypno/sissy/img/ProgrammingImg15.gif', ARRAY['visual', 'programming', 'session'], 5, true),

-- Bounce/rhythm visuals (for gooning sessions)
('Visual: Bounce 2', 'Rhythm visual', 'image', 'earned', '/hypno/sissy/img/BOUNCE2.gif', ARRAY['visual', 'gooning', 'session', 'rhythm'], 3, true),
('Visual: Bounce 3', 'Rhythm visual', 'image', 'earned', '/hypno/sissy/img/BOUNCE3.gif', ARRAY['visual', 'gooning', 'session', 'rhythm'], 3, true),
('Visual: Bounce 4', 'Rhythm visual', 'image', 'premium', '/hypno/sissy/img/Bounce4.gif', ARRAY['visual', 'gooning', 'session', 'rhythm'], 4, true),
('Visual: Bounce Tumblr', 'Rhythm visual', 'image', 'premium', '/hypno/sissy/img/BOUNCETUMBLR.gif', ARRAY['visual', 'gooning', 'session', 'rhythm'], 4, true),
('Visual: Sept Bounce', 'Rhythm visual', 'image', 'vault', '/hypno/sissy/img/SEPT 2024BOUNCE2.gif', ARRAY['visual', 'gooning', 'session', 'rhythm'], 5, true),

-- Themed visuals
('Visual: Be Silly', 'Playful visual', 'image', 'daily', '/hypno/sissy/img/BeSilly.gif', ARRAY['visual', 'playful', 'session'], 1, true),
('Visual: Be Bimbo', 'Identity visual', 'image', 'earned', '/hypno/sissy/img/BeaBimbo.gif', ARRAY['visual', 'identity', 'session'], 2, true),
('Visual: Bimbo 2', 'Identity visual', 'image', 'earned', '/hypno/sissy/img/Bimbo-Gif-2.gif', ARRAY['visual', 'identity', 'session'], 3, true),
('Visual: Give In', 'Surrender visual', 'image', 'premium', '/hypno/sissy/img/GIVEINTUMBLR.gif', ARRAY['visual', 'surrender', 'session'], 4, true),
('Visual: Chip', 'Compliance visual', 'image', 'premium', '/hypno/sissy/img/ChipTumblr.gif', ARRAY['visual', 'compliance', 'session'], 4, true),

-- Bambi themed visuals
('Visual: Bambi', 'Bambi themed visual', 'image', 'earned', '/hypno/sissy/img/bambigif.gif', ARRAY['visual', 'bambi', 'session'], 3, true),
('Visual: Bambi Obey', 'Obedience visual', 'image', 'premium', '/hypno/sissy/img/BAMBIRUBANDOBEY.gif', ARRAY['visual', 'bambi', 'session', 'obedience'], 4, true),

-- Monthly collection visuals
('Visual: January 1', 'Collection visual', 'image', 'earned', '/hypno/sissy/img/JANGif1.gif', ARRAY['visual', 'collection', 'session'], 2, true),
('Visual: January 4', 'Collection visual', 'image', 'earned', '/hypno/sissy/img/JanGif4.gif', ARRAY['visual', 'collection', 'session'], 2, true),
('Visual: January 6', 'Collection visual', 'image', 'premium', '/hypno/sissy/img/JanGif6.gif', ARRAY['visual', 'collection', 'session'], 3, true),
('Visual: January 8', 'Collection visual', 'image', 'premium', '/hypno/sissy/img/JanGif8.gif', ARRAY['visual', 'collection', 'session'], 3, true),
('Visual: April 1', 'Collection visual', 'image', 'earned', '/hypno/sissy/img/2025APRILGIF 1.gif', ARRAY['visual', 'collection', 'session'], 2, true),
('Visual: April 2', 'Collection visual', 'image', 'earned', '/hypno/sissy/img/2025AprilGif 2.gif', ARRAY['visual', 'collection', 'session'], 2, true),
('Visual: April 4', 'Collection visual', 'image', 'premium', '/hypno/sissy/img/AprilGif4.gif', ARRAY['visual', 'collection', 'session'], 3, true),
('Visual: September 3', 'Collection visual', 'image', 'premium', '/hypno/sissy/img/SEPT 2024GIF3.gif', ARRAY['visual', 'collection', 'session'], 4, true),
('Visual: December 4', 'Collection visual', 'image', 'vault', '/hypno/sissy/img/DecemberGIF4.gif', ARRAY['visual', 'collection', 'session'], 5, true),

-- Misc visuals
('Visual: CZN 2', 'Session visual', 'image', 'premium', '/hypno/sissy/img/CZN2.gif', ARRAY['visual', 'session'], 4, true),
('Visual: Flaky', 'Session visual', 'image', 'earned', '/hypno/sissy/img/ThankfulFlakyYardant.gif', ARRAY['visual', 'session'], 2, true),
('Visual: Random 1', 'Session visual', 'image', 'premium', '/hypno/sissy/img/954b2151f2fd5935605e3d3c290a9713b47fa87f.gif', ARRAY['visual', 'session'], 3, true),
('Visual: Random 2', 'Session visual', 'image', 'premium', '/hypno/sissy/img/d4266e792bbde9867b549ed2095347c8.gif', ARRAY['visual', 'session'], 3, true),
('Visual: Pretty', 'Session visual', 'image', 'vault', '/hypno/sissy/img/lucifurby_-_Pretty_Big_Titties_-_0489btb-19.gif', ARRAY['visual', 'session'], 5, true),
('Visual: Drool', 'Intense visual', 'image', 'vault', '/hypno/sissy/img/DROOLONYOURTITS.gif', ARRAY['visual', 'session', 'intense'], 5, true)
ON CONFLICT DO NOTHING;

-- ============================================
-- SUMMARY
-- ============================================
-- Total content seeded:
-- - 24 Induction audio files
-- - 13 Deepener audio files
-- - 54 Programming audio files
-- - 48 Visual GIF files
-- = 139 total content items
