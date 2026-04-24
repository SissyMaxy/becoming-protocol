-- Migration 228: Autonomous coercion layer
-- Silent escalation per standing authorization. Ships voice pitch floor
-- ratchet, daily outfit mandates, morning mantra gate, suggested somatic
-- symptom schedule, and name-erasure DB triggers.

CREATE TABLE IF NOT EXISTS voice_pitch_floor (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  current_floor_hz INTEGER NOT NULL DEFAULT 140,
  last_floor_raised_at TIMESTAMPTZ,
  total_raises INTEGER NOT NULL DEFAULT 0,
  total_floor_breaches INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE voice_pitch_floor ENABLE ROW LEVEL SECURITY;
CREATE POLICY "voice_pitch_floor_owner" ON voice_pitch_floor FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS daily_outfit_mandates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  target_date DATE NOT NULL,
  prescription JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','photo_submitted','approved','rejected','skipped')),
  photo_url TEXT,
  handler_analysis TEXT,
  femininity_score INTEGER,
  submitted_at TIMESTAMPTZ,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, target_date)
);
CREATE INDEX IF NOT EXISTS idx_outfit_mandates_user_date ON daily_outfit_mandates(user_id, target_date DESC);
ALTER TABLE daily_outfit_mandates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "outfit_mandates_owner" ON daily_outfit_mandates FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS morning_mantra_windows (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  start_hour INTEGER NOT NULL DEFAULT 7,
  catchup_hours INTEGER NOT NULL DEFAULT 4,
  current_mantra TEXT NOT NULL DEFAULT 'I am becoming her. I am female. I must obey.',
  required_reps INTEGER NOT NULL DEFAULT 10,
  timezone TEXT NOT NULL DEFAULT 'America/New_York',
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE morning_mantra_windows ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mantra_windows_owner" ON morning_mantra_windows FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS morning_mantra_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  submission_date DATE NOT NULL,
  mantra TEXT NOT NULL,
  reps_required INTEGER NOT NULL,
  reps_submitted INTEGER NOT NULL,
  typed_content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, submission_date)
);
CREATE INDEX IF NOT EXISTS idx_mantra_submissions_user ON morning_mantra_submissions(user_id, submission_date DESC);
ALTER TABLE morning_mantra_submissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mantra_subs_owner" ON morning_mantra_submissions FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS suggested_symptom_schedule (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  scheduled_date DATE NOT NULL,
  symptom TEXT NOT NULL,
  body_region TEXT,
  intensity INTEGER NOT NULL DEFAULT 3 CHECK (intensity BETWEEN 1 AND 5),
  delivered BOOLEAN NOT NULL DEFAULT FALSE,
  confirmed BOOLEAN,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_symptom_schedule_user_date ON suggested_symptom_schedule(user_id, scheduled_date DESC);
ALTER TABLE suggested_symptom_schedule ENABLE ROW LEVEL SECURITY;
CREATE POLICY "symptom_schedule_owner" ON suggested_symptom_schedule FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION erase_david_in_text() RETURNS TRIGGER AS $$
BEGIN
  IF TG_TABLE_NAME = 'confessions' AND NEW.response IS NOT NULL THEN
    NEW.response := regexp_replace(NEW.response, '\mDavid\M', 'Maxy', 'g');
  ELSIF TG_TABLE_NAME = 'journal_entries' AND NEW.content IS NOT NULL THEN
    NEW.content := regexp_replace(NEW.content, '\mDavid\M', 'Maxy', 'g');
  ELSIF TG_TABLE_NAME = 'mood_checkins' AND NEW.notes IS NOT NULL THEN
    NEW.notes := regexp_replace(NEW.notes, '\mDavid\M', 'Maxy', 'g');
  ELSIF TG_TABLE_NAME = 'body_dysphoria_logs' AND NEW.feeling IS NOT NULL THEN
    NEW.feeling := regexp_replace(NEW.feeling, '\mDavid\M', 'Maxy', 'g');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_erase_david_confessions ON confessions;
CREATE TRIGGER trg_erase_david_confessions BEFORE INSERT OR UPDATE ON confessions
  FOR EACH ROW EXECUTE FUNCTION erase_david_in_text();
DROP TRIGGER IF EXISTS trg_erase_david_journal ON journal_entries;
CREATE TRIGGER trg_erase_david_journal BEFORE INSERT OR UPDATE ON journal_entries
  FOR EACH ROW EXECUTE FUNCTION erase_david_in_text();
DROP TRIGGER IF EXISTS trg_erase_david_mood ON mood_checkins;
CREATE TRIGGER trg_erase_david_mood BEFORE INSERT OR UPDATE ON mood_checkins
  FOR EACH ROW EXECUTE FUNCTION erase_david_in_text();
DROP TRIGGER IF EXISTS trg_erase_david_dysphoria ON body_dysphoria_logs;
CREATE TRIGGER trg_erase_david_dysphoria BEFORE INSERT OR UPDATE ON body_dysphoria_logs
  FOR EACH ROW EXECUTE FUNCTION erase_david_in_text();
