-- Migration 211: Outfit submissions for Gina's daily_outfit_approval

CREATE TABLE IF NOT EXISTS outfit_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE
);

ALTER TABLE outfit_submissions
  ADD COLUMN IF NOT EXISTS photo_url TEXT,
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMPTZ DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS gina_decision TEXT DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS gina_decided_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS gina_note TEXT;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'outfit_submissions_decision_check') THEN
    ALTER TABLE outfit_submissions ADD CONSTRAINT outfit_submissions_decision_check
      CHECK (gina_decision IN ('pending', 'approved', 'rejected', 'change_required'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_outfit_submissions_user_recent ON outfit_submissions(user_id, submitted_at DESC);
CREATE INDEX IF NOT EXISTS idx_outfit_submissions_pending ON outfit_submissions(user_id, gina_decision) WHERE gina_decision = 'pending';

ALTER TABLE outfit_submissions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users own outfits" ON outfit_submissions;
CREATE POLICY "Users own outfits" ON outfit_submissions FOR ALL USING (auth.uid() = user_id);

NOTIFY pgrst, 'reload schema';
