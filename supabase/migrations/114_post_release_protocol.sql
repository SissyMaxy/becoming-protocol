-- Post-Release Protocol: lockout, shame capture, deletion intercept, morning reframe
CREATE TABLE IF NOT EXISTS post_release_protocol (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,

  -- Release context
  release_type TEXT NOT NULL,
  regret_level INTEGER NOT NULL DEFAULT 0,
  intensity INTEGER,

  -- Lockout
  lockout_started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  lockout_expires_at TIMESTAMPTZ NOT NULL,
  lockout_tier TEXT NOT NULL DEFAULT 'standard',

  -- Pre-commitment
  pre_commitment_text TEXT,
  pre_commitment_captured_at TIMESTAMPTZ,
  pre_commitment_arousal INTEGER,

  -- Shame capture
  shame_entries JSONB NOT NULL DEFAULT '[]'::jsonb,
  reflection_text TEXT,
  reflection_completed_at TIMESTAMPTZ,

  -- Deletion intercepts
  deletion_attempts INTEGER NOT NULL DEFAULT 0,
  last_deletion_attempt_at TIMESTAMPTZ,

  -- Morning-after
  morning_reframe_shown BOOLEAN NOT NULL DEFAULT FALSE,
  morning_reframe_at TIMESTAMPTZ,

  -- Status
  status TEXT NOT NULL DEFAULT 'active',
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE post_release_protocol ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users access own post-release protocols"
  ON post_release_protocol FOR ALL USING (auth.uid() = user_id);

CREATE INDEX idx_post_release_user_status ON post_release_protocol(user_id, status);
