CREATE TABLE IF NOT EXISTS designated_witnesses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  witness_name TEXT NOT NULL,
  witness_email TEXT NOT NULL,
  relationship TEXT,
  consent_confirmed BOOLEAN NOT NULL DEFAULT FALSE,
  consent_token TEXT UNIQUE,
  consent_confirmed_at TIMESTAMPTZ,
  permissions JSONB DEFAULT '{"daily_digest":true,"quit_alerts":true,"streak_alerts":true,"photo_visibility":false}'::jsonb,
  added_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  removal_requested_at TIMESTAMPTZ,
  removal_cooldown_until TIMESTAMPTZ,
  removed_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'removal_pending', 'removed'))
);

ALTER TABLE designated_witnesses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "witnesses_select" ON designated_witnesses FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "witnesses_insert" ON designated_witnesses FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "witnesses_update" ON designated_witnesses FOR UPDATE USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_witnesses_user ON designated_witnesses(user_id, status);
CREATE INDEX IF NOT EXISTS idx_witnesses_token ON designated_witnesses(consent_token);

-- Block direct deletes — must go through quit_attempts flow
CREATE OR REPLACE FUNCTION prevent_witness_deletes() RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'Witnesses cannot be deleted directly. Use the witness removal flow with mandatory cooldown.';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS block_witness_delete ON designated_witnesses;
CREATE TRIGGER block_witness_delete
  BEFORE DELETE ON designated_witnesses
  FOR EACH ROW EXECUTE FUNCTION prevent_witness_deletes();

CREATE TABLE IF NOT EXISTS witness_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  witness_id UUID NOT NULL REFERENCES designated_witnesses(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  notification_type TEXT NOT NULL CHECK (notification_type IN ('daily_digest', 'quit_attempt', 'streak_break', 'milestone', 'manual_alert')),
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  payload JSONB,
  sent_at TIMESTAMPTZ,
  delivery_status TEXT DEFAULT 'pending' CHECK (delivery_status IN ('pending', 'sent', 'failed')),
  delivery_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE witness_notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "witness_notif_select" ON witness_notifications FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "witness_notif_insert" ON witness_notifications FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_witness_notifs_user ON witness_notifications(user_id, created_at DESC);
