-- Conversational Handler Tables

CREATE TABLE IF NOT EXISTS handler_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  conversation_type TEXT NOT NULL DEFAULT 'general',
  session_id UUID,
  session_type TEXT,
  state_snapshot JSONB NOT NULL DEFAULT '{}',
  whoop_snapshot JSONB,
  initial_mode TEXT,
  mode_transitions JSONB DEFAULT '[]',
  final_mode TEXT,
  coercion_stack_peak_level INTEGER DEFAULT 0,
  commitments_extracted JSONB DEFAULT '[]',
  confessions_captured JSONB DEFAULT '[]',
  memories_generated INTEGER DEFAULT 0,
  resistance_events JSONB DEFAULT '[]',
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  message_count INTEGER DEFAULT 0,
  handler_self_rating INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_conversations_user ON handler_conversations(user_id, started_at DESC);
ALTER TABLE handler_conversations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users own conversations" ON handler_conversations FOR ALL USING (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS handler_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES handler_conversations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  handler_signals JSONB,
  detected_mode TEXT,
  message_index INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_messages_conversation ON handler_messages(conversation_id, message_index);
ALTER TABLE handler_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users own messages" ON handler_messages FOR ALL USING (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS handler_outreach (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  trigger_type TEXT NOT NULL,
  opening_line TEXT NOT NULL,
  conversation_context JSONB,
  scheduled_at TIMESTAMPTZ NOT NULL,
  delivered_at TIMESTAMPTZ,
  opened_at TIMESTAMPTZ,
  conversation_id UUID REFERENCES handler_conversations(id),
  status TEXT DEFAULT 'scheduled',
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_outreach_user ON handler_outreach(user_id, status, scheduled_at);
ALTER TABLE handler_outreach ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users own outreach" ON handler_outreach FOR ALL USING (auth.uid() = user_id);
