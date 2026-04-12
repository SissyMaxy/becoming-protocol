CREATE TABLE IF NOT EXISTS daily_report_cards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  report_date DATE NOT NULL,
  voice_grade INTEGER CHECK (voice_grade BETWEEN 1 AND 10),
  appearance_grade INTEGER CHECK (appearance_grade BETWEEN 1 AND 10),
  obedience_grade INTEGER CHECK (obedience_grade BETWEEN 1 AND 10),
  conditioning_grade INTEGER CHECK (conditioning_grade BETWEEN 1 AND 10),
  social_grade INTEGER CHECK (social_grade BETWEEN 1 AND 10),
  identity_grade INTEGER CHECK (identity_grade BETWEEN 1 AND 10),
  denial_grade INTEGER CHECK (denial_grade BETWEEN 1 AND 10),
  overall_score NUMERIC GENERATED ALWAYS AS (
    (COALESCE(voice_grade,0) + COALESCE(appearance_grade,0) + COALESCE(obedience_grade,0) +
     COALESCE(conditioning_grade,0) + COALESCE(social_grade,0) + COALESCE(identity_grade,0) +
     COALESCE(denial_grade,0))::NUMERIC / 7.0
  ) STORED,
  self_reflection TEXT,
  handler_commentary TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, report_date)
);

ALTER TABLE daily_report_cards ENABLE ROW LEVEL SECURITY;
CREATE POLICY "report_cards_select" ON daily_report_cards FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "report_cards_insert" ON daily_report_cards FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "report_cards_update" ON daily_report_cards FOR UPDATE USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_report_cards_user ON daily_report_cards(user_id, report_date DESC);

-- Block deletion of report cards
DROP TRIGGER IF EXISTS block_report_card_delete ON daily_report_cards;
CREATE TRIGGER block_report_card_delete
  BEFORE DELETE ON daily_report_cards
  FOR EACH ROW EXECUTE FUNCTION prevent_critical_deletes();
