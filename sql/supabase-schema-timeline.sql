-- ============================================
-- VOICE & PHOTO TIMELINE SCHEMA
-- Track transformation over time
-- ============================================

-- Voice recordings
CREATE TABLE IF NOT EXISTS voice_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Recording data
  recorded_at TIMESTAMPTZ DEFAULT NOW(),
  audio_url TEXT NOT NULL,
  audio_duration REAL NOT NULL,  -- seconds

  -- Voice analysis (optional)
  pitch_avg REAL,
  pitch_min REAL,
  pitch_max REAL,

  -- Context
  phrase TEXT NOT NULL,
  week_number INTEGER NOT NULL,
  day_number INTEGER NOT NULL,

  -- Self-assessment
  rating INTEGER CHECK (rating IS NULL OR (rating >= 1 AND rating <= 5)),
  notes TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Photo entries
CREATE TABLE IF NOT EXISTS photo_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Image data
  captured_at TIMESTAMPTZ DEFAULT NOW(),
  image_url TEXT NOT NULL,
  thumbnail_url TEXT,

  -- Categorization
  category TEXT NOT NULL CHECK (category IN ('face', 'full_body', 'outfit', 'hair', 'other')),
  week_number INTEGER NOT NULL,
  day_number INTEGER NOT NULL,

  -- Self-assessment
  rating INTEGER CHECK (rating IS NULL OR (rating >= 1 AND rating <= 5)),
  notes TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Timeline settings
