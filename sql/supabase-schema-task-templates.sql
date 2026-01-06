-- Task Templates Schema
-- Rich task content library for feminization practices
-- Provides spoon-fed, educational, actionable task descriptions

-- ===========================================
-- TASK TEMPLATES TABLE
-- ===========================================

-- Enum for task domains
CREATE TYPE task_domain AS ENUM (
  'voice',
  'movement',
  'skincare',
  'style',
  'social',
  'mindset',
  'body'
);

-- Enum for difficulty levels
CREATE TYPE task_difficulty AS ENUM (
  'beginner',
  'intermediate',
  'advanced'
);

-- Enum for task frequency
CREATE TYPE task_frequency AS ENUM (
  'daily',
  'weekly',
  '2-3x_weekly',
  'as_needed',
  'once'
);

-- Main task templates table
CREATE TABLE IF NOT EXISTS task_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Basic identification
  template_code VARCHAR(20) NOT NULL UNIQUE,  -- e.g., 'V1', 'M2', 'S1'
  domain task_domain NOT NULL,
  name VARCHAR(100) NOT NULL,
  short_description TEXT NOT NULL,

  -- Rich content (JSONB for flexibility)
  full_description JSONB NOT NULL,
  -- Structure:
  -- {
  --   "whatToDo": "Step-by-step instructions...",
  --   "whyItMatters": "Connection to feminization...",
  --   "tipsForBeginners": ["tip1", "tip2", ...],
  --   "variations": ["variation1", "variation2", ...],
  --   "nextLevel": "How to progress..."
  -- }

  -- Metadata
  time_minutes INT NOT NULL,
  difficulty task_difficulty NOT NULL,
  frequency task_frequency NOT NULL,
  requires_privacy BOOLEAN DEFAULT false,
  requires_supplies TEXT[] DEFAULT '{}',

  -- AI prescription metadata
  prescription_context TEXT,  -- When to prescribe this
  contraindications TEXT[] DEFAULT '{}',  -- When NOT to prescribe
  min_phase INT DEFAULT 1,  -- Minimum user phase to prescribe

  -- Weighting for prescription algorithm
  base_weight INT DEFAULT 100,  -- Higher = more likely to be prescribed

  -- Management
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ===========================================
-- INDEXES
-- ===========================================

CREATE INDEX idx_task_templates_domain ON task_templates(domain);
CREATE INDEX idx_task_templates_difficulty ON task_templates(difficulty);
CREATE INDEX idx_task_templates_frequency ON task_templates(frequency);
CREATE INDEX idx_task_templates_active ON task_templates(is_active) WHERE is_active = true;
CREATE INDEX idx_task_templates_min_phase ON task_templates(min_phase);

-- ===========================================
-- USER TASK TEMPLATE HISTORY
-- Tracks which templates users have completed
-- ===========================================

CREATE TABLE IF NOT EXISTS user_template_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  template_id UUID NOT NULL REFERENCES task_templates(id) ON DELETE CASCADE,

  -- Completion tracking
  times_completed INT DEFAULT 0,
  first_completed_at TIMESTAMPTZ,
  last_completed_at TIMESTAMPTZ,

  -- User feedback
  average_rating DECIMAL(3,2),  -- 1-5 rating
  total_ratings INT DEFAULT 0,

  -- Prescription tracking
  times_prescribed INT DEFAULT 0,
  times_skipped INT DEFAULT 0,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(user_id, template_id)
);

CREATE INDEX idx_user_template_history_user ON user_template_history(user_id);
CREATE INDEX idx_user_template_history_template ON user_template_history(template_id);

-- ===========================================
-- TEMPLATE COMPLETION LOG
-- Detailed log of each template completion
-- ===========================================

CREATE TABLE IF NOT EXISTS template_completion_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  template_id UUID NOT NULL REFERENCES task_templates(id) ON DELETE CASCADE,
  task_id UUID REFERENCES daily_tasks(id) ON DELETE SET NULL,  -- If generated from prescription

  -- Completion details
  completed_at TIMESTAMPTZ DEFAULT NOW(),
  duration_minutes INT,  -- Actual time spent

  -- User feedback (optional)
  rating INT CHECK (rating >= 1 AND rating <= 5),
  notes TEXT,
  expanded_why_it_matters BOOLEAN DEFAULT false,  -- Did user expand this section?
  expanded_tips BOOLEAN DEFAULT false,  -- Did user expand this section?

  -- Context
  completed_in_session BOOLEAN DEFAULT false,  -- Was this during an arousal session?
  session_id UUID  -- Reference to arousal session if applicable
);

CREATE INDEX idx_template_completion_user ON template_completion_log(user_id);
CREATE INDEX idx_template_completion_template ON template_completion_log(template_id);
CREATE INDEX idx_template_completion_date ON template_completion_log(completed_at);

-- ===========================================
-- RLS POLICIES
-- ===========================================

ALTER TABLE task_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_template_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE template_completion_log ENABLE ROW LEVEL SECURITY;

