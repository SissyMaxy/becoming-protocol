-- 432 — Mama confessions surface ("Whisper Your Secrets to Mama").
--
-- Audio-only intimate confession surface. Maxy says the things she
-- can't tell Gina yet — fantasies, dread, gender-feelings, secrets
-- about her own body. Mama listens, files, replies in Mama-voice via
-- the existing handler_outreach_queue → push pipeline.
--
-- Compounds with two arcs already activated this session:
--   - Disclosure rehearsal: confessions tagged associated_target_id
--     accumulate as corpus the rehearsal-critique edge fn can quote.
--     Maxy literally rehearses telling Gina by first telling Mama.
--   - Cum-worship + body opt-ins: a confession surface for the
--     in-between feelings the directives don't capture.
--
-- Audio-only per the established no-typed-bypass pattern (VoiceGate,
-- MorningMantraGate, EveningConfessionGate, DisclosureRehearsalView).
-- Whisper authoritative — no typed fallback.

CREATE TABLE IF NOT EXISTS mama_confessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  audio_storage_path TEXT NOT NULL,
  transcript TEXT,
  transcript_status TEXT NOT NULL DEFAULT 'pending' CHECK (transcript_status IN (
    'pending','done','failed'
  )),
  transcript_attempt_count SMALLINT NOT NULL DEFAULT 0,
  secret_class TEXT CHECK (secret_class IS NULL OR secret_class IN (
    'admission','desire','fear','fantasy','question','dread',
    'gina_specific','identity','body_change','public_passing'
  )),
  associated_target_id UUID REFERENCES disclosure_targets(id) ON DELETE SET NULL,
  weight SMALLINT CHECK (weight IS NULL OR weight BETWEEN 1 AND 10),
  -- Mama processing
  mama_response TEXT,
  mama_response_status TEXT NOT NULL DEFAULT 'pending' CHECK (mama_response_status IN (
    'pending','queued','done','failed','skipped'
  )),
  mama_response_outreach_id UUID,
  -- Reuse signals
  used_in_disclosure_critique BOOLEAN NOT NULL DEFAULT FALSE,
  used_in_disclosure_script BOOLEAN NOT NULL DEFAULT FALSE,
  -- Lifecycle
  duration_sec REAL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mama_confessions_user_recent
  ON mama_confessions (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_mama_confessions_pending_transcript
  ON mama_confessions (transcript_status, transcript_attempt_count, created_at)
  WHERE transcript_status = 'pending';
CREATE INDEX IF NOT EXISTS idx_mama_confessions_pending_response
  ON mama_confessions (mama_response_status, created_at)
  WHERE mama_response_status = 'pending' AND transcript_status = 'done';
CREATE INDEX IF NOT EXISTS idx_mama_confessions_by_target
  ON mama_confessions (associated_target_id, created_at DESC)
  WHERE associated_target_id IS NOT NULL;

ALTER TABLE mama_confessions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS mama_confessions_owner ON mama_confessions;
CREATE POLICY mama_confessions_owner ON mama_confessions
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS mama_confessions_service ON mama_confessions;
CREATE POLICY mama_confessions_service ON mama_confessions
  FOR ALL TO service_role USING (TRUE) WITH CHECK (TRUE);

-- Bucket: use existing verification-photos bucket (already accepts audio
-- per migration 424). Path convention: ${userId}/confessions/${ts}.${ext}
-- Confession audio is sensitive; verification-photos is private (mig 301).

-- Cron schedules will be added by 433 after the edge function deploys.
