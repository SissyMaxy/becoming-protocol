-- Migration 008: Investment & Evidence Tables
-- Investments, evidence captures, sealed letters, PONR milestones

-- ============================================
-- INVESTMENTS
-- Financial and time investments in transformation
-- ============================================
CREATE TABLE IF NOT EXISTS investments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  name TEXT NOT NULL,
  category TEXT NOT NULL, -- clothing, lingerie, toys, chastity, makeup, accessories, services, subscriptions
  amount DECIMAL NOT NULL,
  currency TEXT DEFAULT 'USD',
  date DATE DEFAULT CURRENT_DATE,
  private BOOLEAN DEFAULT TRUE, -- hidden from Gina
  times_used INTEGER DEFAULT 0,
  last_used TIMESTAMPTZ,
  photo_url TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Fix for pre-existing investments table missing columns
ALTER TABLE investments ADD COLUMN IF NOT EXISTS date DATE DEFAULT CURRENT_DATE;
ALTER TABLE investments ADD COLUMN IF NOT EXISTS currency TEXT DEFAULT 'USD';
ALTER TABLE investments ADD COLUMN IF NOT EXISTS private BOOLEAN DEFAULT TRUE;
ALTER TABLE investments ADD COLUMN IF NOT EXISTS times_used INTEGER DEFAULT 0;
ALTER TABLE investments ADD COLUMN IF NOT EXISTS last_used TIMESTAMPTZ;
ALTER TABLE investments ADD COLUMN IF NOT EXISTS photo_url TEXT;
ALTER TABLE investments ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE investments ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

-- ============================================
-- EVIDENCE CAPTURES
-- Photos, videos, and other evidence
-- ============================================
CREATE TABLE IF NOT EXISTS evidence_captures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  evidence_type TEXT NOT NULL, -- photo, video, audio, screenshot, document
  file_url TEXT,
  thumbnail_url TEXT,
  description TEXT,
  captured_at TIMESTAMPTZ DEFAULT NOW(),
  private BOOLEAN DEFAULT TRUE,
  milestone_id UUID,
  session_id UUID REFERENCES intimate_sessions,
  tags JSONB DEFAULT '[]',
  metadata JSONB DEFAULT '{}'
);

-- ============================================
-- SEALED LETTERS
-- Letters to future self
-- ============================================
CREATE TABLE IF NOT EXISTS sealed_letters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  letter_type TEXT NOT NULL, -- to_future_self, commitment_letter, confession, reflection, milestone
  content TEXT NOT NULL,
  written_at TIMESTAMPTZ DEFAULT NOW(),
  unlock_condition TEXT, -- date, milestone, escalation_level, gina_command
  unlock_date TIMESTAMPTZ,
  unlock_milestone TEXT,
  opened BOOLEAN DEFAULT FALSE,
  opened_at TIMESTAMPTZ,
  reaction_on_opening TEXT
);

-- ============================================
-- PONR MILESTONES
-- Point of No Return milestones
-- ============================================
CREATE TABLE IF NOT EXISTS ponr_milestones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  milestone_type TEXT NOT NULL, -- first_public, first_service, permanent_change, gina_ownership, etc.
  description TEXT,
  achieved_at TIMESTAMPTZ,
  message TEXT, -- what this milestone means
  celebrated BOOLEAN DEFAULT FALSE,
  celebrated_at TIMESTAMPTZ,
  evidence_id UUID REFERENCES evidence_captures,
  handler_generated BOOLEAN DEFAULT FALSE,
  UNIQUE(user_id, milestone_type)
);

-- ============================================
-- TIMELINE EVENTS
-- Significant events for the timeline view
-- ============================================
CREATE TABLE IF NOT EXISTS timeline_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  event_type TEXT NOT NULL, -- milestone, escalation, first_time, breakthrough, gina_moment
  event_date TIMESTAMPTZ DEFAULT NOW(),
  title TEXT NOT NULL,
  description TEXT,
  domain TEXT,
  significance INTEGER, -- 1-10
  evidence_ids JSONB DEFAULT '[]',
  private BOOLEAN DEFAULT TRUE,
  pinned BOOLEAN DEFAULT FALSE
);

