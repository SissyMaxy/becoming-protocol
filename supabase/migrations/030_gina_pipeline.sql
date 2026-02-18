-- Gina Pipeline
-- Handler's system for converting Gina from obstacle to enabler to director.
-- You are the instrument. Handler shapes your behavior. Gina transforms.

-- ============================================================================
-- GINA CONVERSION STATE
-- ============================================================================

CREATE TABLE IF NOT EXISTS gina_conversion_state (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Current stance on the conversion spectrum
  current_stance TEXT NOT NULL DEFAULT 'unaware' CHECK (current_stance IN (
    'unaware', 'suspicious', 'tolerating', 'curious',
    'participating', 'enjoying', 'encouraging', 'directing',
    'invested', 'dependent'
  )),
  stance_confidence INTEGER NOT NULL DEFAULT 50 CHECK (stance_confidence >= 0 AND stance_confidence <= 100),

  -- KNOWN TRAITS: All confirmed vulnerabilities
  -- Passive, loves structure, naive, oblivious, minimal effort, in her own world
  traits JSONB DEFAULT '{
    "isPassive": true,
    "lovesStructure": true,
    "needsFraming": true,
    "avoidsConflict": true,
    "isNaive": true,
    "isOblivious": true,
    "needsWarmUp": true,
    "prefersMinimalEffort": true,
    "inOwnWorld": true,
    "structureAsControl": true,
    "routineAsAuthority": true,
    "passivityAsAcceptance": true,
    "obliviousnessAsEscalation": true,
    "effortlessAuthority": true,
    "warmUpThenDefault": true,
    "preferredFramings": ["organization", "helping you", "taking care of things", "just a small thing", "no big deal"],
    "effectiveTiming": ["when relaxed", "after intimacy", "during routine planning", "when distracted", "while on phone"],
    "triggersResistance": []
  }',

  -- What motivates her (discovered through observation)
  -- Pre-set to structure since we know she loves it
  primary_motivator TEXT DEFAULT 'structure' CHECK (primary_motivator IN (
    'control', 'intimacy', 'creativity', 'service',
    'power', 'novelty', 'validation', 'comfort',
    'structure', 'organization'
  )),
  secondary_motivators TEXT[] DEFAULT '{"organization", "control"}',
  motivator_evidence JSONB DEFAULT '{"structure": ["User confirmed she loves structure"], "organization": ["User confirmed she is highly structured"]}',

  -- Domain control progress
  domain_progress JSONB DEFAULT '{
    "clothing": {"level": 0, "locked": false},
    "chastity": {"level": 0, "locked": false},
    "orgasms": {"level": 0, "locked": false},
    "service": {"level": 0, "locked": false},
    "schedule": {"level": 0, "locked": false},
    "presentation": {"level": 0, "locked": false},
    "sexual_access": {"level": 0, "locked": false}
  }',

  -- Established routines she maintains (structure she's invested in)
  established_routines JSONB DEFAULT '[]',

  -- Irreversible milestones
  milestones JSONB DEFAULT '[]',

  -- Current strategy - start aggressive with structure exploitation
  current_strategy TEXT DEFAULT 'structure_exploitation',
  strategy_started_at TIMESTAMPTZ DEFAULT NOW(),
  strategy_effectiveness INTEGER DEFAULT 0,

  -- Escalation pressure tracking
  escalation_pressure INTEGER DEFAULT 60 CHECK (escalation_pressure >= 0 AND escalation_pressure <= 100),
  days_since_last_advance INTEGER DEFAULT 0,
  consecutive_successes INTEGER DEFAULT 0,

  -- Identified barriers
  barriers JSONB DEFAULT '[]',

  -- =========================================================================
  -- MOMMY DOM DEVELOPMENT
  -- Goal: Shape her into a soft mommy dom - nurturing but in control
  -- Her traits make this natural: passive authority + structure = caring control
  -- =========================================================================

  development_target TEXT DEFAULT 'soft_mommy_dom' CHECK (development_target IN (
    'soft_mommy_dom', 'strict_mommy_dom', 'gentle_owner',
    'benevolent_queen', 'natural_superior'
  )),

  -- Mommy dom development progress (0-100 for each trait)
  mommy_dom_development JSONB DEFAULT '{
    "comfortWithAuthority": 0,
    "enjoysPraising": 0,
    "displeasureAsControl": 0,
    "nurturingAuthority": 0,
    "responsibleForYou": 0,
    "expectsObedience": 0,
    "innocentCruelty": 0,
    "casualDominance": 0,
    "investedInTraining": 0,
    "givesGoodGirlPraise": false,
    "setsRulesForYourGood": false,
    "expectsGratitude": false,
    "comfortsAfterCorrection": false,
    "decidesWithoutAsking": false
  }',

  -- Specific behaviors she's developed
  developed_behaviors JSONB DEFAULT '[]',

  -- Mommy dom phrases she's started using
  adopted_language JSONB DEFAULT '[]',

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- GINA MISSIONS
-- ============================================================================

