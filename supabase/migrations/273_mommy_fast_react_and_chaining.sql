-- 273 — Mama's fast-react path + action chaining.
--
-- 2026-05-06 user wishes:
--   #1 "Don't make me wait until Sunday" — a new sniffies lead landing should
--      fire Mama within 60s, not wait for the weekly cron tick.
--   #6 "Compounding actions, not independent" — outreach gets responded to,
--      next action conditions on the response. Chain depth.
--
-- This migration adds the columns/structures both need; the edge function
-- mommy-fast-react and the response-capture worker live in code.
--
-- Schema notes:
--   - mommy_scheme_action gains parent_action_id (chain), response_text
--     (captured reply), response_captured_at, event_kind (which trigger
--     produced this), is_fast_react (bypass full-scheme provenance).
--   - mommy_scheme_log gains scheme_kind so fast-react schemes can be
--     distinguished from weekly full-plots in audit.
--   - fast_react_event table tracks every event-trigger fire (idempotency
--     + audit): we don't want to re-fire on the same hookup_funnel insert.

ALTER TABLE mommy_scheme_action
  ADD COLUMN IF NOT EXISTS parent_action_id UUID REFERENCES mommy_scheme_action(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS response_text TEXT,
  ADD COLUMN IF NOT EXISTS response_captured_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS event_kind TEXT, -- 'new_lead' | 'lead_advanced' | 'response_received' | 'follow_up' | 'weekly_plot' | 'manual'
  ADD COLUMN IF NOT EXISTS is_fast_react BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS chain_depth SMALLINT NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_mommy_scheme_action_parent
  ON mommy_scheme_action (parent_action_id) WHERE parent_action_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_mommy_scheme_action_pending_response
  ON mommy_scheme_action (user_id, fired_at DESC)
  WHERE response_text IS NULL AND is_fast_react = true;

ALTER TABLE mommy_scheme_log
  ADD COLUMN IF NOT EXISTS scheme_kind TEXT NOT NULL DEFAULT 'full_plot'
    CHECK (scheme_kind IN ('full_plot', 'fast_react'));

-- Idempotency: track every event that fired Mama's fast-react. If the same
-- event arrives twice (webhook retries, polling overlap), we don't re-fire.
CREATE TABLE IF NOT EXISTS fast_react_event (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  event_kind TEXT NOT NULL CHECK (event_kind IN (
    'new_lead', 'lead_advanced', 'response_received', 'meet_scheduled',
    'meet_window_passed', 'slip_clustered', 'manual'
  )),
  -- Stable key per event source so retries dedup. Examples:
  --   "hookup_funnel:<row_id>:flirting"
  --   "outreach_response:<outreach_id>"
  --   "meet_window:<funnel_id>:<scheduled_iso>"
  source_key TEXT NOT NULL,
  -- The scheme_log row this event produced, if any
  produced_scheme_id UUID REFERENCES mommy_scheme_log(id) ON DELETE SET NULL,
  -- Why we did NOT fire (cooldown, persona mismatch, etc.) — null if fired
  skip_reason TEXT,
  context JSONB,
  fired_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, event_kind, source_key)
);

CREATE INDEX IF NOT EXISTS idx_fast_react_event_user
  ON fast_react_event (user_id, fired_at DESC);

ALTER TABLE fast_react_event ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS fast_react_event_service ON fast_react_event;
CREATE POLICY fast_react_event_service ON fast_react_event
  FOR ALL TO service_role USING (true) WITH CHECK (true);
