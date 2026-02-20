-- Migration 072: Add ready_for_manual to content_distribution post_status
-- Supports post-pack mode: Handler prepares content, David pastes manually
-- Reddit killed self-service API keys Nov 2025; Fansly has no public API

ALTER TABLE content_distribution
  DROP CONSTRAINT IF EXISTS content_distribution_post_status_check;

ALTER TABLE content_distribution
  ADD CONSTRAINT content_distribution_post_status_check
  CHECK (post_status IN ('draft', 'scheduled', 'ready_for_manual', 'posted', 'failed', 'cancelled'));
