-- Migration 203: Unify content_posts into ai_generated_content.
--
-- Problem: Auto-poster writes to content_posts, but the Socials dashboard
-- (src/lib/social-media-analytics.ts) reads only from ai_generated_content.
-- Vault-scheduled posts and Handler-distribution posts were invisible.
--
-- Fix: Extend ai_generated_content with the columns content_posts has that it
-- lacks (vault_item_id, platform_post_id, platform_url, engagement_fetched_at),
-- allow 'posting' in the status CHECK, backfill from content_posts, then rename
-- content_posts to content_posts_legacy so any remaining reader fails loudly
-- instead of silently returning stale data.

-- 1. New columns -----------------------------------------------------------

ALTER TABLE ai_generated_content
  ADD COLUMN IF NOT EXISTS vault_item_id UUID REFERENCES content_vault(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS platform_post_id TEXT,
  ADD COLUMN IF NOT EXISTS platform_url TEXT,
  ADD COLUMN IF NOT EXISTS engagement_fetched_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_agc_vault_item ON ai_generated_content(vault_item_id);
CREATE INDEX IF NOT EXISTS idx_agc_user_status_scheduled ON ai_generated_content(user_id, status, scheduled_at);

-- 2. Expand status CHECK to include 'posting' (transient lock state during dispatch)

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'ai_generated_content_status_check'
  ) THEN
    ALTER TABLE ai_generated_content DROP CONSTRAINT ai_generated_content_status_check;
  END IF;
END $$;

ALTER TABLE ai_generated_content
  ADD CONSTRAINT ai_generated_content_status_check
  CHECK (status IN ('generated', 'scheduled', 'posting', 'posted', 'failed'));

-- 3. Backfill from content_posts ------------------------------------------
-- Only rows that don't already exist in ai_generated_content (by id).

INSERT INTO ai_generated_content (
  id, user_id, content_type, platform, content,
  target_subreddit, target_account, target_hashtags,
  generation_strategy,
  posted_at, engagement_likes, engagement_comments, engagement_shares,
  revenue_generated, variant, status, scheduled_at, created_at,
  vault_item_id, platform_post_id, platform_url, engagement_fetched_at
)
SELECT
  cp.id,
  cp.user_id,
  -- Map platform → content_type; media posts use 'caption'
  CASE cp.platform
    WHEN 'twitter' THEN 'tweet'
    WHEN 'reddit' THEN 'reddit_post'
    WHEN 'fetlife' THEN 'fetlife_post'
    ELSE 'caption'
  END AS content_type,
  cp.platform,
  cp.caption AS content,
  cp.subreddit AS target_subreddit,
  NULL AS target_account,
  COALESCE(cp.hashtags, '{}') AS target_hashtags,
  'vault_distribution' AS generation_strategy,
  cp.posted_at,
  COALESCE(cp.likes, 0),
  COALESCE(cp.comments, 0),
  COALESCE(cp.shares, 0),
  COALESCE(cp.revenue_generated, 0),
  cp.caption_variant AS variant,
  CASE cp.post_status
    WHEN 'scheduled' THEN 'scheduled'
    WHEN 'posting' THEN 'posting'
    WHEN 'posted' THEN 'posted'
    WHEN 'failed' THEN 'failed'
    ELSE 'generated'
  END AS status,
  cp.scheduled_at,
  cp.created_at,
  cp.vault_item_id,
  cp.platform_post_id,
  cp.platform_url,
  cp.engagement_fetched_at
FROM content_posts cp
WHERE NOT EXISTS (
  SELECT 1 FROM ai_generated_content agc WHERE agc.id = cp.id
);

-- 4. Rename content_posts to content_posts_legacy ------------------------
-- Any writer or reader we missed will now throw "relation does not exist"
-- instead of silently working against a stale table.

ALTER TABLE content_posts RENAME TO content_posts_legacy;

-- Reload PostgREST schema cache so the renamed table is reflected.
NOTIFY pgrst, 'reload schema';
