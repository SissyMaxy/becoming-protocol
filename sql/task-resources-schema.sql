-- Task Resources Table
-- External links to videos, tutorials, and other learning resources
-- These are linked to task templates and loaded on-demand when viewing task details

-- Create enum for resource types if it doesn't exist
DO $$ BEGIN
  CREATE TYPE resource_type AS ENUM (
    'video',
    'article',
    'tutorial',
    'product',
    'app'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Create the task_resources table
CREATE TABLE IF NOT EXISTS task_resources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID NOT NULL REFERENCES task_templates(id) ON DELETE CASCADE,

  -- Resource details
  resource_type resource_type NOT NULL,
  title VARCHAR(200) NOT NULL,
  url TEXT NOT NULL,
  description TEXT,
  creator VARCHAR(100),           -- e.g., "TransVoiceLessons", "Dr. Z"
  duration_label VARCHAR(50),     -- e.g., "2 min video", "5 min read"

  -- Metadata
  is_premium BOOLEAN DEFAULT false,  -- Is it behind a paywall?
  is_beginner_friendly BOOLEAN DEFAULT true,
  sort_order INT DEFAULT 0,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index for faster lookups by template
CREATE INDEX IF NOT EXISTS idx_task_resources_template ON task_resources(template_id);
CREATE INDEX IF NOT EXISTS idx_task_resources_type ON task_resources(resource_type);

-- Enable RLS
ALTER TABLE task_resources ENABLE ROW LEVEL SECURITY;

-- Task resources are viewable by any authenticated user (read-only for users)
CREATE POLICY "Task resources are viewable by authenticated users"
  ON task_resources FOR SELECT
  USING (auth.role() = 'authenticated');

-- Only service role can insert/update resources (admin only)
CREATE POLICY "Only service role can modify task resources"
  ON task_resources FOR ALL
  USING (auth.role() = 'service_role');

-- Add updated_at trigger
CREATE OR REPLACE FUNCTION update_task_resources_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS task_resources_updated_at ON task_resources;
CREATE TRIGGER task_resources_updated_at
  BEFORE UPDATE ON task_resources
  FOR EACH ROW
  EXECUTE FUNCTION update_task_resources_updated_at();

-- Sample data (can be extended later)
-- Voice training resources
INSERT INTO task_resources (template_id, resource_type, title, url, creator, description, duration_label, is_beginner_friendly, sort_order)
SELECT
  id,
  'video'::resource_type,
  'Voice Feminization - Resonance Basics',
  'https://www.youtube.com/watch?v=BfCS01MkbIY',
  'TransVoiceLessons',
  'Learn the fundamentals of shifting your vocal resonance for a more feminine sound.',
  '15 min video',
  true,
  1
FROM task_templates WHERE template_code = 'V3'
ON CONFLICT DO NOTHING;

INSERT INTO task_resources (template_id, resource_type, title, url, creator, description, duration_label, is_beginner_friendly, sort_order)
SELECT
  id,
  'app'::resource_type,
  'Voice Tools - Pitch Analyzer',
  'https://play.google.com/store/apps/details?id=de.lilithwittmann.voicetools',
  'Lilith Wittmann',
  'Free app to visualize your pitch in real-time during practice.',
  'App',
  true,
  2
FROM task_templates WHERE template_code = 'V1'
ON CONFLICT DO NOTHING;
