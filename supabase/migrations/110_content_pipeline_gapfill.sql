-- =============================================
-- Migration 110: Content Pipeline Gap-Fill
-- Adds missing columns to existing tables,
-- creates fan_interactions + subscriber_polls
-- =============================================

-- ── content_vault: new columns ────────────────────────
ALTER TABLE content_vault ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}';
ALTER TABLE content_vault ADD COLUMN IF NOT EXISTS caption_draft TEXT;
ALTER TABLE content_vault ADD COLUMN IF NOT EXISTS face_visible BOOLEAN DEFAULT false;
ALTER TABLE content_vault ADD COLUMN IF NOT EXISTS auto_captured BOOLEAN DEFAULT false;
ALTER TABLE content_vault ADD COLUMN IF NOT EXISTS domain TEXT;
ALTER TABLE content_vault ADD COLUMN IF NOT EXISTS platforms TEXT[] DEFAULT '{}';
ALTER TABLE content_vault ADD COLUMN IF NOT EXISTS file_size_bytes BIGINT;
ALTER TABLE content_vault ADD COLUMN IF NOT EXISTS duration_seconds INTEGER;

-- ── content_distribution: new columns ─────────────────
ALTER TABLE content_distribution ADD COLUMN IF NOT EXISTS subreddit TEXT;
ALTER TABLE content_distribution ADD COLUMN IF NOT EXISTS content_tier TEXT DEFAULT 'free';
ALTER TABLE content_distribution ADD COLUMN IF NOT EXISTS beat_position TEXT;
ALTER TABLE content_distribution ADD COLUMN IF NOT EXISTS calendar_slot_id UUID;
ALTER TABLE content_distribution ADD COLUMN IF NOT EXISTS timezone TEXT DEFAULT 'America/Chicago';
ALTER TABLE content_distribution ADD COLUMN IF NOT EXISTS engagement JSONB;

-- ── revenue_log: new columns ──────────────────────────
ALTER TABLE revenue_log ADD COLUMN IF NOT EXISTS scraped BOOLEAN DEFAULT false;
ALTER TABLE revenue_log ADD COLUMN IF NOT EXISTS scrape_source TEXT;
ALTER TABLE revenue_log ADD COLUMN IF NOT EXISTS platform_transaction_id TEXT;
ALTER TABLE revenue_log ADD COLUMN IF NOT EXISTS revenue_date DATE DEFAULT CURRENT_DATE;
ALTER TABLE revenue_log ADD COLUMN IF NOT EXISTS fan_username TEXT;
ALTER TABLE revenue_log ADD COLUMN IF NOT EXISTS description TEXT;

-- Unique index: prevent duplicate scrape imports
CREATE UNIQUE INDEX IF NOT EXISTS idx_revenue_log_platform_txn
  ON revenue_log (user_id, platform, platform_transaction_id)
  WHERE platform_transaction_id IS NOT NULL;

-- ── content_permissions: new columns ──────────────────
ALTER TABLE content_permissions ADD COLUMN IF NOT EXISTS parameters JSONB DEFAULT '{}';
ALTER TABLE content_permissions ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;

-- ── content_calendar: individual slot columns ─────────
ALTER TABLE content_calendar ADD COLUMN IF NOT EXISTS time_slot TEXT;
ALTER TABLE content_calendar ADD COLUMN IF NOT EXISTS platform TEXT;
ALTER TABLE content_calendar ADD COLUMN IF NOT EXISTS planned_content_type TEXT;
ALTER TABLE content_calendar ADD COLUMN IF NOT EXISTS planned_tier TEXT DEFAULT 'free';
ALTER TABLE content_calendar ADD COLUMN IF NOT EXISTS vault_item_id UUID;
ALTER TABLE content_calendar ADD COLUMN IF NOT EXISTS distribution_id UUID;
ALTER TABLE content_calendar ADD COLUMN IF NOT EXISTS slot_status TEXT DEFAULT 'open';
ALTER TABLE content_calendar ADD COLUMN IF NOT EXISTS handler_notes TEXT;
ALTER TABLE content_calendar ADD COLUMN IF NOT EXISTS day_of_week TEXT;

-- ── fan_interactions: new table ───────────────────────
CREATE TABLE IF NOT EXISTS fan_interactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  fan_username TEXT NOT NULL,
  fan_platform TEXT NOT NULL,
  fan_tier TEXT DEFAULT 'casual',
  interaction_type TEXT NOT NULL,
  content TEXT,
  source_post_url TEXT,
  sentiment TEXT,
  handler_action TEXT,
  handler_response TEXT,
  response_approved BOOLEAN DEFAULT false,
  responded_at TIMESTAMPTZ,
  tip_amount_cents INTEGER DEFAULT 0,
  influence_weight NUMERIC(4,2) DEFAULT 1.0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE fan_interactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY fan_interactions_user_policy ON fan_interactions
  FOR ALL USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_fan_interactions_user ON fan_interactions(user_id);
CREATE INDEX IF NOT EXISTS idx_fan_interactions_type ON fan_interactions(user_id, interaction_type);

-- ── subscriber_polls: new table ───────────────────────
CREATE TABLE IF NOT EXISTS subscriber_polls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  title TEXT NOT NULL,
  description TEXT,
  poll_type TEXT DEFAULT 'single_choice',
  options JSONB DEFAULT '[]',
  platform TEXT,
  voting_open_at TIMESTAMPTZ,
  voting_close_at TIMESTAMPTZ,
  votes_per_fan INTEGER DEFAULT 1,
  weighted_voting BOOLEAN DEFAULT false,
  winning_option_id TEXT,
  total_votes INTEGER DEFAULT 0,
  total_vote_weight NUMERIC(10,2) DEFAULT 0,
  approved BOOLEAN DEFAULT false,
  approved_at TIMESTAMPTZ,
  result_applied BOOLEAN DEFAULT false,
  result_action TEXT,
  status TEXT DEFAULT 'draft',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE subscriber_polls ENABLE ROW LEVEL SECURITY;
CREATE POLICY subscriber_polls_user_policy ON subscriber_polls
  FOR ALL USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_subscriber_polls_user ON subscriber_polls(user_id);
CREATE INDEX IF NOT EXISTS idx_subscriber_polls_status ON subscriber_polls(user_id, status);

-- ── task_bank: capture columns ────────────────────────
-- task_bank already has capture_fields JSONB, but add convenience columns
ALTER TABLE task_bank ADD COLUMN IF NOT EXISTS capture_flag BOOLEAN DEFAULT false;
ALTER TABLE task_bank ADD COLUMN IF NOT EXISTS capture_type TEXT;
ALTER TABLE task_bank ADD COLUMN IF NOT EXISTS capture_prompt TEXT;
