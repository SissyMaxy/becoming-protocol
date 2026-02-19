-- Sprint 1: Industry Foundation — Shoot System
-- shoot_prescriptions + shoot_reference_images

-- ============================================================
-- shoot_prescriptions: Handler-prescribed content shoots
-- ============================================================
CREATE TABLE shoot_prescriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,

  -- Prescription content
  title TEXT NOT NULL,
  denial_day INTEGER,
  shoot_type TEXT NOT NULL CHECK (shoot_type IN (
    'photo_set', 'short_video', 'cage_check', 'outfit_of_day',
    'toy_showcase', 'tease_video', 'progress_photo', 'edge_capture'
  )),
  outfit TEXT NOT NULL,
  setup TEXT,
  mood TEXT,
  shot_list JSONB NOT NULL DEFAULT '[]',
  handler_note TEXT,
  estimated_minutes INTEGER DEFAULT 15,

  -- Denial engine integration
  denial_badge_color TEXT,
  content_level TEXT,

  -- Audience poll link
  poll_id UUID,

  -- Scheduling
  scheduled_for TIMESTAMPTZ,

  -- Media handling
  media_paths JSONB DEFAULT '[]',
  selected_media JSONB DEFAULT '[]',

  -- Platform + copy
  primary_platform TEXT DEFAULT 'onlyfans',
  secondary_platforms JSONB DEFAULT '[]',
  caption_draft TEXT,
  hashtags TEXT,

  -- Status
  status TEXT DEFAULT 'prescribed' CHECK (status IN (
    'prescribed', 'in_progress', 'captured',
    'ready_to_post', 'posted', 'skipped'
  )),
  skipped_at TIMESTAMPTZ,
  skip_consequence TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE shoot_prescriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY shoot_prescriptions_user ON shoot_prescriptions
  FOR ALL USING (auth.uid() = user_id);

CREATE INDEX idx_shoot_prescriptions_status
  ON shoot_prescriptions(user_id, status, scheduled_for DESC);
CREATE INDEX idx_shoot_prescriptions_denial
  ON shoot_prescriptions(user_id, denial_day, status);

-- ============================================================
-- shoot_reference_images: SVG reference library for poses/angles
-- ============================================================
CREATE TABLE shoot_reference_images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  pose_name TEXT NOT NULL UNIQUE,
  angle TEXT NOT NULL,
  body_position TEXT NOT NULL,
  lighting TEXT,
  camera_position TEXT,
  svg_data TEXT NOT NULL,
  description TEXT,
  tags TEXT[] DEFAULT '{}',
  difficulty INTEGER DEFAULT 1 CHECK (difficulty BETWEEN 1 AND 5),

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Reference images are shared (no user_id, no RLS)
-- They're a system-wide library
