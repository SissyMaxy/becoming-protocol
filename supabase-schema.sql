-- Becoming Protocol Database Schema
-- Run this in Supabase SQL Editor (Dashboard → SQL Editor → New Query)

-- Daily entries table
CREATE TABLE daily_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL DEFAULT gen_random_uuid(),
  date DATE NOT NULL,
  intensity TEXT NOT NULL CHECK (intensity IN ('crazy', 'normal', 'spacious')),
  tasks JSONB NOT NULL DEFAULT '[]'::jsonb,
  journal JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, date)
);

-- User progress table
CREATE TABLE user_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE,
  overall_streak INTEGER NOT NULL DEFAULT 0,
  longest_streak INTEGER NOT NULL DEFAULT 0,
  total_days INTEGER NOT NULL DEFAULT 0,
  domain_progress JSONB NOT NULL DEFAULT '[]'::jsonb,
  phase JSONB NOT NULL DEFAULT '{}'::jsonb,
  last_active_date DATE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create indexes for better query performance
CREATE INDEX idx_daily_entries_user_date ON daily_entries(user_id, date DESC);
CREATE INDEX idx_daily_entries_date ON daily_entries(date DESC);
CREATE INDEX idx_user_progress_user ON user_progress(user_id);

-- Enable Row Level Security (RLS)
ALTER TABLE daily_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_progress ENABLE ROW LEVEL SECURITY;

-- For now, allow all operations (we'll add auth later)
-- These policies allow anonymous access for development
CREATE POLICY "Allow all operations on daily_entries" ON daily_entries
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Allow all operations on user_progress" ON user_progress
  FOR ALL USING (true) WITH CHECK (true);

-- Function to auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Triggers for auto-updating timestamps
CREATE TRIGGER update_daily_entries_updated_at
  BEFORE UPDATE ON daily_entries
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_user_progress_updated_at
  BEFORE UPDATE ON user_progress
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
