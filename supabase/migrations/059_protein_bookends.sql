-- Migration 059: Protein tracking + Morning/Evening bookend system
-- Simple protein tracker (5 checkboxes, not calorie counting)
-- Bookend overlays for daily open/close ritual

-- ===========================================
-- 1. Daily Protein Tracking
-- ===========================================

CREATE TABLE IF NOT EXISTS daily_protein (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  shake_post_workout BOOLEAN DEFAULT false,
  breakfast_protein BOOLEAN DEFAULT false,
  lunch_protein BOOLEAN DEFAULT false,
  dinner_protein BOOLEAN DEFAULT false,
  snack_protein BOOLEAN DEFAULT false,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, date)
);

ALTER TABLE daily_protein ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own protein" ON daily_protein
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own protein" ON daily_protein
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own protein" ON daily_protein
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own protein" ON daily_protein
  FOR DELETE USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_daily_protein_user_date
  ON daily_protein(user_id, date DESC);

-- ===========================================
-- 2. Bookend Configuration
-- ===========================================

CREATE TABLE IF NOT EXISTS bookend_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL UNIQUE,
  wake_time TIME DEFAULT '06:30',
  bed_time TIME DEFAULT '22:00',
  morning_name TEXT DEFAULT 'Maxy',
  enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE bookend_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own bookend config" ON bookend_config
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own bookend config" ON bookend_config
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own bookend config" ON bookend_config
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own bookend config" ON bookend_config
  FOR DELETE USING (auth.uid() = user_id);

-- ===========================================
-- 3. Bookend View Tracking
-- ===========================================

CREATE TABLE IF NOT EXISTS bookend_views (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  type TEXT NOT NULL, -- 'morning', 'evening'
  message_shown TEXT,
  viewed_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE bookend_views ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own bookend views" ON bookend_views
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own bookend views" ON bookend_views
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_bookend_views_user_type
  ON bookend_views(user_id, type, viewed_at DESC);
