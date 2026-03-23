-- 136: Platform engagement columns + budget tracking

ALTER TABLE engagement_targets ADD COLUMN IF NOT EXISTS subreddit TEXT;
ALTER TABLE engagement_targets ADD COLUMN IF NOT EXISTS group_url TEXT;
ALTER TABLE engagement_targets ADD COLUMN IF NOT EXISTS group_name TEXT;
ALTER TABLE engagement_targets ADD COLUMN IF NOT EXISTS engagement_type TEXT DEFAULT 'reply';

CREATE TABLE IF NOT EXISTS platform_engagement_budget (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  platform TEXT NOT NULL,
  engagement_type TEXT NOT NULL,
  count INTEGER DEFAULT 0,
  max_allowed INTEGER NOT NULL,
  UNIQUE(user_id, date, platform, engagement_type)
);
CREATE INDEX IF NOT EXISTS idx_platform_budget ON platform_engagement_budget(user_id, date, platform);
ALTER TABLE platform_engagement_budget ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users own budget" ON platform_engagement_budget;
CREATE POLICY "Users own budget" ON platform_engagement_budget FOR ALL USING (auth.uid() = user_id);
INSERT INTO supabase_migrations.schema_migrations (version) VALUES ('136');
