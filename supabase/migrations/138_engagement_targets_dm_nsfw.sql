-- 138: DM candidate + NSFW engagement flags on engagement targets
ALTER TABLE engagement_targets ADD COLUMN IF NOT EXISTS dm_candidate BOOLEAN DEFAULT FALSE;
ALTER TABLE engagement_targets ADD COLUMN IF NOT EXISTS nsfw_engagement BOOLEAN DEFAULT FALSE;
ALTER TABLE engagement_targets ADD COLUMN IF NOT EXISTS dm_sent_at TIMESTAMPTZ;
ALTER TABLE engagement_targets ADD COLUMN IF NOT EXISTS dm_response_at TIMESTAMPTZ;
INSERT INTO supabase_migrations.schema_migrations (version) VALUES ('138');
