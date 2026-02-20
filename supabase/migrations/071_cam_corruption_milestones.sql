-- ============================================
-- Migration 071: Cam Corruption Milestones
-- Adds cam session activity as milestone criteria for content domain advancement.
-- Milestone keys: cam_sessions_completed, cam_has_100_session,
--   cam_highlights_total, cam_denial_7plus_sessions
-- These keys are gathered by gatherMilestoneData() in corruption-advancement.ts.
-- ============================================

-- Update content domain criteria to include cam activity requirements.
-- Content L2→L3: also require at least 1 completed cam session.
UPDATE corruption_advancement_criteria
SET required_milestones = required_milestones || '{"cam_sessions_completed": 1}'::jsonb
WHERE domain = 'content' AND from_level = 2 AND to_level = 3;

-- Content L3→L4: also require a $100+ cam session.
UPDATE corruption_advancement_criteria
SET required_milestones = required_milestones || '{"cam_has_100_session": true}'::jsonb
WHERE domain = 'content' AND from_level = 3 AND to_level = 4;

-- Content L4→L5: also require 10+ cam highlights extracted.
UPDATE corruption_advancement_criteria
SET required_milestones = required_milestones || '{"cam_highlights_total": 10}'::jsonb
WHERE domain = 'content' AND from_level = 4 AND to_level = 5;
