-- Migration 094: Measurement progress photos
-- Links photos to monthly body measurement records.

CREATE TABLE IF NOT EXISTS measurement_photos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  measurement_id UUID REFERENCES body_measurements(id) ON DELETE SET NULL,
  photo_url TEXT NOT NULL,
  photo_type TEXT NOT NULL CHECK (photo_type IN ('front', 'side', 'back')),
  notes TEXT,
  taken_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE measurement_photos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own measurement photos" ON measurement_photos
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own measurement photos" ON measurement_photos
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own measurement photos" ON measurement_photos
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own measurement photos" ON measurement_photos
  FOR DELETE USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_measurement_photos_user
  ON measurement_photos(user_id, taken_at DESC);
CREATE INDEX IF NOT EXISTS idx_measurement_photos_measurement
  ON measurement_photos(measurement_id);
