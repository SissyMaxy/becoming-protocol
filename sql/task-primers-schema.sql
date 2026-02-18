-- Task Primers Schema
-- Short hypno/identity videos that prime the user before movement tasks

-- ============================================
-- TABLE: task_primers (Video library)
-- ============================================

CREATE TABLE IF NOT EXISTS task_primers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Content
  title VARCHAR(100) NOT NULL,
  video_path VARCHAR(255) NOT NULL,  -- e.g., '/videos/primers/posture-001.mp4'
  thumbnail_path VARCHAR(255),
  duration_seconds INT NOT NULL,

  -- Classification
  primer_type VARCHAR(30) NOT NULL,  -- 'identity_erasure', 'trigger_plant', 'arousal', 'affirmation', 'hypno', 'mantra'
  target_domain VARCHAR(30),  -- 'movement', 'voice', 'posture', etc. (null = universal)
  intensity INT NOT NULL DEFAULT 1 CHECK (intensity BETWEEN 1 AND 5),

  -- Conditioning elements
  triggers_planted TEXT[],  -- Triggers this video reinforces: ['posture_check', 'hip_sway', 'graceful']
  affirmations TEXT[],  -- Key phrases: ['She moves gracefully', 'Her body knows']
  sensory_anchors JSONB DEFAULT '{}',  -- {'scent': 'feminine', 'color': 'pink'}

  -- Usage control
  requires_arousal_state VARCHAR(30),  -- null, 'building', 'sweet_spot', etc.
  requires_denial_day INT,
  min_phase INT DEFAULT 1,

  -- Metadata
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  active BOOLEAN DEFAULT true
);

-- ============================================
-- TABLE: task_primer_associations
-- Links primers to specific tasks
-- ============================================

CREATE TABLE IF NOT EXISTS task_primer_associations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  task_id UUID NOT NULL REFERENCES task_bank(id) ON DELETE CASCADE,
  primer_id UUID NOT NULL REFERENCES task_primers(id) ON DELETE CASCADE,

  -- Relationship type
  association_type VARCHAR(30) NOT NULL DEFAULT 'warmup',  -- 'warmup', 'during', 'reward', 'random'
  priority INT DEFAULT 1,  -- For ordering when multiple primers

  -- Probability (for random selection)
  weight INT DEFAULT 100,  -- Higher = more likely to be selected

  created_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(task_id, primer_id)
);

-- ============================================
-- TABLE: primer_views (User engagement tracking)
-- ============================================

CREATE TABLE IF NOT EXISTS primer_views (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  primer_id UUID NOT NULL REFERENCES task_primers(id) ON DELETE CASCADE,

  -- View details
  viewed_at TIMESTAMPTZ DEFAULT NOW(),
  watch_duration_seconds INT,  -- How much they actually watched
  completed BOOLEAN DEFAULT false,

  -- Context
  task_id UUID REFERENCES task_bank(id),  -- Which task triggered this
  arousal_state VARCHAR(30),
  denial_day INT,

  -- Effectiveness tracking
  trigger_activated BOOLEAN,  -- Did they respond to the trigger?
  reported_effect VARCHAR(30)  -- 'strong', 'moderate', 'weak', 'none'
);

-- ============================================
-- INDEXES
-- ============================================

CREATE INDEX IF NOT EXISTS idx_task_primers_type ON task_primers(primer_type);
CREATE INDEX IF NOT EXISTS idx_task_primers_domain ON task_primers(target_domain);
CREATE INDEX IF NOT EXISTS idx_task_primers_active ON task_primers(active);

CREATE INDEX IF NOT EXISTS idx_primer_assoc_task ON task_primer_associations(task_id);
CREATE INDEX IF NOT EXISTS idx_primer_assoc_primer ON task_primer_associations(primer_id);

CREATE INDEX IF NOT EXISTS idx_primer_views_user ON primer_views(user_id);
CREATE INDEX IF NOT EXISTS idx_primer_views_primer ON primer_views(primer_id);

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================

ALTER TABLE task_primers ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_primer_associations ENABLE ROW LEVEL SECURITY;
ALTER TABLE primer_views ENABLE ROW LEVEL SECURITY;

-- Primers readable by all authenticated users
CREATE POLICY "Primers readable by authenticated" ON task_primers
  FOR SELECT USING (auth.role() = 'authenticated');

-- Associations readable by all authenticated users
CREATE POLICY "Primer associations readable by authenticated" ON task_primer_associations
  FOR SELECT USING (auth.role() = 'authenticated');

-- Users own their view history
CREATE POLICY "Users own primer_views" ON primer_views
  FOR ALL USING (auth.uid() = user_id);

-- ============================================
-- HELPER FUNCTION: Get primer for task
-- ============================================

CREATE OR REPLACE FUNCTION get_task_primer(
  p_task_id UUID,
  p_association_type VARCHAR DEFAULT 'warmup'
)
RETURNS TABLE (
  primer_id UUID,
  title VARCHAR(100),
  video_path VARCHAR(255),
  duration_seconds INT,
  primer_type VARCHAR(30),
  triggers_planted TEXT[],
  affirmations TEXT[]
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    p.id as primer_id,
    p.title,
    p.video_path,
    p.duration_seconds,
    p.primer_type,
    p.triggers_planted,
    p.affirmations
  FROM task_primers p
  JOIN task_primer_associations a ON a.primer_id = p.id
  WHERE a.task_id = p_task_id
    AND a.association_type = p_association_type
    AND p.active = true
  ORDER BY a.priority, RANDOM()
  LIMIT 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- HELPER FUNCTION: Get random primer by domain
-- ============================================

CREATE OR REPLACE FUNCTION get_random_primer(
  p_domain VARCHAR DEFAULT NULL,
  p_primer_type VARCHAR DEFAULT NULL,
  p_max_intensity INT DEFAULT 5
)
RETURNS TABLE (
  primer_id UUID,
  title VARCHAR(100),
  video_path VARCHAR(255),
  duration_seconds INT,
  primer_type VARCHAR(30),
  triggers_planted TEXT[],
  affirmations TEXT[]
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    p.id as primer_id,
    p.title,
    p.video_path,
    p.duration_seconds,
    p.primer_type,
    p.triggers_planted,
    p.affirmations
  FROM task_primers p
  WHERE p.active = true
    AND p.intensity <= p_max_intensity
    AND (p_domain IS NULL OR p.target_domain = p_domain OR p.target_domain IS NULL)
    AND (p_primer_type IS NULL OR p.primer_type = p_primer_type)
  ORDER BY RANDOM()
  LIMIT 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
