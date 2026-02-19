-- Sprint 5: Creator Outreach + Content Queue Extensions
-- creator_outreach table for relationship pipeline
-- content_queue extensions for text-only + recycled content

-- ============================================================
-- creator_outreach: Relationship building pipeline
-- ============================================================
CREATE TABLE IF NOT EXISTS creator_outreach (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,

  platform TEXT NOT NULL,
  username TEXT NOT NULL,
  display_name TEXT,

  follower_count INTEGER,
  content_overlap TEXT[] DEFAULT '{}',

  relationship_stage TEXT DEFAULT 'identified' CHECK (relationship_stage IN (
    'identified', 'engaged', 'connected', 'active_promo'
  )),

  first_engaged_at TIMESTAMPTZ,
  last_engaged_at TIMESTAMPTZ,

  public_interactions INTEGER DEFAULT 0,
  dms_sent INTEGER DEFAULT 0,
  cross_promos INTEGER DEFAULT 0,

  handler_notes TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(user_id, platform, username)
);

ALTER TABLE creator_outreach ENABLE ROW LEVEL SECURITY;
CREATE POLICY creator_outreach_user ON creator_outreach
  FOR ALL USING (auth.uid() = user_id);

CREATE INDEX idx_creator_outreach_stage
  ON creator_outreach(user_id, relationship_stage);
CREATE INDEX idx_creator_outreach_platform
  ON creator_outreach(user_id, platform);

-- ============================================================
-- content_queue: Add columns for text-only + recycled content
-- ============================================================
ALTER TABLE content_queue
  ADD COLUMN IF NOT EXISTS content_text TEXT,
  ADD COLUMN IF NOT EXISTS caption_text TEXT,
  ADD COLUMN IF NOT EXISTS community_id TEXT,
  ADD COLUMN IF NOT EXISTS media_url TEXT,
  ADD COLUMN IF NOT EXISTS handler_intent TEXT,
  ADD COLUMN IF NOT EXISTS is_text_only BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_handler_voice BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_recycled BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS original_content_id UUID,
  ADD COLUMN IF NOT EXISTS engagement_likes INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS engagement_comments INTEGER DEFAULT 0;
