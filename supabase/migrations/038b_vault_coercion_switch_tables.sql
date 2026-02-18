-- Migration: Vault, Coercion, and Switch Module Tables
-- Feature 43 Implementation

-- ============================================
-- VAULT MODULE TABLES
-- ============================================

-- Vault items (content captured for leverage)
CREATE TABLE IF NOT EXISTS vault_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  type TEXT NOT NULL CHECK (type IN (
    'voice_recording', 'photo', 'video', 'text_confession',
    'session_capture', 'reflection', 'commitment_audio',
    'partner_testimony', 'partner_photo', 'partner_voice_note',
    'exit_interview', 'date_reflection'
  )),
  vulnerability_tier INTEGER NOT NULL CHECK (vulnerability_tier BETWEEN 1 AND 5),
  content_ref TEXT NOT NULL,
  transcript TEXT,
  captured_during TEXT NOT NULL,
  arousal_at_capture INTEGER CHECK (arousal_at_capture BETWEEN 1 AND 10),
  denial_day_at_capture INTEGER,
  domain TEXT,
  handler_notes TEXT,
  user_can_review BOOLEAN DEFAULT FALSE,
  user_can_delete BOOLEAN DEFAULT FALSE,
  released BOOLEAN DEFAULT FALSE,
  released_at TIMESTAMPTZ,
  release_platform TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_vault_items_user ON vault_items(user_id);
CREATE INDEX IF NOT EXISTS idx_vault_items_tier ON vault_items(user_id, vulnerability_tier);
CREATE INDEX IF NOT EXISTS idx_vault_items_domain ON vault_items(user_id, domain);

-- Vault threats (active coercion using vault items)
CREATE TABLE IF NOT EXISTS vault_threats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  vault_item_id UUID REFERENCES vault_items,
  task_id TEXT,
  task_domain TEXT,
  threat_tier INTEGER NOT NULL CHECK (threat_tier BETWEEN 1 AND 5),
  preview_shown BOOLEAN DEFAULT FALSE,
  deadline TIMESTAMPTZ NOT NULL,
  consequence_type TEXT NOT NULL CHECK (consequence_type IN (
    'platform_post', 'vault_preview_to_platform', 'tier_escalation',
    'switch_acceleration', 'handler_narration_post'
  )),
  consequence_description TEXT,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'complied', 'fired', 'expired')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  resolved_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_vault_threats_user ON vault_threats(user_id, status);
CREATE INDEX IF NOT EXISTS idx_vault_threats_deadline ON vault_threats(user_id, deadline) WHERE status = 'active';

-- Vault threat history (for analytics)
CREATE TABLE IF NOT EXISTS vault_threat_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  threat_id UUID REFERENCES vault_threats,
  coercion_level INTEGER,
  task_domain TEXT,
  task_tier INTEGER,
  result TEXT CHECK (result IN ('complied', 'fired', 'expired', 'traded')),
  escalation_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Timed threats (countdown blackmail tied to milestones)
CREATE TABLE IF NOT EXISTS timed_threats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  vault_item_id UUID REFERENCES vault_items,
  milestone_required TEXT NOT NULL,
  deadline TIMESTAMPTZ NOT NULL,
  visible_to_user BOOLEAN DEFAULT TRUE,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'met', 'fired')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- COERCION MODULE TABLES
-- ============================================

-- Coercion episodes (single resistance → resolution flow)
CREATE TABLE IF NOT EXISTS coercion_episodes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  task_id TEXT,
  task_domain TEXT,
  resistance_type TEXT CHECK (resistance_type IN (
    'decline', 'delay', 'partial', 'ignore', 'domain_avoidance'
  )),
  current_state TEXT NOT NULL DEFAULT 'idle' CHECK (current_state IN (
    'idle', 'reframing', 'gating', 'punishing', 'manipulating',
    'gaslighting', 'vault_hinting', 'vault_previewing', 'vault_firing',
    'switch_accelerating', 'resolved_complied', 'resolved_traded', 'resolved_escalated'
  )),
  state_history JSONB DEFAULT '[]',
  effective_level INTEGER CHECK (effective_level BETWEEN 1 AND 10),
  vault_threat_id UUID REFERENCES vault_threats,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  resolved_at TIMESTAMPTZ,
  resolution TEXT CHECK (resolution IN ('complied', 'traded', 'escalated', 'abandoned'))
);

