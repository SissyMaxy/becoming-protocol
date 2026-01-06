-- ============================================
-- HAPTIC PATTERN LIBRARY SEED
-- Becoming Protocol — Lovense Control Patterns
-- ============================================

-- Clear existing patterns and insert fresh
DELETE FROM haptic_patterns;

INSERT INTO haptic_patterns (name, description, command_type, command_payload, duration_sec, intensity_min, intensity_max, use_context) VALUES

-- ============================================
-- MICRO-REWARDS
-- ============================================

('task_complete', 'Brief acknowledgment pulse for completing a task', 'Pattern',
 '{"pattern": "V:1;F:v8;S:300#V:1;F:v12;S:400#V:1;F:v8;S:300"}', 2, 8, 12,
 ARRAY['task_complete']),

('good_girl', 'Warm wave accompanying good girl affirmation', 'Pattern',
 '{"pattern": "V:1;F:v4;S:500#V:1;F:v8;S:800#V:1;F:v10;S:600#V:1;F:v8;S:500#V:1;F:v4;S:400"}', 3, 4, 10,
 ARRAY['affirmation']),

('streak_milestone', 'Celebration burst for hitting streak milestones', 'Pattern',
 '{"pattern": "V:1;F:v6;S:200#V:1;F:v12;S:300#V:1;F:v16;S:500#V:1;F:v12;S:300#V:1;F:v6;S:200#V:1;F:v0;S:300#V:1;F:v10;S:400#V:1;F:v14;S:600#V:1;F:v10;S:300"}', 4, 6, 16,
 ARRAY['milestone', 'streak_milestone']),

('protocol_complete', 'Satisfying closure pulse for completing daily protocol', 'Pattern',
 '{"pattern": "V:1;F:v5;S:400#V:1;F:v9;S:600#V:1;F:v12;S:800#V:1;F:v9;S:600#V:1;F:v5;S:400#V:1;F:v2;S:800"}', 4, 2, 12,
 ARRAY['protocol', 'evening']),

('level_up', 'Level up celebration pattern', 'Preset',
 '{"name": "fireworks", "timeSec": 6}', 6, 12, 18,
 ARRAY['level_up', 'achievement']),

('achievement_unlock', 'Achievement earned celebration', 'Pattern',
 '{"pattern": "V:1;F:v10;S:300#V:1;F:v14;S:400#V:1;F:v17;S:600#V:1;F:v14;S:400#V:1;F:v10;S:300"}', 3, 10, 17,
 ARRAY['achievement']),

-- ============================================
-- NOTIFICATIONS (Variable Ratio Reinforcement)
-- ============================================

-- Tier 1: Subtle (40%)
('notification_whisper', 'Subtle awareness ping', 'Pattern',
 '{"pattern": "V:1;F:v3;S:400#V:1;F:v5;S:600#V:1;F:v3;S:400"}', 2, 3, 5,
 ARRAY['notification', 'subtle']),

('notification_tap', 'Quick double tap', 'Pattern',
 '{"pattern": "V:1;F:v6;S:200#V:1;F:v0;S:300#V:1;F:v6;S:200"}', 1, 0, 6,
 ARRAY['notification', 'subtle']),

('notification_hint', 'Single gentle hint', 'Pattern',
 '{"pattern": "V:1;F:v4;S:800"}', 1, 4, 4,
 ARRAY['notification', 'subtle']),

-- Tier 2: Moderate (30%)
('notification_pulse_double', 'Pleasant double pulse', 'Pattern',
 '{"pattern": "V:1;F:v8;S:400#V:1;F:v0;S:200#V:1;F:v10;S:500#V:1;F:v0;S:200#V:1;F:v8;S:400"}', 2, 0, 10,
 ARRAY['notification', 'moderate']),

('notification_wave_small', 'Small pleasant wave', 'Pattern',
 '{"pattern": "V:1;F:v5;S:300#V:1;F:v8;S:400#V:1;F:v10;S:500#V:1;F:v8;S:400#V:1;F:v5;S:300"}', 2, 5, 10,
 ARRAY['notification', 'moderate']),

