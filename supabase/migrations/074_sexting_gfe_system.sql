-- ============================================
-- 074: Sexting & GFE Automation System
-- Handler runs 90%+ of fan conversations autonomously.
-- ============================================

-- ============================================
-- ALTER fan_profiles: personality modeling + GFE fields
-- ============================================

ALTER TABLE fan_profiles
  ADD COLUMN IF NOT EXISTS personality_model JSONB,
  ADD COLUMN IF NOT EXISTS response_preferences JSONB,
  ADD COLUMN IF NOT EXISTS gfe_subscriber BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS gfe_started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS lifetime_message_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS avg_response_time_minutes FLOAT;

-- Expand fan_tier to include 'gfe'
ALTER TABLE fan_profiles DROP CONSTRAINT IF EXISTS fan_profiles_fan_tier_check;
ALTER TABLE fan_profiles ADD CONSTRAINT fan_profiles_fan_tier_check
  CHECK (fan_tier IN ('casual', 'regular', 'supporter', 'whale', 'gfe'));

-- ============================================
-- ALTER fan_messages: conversation threading + media
-- ============================================

ALTER TABLE fan_messages
  ADD COLUMN IF NOT EXISTS conversation_id UUID,
  ADD COLUMN IF NOT EXISTS message_type TEXT DEFAULT 'text',
  ADD COLUMN IF NOT EXISTS media_vault_id UUID REFERENCES content_vault(id),
  ADD COLUMN IF NOT EXISTS auto_sent BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS ai_confidence FLOAT,
  ADD COLUMN IF NOT EXISTS response_time_seconds INTEGER;

ALTER TABLE fan_messages ADD CONSTRAINT fan_messages_message_type_check
  CHECK (message_type IN ('text', 'media_request', 'media_send', 'gfe_scheduled', 'tip_thanks'));

CREATE INDEX IF NOT EXISTS idx_fan_messages_conversation ON fan_messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_fan_messages_auto_sent ON fan_messages(user_id, auto_sent) WHERE auto_sent = true;

-- ============================================
-- sexting_conversations: Thread-level tracking
-- ============================================

CREATE TABLE IF NOT EXISTS sexting_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  fan_id UUID REFERENCES fan_profiles(id) ON DELETE CASCADE,

  platform TEXT NOT NULL,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'paused', 'closed', 'escalated')),
  handler_personality TEXT CHECK (handler_personality IN ('flirty', 'bratty', 'sweet', 'dominant')),

  auto_reply_enabled BOOLEAN DEFAULT true,
  escalation_threshold FLOAT DEFAULT 0.7,

  total_messages INTEGER DEFAULT 0,
  revenue_cents INTEGER DEFAULT 0,
  last_message_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sexting_conv_user_status ON sexting_conversations(user_id, status);
CREATE INDEX IF NOT EXISTS idx_sexting_conv_fan ON sexting_conversations(fan_id);

-- ============================================
-- sexting_templates: Message templates for Handler
-- ============================================

CREATE TABLE IF NOT EXISTS sexting_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,

  category TEXT NOT NULL CHECK (category IN (
    'greeting', 'flirty', 'tease', 'explicit', 'tip_thanks',
    'media_offer', 'gfe_morning', 'gfe_goodnight', 'escalation', 'boundary'
  )),
  template_text TEXT NOT NULL,
  variables JSONB,

  tier_minimum TEXT DEFAULT 'casual',
  usage_count INTEGER DEFAULT 0,
  effectiveness_score FLOAT DEFAULT 0,
  is_active BOOLEAN DEFAULT true,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sexting_templates_category ON sexting_templates(user_id, category, is_active);

-- ============================================
-- gfe_subscriptions: Girlfriend Experience management
-- ============================================

CREATE TABLE IF NOT EXISTS gfe_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  fan_id UUID REFERENCES fan_profiles(id) ON DELETE CASCADE,

  platform TEXT NOT NULL,
  tier TEXT DEFAULT 'basic' CHECK (tier IN ('basic', 'premium', 'vip')),
  price_cents INTEGER NOT NULL,

  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'paused', 'cancelled', 'expired')),

  morning_message BOOLEAN DEFAULT true,
  goodnight_message BOOLEAN DEFAULT true,
  weekly_photo BOOLEAN DEFAULT false,
  custom_nickname TEXT,

  started_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_gfe_subs_user_status ON gfe_subscriptions(user_id, status);
CREATE INDEX IF NOT EXISTS idx_gfe_subs_fan ON gfe_subscriptions(fan_id);

-- ============================================
-- RLS policies
-- ============================================

ALTER TABLE sexting_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE sexting_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE gfe_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY sexting_conversations_user ON sexting_conversations
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY sexting_templates_user ON sexting_templates
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY gfe_subscriptions_user ON gfe_subscriptions
  FOR ALL USING (auth.uid() = user_id);
