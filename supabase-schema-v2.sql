-- Becoming Protocol V2 Schema
-- Run this in Supabase SQL Editor to add new features

-- Evidence table for photos and recordings
CREATE TABLE IF NOT EXISTS evidence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  date DATE NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('photo', 'voice', 'video')),
  domain TEXT,
  task_id TEXT,
  file_name TEXT NOT NULL,
  file_url TEXT NOT NULL,
  thumbnail_url TEXT,
  duration INTEGER, -- seconds for audio/video
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_evidence_user_date ON evidence(user_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_evidence_user_domain ON evidence(user_id, domain);

-- Enable RLS
ALTER TABLE evidence ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only access their own evidence
CREATE POLICY "Users can manage own evidence" ON evidence
  FOR ALL USING (auth.uid() = user_id);

-- Sealed content unlock tracking
CREATE TABLE IF NOT EXISTS sealed_unlocks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  content_id TEXT NOT NULL,
  unlocked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  viewed_at TIMESTAMPTZ,
  UNIQUE(user_id, content_id)
);

CREATE INDEX IF NOT EXISTS idx_sealed_unlocks_user ON sealed_unlocks(user_id);

ALTER TABLE sealed_unlocks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own unlocks" ON sealed_unlocks
  FOR ALL USING (auth.uid() = user_id);

-- Create storage bucket for evidence (run separately in Storage settings)
-- INSERT INTO storage.buckets (id, name, public) VALUES ('evidence', 'evidence', true);

-- Storage policies (run in SQL editor)
-- Allow authenticated users to upload to their own folder
CREATE POLICY "Users can upload own evidence"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'evidence'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- Allow users to read their own evidence
CREATE POLICY "Users can read own evidence"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'evidence'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- Allow users to delete their own evidence
CREATE POLICY "Users can delete own evidence"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'evidence'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- Update daily_entries to use auth.uid() properly
DROP POLICY IF EXISTS "Allow all on daily_entries" ON daily_entries;
CREATE POLICY "Users can manage own entries" ON daily_entries
  FOR ALL USING (auth.uid() = user_id);

-- Update user_progress to use auth.uid() properly
DROP POLICY IF EXISTS "Allow all on user_progress" ON user_progress;
CREATE POLICY "Users can manage own progress" ON user_progress
  FOR ALL USING (auth.uid() = user_id);
