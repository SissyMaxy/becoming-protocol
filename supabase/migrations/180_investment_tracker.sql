CREATE TABLE IF NOT EXISTS feminization_investment (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users ON DELETE CASCADE,
  total_minutes_in_app INTEGER DEFAULT 0,
  total_dollars_spent NUMERIC(10,2) DEFAULT 0,
  total_photos_submitted INTEGER DEFAULT 0,
  total_voice_recordings INTEGER DEFAULT 0,
  total_journal_entries INTEGER DEFAULT 0,
  total_conditioning_sessions INTEGER DEFAULT 0,
  total_handler_messages INTEGER DEFAULT 0,
  total_device_commands INTEGER DEFAULT 0,
  total_public_posts INTEGER DEFAULT 0,
  total_compliance_days INTEGER DEFAULT 0,
  longest_denial_streak INTEGER DEFAULT 0,
  first_engagement_at TIMESTAMPTZ,
  last_calculated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE feminization_investment ENABLE ROW LEVEL SECURITY;
CREATE POLICY "investment_select" ON feminization_investment FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "investment_insert" ON feminization_investment FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "investment_update" ON feminization_investment FOR UPDATE USING (auth.uid() = user_id);
