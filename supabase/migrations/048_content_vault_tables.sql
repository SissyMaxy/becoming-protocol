-- ============================================
-- Content Pipeline Phase 1: Vault & Submission Flow
-- ============================================

-- Content Vault: All submitted evidence flows here
CREATE TABLE IF NOT EXISTS content_vault (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,

  -- Content
  media_url TEXT NOT NULL,
  media_type TEXT NOT NULL CHECK (media_type IN ('image', 'video', 'audio')),
  thumbnail_url TEXT,
  description TEXT,

  -- Source
  source_type TEXT NOT NULL CHECK (source_type IN ('task', 'session', 'cam', 'spontaneous')),
  source_task_id TEXT,
  source_session_id UUID,
  source_cam_session_id UUID,
  capture_context TEXT,
  arousal_level_at_capture INTEGER CHECK (arousal_level_at_capture BETWEEN 0 AND 10),

  -- Submission
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  submission_state TEXT CHECK (submission_state IN ('calm', 'aroused', 'post_session', 'during_cam')),

  -- Handler classification
  vault_tier TEXT NOT NULL DEFAULT 'public_ready'
    CHECK (vault_tier IN ('public_ready', 'private', 'restricted', 'cam_recording', 'cam_highlight')),
  vulnerability_score INTEGER CHECK (vulnerability_score BETWEEN 1 AND 10),
  exposure_phase_minimum TEXT CHECK (exposure_phase_minimum IN ('pre_hrt', 'early_hrt', 'mid_hrt', 'post_coming_out')),
  handler_classification_reason TEXT,

  -- Handler usage
  times_used INTEGER DEFAULT 0,
  last_used_at TIMESTAMPTZ,
  used_as TEXT[] DEFAULT '{}',

  -- Privacy
  anonymity_verified BOOLEAN DEFAULT false,
  privacy_scan_result JSONB,
  exif_stripped BOOLEAN DEFAULT false,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_vault_tier ON content_vault(user_id, vault_tier);
CREATE INDEX idx_vault_vulnerability ON content_vault(user_id, vulnerability_score DESC);
CREATE INDEX idx_vault_unused ON content_vault(user_id, times_used) WHERE times_used = 0;
CREATE INDEX idx_vault_source ON content_vault(user_id, source_type);
CREATE INDEX idx_vault_created ON content_vault(user_id, created_at DESC);

-- Consequence State: Tracks current consequence tier
CREATE TABLE IF NOT EXISTS consequence_state (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL UNIQUE,

  current_tier INTEGER DEFAULT 0 CHECK (current_tier BETWEEN 0 AND 9),
  days_noncompliant INTEGER DEFAULT 0,
  last_escalation_at TIMESTAMPTZ,
  last_compliance_at TIMESTAMPTZ,
  veto_count_this_week INTEGER DEFAULT 0,
  submission_count_this_week INTEGER DEFAULT 0,

  active_warnings JSONB DEFAULT '[]',
  active_deadlines JSONB DEFAULT '[]',
  escalation_history JSONB DEFAULT '[]',

  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Consequence Events: Log of all consequence actions
CREATE TABLE IF NOT EXISTS consequence_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,

  tier INTEGER NOT NULL CHECK (tier BETWEEN 0 AND 9),
  event_type TEXT NOT NULL CHECK (event_type IN ('warning', 'escalation', 'content_posted', 'deescalation', 'compliance_reset')),
  description TEXT,
  vault_content_id UUID REFERENCES content_vault(id),
  content_posted BOOLEAN DEFAULT false,
  platform_posted_to TEXT,

  days_noncompliant INTEGER,
  tasks_skipped INTEGER,
  handler_message TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_consequence_events_user ON consequence_events(user_id, created_at DESC);
CREATE INDEX idx_consequence_events_tier ON consequence_events(user_id, tier);

-- Veto Log: Tracks every veto decision for avoidance detection
CREATE TABLE IF NOT EXISTS veto_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,

  source_type TEXT NOT NULL,
  source_task_id TEXT,
  source_session_id UUID,
  capture_context TEXT,
  arousal_level_at_capture INTEGER,

  media_type TEXT,
  reason TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_veto_log_user ON veto_log(user_id, created_at DESC);
-- Weekly veto queries use idx_veto_log_user with a date filter at query time

-- ============================================
-- RLS Policies
-- ============================================

ALTER TABLE content_vault ENABLE ROW LEVEL SECURITY;
ALTER TABLE consequence_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE consequence_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE veto_log ENABLE ROW LEVEL SECURITY;

-- content_vault: users can CRUD their own content
CREATE POLICY "Users can view own vault content"
  ON content_vault FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own vault content"
  ON content_vault FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own vault content"
  ON content_vault FOR UPDATE
  USING (auth.uid() = user_id);

-- consequence_state: users can view/upsert their own
CREATE POLICY "Users can view own consequence state"
  ON consequence_state FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own consequence state"
  ON consequence_state FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own consequence state"
  ON consequence_state FOR UPDATE
  USING (auth.uid() = user_id);

-- consequence_events: users can view/insert their own
CREATE POLICY "Users can view own consequence events"
  ON consequence_events FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own consequence events"
  ON consequence_events FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- veto_log: users can view/insert their own
CREATE POLICY "Users can view own veto log"
  ON veto_log FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own veto log"
  ON veto_log FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- ============================================
-- Supabase Storage bucket for vault media
-- ============================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'vault-media',
  'vault-media',
  false,
  104857600,  -- 100MB limit
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'video/mp4', 'video/webm', 'audio/mp3', 'audio/webm', 'audio/ogg']
)
ON CONFLICT (id) DO NOTHING;

-- Storage policies: users can upload/read their own media
CREATE POLICY "Users can upload vault media"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'vault-media'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Users can view own vault media"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'vault-media'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Users can delete own vault media"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'vault-media'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- ============================================
-- Auto-initialize consequence_state for new users
-- ============================================

CREATE OR REPLACE FUNCTION initialize_consequence_state()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO consequence_state (user_id, current_tier, days_noncompliant)
  VALUES (NEW.id, 0, 0)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Only create trigger if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'on_auth_user_created_consequence'
  ) THEN
    CREATE TRIGGER on_auth_user_created_consequence
      AFTER INSERT ON auth.users
      FOR EACH ROW
      EXECUTE FUNCTION initialize_consequence_state();
  END IF;
END;
$$;
