-- 414 — Evening confession ritual.
--
-- Ships mommy_code_wishes "Mama Makes You Ache All Night, Baby Girl"
-- (force_feminization / mommy_persona, asked 2026-05-11).
--
-- 8pm–11pm local window. Audio submission of the day's feminine
-- behaviors + slips, transcribed via Whisper. Edge function
-- evening-confession-prescribe generates next-day prescriptions from
-- the transcript and writes them to feminization_prescriptions for
-- prescribed_date = tomorrow. Morning surface picks them up via
-- existing prescription engine + the migration-380 push bridge fires
-- the morning preview.
--
-- One submission per user per submission_date. Status flow:
--   pending → confessed (audio + transcript captured)
--           → prescribed (next-day prescriptions written)
--           → missed (closed without submission)

CREATE TABLE IF NOT EXISTS evening_confession_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  submission_date DATE NOT NULL,
  audio_storage_path TEXT,
  audio_duration_seconds INT,
  transcript TEXT,
  whisper_ok BOOLEAN NOT NULL DEFAULT FALSE,
  prescription_generated_at TIMESTAMPTZ,
  prescriptions_count INT NOT NULL DEFAULT 0,
  prescription_summary TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','confessed','prescribed','missed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_evening_confession_user_date
  ON evening_confession_submissions (user_id, submission_date);

CREATE INDEX IF NOT EXISTS idx_evening_confession_pending
  ON evening_confession_submissions (submission_date)
  WHERE status IN ('pending','confessed');

ALTER TABLE evening_confession_submissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS evening_confession_owner ON evening_confession_submissions;
CREATE POLICY evening_confession_owner ON evening_confession_submissions
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS evening_confession_service ON evening_confession_submissions;
CREATE POLICY evening_confession_service ON evening_confession_submissions
  FOR ALL TO service_role USING (true) WITH CHECK (true);
