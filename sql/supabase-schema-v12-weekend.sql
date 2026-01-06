-- =====================================================
-- Becoming Protocol - Weekend Gina Integration Schema
-- Version 12
-- =====================================================

-- Weekend activity definitions (seeded reference data)
CREATE TABLE IF NOT EXISTS weekend_activities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Identity
    activity_id VARCHAR(50) UNIQUE NOT NULL, -- e.g., 'yoga_together', 'nail_painting'
    name VARCHAR(100) NOT NULL,
    description TEXT,

    -- Categorization
    category VARCHAR(30) NOT NULL, -- 'gina_feminizing', 'shared', 'intimacy', 'support'
    subcategory VARCHAR(30),
    integration_level INT NOT NULL CHECK (integration_level BETWEEN 1 AND 5),

    -- For gina_feminizing activities
    gina_action TEXT,
    your_role VARCHAR(20), -- 'passive', 'receptive', 'collaborative'

    -- Framing
    gina_framing TEXT NOT NULL,
    feminization_benefit TEXT,
    gina_benefit TEXT,

    -- Requirements
    requires_prior_activity VARCHAR(50), -- Activity ID
    requires_supplies BOOLEAN DEFAULT false,
    supplies_needed TEXT[],

    -- Timing
    duration_minutes INT,
    best_time VARCHAR(20) DEFAULT 'flexible', -- 'morning', 'afternoon', 'evening', 'flexible'

    -- Flags
    is_intimate BOOLEAN DEFAULT false,
    intimacy_level VARCHAR(20), -- 'non_intimate', 'sensual', 'intimate', 'sexual'
    photo_opportunity BOOLEAN DEFAULT false,
    content_potential BOOLEAN DEFAULT false,
    content_notes TEXT,

    -- Domains touched (for cross-tracking with main protocol)
    feminization_domains TEXT[],

    -- Status
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for common queries
CREATE INDEX IF NOT EXISTS idx_weekend_activities_category ON weekend_activities(category);
CREATE INDEX IF NOT EXISTS idx_weekend_activities_level ON weekend_activities(integration_level);
CREATE INDEX IF NOT EXISTS idx_weekend_activities_active ON weekend_activities(active);

-- Weekend sessions (logged completed activities)
CREATE TABLE IF NOT EXISTS weekend_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

    -- Timing
    session_date DATE NOT NULL,
    day_of_week VARCHAR(10) NOT NULL, -- 'saturday', 'sunday'
    time_block VARCHAR(20), -- 'morning', 'afternoon', 'evening'

    -- Activity
    activity_id VARCHAR(50) NOT NULL REFERENCES weekend_activities(activity_id),

    -- Completion
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    duration_minutes INT,
    completed BOOLEAN DEFAULT false,

    -- Gina participation
    gina_participated BOOLEAN DEFAULT false,
    gina_initiated BOOLEAN DEFAULT false,
    gina_engagement_rating INT CHECK (gina_engagement_rating BETWEEN 1 AND 5),

    -- Your experience
    feminization_rating INT CHECK (feminization_rating BETWEEN 1 AND 5),
    connection_rating INT CHECK (connection_rating BETWEEN 1 AND 5),
    enjoyment_rating INT CHECK (enjoyment_rating BETWEEN 1 AND 5),

    -- Evidence
    photos_captured INT DEFAULT 0,

    -- Journal
    notes TEXT,
    gina_reactions TEXT,
    what_worked TEXT,
    what_to_improve TEXT,

    -- For future suggestions
    would_repeat BOOLEAN,
    suggested_followup VARCHAR(50),

    created_at TIMESTAMPTZ DEFAULT NOW(),

    -- Prevent duplicate sessions for same activity on same day
    UNIQUE(user_id, session_date, activity_id)
);

-- Indexes for weekend_sessions
CREATE INDEX IF NOT EXISTS idx_weekend_sessions_user ON weekend_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_weekend_sessions_date ON weekend_sessions(session_date);
CREATE INDEX IF NOT EXISTS idx_weekend_sessions_user_date ON weekend_sessions(user_id, session_date);

-- Weekend plans (prescriptions for a weekend)
CREATE TABLE IF NOT EXISTS weekend_plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

    -- Which weekend (Saturday date)
    weekend_start DATE NOT NULL,

    -- Planned activities (stored as JSONB arrays)
    saturday_activities JSONB DEFAULT '[]'::jsonb,
    sunday_activities JSONB DEFAULT '[]'::jsonb,

    -- AI-generated context
    saturday_theme TEXT,
    sunday_theme TEXT,
    weekend_focus TEXT,

    -- Goals
    gina_involvement_level VARCHAR(20) DEFAULT 'moderate', -- 'light', 'moderate', 'deep'
    intimacy_goal TEXT,
    feminization_focus TEXT[],

    -- Stretch activity (for progression)
    stretch_activity JSONB,

    -- Intimacy suggestion
    intimacy_suggestion JSONB,

    -- Status
    created_at TIMESTAMPTZ DEFAULT NOW(),
    finalized BOOLEAN DEFAULT false,

    -- One plan per weekend per user
    UNIQUE(user_id, weekend_start)
);

