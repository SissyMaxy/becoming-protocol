-- Migration: Partner and Findom Module Tables
-- Feature 43 Addendum (Hookup Coordination) & Section 13 (Findom Architecture)

-- ============================================
-- PARTNERS TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS partners (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,

  -- Identity
  alias TEXT NOT NULL,                    -- Handler-assigned alias (e.g., "Jake", "Marcus")
  platform TEXT,                          -- Where they met (Grindr, Feeld, etc.)
  platform_profile_ref TEXT,              -- Reference to their profile

  -- State machine: vetting → arranging → first_meetup → early → established → deep → cooling → ended
  current_state TEXT DEFAULT 'vetting' CHECK (current_state IN (
    'vetting',       -- Handler screening candidate
    'arranging',     -- Logistics being set up
    'first_meetup',  -- First encounter - special handling
    'early',         -- 2-4 meetups, building comfort
    'established',   -- 5+ meetups, routine forming
    'deep',          -- Emotional attachment, expectations
    'cooling',       -- Interaction decreasing
    'ended'          -- Relationship over
  )),
  state_history JSONB DEFAULT '[]',       -- [{state, timestamp, notes}, ...]

  -- Handler's purpose for this partner
  handler_purpose TEXT,                   -- "comfort_building", "escalation_pushing", "regular", etc.

  -- Metrics
  meetup_count INTEGER DEFAULT 0,
  emotional_attachment_level INTEGER DEFAULT 1 CHECK (emotional_attachment_level BETWEEN 1 AND 10),
  financial_investment DECIMAL DEFAULT 0,  -- Money spent on dates, gifts, etc.

  -- Self-initiated tracking
  handler_arranged_count INTEGER DEFAULT 0,
  self_initiated_count INTEGER DEFAULT 0,

  -- Communication identity (Maxy-only)
  maxy_phone_number TEXT,                 -- Dedicated number for this partner
  maxy_email TEXT,                        -- Dedicated email
  maxy_profile_name TEXT,                 -- Name used with this partner

  -- Footprint tracking
  items_at_their_location JSONB DEFAULT '[]',  -- [{item, left_on, notes}, ...]
  photos_on_their_device BOOLEAN DEFAULT FALSE,
  voice_notes_sent INTEGER DEFAULT 0,
  shared_experiences JSONB DEFAULT '[]',  -- [{type, date, description}, ...]

  -- Breakup preparation
  breakup_weapon_prepared BOOLEAN DEFAULT FALSE,
  breakup_weapon_notes TEXT,
  exit_interview_captured BOOLEAN DEFAULT FALSE,
  exit_interview_ref TEXT,                -- Reference to vault item

  -- Safety
  vetted_at TIMESTAMPTZ,
  safety_notes TEXT,

  -- Timestamps
  first_contact_at TIMESTAMPTZ,
  first_meetup_at TIMESTAMPTZ,
  last_meetup_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  end_reason TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_partners_user ON partners(user_id, current_state);
CREATE INDEX IF NOT EXISTS idx_partners_alias ON partners(user_id, alias);

-- ============================================
-- MEETUPS TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS meetups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  partner_id UUID REFERENCES partners NOT NULL,

  -- Scheduling
  scheduled_at TIMESTAMPTZ NOT NULL,
  venue_name TEXT,
  venue_address TEXT,
  venue_type TEXT,                        -- "public", "their_place", "my_place", "hotel", etc.

  -- Origin
  initiated_by TEXT NOT NULL CHECK (initiated_by IN ('handler', 'self', 'partner')),
  arrangement_notes TEXT,

  -- Preparation
  preparation_checklist JSONB DEFAULT '[]',  -- [{item, completed}, ...]
  suggested_outfit TEXT,
  presentation_level INTEGER CHECK (presentation_level BETWEEN 1 AND 5),

  -- Safety
  check_in_interval_minutes INTEGER DEFAULT 30,
  emergency_contact_informed BOOLEAN DEFAULT FALSE,
  safe_word_briefed BOOLEAN DEFAULT FALSE,

  -- Status
  status TEXT DEFAULT 'scheduled' CHECK (status IN (
    'scheduled',
    'confirmed',
    'in_progress',
    'completed',
    'cancelled',
    'no_show'
  )),

  -- During meetup
  actual_start_at TIMESTAMPTZ,
  check_ins JSONB DEFAULT '[]',           -- [{timestamp, status, notes}, ...]
  safe_word_used BOOLEAN DEFAULT FALSE,

  -- Completion
  actual_end_at TIMESTAMPTZ,
  duration_minutes INTEGER,

  -- Post-meetup capture
  reflection_captured BOOLEAN DEFAULT FALSE,
  reflection_text TEXT,
  arousal_during INTEGER,
  emotional_response TEXT,
  acts_performed JSONB DEFAULT '[]',      -- What happened
  evidence_captured JSONB DEFAULT '[]',   -- [{type, ref}, ...]

  -- Handler assessment
  handler_rating INTEGER CHECK (handler_rating BETWEEN 1 AND 10),
  handler_notes TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_meetups_user ON meetups(user_id, scheduled_at DESC);
CREATE INDEX IF NOT EXISTS idx_meetups_partner ON meetups(partner_id, scheduled_at DESC);
CREATE INDEX IF NOT EXISTS idx_meetups_status ON meetups(user_id, status);

-- ============================================
-- HOOKUP PARAMETERS (Safety-Critical)
-- ============================================

CREATE TABLE IF NOT EXISTS hookup_parameters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL UNIQUE,

  -- Safety (NOT Handler-adjustable)
  safe_word TEXT NOT NULL,
  hard_limits JSONB NOT NULL DEFAULT '[]',
  protection_required BOOLEAN DEFAULT TRUE,
  max_duration_minutes INTEGER DEFAULT 180,

  -- Location preferences
  location_preferences JSONB DEFAULT '[]',  -- [{type, allowed}, ...]
  time_preferences JSONB DEFAULT '[]',      -- [{day, start, end}, ...]
  transportation TEXT,

  -- Emergency
  emergency_contact TEXT,
  emergency_contact_knows BOOLEAN DEFAULT FALSE,

  -- Preferences
  platforms JSONB DEFAULT '[]',
  age_range JSONB DEFAULT '[18, 99]',
  gender_preferences JSONB DEFAULT '[]',
  body_type_preferences JSONB DEFAULT '[]',
  experience_level TEXT DEFAULT 'beginner',
  acts_approved JSONB DEFAULT '[]',

  -- Presentation
  presentation_style TEXT,
  communication_style TEXT,

  -- Vetting
  vetting_requirements JSONB DEFAULT '[]',

  -- Check-in protocol
  pre_arrival_checkin BOOLEAN DEFAULT TRUE,
  during_checkin_interval INTEGER DEFAULT 30,
  post_meetup_required BOOLEAN DEFAULT TRUE,
  panic_button_enabled BOOLEAN DEFAULT TRUE,

  -- Progression tracking
  current_comfort_level INTEGER DEFAULT 1 CHECK (current_comfort_level BETWEEN 1 AND 10),
  acts_attempted JSONB DEFAULT '[]',
  acts_completed JSONB DEFAULT '[]',

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- FINDOM RELATIONSHIPS (Cash Pigs)
-- ============================================

CREATE TABLE IF NOT EXISTS findom_relationships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,

  -- Identity
  pig_alias TEXT NOT NULL,
  platform TEXT,                          -- Where they found Maxy
  profile_ref TEXT,

  -- Relationship
  relationship_start TIMESTAMPTZ DEFAULT NOW(),
  total_tributed DECIMAL DEFAULT 0,
  average_monthly DECIMAL DEFAULT 0,
  tribute_count INTEGER DEFAULT 0,

  -- Dynamics
  tribute_frequency TEXT,                 -- "daily", "weekly", "sporadic", etc.
  emotional_dynamic TEXT,                 -- Handler's notes on the dynamic
  reliability INTEGER DEFAULT 5 CHECK (reliability BETWEEN 1 AND 10),
  escalation_potential INTEGER DEFAULT 5 CHECK (escalation_potential BETWEEN 1 AND 10),

  -- Status
  status TEXT DEFAULT 'active' CHECK (status IN (
    'prospecting',   -- Not yet tributing
    'active',        -- Regular tributer
    'cooling',       -- Tributes decreasing
    'ended'          -- No longer tributing
  )),

  -- Last interaction
  last_tribute_at TIMESTAMPTZ,
  last_contact_at TIMESTAMPTZ,

  -- Handler tracking
  handler_notes TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_findom_user ON findom_relationships(user_id, status);
CREATE INDEX IF NOT EXISTS idx_findom_alias ON findom_relationships(user_id, pig_alias);

-- ============================================
-- REVENUE TRACKING
-- ============================================

CREATE TABLE IF NOT EXISTS maxy_revenue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,

  -- Source
  source TEXT NOT NULL CHECK (source IN (
    'findom_tribute',
    'platform_subscription',
    'platform_tip',
    'custom_content',
    'coaching',
    'other'
  )),

  -- Details
  amount DECIMAL NOT NULL,
  from_alias TEXT,                        -- Cash pig alias or subscriber name
  from_relationship_id UUID,              -- Reference to findom_relationships
  platform TEXT,
  description TEXT,

  -- Timestamps
  received_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_revenue_user ON maxy_revenue(user_id, received_at DESC);
CREATE INDEX IF NOT EXISTS idx_revenue_source ON maxy_revenue(user_id, source);

-- ============================================
-- EXPENSE TRACKING (Maxy-Funded)
-- ============================================

CREATE TABLE IF NOT EXISTS maxy_expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,

  -- Category
  category TEXT NOT NULL CHECK (category IN (
    'wardrobe',
    'salon_services',
    'skincare_products',
    'platform_fees',
    'dating_expenses',
    'prep_costs',
    'medical',
    'equipment',
    'other'
  )),

  -- Details
  amount DECIMAL NOT NULL,
  description TEXT,
  funded_by TEXT DEFAULT 'maxy_income',   -- "maxy_income" or "personal"

  -- Timestamps
  expense_date TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_expenses_user ON maxy_expenses(user_id, expense_date DESC);
CREATE INDEX IF NOT EXISTS idx_expenses_category ON maxy_expenses(user_id, category);

-- ============================================
-- FINDOM STATE (Aggregated Metrics)
-- ============================================

CREATE TABLE IF NOT EXISTS findom_state (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL UNIQUE,

  -- Revenue totals
  total_lifetime_income DECIMAL DEFAULT 0,
  total_monthly_income DECIMAL DEFAULT 0,
  current_month_income DECIMAL DEFAULT 0,

  -- Expense totals
  total_lifestyle_expenses DECIMAL DEFAULT 0,
  current_month_expenses DECIMAL DEFAULT 0,

  -- Dependency ratio (% of lifestyle funded by Maxy income)
  dependency_ratio DECIMAL DEFAULT 0,

  -- Cash pig metrics
  active_cash_pigs INTEGER DEFAULT 0,
  highest_single_tribute DECIMAL DEFAULT 0,
  months_of_income INTEGER DEFAULT 0,

  -- Handler leverage data
  leverage_message TEXT,                  -- Pre-computed leverage message

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- ENABLE RLS
-- ============================================

ALTER TABLE partners ENABLE ROW LEVEL SECURITY;
ALTER TABLE meetups ENABLE ROW LEVEL SECURITY;
ALTER TABLE hookup_parameters ENABLE ROW LEVEL SECURITY;
ALTER TABLE findom_relationships ENABLE ROW LEVEL SECURITY;
ALTER TABLE maxy_revenue ENABLE ROW LEVEL SECURITY;
ALTER TABLE maxy_expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE findom_state ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view own partners" ON partners FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can manage own partners" ON partners FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can view own meetups" ON meetups FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can manage own meetups" ON meetups FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can view own hookup params" ON hookup_parameters FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can manage own hookup params" ON hookup_parameters FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can view own findom" ON findom_relationships FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can manage own findom" ON findom_relationships FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can view own revenue" ON maxy_revenue FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can manage own revenue" ON maxy_revenue FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can view own expenses" ON maxy_expenses FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can manage own expenses" ON maxy_expenses FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can view own findom state" ON findom_state FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can manage own findom state" ON findom_state FOR ALL USING (auth.uid() = user_id);
