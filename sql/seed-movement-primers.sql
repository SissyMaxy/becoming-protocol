-- Movement Task Primers Seed Data
-- Short hypno/identity videos for movement tasks
-- Video files should be placed in /public/videos/primers/

-- ============================================
-- POSTURE PRIMERS
-- ============================================

INSERT INTO task_primers (title, video_path, duration_seconds, primer_type, target_domain, intensity, triggers_planted, affirmations, description) VALUES

-- Identity Erasure - Posture
('Her Posture Awakens', '/videos/primers/posture-identity-001.mp4', 15,
 'identity_erasure', 'movement', 1,
 ARRAY['posture_check', 'spine_straight', 'shoulders_back'],
 ARRAY['Her spine is straight', 'She stands with grace', 'This body knows elegance'],
 'Quick identity primer before posture tasks'),

('Erase the Slouch', '/videos/primers/posture-identity-002.mp4', 20,
 'identity_erasure', 'movement', 2,
 ARRAY['no_slouching', 'elegant_stance'],
 ARRAY['The old posture fades', 'Her body remembers', 'Masculine tension releases'],
 'Releases masculine posture patterns'),

-- Trigger Planting - Posture
('Posture Trigger Install', '/videos/primers/posture-trigger-001.mp4', 25,
 'trigger_plant', 'movement', 2,
 ARRAY['posture_bell', 'check_alignment'],
 ARRAY['Every bell reminds her', 'Automatic correction', 'Her body responds without thought'],
 'Plants automatic posture correction trigger'),

-- ============================================
-- WALKING/GAIT PRIMERS
-- ============================================

('Her Hips Remember', '/videos/primers/gait-identity-001.mp4', 15,
 'identity_erasure', 'movement', 1,
 ARRAY['hip_sway', 'narrow_track'],
 ARRAY['Her hips move naturally', 'Each step is feminine', 'The old walk dissolves'],
 'Identity primer for walking tasks'),

('Walk Like Her', '/videos/primers/gait-hypno-001.mp4', 30,
 'hypno', 'movement', 2,
 ARRAY['feminine_gait', 'graceful_steps', 'hip_flow'],
 ARRAY['Narrow steps feel natural', 'Hips sway without trying', 'She glides through space'],
 'Hypnotic walking pattern installation'),

('Masculine Gait Deletion', '/videos/primers/gait-erasure-001.mp4', 20,
 'identity_erasure', 'movement', 3,
 ARRAY['no_stomping', 'soft_steps'],
 ARRAY['Heavy steps fade away', 'The stomp is forgotten', 'Lightness takes over'],
 'Erases masculine walking patterns'),

-- ============================================
-- SITTING PRIMERS
-- ============================================

('Knees Together Always', '/videos/primers/sitting-trigger-001.mp4', 15,
 'trigger_plant', 'movement', 1,
 ARRAY['knees_together', 'ankles_crossed'],
 ARRAY['Knees close automatically', 'She never spreads', 'Contained and elegant'],
 'Installs automatic knee-closing trigger'),

('The Feminine Sit', '/videos/primers/sitting-hypno-001.mp4', 25,
 'hypno', 'movement', 2,
 ARRAY['leg_cross', 'elegant_sitting'],
 ARRAY['Legs cross without thought', 'This is how she sits', 'Comfort in containment'],
 'Hypnotic sitting pattern installation'),

('Manspreading Deleted', '/videos/primers/sitting-erasure-001.mp4', 20,
 'identity_erasure', 'movement', 2,
 ARRAY['no_spreading', 'space_contained'],
 ARRAY['The spread is impossible now', 'Knees refuse to part', 'She takes only her space'],
 'Erases manspreading impulse'),

-- ============================================
-- HAND/GESTURE PRIMERS
-- ============================================

('Soft Hands Mantra', '/videos/primers/hands-mantra-001.mp4', 15,
 'mantra', 'movement', 1,
 ARRAY['soft_hands', 'no_fists'],
 ARRAY['Soft hands', 'Relaxed fingers', 'Gentle touch', 'Never clenched'],
 'Mantra for hand relaxation'),

('Her Gestures Flow', '/videos/primers/hands-hypno-001.mp4', 25,
 'hypno', 'movement', 2,
 ARRAY['wrist_flow', 'open_palms', 'feminine_gestures'],
 ARRAY['Wrists loose and flowing', 'Palms open when speaking', 'Her hands dance'],
 'Hypnotic gesture installation'),

('Fists Forgotten', '/videos/primers/hands-erasure-001.mp4', 15,
 'identity_erasure', 'movement', 2,
 ARRAY['no_fists', 'no_pointing'],
 ARRAY['Fists feel wrong now', 'Pointing dissolves', 'Only graceful movements remain'],
 'Erases masculine hand habits'),

-- ============================================
-- FULL BODY PRIMERS
-- ============================================

