-- Migration 070: Cam Session Expansion
-- Adds handler prompts, detailed tip logging, and live session control columns
-- Builds on existing cam_sessions from migration 050

-- ============================================
-- Extend cam_sessions with live session fields
-- ============================================

ALTER TABLE cam_sessions ADD COLUMN IF NOT EXISTS denial_day INTEGER;
ALTER TABLE cam_sessions ADD COLUMN IF NOT EXISTS prescribed_makeup TEXT;
ALTER TABLE cam_sessions ADD COLUMN IF NOT EXISTS prescribed_setup TEXT;

-- Lifecycle timestamps (more granular than started_at/ended_at)
ALTER TABLE cam_sessions ADD COLUMN IF NOT EXISTS prep_started_at TIMESTAMPTZ;
ALTER TABLE cam_sessions ADD COLUMN IF NOT EXISTS live_started_at TIMESTAMPTZ;
ALTER TABLE cam_sessions ADD COLUMN IF NOT EXISTS live_ended_at TIMESTAMPTZ;

-- Stream
ALTER TABLE cam_sessions ADD COLUMN IF NOT EXISTS stream_url TEXT;
ALTER TABLE cam_sessions ADD COLUMN IF NOT EXISTS is_recording BOOLEAN DEFAULT true;
ALTER TABLE cam_sessions ADD COLUMN IF NOT EXISTS recording_url TEXT;
ALTER TABLE cam_sessions ADD COLUMN IF NOT EXISTS recording_duration_seconds INTEGER;

-- Live session metrics
ALTER TABLE cam_sessions ADD COLUMN IF NOT EXISTS edge_count INTEGER DEFAULT 0;
ALTER TABLE cam_sessions ADD COLUMN IF NOT EXISTS tip_count INTEGER DEFAULT 0;

-- Handler control log (what the Handler did during session)
-- Array of { timestamp, action, details }
ALTER TABLE cam_sessions ADD COLUMN IF NOT EXISTS handler_actions JSONB DEFAULT '[]';

-- Highlight markers (Handler flags moments for clip extraction)
-- Array of { timestamp_seconds, duration_seconds, type, description }
ALTER TABLE cam_sessions ADD COLUMN IF NOT EXISTS highlights JSONB DEFAULT '[]';

-- Content pipeline integration
ALTER TABLE cam_sessions ADD COLUMN IF NOT EXISTS vault_items_created INTEGER DEFAULT 0;

-- Tip goals (Handler-set goals for fan engagement)
ALTER TABLE cam_sessions ADD COLUMN IF NOT EXISTS tip_goals JSONB DEFAULT '[]';

-- ============================================
-- cam_tips: Per-tip logging with device response
-- More detailed than cam_revenue for real-time tip processing
-- ============================================

CREATE TABLE IF NOT EXISTS cam_tips (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  cam_session_id UUID REFERENCES cam_sessions NOT NULL,

  tipper_username TEXT,
  tipper_platform TEXT,
  token_amount INTEGER NOT NULL,
  tip_amount_usd NUMERIC,

  -- Device response
  pattern_triggered TEXT,
  device_response_sent BOOLEAN DEFAULT true,

  -- Timing
  session_timestamp_seconds INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cam_tips_session ON cam_tips(cam_session_id, created_at);

-- ============================================
-- cam_handler_prompts: Invisible prompts sent to David during live
-- ============================================

CREATE TABLE IF NOT EXISTS cam_handler_prompts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  cam_session_id UUID REFERENCES cam_sessions NOT NULL,

  prompt_type TEXT CHECK (prompt_type IN (
    'voice_check',
    'engagement',
    'pacing',
    'tip_goal',
    'edge_warning',
    'outfit_adjust',
    'position_change',
    'affirmation',
    'wind_down',
    'custom'
  )),
  prompt_text TEXT NOT NULL,

  -- Response tracking
  acknowledged BOOLEAN DEFAULT false,
  acknowledged_at TIMESTAMPTZ,

  session_timestamp_seconds INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cam_prompts_session ON cam_handler_prompts(cam_session_id, created_at);

-- ============================================
-- RLS
-- ============================================

ALTER TABLE cam_tips ENABLE ROW LEVEL SECURITY;
ALTER TABLE cam_handler_prompts ENABLE ROW LEVEL SECURITY;

CREATE POLICY cam_tips_user ON cam_tips FOR ALL USING (auth.uid() = user_id);
CREATE POLICY cam_prompts_user ON cam_handler_prompts FOR ALL USING (auth.uid() = user_id);