-- Task templates are readable by all authenticated users
CREATE POLICY "Task templates are viewable by authenticated users"
  ON task_templates FOR SELECT
  USING (auth.role() = 'authenticated');

-- User template history - users can only see their own
CREATE POLICY "Users can view own template history"
  ON user_template_history FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own template history"
  ON user_template_history FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own template history"
  ON user_template_history FOR UPDATE
  USING (auth.uid() = user_id);

-- Template completion log - users can only see their own
CREATE POLICY "Users can view own completion log"
  ON template_completion_log FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own completion log"
  ON template_completion_log FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- ===========================================
-- FUNCTIONS
-- ===========================================

-- Function to get templates for prescription based on user phase and preferences
CREATE OR REPLACE FUNCTION get_prescribable_templates(
  p_user_id UUID,
  p_user_phase INT DEFAULT 1,
  p_domains task_domain[] DEFAULT NULL,
  p_max_difficulty task_difficulty DEFAULT 'advanced',
  p_limit INT DEFAULT 20
)
RETURNS TABLE (
  template_id UUID,
  template_code VARCHAR(20),
  domain task_domain,
  name VARCHAR(100),
  short_description TEXT,
  full_description JSONB,
  time_minutes INT,
  difficulty task_difficulty,
  frequency task_frequency,
  requires_privacy BOOLEAN,
  requires_supplies TEXT[],
  times_completed INT,
  last_completed_at TIMESTAMPTZ,
  prescription_weight INT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    t.id as template_id,
    t.template_code,
    t.domain,
    t.name,
    t.short_description,
    t.full_description,
    t.time_minutes,
    t.difficulty,
    t.frequency,
    t.requires_privacy,
    t.requires_supplies,
    COALESCE(h.times_completed, 0) as times_completed,
    h.last_completed_at,
    -- Calculate prescription weight
    CASE
      -- Reduce weight for recently completed templates
      WHEN h.last_completed_at > NOW() - INTERVAL '1 day' THEN t.base_weight / 4
      WHEN h.last_completed_at > NOW() - INTERVAL '3 days' THEN t.base_weight / 2
      -- Increase weight for never-completed templates
      WHEN h.times_completed IS NULL OR h.times_completed = 0 THEN t.base_weight * 2
      ELSE t.base_weight
    END as prescription_weight
  FROM task_templates t
  LEFT JOIN user_template_history h ON h.template_id = t.id AND h.user_id = p_user_id
  WHERE
    t.is_active = true
    AND t.min_phase <= p_user_phase
    AND (
      p_domains IS NULL
      OR t.domain = ANY(p_domains)
    )
    AND (
      (p_max_difficulty = 'advanced')
      OR (p_max_difficulty = 'intermediate' AND t.difficulty IN ('beginner', 'intermediate'))
      OR (p_max_difficulty = 'beginner' AND t.difficulty = 'beginner')
    )
  ORDER BY prescription_weight DESC, RANDOM()
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to record template completion
CREATE OR REPLACE FUNCTION record_template_completion(
  p_user_id UUID,
  p_template_id UUID,
  p_task_id UUID DEFAULT NULL,
  p_duration_minutes INT DEFAULT NULL,
  p_rating INT DEFAULT NULL,
  p_notes TEXT DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  v_log_id UUID;
BEGIN
  -- Insert completion log
  INSERT INTO template_completion_log (
    user_id, template_id, task_id, duration_minutes, rating, notes
  ) VALUES (
    p_user_id, p_template_id, p_task_id, p_duration_minutes, p_rating, p_notes
  )
  RETURNING id INTO v_log_id;

  -- Update or insert user history
  INSERT INTO user_template_history (
    user_id, template_id, times_completed, first_completed_at, last_completed_at,
    average_rating, total_ratings
  ) VALUES (
    p_user_id, p_template_id, 1, NOW(), NOW(),
    p_rating, CASE WHEN p_rating IS NOT NULL THEN 1 ELSE 0 END
  )
  ON CONFLICT (user_id, template_id) DO UPDATE SET
    times_completed = user_template_history.times_completed + 1,
    last_completed_at = NOW(),
    average_rating = CASE
      WHEN p_rating IS NOT NULL THEN
        ((user_template_history.average_rating * user_template_history.total_ratings) + p_rating)
        / (user_template_history.total_ratings + 1)
      ELSE user_template_history.average_rating
    END,
    total_ratings = CASE
      WHEN p_rating IS NOT NULL THEN user_template_history.total_ratings + 1
      ELSE user_template_history.total_ratings
    END,
    updated_at = NOW();

  RETURN v_log_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ===========================================
-- TRIGGERS
-- ===========================================

-- Update timestamp trigger
CREATE OR REPLACE FUNCTION update_task_template_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER task_templates_updated_at
  BEFORE UPDATE ON task_templates
  FOR EACH ROW
  EXECUTE FUNCTION update_task_template_timestamp();

CREATE TRIGGER user_template_history_updated_at
  BEFORE UPDATE ON user_template_history
  FOR EACH ROW
  EXECUTE FUNCTION update_task_template_timestamp();