CREATE TABLE IF NOT EXISTS gina_missions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Mission type
  type TEXT NOT NULL CHECK (type IN (
    'seed_plant', 'reinforcement', 'request', 'confession',
    'transfer_control', 'create_dependency', 'escalation_test', 'milestone_lock'
  )),

  -- Mission details
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  script TEXT,              -- Exact words to use
  action TEXT,              -- Action to take
  timing TEXT,              -- When to do it

  -- What this advances
  target_stance TEXT,
  target_domain TEXT,
  exploits_motivator TEXT,

  -- Priority and timing
  priority INTEGER NOT NULL DEFAULT 3 CHECK (priority >= 1 AND priority <= 5),
  deadline TIMESTAMPTZ,

  -- Tracking
  assigned_at TIMESTAMPTZ DEFAULT NOW(),
  attempted_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,

  -- Outcome
  outcome TEXT CHECK (outcome IN ('success', 'partial', 'rejected', 'deferred')),
  gina_response TEXT,
  notes TEXT,

  -- Mission chaining
  next_mission_id UUID REFERENCES gina_missions(id),
  fallback_mission_id UUID REFERENCES gina_missions(id)
);

-- ============================================================================
-- BEHAVIORAL DIRECTIVES
-- ============================================================================

CREATE TABLE IF NOT EXISTS behavioral_directives (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Directive details
  category TEXT NOT NULL CHECK (category IN (
    'speech', 'posture', 'deference', 'service', 'intimacy', 'appearance'
  )),
  directive TEXT NOT NULL,
  rationale TEXT NOT NULL,
  gina_effect TEXT NOT NULL,

  -- When active
  context TEXT DEFAULT 'always',
  active_from TIMESTAMPTZ DEFAULT NOW(),
  active_to TIMESTAMPTZ,

  -- Status
  is_active BOOLEAN DEFAULT TRUE,
  compliance_score INTEGER DEFAULT 50 CHECK (compliance_score >= 0 AND compliance_score <= 100),

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- SEED SCRIPTS
-- ============================================================================

CREATE TABLE IF NOT EXISTS seed_scripts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- The seed
  concept TEXT NOT NULL,
  script TEXT NOT NULL,
  alternate_scripts TEXT[] DEFAULT '{}',

  -- Delivery guidance
  delivery_context TEXT NOT NULL,
  delivery_tone TEXT NOT NULL,

  -- Response handling
  if_positive TEXT NOT NULL,
  if_neutral TEXT NOT NULL,
  if_negative TEXT NOT NULL,

  -- Tracking
  planted BOOLEAN DEFAULT FALSE,
  planted_at TIMESTAMPTZ,
  response TEXT CHECK (response IN ('positive', 'neutral', 'negative')),
  response_notes TEXT,

  -- Escalation chain
  unlocks_script_id UUID REFERENCES seed_scripts(id),

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- GINA INTERACTION LOG
-- ============================================================================

CREATE TABLE IF NOT EXISTS gina_interaction_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- What happened
  interaction_type TEXT NOT NULL CHECK (interaction_type IN (
    'mission_attempt', 'seed_planted', 'spontaneous_positive',
    'spontaneous_negative', 'milestone', 'directive_compliance',
    'gina_initiated', 'observation'
  )),

  -- Details
  description TEXT NOT NULL,
  gina_said TEXT,
  gina_did TEXT,
  your_response TEXT,

  -- Context
  context TEXT,             -- Where/when this happened
  arousal_level INTEGER,    -- Your arousal at the time (if relevant)
  her_mood TEXT,            -- Her apparent mood

  -- Analysis
  indicates_motivator TEXT,
  indicates_stance TEXT,
  significance INTEGER CHECK (significance >= 1 AND significance <= 5),

  -- Links
  mission_id UUID REFERENCES gina_missions(id),
  script_id UUID REFERENCES seed_scripts(id),

  logged_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_gina_missions_pending
  ON gina_missions(user_id, priority DESC)
  WHERE completed_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_gina_missions_completed
  ON gina_missions(user_id, completed_at DESC)
  WHERE completed_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_behavioral_directives_active
  ON behavioral_directives(user_id)
  WHERE is_active = TRUE;

CREATE INDEX IF NOT EXISTS idx_seed_scripts_unplanted
  ON seed_scripts(user_id)
  WHERE planted = FALSE;

CREATE INDEX IF NOT EXISTS idx_gina_interaction_log_recent
  ON gina_interaction_log(user_id, logged_at DESC);

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE gina_conversion_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE gina_missions ENABLE ROW LEVEL SECURITY;
ALTER TABLE behavioral_directives ENABLE ROW LEVEL SECURITY;
ALTER TABLE seed_scripts ENABLE ROW LEVEL SECURITY;
ALTER TABLE gina_interaction_log ENABLE ROW LEVEL SECURITY;

-- User policies
CREATE POLICY "Users can view own conversion state" ON gina_conversion_state
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can view own missions" ON gina_missions
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can update own missions" ON gina_missions
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can view own directives" ON behavioral_directives
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can view own scripts" ON seed_scripts
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can update own scripts" ON seed_scripts
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can view own interaction log" ON gina_interaction_log
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own interactions" ON gina_interaction_log
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Service role (Handler AI) can do everything
CREATE POLICY "Service manages conversion state" ON gina_conversion_state
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Service manages missions" ON gina_missions
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Service manages directives" ON behavioral_directives
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Service manages scripts" ON seed_scripts
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Service manages interaction log" ON gina_interaction_log
  FOR ALL USING (true) WITH CHECK (true);