CREATE TABLE IF NOT EXISTS timeline_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  reminder_day INTEGER DEFAULT 0 CHECK (reminder_day >= 0 AND reminder_day <= 6),
  reminder_enabled BOOLEAN DEFAULT true,
  default_phrase TEXT DEFAULT 'Hi, my name is {name}. How are you today?',
  photo_categories TEXT[] DEFAULT ARRAY['face', 'full_body'],

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(user_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_voice_entries_user_date
ON voice_entries(user_id, recorded_at DESC);

CREATE INDEX IF NOT EXISTS idx_voice_entries_week
ON voice_entries(user_id, week_number);

CREATE INDEX IF NOT EXISTS idx_photo_entries_user_date
ON photo_entries(user_id, captured_at DESC);

CREATE INDEX IF NOT EXISTS idx_photo_entries_category
ON photo_entries(user_id, category, captured_at DESC);

CREATE INDEX IF NOT EXISTS idx_photo_entries_week
ON photo_entries(user_id, week_number);

-- RLS Policies
ALTER TABLE voice_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE photo_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE timeline_settings ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (for re-runs)
DROP POLICY IF EXISTS "Users can view own voice entries" ON voice_entries;
DROP POLICY IF EXISTS "Users can insert own voice entries" ON voice_entries;
DROP POLICY IF EXISTS "Users can delete own voice entries" ON voice_entries;
DROP POLICY IF EXISTS "Users can view own photo entries" ON photo_entries;
DROP POLICY IF EXISTS "Users can insert own photo entries" ON photo_entries;
DROP POLICY IF EXISTS "Users can delete own photo entries" ON photo_entries;
DROP POLICY IF EXISTS "Users can view own timeline settings" ON timeline_settings;
DROP POLICY IF EXISTS "Users can insert own timeline settings" ON timeline_settings;
DROP POLICY IF EXISTS "Users can update own timeline settings" ON timeline_settings;

-- Voice entry policies
CREATE POLICY "Users can view own voice entries"
ON voice_entries FOR SELECT TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own voice entries"
ON voice_entries FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own voice entries"
ON voice_entries FOR DELETE TO authenticated
USING (auth.uid() = user_id);

-- Photo entry policies
CREATE POLICY "Users can view own photo entries"
ON photo_entries FOR SELECT TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own photo entries"
ON photo_entries FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own photo entries"
ON photo_entries FOR DELETE TO authenticated
USING (auth.uid() = user_id);

-- Timeline settings policies
CREATE POLICY "Users can view own timeline settings"
ON timeline_settings FOR SELECT TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own timeline settings"
ON timeline_settings FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own timeline settings"
ON timeline_settings FOR UPDATE TO authenticated
USING (auth.uid() = user_id);

-- ============================================
-- STORAGE BUCKETS
-- Run these in Supabase Dashboard > Storage
-- ============================================
--
-- Create buckets:
-- 1. voice-recordings (private)
-- 2. progress-photos (private)
--
-- Or run via SQL:
-- INSERT INTO storage.buckets (id, name, public) VALUES ('voice-recordings', 'voice-recordings', false);
-- INSERT INTO storage.buckets (id, name, public) VALUES ('progress-photos', 'progress-photos', false);

-- ============================================
-- FUNCTIONS
-- ============================================

-- Get timeline stats
CREATE OR REPLACE FUNCTION get_timeline_stats(p_user_id UUID)
RETURNS JSON AS $$
DECLARE
  result JSON;
  first_voice TIMESTAMPTZ;
  first_photo TIMESTAMPTZ;
  first_entry TIMESTAMPTZ;
BEGIN
  -- Get first entries
  SELECT MIN(recorded_at) INTO first_voice FROM voice_entries WHERE user_id = p_user_id;
  SELECT MIN(captured_at) INTO first_photo FROM photo_entries WHERE user_id = p_user_id;

  -- Determine earliest entry
  first_entry := LEAST(COALESCE(first_voice, first_photo), COALESCE(first_photo, first_voice));

  SELECT json_build_object(
    'total_voice_entries', (SELECT COUNT(*) FROM voice_entries WHERE user_id = p_user_id),
    'total_photo_entries', (SELECT COUNT(*) FROM photo_entries WHERE user_id = p_user_id),
    'first_entry_date', first_entry,
    'latest_voice_date', (SELECT MAX(recorded_at) FROM voice_entries WHERE user_id = p_user_id),
    'latest_photo_date', (SELECT MAX(captured_at) FROM photo_entries WHERE user_id = p_user_id),
    'avg_voice_rating', (SELECT ROUND(AVG(rating), 1) FROM voice_entries WHERE user_id = p_user_id AND rating IS NOT NULL),
    'avg_photo_rating', (SELECT ROUND(AVG(rating), 1) FROM photo_entries WHERE user_id = p_user_id AND rating IS NOT NULL),
    'photos_by_category', (
      SELECT json_object_agg(category, cnt)
      FROM (
        SELECT category, COUNT(*) as cnt
        FROM photo_entries
        WHERE user_id = p_user_id
        GROUP BY category
      ) sub
    ),
    'weeks_with_entries', (
      SELECT COUNT(DISTINCT week_number)
      FROM (
        SELECT week_number FROM voice_entries WHERE user_id = p_user_id
        UNION
        SELECT week_number FROM photo_entries WHERE user_id = p_user_id
      ) weeks
    )
  ) INTO result;

  RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Get comparison pairs (first vs latest)
CREATE OR REPLACE FUNCTION get_voice_comparison(p_user_id UUID)
RETURNS JSON AS $$
DECLARE
  first_entry JSON;
  latest_entry JSON;
BEGIN
  SELECT row_to_json(v) INTO first_entry
  FROM voice_entries v
  WHERE user_id = p_user_id
  ORDER BY recorded_at ASC
  LIMIT 1;

  SELECT row_to_json(v) INTO latest_entry
  FROM voice_entries v
  WHERE user_id = p_user_id
  ORDER BY recorded_at DESC
  LIMIT 1;

  RETURN json_build_object(
    'first', first_entry,
    'latest', latest_entry
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION get_photo_comparison(p_user_id UUID, p_category TEXT DEFAULT 'face')
RETURNS JSON AS $$
DECLARE
  first_entry JSON;
  latest_entry JSON;
BEGIN
  SELECT row_to_json(p) INTO first_entry
  FROM photo_entries p
  WHERE user_id = p_user_id AND category = p_category
  ORDER BY captured_at ASC
  LIMIT 1;

  SELECT row_to_json(p) INTO latest_entry
  FROM photo_entries p
  WHERE user_id = p_user_id AND category = p_category
  ORDER BY captured_at DESC
  LIMIT 1;

  RETURN json_build_object(
    'first', first_entry,
    'latest', latest_entry,
    'category', p_category
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
