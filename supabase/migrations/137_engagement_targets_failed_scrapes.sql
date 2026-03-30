-- 137: Track failed scrape attempts on engagement targets so dead accounts get pruned
ALTER TABLE engagement_targets ADD COLUMN IF NOT EXISTS failed_scrapes INTEGER DEFAULT 0;
INSERT INTO supabase_migrations.schema_migrations (version) VALUES ('137');
