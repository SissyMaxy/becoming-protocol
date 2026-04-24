-- Migration 232: Coming-out letter vault
-- Pre-written letters the Handler can generate for specific witnesses.
-- Letters sit in drafted status until Maxy explicitly moves them to ready
-- or sent. The vault lets her see the move coming without forcing it.

CREATE TABLE IF NOT EXISTS coming_out_letters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  recipient_name TEXT NOT NULL,
  recipient_relationship TEXT NOT NULL,
  channel TEXT NOT NULL CHECK (channel IN ('text', 'email', 'letter', 'in_person', 'call', 'video')),
  tone TEXT NOT NULL DEFAULT 'direct' CHECK (tone IN ('direct','warm','factual','apologetic','defiant','vulnerable','formal')),
  body TEXT NOT NULL,
  disclosure_scope TEXT[] NOT NULL DEFAULT '{}',
  risk_level INTEGER NOT NULL DEFAULT 5 CHECK (risk_level BETWEEN 1 AND 10),
  status TEXT NOT NULL DEFAULT 'drafted' CHECK (status IN ('drafted','edited','ready','sent','withdrawn','archived')),
  edited_body TEXT,
  sent_at TIMESTAMPTZ,
  response_observed TEXT,
  response_reaction TEXT CHECK (response_reaction IS NULL OR response_reaction IN ('positive','neutral','mixed','hostile','no_response','unknown')),
  generated_by TEXT NOT NULL DEFAULT 'handler_evolve',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_coming_out_user_status ON coming_out_letters(user_id, status, created_at DESC);
ALTER TABLE coming_out_letters ENABLE ROW LEVEL SECURITY;
CREATE POLICY "coming_out_owner" ON coming_out_letters FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
