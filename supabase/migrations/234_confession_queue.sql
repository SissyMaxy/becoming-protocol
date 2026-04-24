-- Migration 234: confession_queue
-- Handler-scheduled confessions Maxy must verbalize. Triggered by slips,
-- arousal spikes, rationalization detection, or scheduled cadence. Each
-- confession demands a written or audio response by deadline; miss → penalty
-- cascade handled by compliance_check edge fn.

CREATE TABLE IF NOT EXISTS confession_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  category TEXT NOT NULL CHECK (category IN (
    'slip', 'arousal_spike', 'rationalization', 'scheduled_daily',
    'resistance', 'desire_owning', 'identity_acknowledgement', 'handler_triggered'
  )),
  prompt TEXT NOT NULL,
  context_note TEXT,
  triggered_by_table TEXT,
  triggered_by_id UUID,
  deadline TIMESTAMPTZ NOT NULL,
  response_text TEXT,
  response_audio_url TEXT,
  confessed_at TIMESTAMPTZ,
  missed BOOLEAN NOT NULL DEFAULT FALSE,
  penalty_applied TEXT,
  penalty_applied_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_confession_queue_user_open
  ON confession_queue (user_id, confessed_at, deadline)
  WHERE confessed_at IS NULL AND missed = FALSE;

CREATE INDEX IF NOT EXISTS idx_confession_queue_user_created
  ON confession_queue (user_id, created_at DESC);

ALTER TABLE confession_queue ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS confession_queue_owner ON confession_queue;
CREATE POLICY confession_queue_owner ON confession_queue
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS confession_queue_service ON confession_queue;
CREATE POLICY confession_queue_service ON confession_queue
  FOR ALL TO service_role USING (true) WITH CHECK (true);
