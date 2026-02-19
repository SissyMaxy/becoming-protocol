-- Sprint 1: Industry Foundation — Denial Content Calendar
-- denial_day_content_map + denial_cycle_shoots

-- ============================================================
-- denial_day_content_map: Maps denial days to content strategy
-- ============================================================
CREATE TABLE denial_day_content_map (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  denial_day INTEGER NOT NULL UNIQUE CHECK (denial_day BETWEEN 1 AND 7),
  mood TEXT NOT NULL,
  content_types JSONB NOT NULL DEFAULT '[]',
  audience_hooks JSONB NOT NULL DEFAULT '[]',
  engagement_strategy TEXT NOT NULL,
  shoot_difficulty TEXT CHECK (shoot_difficulty IN (
    'easy', 'medium', 'high_arousal', 'premium'
  )),
  reddit_subs JSONB DEFAULT '[]',
  handler_notes TEXT,
  optimal_shoot_types JSONB DEFAULT '[]',

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- System-wide config, no RLS

-- ============================================================
-- denial_cycle_shoots: Template shoots keyed to denial day
-- ============================================================
CREATE TABLE denial_cycle_shoots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  denial_day INTEGER NOT NULL UNIQUE CHECK (denial_day BETWEEN 1 AND 7),
  title TEXT NOT NULL,
  shoot_type TEXT NOT NULL CHECK (shoot_type IN (
    'photo_set', 'short_video', 'cage_check', 'outfit_of_day',
    'toy_showcase', 'tease_video', 'progress_photo', 'edge_capture'
  )),
  duration_minutes INTEGER DEFAULT 10,
  mood TEXT,
  setup TEXT,
  outfit TEXT,
  shot_count INTEGER DEFAULT 3,
  shot_descriptions JSONB NOT NULL DEFAULT '[]',
  platforms JSONB NOT NULL DEFAULT '{}',
  caption_template TEXT,
  poll_type TEXT CHECK (poll_type IN (
    'denial_release', 'outfit_choice', 'content_choice',
    'challenge', 'timer', 'prediction', 'punishment', NULL
  )),
  handler_note TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- System-wide config, no RLS
