-- Migration 220: track post URLs (for engagement backfill) + failure reasons
-- (for diagnosing why posts didn't land).
--
-- poster.ts already tries to UPDATE platform_url on successful posts but the
-- column never existed — those updates were silently no-op'd. Post-ban we had
-- 25 failed Reddit posts in 7 days with zero error details because the failure
-- path also dropped result.error on the floor.

ALTER TABLE ai_generated_content
  ADD COLUMN IF NOT EXISTS platform_url TEXT,
  ADD COLUMN IF NOT EXISTS failure_reason TEXT,
  ADD COLUMN IF NOT EXISTS engagement_last_updated TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_ai_generated_content_backfill
  ON ai_generated_content (platform, posted_at)
  WHERE status = 'posted' AND platform_url IS NOT NULL;