('notification_throb', 'Deep throb pulse', 'Pattern',
 '{"pattern": "V:1;F:v7;S:600#V:1;F:v11;S:800#V:1;F:v7;S:600"}', 2, 7, 11,
 ARRAY['notification', 'moderate']),

-- Tier 3: Strong (22%)
('notification_surge', 'Strong surge wave', 'Pattern',
 '{"pattern": "V:1;F:v6;S:300#V:1;F:v10;S:400#V:1;F:v14;S:600#V:1;F:v10;S:400#V:1;F:v6;S:300"}', 2, 6, 14,
 ARRAY['notification', 'strong']),

('notification_cascade', 'Cascading intensity wave', 'Pattern',
 '{"pattern": "V:1;F:v8;S:250#V:1;F:v12;S:350#V:1;F:v15;S:450#V:1;F:v12;S:350#V:1;F:v8;S:250#V:1;F:v4;S:350"}', 2, 4, 15,
 ARRAY['notification', 'strong']),

('notification_embrace', 'Warm embracing wave', 'Pattern',
 '{"pattern": "V:1;F:v5;S:400#V:1;F:v10;S:600#V:1;F:v13;S:1000#V:1;F:v10;S:600#V:1;F:v5;S:400"}', 3, 5, 13,
 ARRAY['notification', 'strong']),

-- Tier 4: Jackpot (8%)
('notification_fireworks', 'Rare jackpot fireworks', 'Preset',
 '{"name": "fireworks", "timeSec": 8}', 8, 12, 20,
 ARRAY['notification', 'jackpot']),

('notification_crescendo', 'Building crescendo jackpot', 'Pattern',
 '{"pattern": "V:1;F:v4;S:500#V:1;F:v8;S:600#V:1;F:v12;S:700#V:1;F:v16;S:1000#V:1;F:v18;S:1500#V:1;F:v14;S:600#V:1;F:v10;S:500#V:1;F:v6;S:400"}', 6, 4, 18,
 ARRAY['notification', 'jackpot']),

('notification_explosion', 'Intense explosion jackpot', 'Pattern',
 '{"pattern": "V:1;F:v10;S:200#V:1;F:v16;S:300#V:1;F:v20;S:500#V:1;F:v16;S:300#V:1;F:v20;S:600#V:1;F:v14;S:400#V:1;F:v18;S:500#V:1;F:v12;S:400#V:1;F:v6;S:600"}', 4, 6, 20,
 ARRAY['notification', 'jackpot']),

-- ============================================
-- SESSION WARMUP
-- ============================================

('warmup_gentle', 'Slow build from nothing to light awareness (2 min)', 'Pattern',
 '{"pattern": "V:1;F:v0;S:5000#V:1;F:v2;S:8000#V:1;F:v3;S:10000#V:1;F:v4;S:12000#V:1;F:v5;S:15000#V:1;F:v6;S:15000#V:1;F:v7;S:15000#V:1;F:v8;S:20000#V:1;F:v9;S:10000#V:1;F:v10;S:10000"}', 120, 0, 10,
 ARRAY['session_warmup', 'edge_session']),

('warmup_tease', 'Builds with occasional dips to create anticipation', 'Pattern',
 '{"pattern": "V:1;F:v3;S:5000#V:1;F:v6;S:8000#V:1;F:v4;S:4000#V:1;F:v7;S:10000#V:1;F:v5;S:5000#V:1;F:v8;S:12000#V:1;F:v6;S:4000#V:1;F:v9;S:15000#V:1;F:v7;S:5000#V:1;F:v10;S:12000#V:1;F:v8;S:10000"}', 90, 3, 10,
 ARRAY['session_warmup', 'edge_session']),

('warmup_rapid', 'Quick climb for already-aroused states', 'Pattern',
 '{"pattern": "V:1;F:v5;S:5000#V:1;F:v8;S:10000#V:1;F:v10;S:15000#V:1;F:v12;S:20000#V:1;F:v10;S:10000"}', 60, 5, 12,
 ARRAY['session_warmup', 'edge_session']),

