-- Migration 062: Corruption Mechanic
-- Handler-internal system tracking progressive boundary erosion across 7 domains.
-- NEVER visible to the user.

-- Core state: one row per user per domain
CREATE TABLE corruption_state (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  domain TEXT NOT NULL CHECK (domain IN (
    'privacy', 'gina', 'financial', 'autonomy',
    'identity_language', 'therapist', 'content'
  )),
  current_level INTEGER NOT NULL DEFAULT 0 CHECK (current_level BETWEEN 0 AND 5),
  level_entered_at TIMESTAMPTZ DEFAULT NOW(),
  advancement_score NUMERIC DEFAULT 0,
  advancement_threshold NUMERIC DEFAULT 100,
  is_suspended BOOLEAN DEFAULT false,
  suspension_reason TEXT,
  suspended_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, domain)
);

-- Event log: every corruption deployment, milestone, advancement, suspension
CREATE TABLE corruption_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  domain TEXT NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN (
    'deployment', 'milestone', 'advancement', 'suspension',
    'resumption', 'override', 'cascade', 'therapist_flag'
  )),
  corruption_level_at_event INTEGER NOT NULL,
  details JSONB,
  handler_intent TEXT,
  user_facing_copy TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Advancement criteria: defines what's needed to advance each domain
CREATE TABLE corruption_advancement_criteria (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  domain TEXT NOT NULL,
  from_level INTEGER NOT NULL,
  to_level INTEGER NOT NULL,
  minimum_days INTEGER NOT NULL,
  required_milestones JSONB NOT NULL DEFAULT '{}',
  cascade_eligible BOOLEAN DEFAULT true,
  UNIQUE(domain, from_level, to_level)
);

-- RLS
ALTER TABLE corruption_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE corruption_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE corruption_advancement_criteria ENABLE ROW LEVEL SECURITY;

CREATE POLICY corruption_state_user ON corruption_state
  FOR ALL USING (auth.uid() = user_id);
CREATE POLICY corruption_events_user ON corruption_events
  FOR ALL USING (auth.uid() = user_id);
CREATE POLICY corruption_advancement_read ON corruption_advancement_criteria
  FOR SELECT USING (true);

-- Indexes
CREATE INDEX idx_corruption_state_user ON corruption_state(user_id);
CREATE INDEX idx_corruption_events_user ON corruption_events(user_id, domain);
CREATE INDEX idx_corruption_events_type ON corruption_events(event_type, created_at);

-- Seed advancement criteria
INSERT INTO corruption_advancement_criteria (domain, from_level, to_level, minimum_days, required_milestones, cascade_eligible) VALUES
-- Privacy
('privacy', 0, 1, 14, '{"streak_days_min": 14}', true),
('privacy', 1, 2, 30, '{"content_pieces_at_level": 5}', true),
('privacy', 2, 3, 45, '{"content_pieces_at_level": 10, "exposure_incidents": 0}', true),
('privacy', 3, 4, 60, '{"content_pieces_at_level": 15, "exposure_incidents": 0}', true),
('privacy', 4, 5, 90, '{"content_pieces_at_level": 20, "exposure_incidents": 0}', true),
-- Gina
('gina', 0, 1, 14, '{"streak_days_min": 14}', true),
('gina', 1, 2, 30, '{"skipped_cleanup_days": 14, "shared_space_activities": 3}', true),
('gina', 2, 3, 45, '{"comfort_self_report_min": 7}', true),
('gina', 3, 4, 60, '{"gina_questions_logged": 1}', true),
('gina', 4, 5, 90, '{}', true),
-- Financial (revenue-gated)
('financial', 0, 1, 0, '{"protocol_revenue_min": 1}', true),
('financial', 1, 2, 30, '{"revenue_covers_spending": true}', true),
('financial', 2, 3, 45, '{"consistent_revenue_days": 30}', true),
('financial', 3, 4, 60, '{"revenue_exceeds_expenses": true}', true),
('financial', 4, 5, 90, '{"monthly_revenue_min": 400}', true),
-- Autonomy
('autonomy', 0, 1, 14, '{"streak_days_min": 14}', true),
('autonomy', 1, 2, 30, '{"task_acceptance_rate_min": 0.9}', true),
('autonomy', 2, 3, 45, '{"override_rate_max": 0.2}', true),
('autonomy', 3, 4, 60, '{"override_rate_max": 0.1, "delegated_domains_min": 3}', true),
('autonomy', 4, 5, 90, '{"override_rate_max": 0.05}', true),
-- Identity Language
('identity_language', 0, 1, 14, '{"streak_days_min": 14}', true),
('identity_language', 1, 2, 30, '{"feminine_reference_rate_min": 0.5}', true),
('identity_language', 2, 3, 45, '{"self_correction_ratio_min": 0.5}', true),
('identity_language', 3, 4, 60, '{"self_correction_ratio_min": 0.9, "consecutive_days": 14}', true),
('identity_language', 4, 5, 90, '{"masculine_references_per_week_max": 0}', true),
-- Therapist (HALF speed)
('therapist', 0, 1, 30, '{"streak_days_min": 30}', false),
('therapist', 1, 2, 60, '{"therapist_endorsed": true}', false),
('therapist', 2, 3, 90, '{"no_concerns_days": 60}', false),
('therapist', 3, 4, 120, '{"therapeutic_framing_natural": true}', false),
('therapist', 4, 5, 180, '{}', false),
-- Content (revenue-gated)
('content', 0, 1, 0, '{"protocol_revenue_min": 1}', true),
('content', 1, 2, 30, '{"content_pieces_min": 10}', true),
('content', 2, 3, 45, '{"fan_engagement_growing": true}', true),
('content', 3, 4, 60, '{"revenue_exceeds_expenses": true}', true),
('content', 4, 5, 90, '{"content_feels_natural": true}', true);
