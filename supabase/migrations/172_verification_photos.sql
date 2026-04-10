CREATE TABLE IF NOT EXISTS verification_photos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  task_type TEXT NOT NULL CHECK (task_type IN ('outfit', 'mirror_check', 'pose', 'makeup', 'nails', 'general')),
  task_id UUID,
  prescription_id UUID,
  photo_url TEXT NOT NULL,
  caption TEXT,
  handler_response TEXT,
  approved BOOLEAN DEFAULT NULL,
  approved_at TIMESTAMPTZ,
  rejection_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE verification_photos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "verification_photos_select" ON verification_photos FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "verification_photos_insert" ON verification_photos FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "verification_photos_update" ON verification_photos FOR UPDATE USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_verification_photos_user ON verification_photos(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_verification_photos_pending ON verification_photos(user_id, approved) WHERE approved IS NULL;