-- ============================================
-- SESSION BUILDING
-- ============================================

('building_steady', 'Consistent upward pressure', 'Function',
 '{"action": "Vibrate:12", "timeSec": 0, "loopRunningSec": 8, "loopPauseSec": 0}', 0, 12, 12,
 ARRAY['session_building', 'edge_session']),

('building_wave', 'Oscillating intensity that trends upward', 'Pattern',
 '{"pattern": "V:1;F:v10;S:3000#V:1;F:v12;S:4000#V:1;F:v14;S:5000#V:1;F:v13;S:4000#V:1;F:v15;S:6000#V:1;F:v13;S:4000#V:1;F:v11;S:4000"}', 30, 10, 15,
 ARRAY['session_building', 'edge_session']),

('building_pulse', 'Rhythmic pulses with increasing peak intensity', 'Pattern',
 '{"pattern": "V:1;F:v4;S:1000#V:1;F:v10;S:2000#V:1;F:v4;S:1000#V:1;F:v11;S:2000#V:1;F:v4;S:1000#V:1;F:v12;S:2000#V:1;F:v4;S:1000#V:1;F:v13;S:2000"}', 12, 4, 13,
 ARRAY['session_building', 'edge_session']),

-- ============================================
-- SESSION PLATEAU
-- ============================================

('plateau_sustained', 'Steady intensity with subtle aliveness', 'Function',
 '{"action": "Vibrate:14", "timeSec": 0}', 0, 14, 14,
 ARRAY['session_plateau', 'edge_session']),

('plateau_breathing', 'Intensity follows breathing pattern (12s cycle)', 'Pattern',
 '{"pattern": "V:1;F:v10;S:1000#V:1;F:v12;S:1000#V:1;F:v14;S:1000#V:1;F:v15;S:1000#V:1;F:v15;S:2000#V:1;F:v14;S:1000#V:1;F:v12;S:1000#V:1;F:v11;S:1000#V:1;F:v10;S:1000#V:1;F:v10;S:2000"}', 12, 10, 15,
 ARRAY['session_plateau', 'edge_session']),

('plateau_rolling', 'Gentle continuous waves (8s cycle)', 'Pattern',
 '{"pattern": "V:1;F:v11;S:1000#V:1;F:v13;S:1500#V:1;F:v15;S:2000#V:1;F:v13;S:1500#V:1;F:v11;S:1000#V:1;F:v12;S:1000"}', 8, 11, 15,
 ARRAY['session_plateau', 'edge_session']),

-- ============================================
-- SESSION EDGE
-- ============================================

('edge_sharp', 'Quick intense pulse at edge moment', 'Pattern',
 '{"pattern": "V:1;F:v16;S:300#V:1;F:v19;S:500#V:1;F:v20;S:400#V:1;F:v18;S:300"}', 2, 16, 20,
 ARRAY['session_edge', 'edge_session']),

('edge_crest', 'Rise to peak and hold at edge', 'Pattern',
 '{"pattern": "V:1;F:v14;S:400#V:1;F:v16;S:500#V:1;F:v18;S:600#V:1;F:v19;S:800#V:1;F:v20;S:1000#V:1;F:v18;S:500"}', 4, 14, 20,
 ARRAY['session_edge', 'edge_session']),

('edge_pulse', 'Rapid intense pulses at edge', 'Pattern',
 '{"pattern": "V:1;F:v18;S:200#V:1;F:v14;S:150#V:1;F:v19;S:200#V:1;F:v15;S:150#V:1;F:v20;S:300#V:1;F:v16;S:200#V:1;F:v18;S:200"}', 2, 14, 20,
 ARRAY['session_edge', 'edge_session']),

('edge_sustained', 'Extended high intensity hold', 'Pattern',
 '{"pattern": "V:1;F:v17;S:1000#V:1;F:v18;S:2000#V:1;F:v19;S:2000#V:1;F:v18;S:1000"}', 6, 17, 19,
 ARRAY['session_edge', 'edge_session']),

-- ============================================
-- SESSION RECOVERY
-- ============================================

