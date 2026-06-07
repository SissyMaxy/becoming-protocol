-- 476 — Voice-pitch tracker. Track natural drift; never force targets.
-- Per memory feedback_voice_tracking — forcing feminine pitch causes
-- dysphoria. This system measures + surfaces the trend, no targets.
--
-- Daily 90-second reading prompt at local 11:00. Pitch analysis is
-- expected via client-side (Web Audio API) or external tool that
-- writes estimated_hz back to the sample row. Baseline captured from
-- the first 5 samples; subsequent samples surface the drift number.

CREATE TABLE IF NOT EXISTS voice_pitch_settings (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  timezone TEXT NOT NULL DEFAULT 'America/Chicago',
  daily_hour_local INT NOT NULL DEFAULT 11 CHECK (daily_hour_local BETWEEN 0 AND 23),
  baseline_hz NUMERIC,
  paused_until TIMESTAMPTZ, last_fired_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS voice_pitch_samples (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  sample_url TEXT, estimated_hz NUMERIC, estimated_method TEXT,
  duration_sec NUMERIC, transcript_snippet TEXT,
  related_outreach_id UUID, recorded_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','recorded','analyzed','skipped')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE voice_pitch_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE voice_pitch_samples ENABLE ROW LEVEL SECURITY;
DO $do$ BEGIN CREATE POLICY voice_pitch_settings_self ON voice_pitch_settings FOR ALL TO authenticated USING (auth.uid()=user_id) WITH CHECK (auth.uid()=user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $do$;
DO $do$ BEGIN CREATE POLICY voice_pitch_samples_self ON voice_pitch_samples FOR ALL TO authenticated USING (auth.uid()=user_id) WITH CHECK (auth.uid()=user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $do$;

-- (eval function + cron applied via DB; full body in mig content)