-- Index for weekend_plans
CREATE INDEX IF NOT EXISTS idx_weekend_plans_user ON weekend_plans(user_id);
CREATE INDEX IF NOT EXISTS idx_weekend_plans_weekend ON weekend_plans(weekend_start);

-- Gina integration progress (ratchet tracking)
CREATE TABLE IF NOT EXISTS gina_integration_progress (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID UNIQUE NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

    -- Overall level (1-5)
    current_level INT DEFAULT 1 CHECK (current_level BETWEEN 1 AND 5),

    -- Per-category levels
    level_gina_feminizing INT DEFAULT 1 CHECK (level_gina_feminizing BETWEEN 1 AND 5),
    level_shared_activities INT DEFAULT 1 CHECK (level_shared_activities BETWEEN 1 AND 5),
    level_intimacy INT DEFAULT 1 CHECK (level_intimacy BETWEEN 1 AND 5),
    level_support INT DEFAULT 1 CHECK (level_support BETWEEN 1 AND 5),

    -- Milestone tracking (dates achieved)
    first_nail_painting DATE,
    first_makeup DATE,
    first_full_makeup DATE,
    first_photoshoot DATE,
    first_cage_check DATE,
    first_dressed_intimacy DATE,
    first_role_reversal DATE,
    first_name_usage DATE,

    -- Activity counts
    total_gina_feminizing_sessions INT DEFAULT 0,
    total_shared_sessions INT DEFAULT 0,
    total_intimacy_sessions INT DEFAULT 0,
    total_support_sessions INT DEFAULT 0,

    -- Engagement tracking
    gina_avg_engagement DECIMAL(3,2) DEFAULT 0,
    gina_initiated_count INT DEFAULT 0,

    -- Locked activities (ratchet - activities she's done)
    locked_activities TEXT[] DEFAULT '{}',

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- Row Level Security Policies
-- =====================================================

-- Enable RLS on all tables
ALTER TABLE weekend_activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE weekend_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE weekend_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE gina_integration_progress ENABLE ROW LEVEL SECURITY;

-- weekend_activities: Read-only for all authenticated users (reference data)
CREATE POLICY "weekend_activities_select"
    ON weekend_activities FOR SELECT
    TO authenticated
    USING (active = true);

-- weekend_sessions: Users can only access their own sessions
CREATE POLICY "weekend_sessions_select"
    ON weekend_sessions FOR SELECT
    TO authenticated
    USING (auth.uid() = user_id);

CREATE POLICY "weekend_sessions_insert"
    ON weekend_sessions FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "weekend_sessions_update"
    ON weekend_sessions FOR UPDATE
    TO authenticated
    USING (auth.uid() = user_id);

CREATE POLICY "weekend_sessions_delete"
    ON weekend_sessions FOR DELETE
    TO authenticated
    USING (auth.uid() = user_id);

-- weekend_plans: Users can only access their own plans
CREATE POLICY "weekend_plans_select"
    ON weekend_plans FOR SELECT
    TO authenticated
    USING (auth.uid() = user_id);

CREATE POLICY "weekend_plans_insert"
    ON weekend_plans FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "weekend_plans_update"
    ON weekend_plans FOR UPDATE
    TO authenticated
    USING (auth.uid() = user_id);

CREATE POLICY "weekend_plans_delete"
    ON weekend_plans FOR DELETE
    TO authenticated
    USING (auth.uid() = user_id);

-- gina_integration_progress: Users can only access their own progress
CREATE POLICY "gina_progress_select"
    ON gina_integration_progress FOR SELECT
    TO authenticated
    USING (auth.uid() = user_id);

CREATE POLICY "gina_progress_insert"
    ON gina_integration_progress FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "gina_progress_update"
    ON gina_integration_progress FOR UPDATE
    TO authenticated
    USING (auth.uid() = user_id);

-- =====================================================
-- Helper Functions
-- =====================================================

-- Function to update gina integration progress after completing a session
CREATE OR REPLACE FUNCTION update_gina_integration_after_session()
RETURNS TRIGGER AS $$
DECLARE
    activity_record RECORD;
    current_progress RECORD;
    new_avg DECIMAL(3,2);
BEGIN
    -- Only run on completed sessions
    IF NEW.completed = false THEN
        RETURN NEW;
    END IF;

    -- Get the activity details
    SELECT * INTO activity_record
    FROM weekend_activities
    WHERE activity_id = NEW.activity_id;

    -- Get or create progress record
    INSERT INTO gina_integration_progress (user_id)
    VALUES (NEW.user_id)
    ON CONFLICT (user_id) DO NOTHING;

    SELECT * INTO current_progress
    FROM gina_integration_progress
    WHERE user_id = NEW.user_id;

    -- Update session counts based on category
    IF activity_record.category = 'gina_feminizing' THEN
        UPDATE gina_integration_progress
        SET total_gina_feminizing_sessions = total_gina_feminizing_sessions + 1,
            updated_at = NOW()
        WHERE user_id = NEW.user_id;
    ELSIF activity_record.category = 'shared' THEN
        UPDATE gina_integration_progress
        SET total_shared_sessions = total_shared_sessions + 1,
            updated_at = NOW()
        WHERE user_id = NEW.user_id;
    ELSIF activity_record.category = 'intimacy' THEN
        UPDATE gina_integration_progress
        SET total_intimacy_sessions = total_intimacy_sessions + 1,
            updated_at = NOW()
        WHERE user_id = NEW.user_id;
    ELSIF activity_record.category = 'support' THEN
        UPDATE gina_integration_progress
        SET total_support_sessions = total_support_sessions + 1,
            updated_at = NOW()
        WHERE user_id = NEW.user_id;
    END IF;

    -- Update Gina initiated count if applicable
    IF NEW.gina_initiated = true THEN
        UPDATE gina_integration_progress
        SET gina_initiated_count = gina_initiated_count + 1,
            updated_at = NOW()
        WHERE user_id = NEW.user_id;
    END IF;

    -- Recalculate average engagement if rating provided
    IF NEW.gina_engagement_rating IS NOT NULL THEN
        SELECT AVG(gina_engagement_rating) INTO new_avg
        FROM weekend_sessions
        WHERE user_id = NEW.user_id
          AND gina_engagement_rating IS NOT NULL;

        UPDATE gina_integration_progress
        SET gina_avg_engagement = COALESCE(new_avg, 0),
            updated_at = NOW()
        WHERE user_id = NEW.user_id;
    END IF;

    -- Add to locked activities if not already there
    UPDATE gina_integration_progress
    SET locked_activities = array_append(
            array_remove(locked_activities, NEW.activity_id),
            NEW.activity_id
        ),
        updated_at = NOW()
    WHERE user_id = NEW.user_id
      AND NOT (NEW.activity_id = ANY(locked_activities));

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to update progress after session completion
DROP TRIGGER IF EXISTS trigger_update_gina_integration ON weekend_sessions;
CREATE TRIGGER trigger_update_gina_integration
    AFTER INSERT OR UPDATE ON weekend_sessions
    FOR EACH ROW
    EXECUTE FUNCTION update_gina_integration_after_session();

-- Function to record a milestone
CREATE OR REPLACE FUNCTION record_gina_milestone(
    p_user_id UUID,
    p_milestone TEXT
)
RETURNS VOID AS $$
BEGIN
    -- Ensure progress record exists
    INSERT INTO gina_integration_progress (user_id)
    VALUES (p_user_id)
    ON CONFLICT (user_id) DO NOTHING;

    -- Update the appropriate milestone field
    CASE p_milestone
        WHEN 'first_nail_painting' THEN
            UPDATE gina_integration_progress
            SET first_nail_painting = COALESCE(first_nail_painting, CURRENT_DATE),
                updated_at = NOW()
            WHERE user_id = p_user_id;
        WHEN 'first_makeup' THEN
            UPDATE gina_integration_progress
            SET first_makeup = COALESCE(first_makeup, CURRENT_DATE),
                updated_at = NOW()
            WHERE user_id = p_user_id;
        WHEN 'first_full_makeup' THEN
            UPDATE gina_integration_progress
            SET first_full_makeup = COALESCE(first_full_makeup, CURRENT_DATE),
                updated_at = NOW()
            WHERE user_id = p_user_id;
        WHEN 'first_photoshoot' THEN
            UPDATE gina_integration_progress
            SET first_photoshoot = COALESCE(first_photoshoot, CURRENT_DATE),
                updated_at = NOW()
            WHERE user_id = p_user_id;
        WHEN 'first_cage_check' THEN
            UPDATE gina_integration_progress
            SET first_cage_check = COALESCE(first_cage_check, CURRENT_DATE),
                updated_at = NOW()
            WHERE user_id = p_user_id;
        WHEN 'first_dressed_intimacy' THEN
            UPDATE gina_integration_progress
            SET first_dressed_intimacy = COALESCE(first_dressed_intimacy, CURRENT_DATE),
                updated_at = NOW()
            WHERE user_id = p_user_id;
        WHEN 'first_role_reversal' THEN
            UPDATE gina_integration_progress
            SET first_role_reversal = COALESCE(first_role_reversal, CURRENT_DATE),
                updated_at = NOW()
            WHERE user_id = p_user_id;
        WHEN 'first_name_usage' THEN
            UPDATE gina_integration_progress
            SET first_name_usage = COALESCE(first_name_usage, CURRENT_DATE),
                updated_at = NOW()
            WHERE user_id = p_user_id;
        ELSE
            -- Unknown milestone, do nothing
            NULL;
    END CASE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- Grant Permissions
-- =====================================================

GRANT SELECT ON weekend_activities TO authenticated;
GRANT ALL ON weekend_sessions TO authenticated;
GRANT ALL ON weekend_plans TO authenticated;
GRANT ALL ON gina_integration_progress TO authenticated;
