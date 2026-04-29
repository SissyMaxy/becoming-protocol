-- Migration 225: Handler-driven Twitter profile configuration.
-- The Handler decides bio/display name/follow strategy; Maxy or automation executes.

CREATE TABLE IF NOT EXISTS twitter_profile_config (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  handle TEXT,
  display_name TEXT,
  bio TEXT,
  location TEXT,
  website_url TEXT,
  pinned_tweet_text TEXT,
  pinned_tweet_id TEXT,
  nsfw_media BOOLEAN NOT NULL DEFAULT true,
  allow_dms_from TEXT NOT NULL DEFAULT 'verified' CHECK (allow_dms_from IN ('everyone', 'followers', 'verified', 'none')),
  target_follow_categories JSONB NOT NULL DEFAULT '{}'::jsonb,
  seed_follows JSONB NOT NULL DEFAULT '[]'::jsonb,
  applied_at TIMESTAMPTZ,
  applied_by TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE twitter_profile_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users own twitter profile config" ON twitter_profile_config
  FOR ALL USING (auth.uid() = user_id);