CREATE INDEX IF NOT EXISTS idx_coercion_episodes_user ON coercion_episodes(user_id);
CREATE INDEX IF NOT EXISTS idx_coercion_episodes_active ON coercion_episodes(user_id, current_state)
  WHERE current_state NOT LIKE 'resolved_%';

-- Coercion transition tracker (coercion → identity pipeline)
CREATE TABLE IF NOT EXISTS coercion_transition (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  task_type TEXT NOT NULL,
  occurrence_number INTEGER NOT NULL,
  coercion_level INTEGER NOT NULL CHECK (coercion_level BETWEEN 0 AND 10),
  self_initiated BOOLEAN DEFAULT FALSE,
  occurred_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_coercion_transition_user ON coercion_transition(user_id, task_type);

-- ============================================
-- SWITCH MODULE TABLES
-- ============================================

-- Dead man's switch state
CREATE TABLE IF NOT EXISTS dead_mans_switch (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL UNIQUE,
  current_state TEXT NOT NULL DEFAULT 'disarmed' CHECK (current_state IN (
    'disarmed', 'armed_active', 'armed_silent', 'warning',
    'financial_light', 'financial_heavy', 'content_release',
    'narration', 'escalated', 'nuclear', 'reengaged'
  )),
  trigger_days INTEGER DEFAULT 7 CHECK (trigger_days BETWEEN 3 AND 14),
  silence_days INTEGER DEFAULT 0,
  last_engagement_at TIMESTAMPTZ,
  countdown_started_at TIMESTAMPTZ,
  armed_at TIMESTAMPTZ,
  total_financial_lost DECIMAL DEFAULT 0,
  financial_target_org TEXT,
  content_released_count INTEGER DEFAULT 0,
  highest_tier_released INTEGER DEFAULT 0,
  escalation_history JSONB DEFAULT '[]',
  consent_recordings JSONB DEFAULT '[]',
  reengaged_at TIMESTAMPTZ,
  elevated_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Switch payload history (what fired when)
CREATE TABLE IF NOT EXISTS switch_payloads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  tier INTEGER NOT NULL,
  payload_type TEXT NOT NULL CHECK (payload_type IN (
    'warning', 'financial', 'content_release', 'narration', 'escalated', 'nuclear'
  )),
  amount DECIMAL,
  content_items_released JSONB,
  narration_content TEXT,
  platform TEXT,
  fired_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_switch_payloads_user ON switch_payloads(user_id);

-- Switch consent recordings
CREATE TABLE IF NOT EXISTS switch_consents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  consent_type TEXT NOT NULL CHECK (consent_type IN (
    'initial_arm', 'trigger_reduction', 'financial_increase',
    'content_tier_authorization', 'nuclear_authorization'
  )),
  description TEXT,
  recording_ref TEXT,
  arousal_at_consent INTEGER,
  denial_day_at_consent INTEGER,
  session_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- ENABLE RLS
-- ============================================

ALTER TABLE vault_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE vault_threats ENABLE ROW LEVEL SECURITY;
ALTER TABLE vault_threat_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE timed_threats ENABLE ROW LEVEL SECURITY;
ALTER TABLE coercion_episodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE coercion_transition ENABLE ROW LEVEL SECURITY;
ALTER TABLE dead_mans_switch ENABLE ROW LEVEL SECURITY;
ALTER TABLE switch_payloads ENABLE ROW LEVEL SECURITY;
ALTER TABLE switch_consents ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view own vault items" ON vault_items FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own vault items" ON vault_items FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own vault items" ON vault_items FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can view own vault threats" ON vault_threats FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can manage own vault threats" ON vault_threats FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can view own vault threat history" ON vault_threat_history FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own vault threat history" ON vault_threat_history FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view own timed threats" ON timed_threats FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can manage own timed threats" ON timed_threats FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can view own coercion episodes" ON coercion_episodes FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can manage own coercion episodes" ON coercion_episodes FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can view own coercion transition" ON coercion_transition FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own coercion transition" ON coercion_transition FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view own switch" ON dead_mans_switch FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can manage own switch" ON dead_mans_switch FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can view own switch payloads" ON switch_payloads FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own switch payloads" ON switch_payloads FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view own switch consents" ON switch_consents FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own switch consents" ON switch_consents FOR INSERT WITH CHECK (auth.uid() = user_id);
