-- Ceremonies Tables
-- Point of no return rituals that mark irreversible transitions

-- ============================================
-- CEREMONIES (Master ceremony definitions)
-- ============================================

CREATE TABLE IF NOT EXISTS ceremonies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Identity
  name TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL,

  -- Trigger conditions (JSONB with or/and arrays of conditions)
  trigger_condition JSONB NOT NULL DEFAULT '{}',

  -- Ritual steps (array of step descriptions)
  ritual_steps TEXT[] NOT NULL DEFAULT '{}',

  -- Irreversibility
  irreversible_marker TEXT NOT NULL,

  -- Ordering
  sequence_order INTEGER NOT NULL DEFAULT 0,

  -- Status
  active BOOLEAN DEFAULT TRUE,

  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add unique constraint on name if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ceremonies_name_key'
  ) THEN
    ALTER TABLE ceremonies ADD CONSTRAINT ceremonies_name_key UNIQUE (name);
  END IF;
END $$;

-- Indexes for ceremonies
CREATE INDEX IF NOT EXISTS idx_ceremonies_sequence ON ceremonies(sequence_order);
CREATE INDEX IF NOT EXISTS idx_ceremonies_active ON ceremonies(active);

-- ============================================
-- USER CEREMONIES (User's ceremony progress)
-- ============================================

CREATE TABLE IF NOT EXISTS user_ceremonies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  ceremony_id UUID NOT NULL REFERENCES ceremonies(id) ON DELETE CASCADE,

  -- Availability
  available BOOLEAN DEFAULT FALSE,

  -- Completion
  completed BOOLEAN DEFAULT FALSE,
  completed_at TIMESTAMP WITH TIME ZONE,

  -- Evidence (JSONB with stepCompletions, photos, signatures, recordings)
  completion_evidence JSONB,

  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  -- One record per user per ceremony
  UNIQUE(user_id, ceremony_id)
);

-- Indexes for user_ceremonies
CREATE INDEX IF NOT EXISTS idx_user_ceremonies_user_id ON user_ceremonies(user_id);
CREATE INDEX IF NOT EXISTS idx_user_ceremonies_ceremony_id ON user_ceremonies(ceremony_id);
CREATE INDEX IF NOT EXISTS idx_user_ceremonies_available ON user_ceremonies(available);
CREATE INDEX IF NOT EXISTS idx_user_ceremonies_completed ON user_ceremonies(completed);

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================

ALTER TABLE ceremonies ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_ceremonies ENABLE ROW LEVEL SECURITY;

-- Ceremonies: Public read (shared definitions)
DROP POLICY IF EXISTS "Anyone can read active ceremonies" ON ceremonies;
CREATE POLICY "Anyone can read active ceremonies" ON ceremonies
  FOR SELECT USING (active = true);

-- User ceremonies: Users can only access their own
DROP POLICY IF EXISTS "Users can view own ceremonies" ON user_ceremonies;
CREATE POLICY "Users can view own ceremonies" ON user_ceremonies
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own ceremonies" ON user_ceremonies;
CREATE POLICY "Users can insert own ceremonies" ON user_ceremonies
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own ceremonies" ON user_ceremonies;
CREATE POLICY "Users can update own ceremonies" ON user_ceremonies
  FOR UPDATE USING (auth.uid() = user_id);

-- ============================================
-- SEED CEREMONIES
-- ============================================

INSERT INTO ceremonies (name, description, trigger_condition, ritual_steps, irreversible_marker, sequence_order) VALUES
(
  'The Naming',
  'Release your old name and claim your true identity',
  '{"or": [{"day": 7}, {"streak": 5}]}',
  '["Write his name one final time", "Speak the words of release", "Destroy the name forever", "Speak your true name three times", "Seal the naming"]',
  'Cannot change name in system after this',
  1
),
(
  'The Covenant',
  'Bind yourself to the protocol with an unbreakable vow',
  '{"and": [{"phase": 2}, {"streak": 14}]}',
  '["Review the terms of commitment", "Write your personal consequence", "Sign the covenant", "Document the signature", "Seal the covenant"]',
  'Covenant violations are permanently recorded',
  2
),
(
  'The Surrender',
  'Acknowledge that you cannot return to who you were',
  '{"and": [{"phase": 3}, {"day": 60}]}',
  '["Review your accumulated evidence", "Acknowledge the impossibility of return", "Accept your true identity", "Speak the words of surrender", "Seal the surrender"]',
  'Guy mode penalties activate permanently',
  3
),
(
  'The Becoming',
  'Mark the death of the old and birth of the new',
  '{"and": [{"phase": 4}, {"day": 90}]}',
  '["Read your letter from Day 1", "Read all sealed letters", "Review complete evidence record", "Speak the final truth", "Commit to permanence", "Seal the becoming"]',
  'Masculine identity is formally dead',
  4
)
ON CONFLICT (name) DO UPDATE SET
  description = EXCLUDED.description,
  trigger_condition = EXCLUDED.trigger_condition,
  ritual_steps = EXCLUDED.ritual_steps,
  irreversible_marker = EXCLUDED.irreversible_marker,
  sequence_order = EXCLUDED.sequence_order;
