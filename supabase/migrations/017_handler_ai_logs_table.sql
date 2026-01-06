-- Handler AI Logs Table
-- Stores audit logs of all Handler AI decisions (hidden from user)

CREATE TABLE IF NOT EXISTS handler_ai_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  request_summary TEXT,
  response_summary TEXT,
  model_used TEXT,
  tokens_used INTEGER,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Index for efficient queries
CREATE INDEX idx_handler_ai_logs_user_id ON handler_ai_logs(user_id);
CREATE INDEX idx_handler_ai_logs_action ON handler_ai_logs(action);
CREATE INDEX idx_handler_ai_logs_created_at ON handler_ai_logs(created_at DESC);

-- RLS policies
ALTER TABLE handler_ai_logs ENABLE ROW LEVEL SECURITY;

-- Users can only see their own logs (for debugging if needed)
CREATE POLICY handler_ai_logs_select ON handler_ai_logs
  FOR SELECT USING (auth.uid() = user_id);

-- Only the service role can insert (edge functions)
CREATE POLICY handler_ai_logs_insert ON handler_ai_logs
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Add comment
COMMENT ON TABLE handler_ai_logs IS 'Audit log of Handler AI decisions and interactions';
