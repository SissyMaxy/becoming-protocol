-- Sprint 1: Industry Foundation — Audience Participation
-- audience_polls + audience_challenges

-- ============================================================
-- audience_polls: Fan-facing polls (distinct from fan_polls in 050)
-- ============================================================
CREATE TABLE audience_polls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,

  -- Poll content
  question TEXT NOT NULL,
  poll_type TEXT NOT NULL CHECK (poll_type IN (
    'denial_release', 'outfit_choice', 'content_choice',
    'challenge', 'timer', 'prediction', 'punishment', 'general'
  )),
  options JSONB NOT NULL DEFAULT '[]',

  -- Where it was posted
  platforms_posted TEXT[] DEFAULT '{}',
  platform_poll_ids JSONB DEFAULT '{}',

  -- Handler strategy
  handler_intent TEXT,

  -- Result
  winning_option_id TEXT,
  result_honored BOOLEAN,
  result_post_id UUID,

  -- Status
  status TEXT DEFAULT 'draft' CHECK (status IN (
    'draft', 'active', 'closed'
  )),
  expires_at TIMESTAMPTZ,
  posted_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE audience_polls ENABLE ROW LEVEL SECURITY;
CREATE POLICY audience_polls_user ON audience_polls
  FOR ALL USING (auth.uid() = user_id);

CREATE INDEX idx_audience_polls_status
  ON audience_polls(user_id, status, created_at DESC);
CREATE INDEX idx_audience_polls_type
  ON audience_polls(user_id, poll_type, status);

-- ============================================================
-- audience_challenges: Fan-suggested and handler-planted challenges
-- ============================================================
CREATE TABLE audience_challenges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,

  -- Source
  fan_username TEXT,
  platform TEXT,
  suggestion TEXT NOT NULL,

  -- Handler evaluation
  handler_evaluation TEXT,
  handler_modified_version TEXT,

  -- Status
  status TEXT DEFAULT 'pending' CHECK (status IN (
    'pending', 'approved', 'rejected', 'completed'
  )),

  -- Link to shoot
  shoot_prescription_id UUID REFERENCES shoot_prescriptions,

  -- Engagement
  engagement_score NUMERIC,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE audience_challenges ENABLE ROW LEVEL SECURITY;
CREATE POLICY audience_challenges_user ON audience_challenges
  FOR ALL USING (auth.uid() = user_id);

CREATE INDEX idx_audience_challenges_status
  ON audience_challenges(user_id, status, created_at DESC);