('recovery_gentle', 'Slow gentle decrease to rest', 'Pattern',
 '{"pattern": "V:1;F:v12;S:2000#V:1;F:v10;S:2000#V:1;F:v8;S:3000#V:1;F:v6;S:3000#V:1;F:v4;S:4000#V:1;F:v2;S:4000#V:1;F:v0;S:2000"}', 20, 0, 12,
 ARRAY['session_recovery', 'edge_session']),

('recovery_quick', 'Immediate stop for sharp recovery', 'Function',
 '{"action": "Vibrate:0", "timeSec": 0}', 0, 0, 0,
 ARRAY['session_recovery', 'edge_session']),

('recovery_tease', 'Drops low but maintains subtle presence', 'Pattern',
 '{"pattern": "V:1;F:v10;S:1000#V:1;F:v6;S:2000#V:1;F:v3;S:3000#V:1;F:v4;S:5000#V:1;F:v3;S:5000"}', 16, 3, 10,
 ARRAY['session_recovery', 'edge_session', 'tease']),

-- ============================================
-- TEASE PATTERNS
-- ============================================

('tease_almost', 'Builds toward satisfaction then drops', 'Pattern',
 '{"pattern": "V:1;F:v6;S:2000#V:1;F:v9;S:2000#V:1;F:v12;S:2000#V:1;F:v14;S:2000#V:1;F:v4;S:500#V:1;F:v4;S:3000"}', 12, 4, 14,
 ARRAY['tease', 'edge_session']),

('tease_ghost', 'Extremely subtle, barely perceptible ghost touches', 'Pattern',
 '{"pattern": "V:1;F:v2;S:1500#V:1;F:v0;S:2000#V:1;F:v3;S:1000#V:1;F:v0;S:2500#V:1;F:v2;S:800#V:1;F:v4;S:600#V:1;F:v0;S:3000#V:1;F:v3;S:1200"}', 13, 0, 4,
 ARRAY['tease', 'edge_session']),

('tease_cruel', 'Approaches edge intensity then abandons', 'Pattern',
 '{"pattern": "V:1;F:v10;S:2000#V:1;F:v13;S:2000#V:1;F:v15;S:2000#V:1;F:v17;S:1500#V:1;F:v0;S:5000"}', 13, 0, 17,
 ARRAY['tease', 'edge_session', 'denial']),

-- ============================================
-- DENIAL PATTERNS
-- ============================================

('denial_reminder', 'Random reminder of denial state during day', 'Pattern',
 '{"pattern": "V:1;F:v6;S:500#V:1;F:v8;S:800#V:1;F:v6;S:500#V:1;F:v0;S:100"}', 2, 0, 8,
 ARRAY['denial', 'tease']),

('denial_morning', 'Gentle morning reminder of denial', 'Pattern',
 '{"pattern": "V:1;F:v4;S:2000#V:1;F:v7;S:3000#V:1;F:v9;S:4000#V:1;F:v7;S:3000#V:1;F:v4;S:2000#V:1;F:v0;S:1000"}', 15, 0, 9,
 ARRAY['denial', 'morning']),

('denial_frustration', 'Builds desire without any release', 'Pattern',
 '{"pattern": "V:1;F:v5;S:2000#V:1;F:v8;S:3000#V:1;F:v10;S:4000#V:1;F:v8;S:2000#V:1;F:v0;S:1000#V:1;F:v6;S:2000#V:1;F:v9;S:3000#V:1;F:v0;S:1000"}', 18, 0, 10,
 ARRAY['denial', 'tease']),

-- ============================================
-- AUCTION PATTERNS
-- ============================================

('auction_accept', 'Reward for accepting auction commitment', 'Pattern',
 '{"pattern": "V:1;F:v12;S:500#V:1;F:v16;S:800#V:1;F:v18;S:500#V:1;F:v14;S:400"}', 3, 12, 18,
 ARRAY['auction', 'edge_session']),