-- ============================================
-- TRANSFORMATION JOURNAL
-- Reflective journal entries
-- ============================================
CREATE TABLE IF NOT EXISTS transformation_journal (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  entry_date DATE DEFAULT CURRENT_DATE,
  prompt TEXT, -- what prompted this entry
  content TEXT NOT NULL,
  mood TEXT,
  feminine_state INTEGER, -- 1-10
  insights TEXT,
  gratitude TEXT,
  handler_response TEXT, -- if Handler comments
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- PURCHASE WISHLIST
-- Items to buy for transformation
-- ============================================
CREATE TABLE IF NOT EXISTS purchase_wishlist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  item_name TEXT NOT NULL,
  category TEXT NOT NULL,
  estimated_price DECIMAL,
  priority INTEGER DEFAULT 5, -- 1-10
  url TEXT,
  notes TEXT,
  handler_suggested BOOLEAN DEFAULT FALSE,
  purchased BOOLEAN DEFAULT FALSE,
  purchased_at TIMESTAMPTZ,
  investment_id UUID REFERENCES investments,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================
ALTER TABLE investments ENABLE ROW LEVEL SECURITY;
ALTER TABLE evidence_captures ENABLE ROW LEVEL SECURITY;
ALTER TABLE sealed_letters ENABLE ROW LEVEL SECURITY;
ALTER TABLE ponr_milestones ENABLE ROW LEVEL SECURITY;
ALTER TABLE timeline_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE transformation_journal ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_wishlist ENABLE ROW LEVEL SECURITY;

-- RLS Policies
DROP POLICY IF EXISTS "Users access own investments" ON investments;
CREATE POLICY "Users access own investments" ON investments FOR ALL USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users access own evidence" ON evidence_captures;
CREATE POLICY "Users access own evidence" ON evidence_captures FOR ALL USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users access own letters" ON sealed_letters;
CREATE POLICY "Users access own letters" ON sealed_letters FOR ALL USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users access own milestones" ON ponr_milestones;
CREATE POLICY "Users access own milestones" ON ponr_milestones FOR ALL USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users access own timeline" ON timeline_events;
CREATE POLICY "Users access own timeline" ON timeline_events FOR ALL USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users access own journal" ON transformation_journal;
CREATE POLICY "Users access own journal" ON transformation_journal FOR ALL USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users access own wishlist" ON purchase_wishlist;
CREATE POLICY "Users access own wishlist" ON purchase_wishlist FOR ALL USING (auth.uid() = user_id);

-- ============================================
-- INDEXES
-- ============================================
CREATE INDEX IF NOT EXISTS idx_investments_user_id ON investments(user_id);
CREATE INDEX IF NOT EXISTS idx_investments_category ON investments(user_id, category);
CREATE INDEX IF NOT EXISTS idx_investments_date ON investments(user_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_evidence_captures_user_id ON evidence_captures(user_id);
CREATE INDEX IF NOT EXISTS idx_evidence_captures_type ON evidence_captures(user_id, evidence_type);
CREATE INDEX IF NOT EXISTS idx_evidence_captures_captured ON evidence_captures(user_id, captured_at DESC);
CREATE INDEX IF NOT EXISTS idx_sealed_letters_user_id ON sealed_letters(user_id);
CREATE INDEX IF NOT EXISTS idx_sealed_letters_opened ON sealed_letters(user_id, opened);
CREATE INDEX IF NOT EXISTS idx_ponr_milestones_user_id ON ponr_milestones(user_id);
CREATE INDEX IF NOT EXISTS idx_ponr_milestones_type ON ponr_milestones(user_id, milestone_type);
CREATE INDEX IF NOT EXISTS idx_timeline_events_user_id ON timeline_events(user_id);
CREATE INDEX IF NOT EXISTS idx_timeline_events_date ON timeline_events(user_id, event_date DESC);
CREATE INDEX IF NOT EXISTS idx_timeline_events_pinned ON timeline_events(user_id, pinned);
CREATE INDEX IF NOT EXISTS idx_transformation_journal_user_id ON transformation_journal(user_id);
CREATE INDEX IF NOT EXISTS idx_transformation_journal_date ON transformation_journal(user_id, entry_date DESC);
CREATE INDEX IF NOT EXISTS idx_purchase_wishlist_user_id ON purchase_wishlist(user_id);
CREATE INDEX IF NOT EXISTS idx_purchase_wishlist_purchased ON purchase_wishlist(user_id, purchased);

-- ============================================
-- TRIGGER: Update transformation_journal updated_at
-- ============================================
DROP TRIGGER IF EXISTS update_transformation_journal_updated_at ON transformation_journal;
CREATE TRIGGER update_transformation_journal_updated_at
  BEFORE UPDATE ON transformation_journal
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
