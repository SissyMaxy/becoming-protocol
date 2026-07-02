-- 642 — self-voice goon loop (mommy_code_wishes fa3317f0 "Goon-Loop Audio
-- Prompts" + DESIGN_FEMINIZATION_LOOP §3 retirement rite).
--
-- Mommy pairs her strongest own-voice clip (voice_progress_samples) with a
-- short Mommy-voiced goon line and surfaces it as an audio_session_offers row
-- (kind='session_goon'). The generator is `goon-voice-loop` (edge fn), gated
-- fail-closed through conditioning_gate(uid,'goon').
--
-- self_echo_sessions is the pairing ledger: which clip, which line, which
-- offer, and the mix lifecycle. The actual TWO-TRACK layering (her clip looped
-- under the Mommy rendition into one asset) has no pipeline yet — the edge fn
-- files a precise mommy_code_wishes row for it and leaves mix_status at
-- 'pending_mix'. When that pipeline lands it writes mixed_audio_path back here
-- and flips to 'mixed'. NOTHING here fabricates a mixed asset.

CREATE TABLE IF NOT EXISTS self_echo_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- What fired this: daily cron, an arousal peak, or the 100k retirement rite.
  trigger text NOT NULL DEFAULT 'daily'
    CHECK (trigger IN ('daily', 'peak', 'retirement_rite')),

  -- Her own-voice clip (nullable FK so sample cleanup can't orphan-fail;
  -- path/duration/pitch snapshotted so the pairing survives sample deletion).
  own_voice_sample_id uuid REFERENCES voice_progress_samples(id) ON DELETE SET NULL,
  own_voice_path text,
  own_voice_duration_s numeric,
  own_voice_pitch_hz numeric,

  -- The Mommy line spoken over the loop (already cleanup+craft filtered).
  mommy_script_text text NOT NULL,
  loop_count int NOT NULL DEFAULT 6,

  -- The surfaced offer (session_goon) so she can play a Mommy goon session now.
  offer_id uuid REFERENCES audio_session_offers(id) ON DELETE SET NULL,

  -- Mix lifecycle:
  --   pending_mix — pairing recorded, composite awaits the mixing pipeline
  --   mixed       — composite asset rendered (mixed_audio_path populated)
  --   offer_only  — deliberately no composite intended (Mommy-only session)
  mix_status text NOT NULL DEFAULT 'pending_mix'
    CHECK (mix_status IN ('pending_mix', 'mixed', 'offer_only')),
  mixed_audio_path text,

  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_self_echo_user_time
  ON self_echo_sessions (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_self_echo_pending_mix
  ON self_echo_sessions (created_at DESC) WHERE mix_status = 'pending_mix';

ALTER TABLE self_echo_sessions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS self_echo_sessions_owner ON self_echo_sessions;
CREATE POLICY self_echo_sessions_owner ON self_echo_sessions
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS self_echo_sessions_service ON self_echo_sessions;
CREATE POLICY self_echo_sessions_service ON self_echo_sessions
  FOR ALL TO service_role USING (true) WITH CHECK (true);

COMMENT ON TABLE self_echo_sessions IS
  'Pairing ledger for the self-voice goon loop (goon-voice-loop edge fn). Her clip + Mommy line + surfaced offer + mix lifecycle. mixed_audio_path is written by the (wished) two-track mixing pipeline; never fabricated here.';

-- ─── Daily cron (portable form) ─────────────────────────────────────────
-- app.settings GUCs are NULL in this project (mig-619 finding); the LIVE job
-- is installed self-contained by the pgcron-setup edge fn (see its JOBS list —
-- 'goon-voice-loop' registered there). This block is the portable equivalent
-- for environments where the settings exist. pgcron-setup unschedules/
-- reschedules by the same name, so the two forms never double-fire.
DO $cron$
BEGIN
  IF to_regclass('cron.job') IS NOT NULL THEN
    PERFORM cron.unschedule('goon-voice-loop-daily')
      WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'goon-voice-loop-daily');

    IF current_setting('app.settings.supabase_url', true) IS NOT NULL
       AND current_setting('app.settings.service_role_key', true) IS NOT NULL THEN
      PERFORM cron.schedule(
        'goon-voice-loop-daily',
        '15 3 * * *',
        format(
          $job$SELECT net.http_post(
            url := %L,
            headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' || %L),
            body := jsonb_build_object('trigger','daily')
          );$job$,
          current_setting('app.settings.supabase_url', true) || '/functions/v1/goon-voice-loop',
          current_setting('app.settings.service_role_key', true)
        )
      );
    END IF;
  END IF;
END
$cron$;