('auction_high_accept', 'Reward for accepting significant commitment', 'Pattern',
 '{"pattern": "V:1;F:v10;S:400#V:1;F:v14;S:600#V:1;F:v17;S:800#V:1;F:v19;S:1000#V:1;F:v20;S:800#V:1;F:v17;S:600#V:1;F:v14;S:400#V:1;F:v10;S:300"}', 5, 10, 20,
 ARRAY['auction', 'edge_session']),

-- ============================================
-- CONDITIONING ANCHORS (NEVER VARY)
-- ============================================

('anchor_good_girl', 'Conditioning pattern paired with good girl affirmation', 'Pattern',
 '{"pattern": "V:1;F:v5;S:400#V:1;F:v8;S:600#V:1;F:v10;S:800#V:1;F:v8;S:500#V:1;F:v5;S:400"}', 3, 5, 10,
 ARRAY['conditioning', 'affirmation', 'anchor']),

('anchor_femininity', 'Conditioning pattern for femininity activation moments', 'Pattern',
 '{"pattern": "V:1;F:v4;S:800#V:1;F:v7;S:1000#V:1;F:v9;S:1200#V:1;F:v7;S:800#V:1;F:v4;S:600#V:1;F:v6;S:600"}', 5, 4, 9,
 ARRAY['conditioning', 'mode_switch', 'anchor']),

('anchor_surrender', 'Conditioning pattern for surrender/submission moments', 'Pattern',
 '{"pattern": "V:1;F:v12;S:600#V:1;F:v10;S:700#V:1;F:v8;S:800#V:1;F:v6;S:900#V:1;F:v5;S:1000"}', 4, 5, 12,
 ARRAY['conditioning', 'submission', 'anchor']),

('anchor_morning', 'Consistent morning protocol start signal', 'Pattern',
 '{"pattern": "V:1;F:v3;S:500#V:1;F:v5;S:600#V:1;F:v7;S:700#V:1;F:v5;S:500#V:1;F:v3;S:400"}', 3, 3, 7,
 ARRAY['conditioning', 'protocol', 'morning', 'anchor']),

('anchor_evening', 'Consistent evening protocol completion signal', 'Pattern',
 '{"pattern": "V:1;F:v6;S:600#V:1;F:v8;S:800#V:1;F:v10;S:1000#V:1;F:v8;S:700#V:1;F:v5;S:500#V:1;F:v3;S:600"}', 4, 3, 10,
 ARRAY['conditioning', 'protocol', 'evening', 'anchor']),

-- ============================================
-- GOON MODE PATTERNS
-- ============================================

('goon_hypnotic', 'Steady rhythm for trance induction (loops)', 'Pattern',
 '{"pattern": "V:1;F:v8;S:1500#V:1;F:v10;S:1500#V:1;F:v12;S:1500#V:1;F:v10;S:1500"}', 0, 8, 12,
 ARRAY['goon_session', 'trance']),

('goon_breath', 'Syncs with 4-count breathing (16s cycle)', 'Pattern',
 '{"pattern": "V:1;F:v6;S:1000#V:1;F:v8;S:1000#V:1;F:v10;S:1000#V:1;F:v12;S:1000#V:1;F:v12;S:4000#V:1;F:v10;S:1000#V:1;F:v8;S:1000#V:1;F:v6;S:1000#V:1;F:v6;S:1000#V:1;F:v6;S:4000"}', 16, 6, 12,
 ARRAY['goon_session', 'breathing']),

('goon_ocean', 'Long slow waves like ocean swells (loops)', 'Pattern',
 '{"pattern": "V:1;F:v6;S:2500#V:1;F:v8;S:2500#V:1;F:v10;S:2500#V:1;F:v12;S:3000#V:1;F:v13;S:2500#V:1;F:v12;S:2000#V:1;F:v10;S:2000#V:1;F:v8;S:1500#V:1;F:v6;S:1500"}', 0, 6, 13,
 ARRAY['goon_session', 'trance']),

('goon_heartbeat', 'Steady pulse mimicking heartbeat ~60 BPM (loops)', 'Pattern',
 '{"pattern": "V:1;F:v10;S:200#V:1;F:v6;S:100#V:1;F:v8;S:150#V:1;F:v6;S:550"}', 0, 6, 10,
 ARRAY['goon_session', 'grounding']),

