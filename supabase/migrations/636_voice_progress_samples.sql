-- 636 — voice spine (FEM §2).
--
-- One capture table, three inflows (weekly tracking-decree audio, mantra
-- drills, elective freeform). The watcher reads THIS — never the fictional
-- voice_corpus the old watcher queried (that table never existed; the
-- audit's schema-fiction poster child).
--
-- Backfill sources verified against migrations (NOT guessed):
--   voice_pitch_logs   (mig 068: context, pitch_hz, duration_seconds, recorded_at)
--   voice_recordings   (mig 068: recording_url, duration_seconds, pitch_avg_hz, created_at)
-- voice_pitch_samples exists too (mig 148 shape won the CREATE race over
-- 476: pitch_hz NOT NULL, context, created_at) — included, guarded.

CREATE TABLE IF NOT EXISTS voice_progress_samples (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  source text NOT NULL CHECK (source IN ('tracking_decree','mantra_drill','freeform')),
  audio_path text,
  duration_s numeric,
  pitch_median_hz numeric,
  pitch_p90_hz numeric,
  extraction_method text,
  decree_id uuid,
  drill_session_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_voice_progress_user_time
  ON voice_progress_samples (user_id, recorded_at DESC);

ALTER TABLE voice_progress_samples ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS voice_progress_samples_owner ON voice_progress_samples;
CREATE POLICY voice_progress_samples_owner ON voice_progress_samples
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS voice_progress_samples_service ON voice_progress_samples;
CREATE POLICY voice_progress_samples_service ON voice_progress_samples
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ─── Server-side pitch bounds (60–400 Hz) ───────────────────────────
-- Out-of-band client extraction → NULL (counts for engagement only).
-- A CHECK would reject the row; the row is real evidence either way.

CREATE OR REPLACE FUNCTION trg_voice_progress_pitch_bounds()
RETURNS TRIGGER LANGUAGE plpgsql AS $fn$
BEGIN
  IF NEW.pitch_median_hz IS NOT NULL AND (NEW.pitch_median_hz < 60 OR NEW.pitch_median_hz > 400) THEN
    NEW.pitch_median_hz := NULL;
  END IF;
  IF NEW.pitch_p90_hz IS NOT NULL AND (NEW.pitch_p90_hz < 60 OR NEW.pitch_p90_hz > 400) THEN
    NEW.pitch_p90_hz := NULL;
  END IF;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS voice_progress_pitch_bounds ON voice_progress_samples;
CREATE TRIGGER voice_progress_pitch_bounds
  BEFORE INSERT OR UPDATE ON voice_progress_samples
  FOR EACH ROW EXECUTE FUNCTION trg_voice_progress_pitch_bounds();

-- ─── Organic tracking-log writer (FEM §5 writer #2) ─────────────────
-- Doing voice work unprompted counts toward the voice_sample cadence.

CREATE OR REPLACE FUNCTION trg_tracking_log_on_voice_sample()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  INSERT INTO transition_tracking_log (user_id, tracking_type, recorded_at, evidence_path, source_table, source_id)
  VALUES (NEW.user_id, 'voice_sample', NEW.recorded_at, NEW.audio_path, 'voice_progress_samples', NEW.id);
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS tracking_log_on_voice_sample ON voice_progress_samples;
CREATE TRIGGER tracking_log_on_voice_sample
  AFTER INSERT ON voice_progress_samples
  FOR EACH ROW EXECUTE FUNCTION trg_tracking_log_on_voice_sample();

-- ─── Backfill (guarded on real table + column existence) ────────────

DO $do$
BEGIN
  -- voice_pitch_logs (068): Hz measurements over time.
  IF to_regclass('public.voice_pitch_logs') IS NOT NULL
     AND EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema='public' AND table_name='voice_pitch_logs' AND column_name='pitch_hz') THEN
    INSERT INTO voice_progress_samples (user_id, recorded_at, source, duration_s, pitch_median_hz, extraction_method)
    SELECT user_id, COALESCE(recorded_at, now()), 'freeform', duration_seconds,
           CASE WHEN pitch_hz BETWEEN 60 AND 400 THEN pitch_hz END,
           'backfill:voice_pitch_logs'
      FROM voice_pitch_logs
     WHERE NOT EXISTS (SELECT 1 FROM voice_progress_samples s WHERE s.extraction_method = 'backfill:voice_pitch_logs');
  END IF;

  -- voice_recordings (068): own-voice recordings with optional pitch.
  IF to_regclass('public.voice_recordings') IS NOT NULL
     AND EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema='public' AND table_name='voice_recordings' AND column_name='recording_url') THEN
    INSERT INTO voice_progress_samples (user_id, recorded_at, source, audio_path, duration_s, pitch_median_hz, extraction_method)
    SELECT user_id, COALESCE(created_at, now()), 'freeform', recording_url, duration_seconds,
           CASE WHEN pitch_avg_hz BETWEEN 60 AND 400 THEN pitch_avg_hz END,
           'backfill:voice_recordings'
      FROM voice_recordings
     WHERE NOT EXISTS (SELECT 1 FROM voice_progress_samples s WHERE s.extraction_method = 'backfill:voice_recordings');
  END IF;

  -- voice_pitch_samples (148 shape: pitch_hz NOT NULL). The 476 shape
  -- (estimated_hz) never landed because 148's CREATE won; guard anyway.
  IF to_regclass('public.voice_pitch_samples') IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_schema='public' AND table_name='voice_pitch_samples' AND column_name='pitch_hz') THEN
      INSERT INTO voice_progress_samples (user_id, recorded_at, source, pitch_median_hz, extraction_method)
      SELECT user_id, COALESCE(created_at, now()), 'freeform',
             CASE WHEN pitch_hz BETWEEN 60 AND 400 THEN pitch_hz END,
             'backfill:voice_pitch_samples'
        FROM voice_pitch_samples
       WHERE NOT EXISTS (SELECT 1 FROM voice_progress_samples s WHERE s.extraction_method = 'backfill:voice_pitch_samples');
    ELSIF EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema='public' AND table_name='voice_pitch_samples' AND column_name='estimated_hz') THEN
      INSERT INTO voice_progress_samples (user_id, recorded_at, source, audio_path, duration_s, pitch_median_hz, extraction_method)
      SELECT user_id, COALESCE(recorded_at, created_at, now()), 'freeform', sample_url, duration_sec,
             CASE WHEN estimated_hz BETWEEN 60 AND 400 THEN estimated_hz END,
             'backfill:voice_pitch_samples'
        FROM voice_pitch_samples
       WHERE NOT EXISTS (SELECT 1 FROM voice_progress_samples s WHERE s.extraction_method = 'backfill:voice_pitch_samples');
    END IF;
  END IF;
END $do$;