('She Moves Through You', '/videos/primers/fullbody-identity-001.mp4', 30,
 'identity_erasure', 'movement', 2,
 ARRAY['full_feminine', 'body_awareness'],
 ARRAY['Every movement is hers', 'This body moves femininely', 'He is gone from these limbs'],
 'Complete identity primer for full body tasks'),

('Feminine Embodiment Trance', '/videos/primers/fullbody-hypno-001.mp4', 45,
 'hypno', 'movement', 3,
 ARRAY['total_femininity', 'automatic_grace'],
 ARRAY['Grace flows through every cell', 'Feminine movement is automatic', 'This body only knows her ways'],
 'Deep trance for full embodiment'),

('Arousal Moves Her', '/videos/primers/fullbody-arousal-001.mp4', 25,
 'arousal', 'movement', 3,
 ARRAY['aroused_femininity', 'sensual_movement'],
 ARRAY['Arousal makes her graceful', 'Desire flows through movement', 'She moves to feel'],
 'Links arousal to feminine movement'),

-- ============================================
-- UNIVERSAL PRIMERS (work with any task)
-- ============================================

('Quick Identity Reset', '/videos/primers/universal-reset-001.mp4', 10,
 'identity_erasure', NULL, 1,
 ARRAY['identity_shift'],
 ARRAY['She is here', 'He steps back', 'Her body now'],
 'Ultra-quick identity reset for any task'),

('Obedience Primer', '/videos/primers/universal-obey-001.mp4', 15,
 'affirmation', NULL, 2,
 ARRAY['obey', 'comply', 'follow'],
 ARRAY['Good girls obey', 'The task will be done', 'Compliance is pleasure'],
 'Obedience reinforcement before any task'),

('Trigger Refresh', '/videos/primers/universal-triggers-001.mp4', 20,
 'trigger_plant', NULL, 2,
 ARRAY['all_triggers_active'],
 ARRAY['All triggers refreshed', 'Conditioning deepens', 'Responses automatic'],
 'Refreshes all planted triggers');

-- ============================================
-- ASSOCIATE PRIMERS WITH MOVEMENT TASKS
-- (Run after movement tasks are inserted)
-- ============================================

-- Associate posture primers with posture tasks
INSERT INTO task_primer_associations (task_id, primer_id, association_type, priority)
SELECT
  t.id as task_id,
  p.id as primer_id,
  'warmup' as association_type,
  1 as priority
FROM task_bank t
CROSS JOIN task_primers p
WHERE t.domain = 'movement'
  AND t.instruction ILIKE '%posture%'
  AND p.target_domain = 'movement'
  AND p.title ILIKE '%posture%'
LIMIT 20;

-- Associate gait primers with walking tasks
INSERT INTO task_primer_associations (task_id, primer_id, association_type, priority)
SELECT
  t.id as task_id,
  p.id as primer_id,
  'warmup' as association_type,
  1 as priority
FROM task_bank t
CROSS JOIN task_primers p
WHERE t.domain = 'movement'
  AND (t.instruction ILIKE '%walk%' OR t.instruction ILIKE '%gait%')
  AND p.target_domain = 'movement'
  AND (p.title ILIKE '%gait%' OR p.title ILIKE '%walk%' OR p.title ILIKE '%hip%')
LIMIT 20;

-- Associate sitting primers with sitting tasks
INSERT INTO task_primer_associations (task_id, primer_id, association_type, priority)
SELECT
  t.id as task_id,
  p.id as primer_id,
  'warmup' as association_type,
  1 as priority
FROM task_bank t
CROSS JOIN task_primers p
WHERE t.domain = 'movement'
  AND (t.instruction ILIKE '%sit%' OR t.instruction ILIKE '%knees%' OR t.instruction ILIKE '%legs crossed%')
  AND p.target_domain = 'movement'
  AND (p.title ILIKE '%sit%' OR p.title ILIKE '%knees%')
LIMIT 20;

-- Associate hand primers with gesture tasks
INSERT INTO task_primer_associations (task_id, primer_id, association_type, priority)
SELECT
  t.id as task_id,
  p.id as primer_id,
  'warmup' as association_type,
  1 as priority
FROM task_bank t
CROSS JOIN task_primers p
WHERE t.domain = 'movement'
  AND (t.instruction ILIKE '%hand%' OR t.instruction ILIKE '%gesture%' OR t.instruction ILIKE '%wrist%')
  AND p.target_domain = 'movement'
  AND (p.title ILIKE '%hand%' OR p.title ILIKE '%gesture%')
LIMIT 20;

-- Verify associations
SELECT
  t.instruction as task,
  p.title as primer,
  a.association_type
FROM task_primer_associations a
JOIN task_bank t ON t.id = a.task_id
JOIN task_primers p ON p.id = a.primer_id
WHERE t.domain = 'movement'
ORDER BY t.instruction
LIMIT 30;