('goon_deep', 'Very subtle constant presence for deep trance', 'Function',
 '{"action": "Vibrate:4", "timeSec": 0}', 0, 4, 4,
 ARRAY['goon_session', 'trance', 'background']),

-- ============================================
-- COMPLETION PATTERNS
-- ============================================

('denial_end_graceful', 'Gentle wind-down for denial completion', 'Pattern',
 '{"pattern": "V:1;F:v12;S:3000#V:1;F:v10;S:4000#V:1;F:v8;S:5000#V:1;F:v6;S:5000#V:1;F:v4;S:6000#V:1;F:v2;S:5000#V:1;F:v0;S:2000"}', 30, 0, 12,
 ARRAY['completion', 'denial']),

('denial_end_proud', 'Ends with final strong pulse then stop', 'Pattern',
 '{"pattern": "V:1;F:v14;S:2000#V:1;F:v16;S:2000#V:1;F:v18;S:2000#V:1;F:v16;S:1500#V:1;F:v12;S:1500#V:1;F:v8;S:2000#V:1;F:v4;S:2000#V:1;F:v0;S:1000"}', 14, 0, 18,
 ARRAY['completion', 'denial']),

('reward_climax_build', 'Escalating intensity for permitted release', 'Pattern',
 '{"pattern": "V:1;F:v12;S:3000#V:1;F:v14;S:4000#V:1;F:v15;S:5000#V:1;F:v16;S:5000#V:1;F:v17;S:6000#V:1;F:v18;S:6000#V:1;F:v19;S:8000#V:1;F:v20;S:10000"}', 47, 12, 20,
 ARRAY['completion', 'reward', 'climax']),

('reward_peak', 'Sustained maximum intensity for climax', 'Function',
 '{"action": "Vibrate:20", "timeSec": 0}', 0, 20, 20,
 ARRAY['completion', 'reward', 'climax']),

('reward_afterglow', 'Gentle pattern for post-release', 'Pattern',
 '{"pattern": "V:1;F:v10;S:3000#V:1;F:v7;S:4000#V:1;F:v5;S:5000#V:1;F:v3;S:6000#V:1;F:v2;S:8000#V:1;F:v0;S:4000"}', 30, 0, 10,
 ARRAY['completion', 'reward', 'afterglow']),

-- ============================================
-- VOICE/POSTURE CONDITIONING
-- ============================================

('voice_target_hit', 'Reward for hitting voice pitch target', 'Pattern',
 '{"pattern": "V:1;F:v8;S:300#V:1;F:v12;S:400#V:1;F:v8;S:300"}', 1, 8, 12,
 ARRAY['voice', 'conditioning']),

('posture_reward', 'Reward for maintaining good posture', 'Pattern',
 '{"pattern": "V:1;F:v6;S:300#V:1;F:v10;S:400#V:1;F:v6;S:300"}', 1, 6, 10,
 ARRAY['posture', 'conditioning']),

-- ============================================
-- BACKGROUND/AWARENESS
-- ============================================

('constant_subtle', 'Very low constant for awareness', 'Function',
 '{"action": "Vibrate:3", "timeSec": 0}', 0, 3, 3,
 ARRAY['background', 'awareness']),

('constant_low', 'Low constant presence', 'Function',
 '{"action": "Vibrate:5", "timeSec": 0}', 0, 5, 5,
 ARRAY['background']),

('constant_medium', 'Medium constant presence', 'Function',
 '{"action": "Vibrate:10", "timeSec": 0}', 0, 10, 10,
 ARRAY['background', 'session'])

ON CONFLICT (name) DO UPDATE SET
  description = EXCLUDED.description,
  command_type = EXCLUDED.command_type,
  command_payload = EXCLUDED.command_payload,
  duration_sec = EXCLUDED.duration_sec,
  intensity_min = EXCLUDED.intensity_min,
  intensity_max = EXCLUDED.intensity_max,
  use_context = EXCLUDED.use_context;
