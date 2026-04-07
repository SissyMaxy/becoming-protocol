-- Twitter Growth Engine tables
-- Tracks follows, unfollows, and follower snapshots for growth automation

-- ── twitter_follows: track who we follow and why ─────────────────────
CREATE TABLE IF NOT EXISTS twitter_follows (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) NOT NULL,
  target_handle text NOT NULL,
  source text NOT NULL,               -- 'followback', 'engage_follow', 'strategic'
  source_detail text,                  -- e.g. tweet URL or search query label
  status text NOT NULL DEFAULT 'followed',  -- 'followed', 'followed_back', 'unfollowed_stale'
  followed_at timestamptz DEFAULT now(),
  followed_back_at timestamptz,
  unfollowed_at timestamptz,
  follower_count integer,
  bio_snippet text,
  created_at timestamptz DEFAULT now()
);

-- Unique constraint: one active record per user+target
CREATE UNIQUE INDEX IF NOT EXISTS twitter_follows_user_target_idx
  ON twitter_follows(user_id, target_handle);

-- Query patterns: stale follows, followback check
CREATE INDEX IF NOT EXISTS twitter_follows_status_idx
  ON twitter_follows(user_id, status, followed_at);

ALTER TABLE twitter_follows ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own follows"
  ON twitter_follows FOR ALL
  USING (auth.uid() = user_id);

-- ── twitter_followers_snapshot: track who follows us ─────────────────
CREATE TABLE IF NOT EXISTS twitter_followers_snapshot (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) NOT NULL,
  handle text NOT NULL,
  first_seen_at timestamptz DEFAULT now(),
  last_seen_at timestamptz DEFAULT now(),
  processed boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS twitter_followers_snapshot_user_handle_idx
  ON twitter_followers_snapshot(user_id, handle);

CREATE INDEX IF NOT EXISTS twitter_followers_snapshot_unprocessed_idx
  ON twitter_followers_snapshot(user_id, processed) WHERE processed = false;

ALTER TABLE twitter_followers_snapshot ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own follower snapshots"
  ON twitter_followers_snapshot FOR ALL
  USING (auth.uid() = user_id);

-- ── Update content_type constraint to allow quote_tweet ──────────────
-- Drop and recreate the check constraint to include 'quote_tweet'
DO $$
BEGIN
  -- Try to drop existing constraint (may have different names)
  BEGIN
    ALTER TABLE ai_generated_content DROP CONSTRAINT IF EXISTS ai_generated_content_content_type_check;
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
  BEGIN
    ALTER TABLE ai_generated_content DROP CONSTRAINT IF EXISTS content_type_check;
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  -- Add updated constraint
  ALTER TABLE ai_generated_content ADD CONSTRAINT ai_generated_content_content_type_check
    CHECK (content_type IN (
      'tweet', 'reply', 'caption', 'reddit_post', 'reddit_comment',
      'fetlife_comment', 'engagement_bait', 'dm', 'subscriber_reply',
      'sniffies_chat', 'quote_tweet'
    ));
END $$;
