-- 643 — self-echo two-track composite pipeline (mommy_code_wishes 07f1a2bb).
--
-- The goon-voice-loop generator (mig 642) files pending_mix self_echo_sessions:
-- her strongest own-voice clip paired with a short Mommy line, but with NO
-- composite yet. This migration lands the mixing pipeline the wish asked for.
--
-- DECISION (per the wish, the repo-recommended path): ffmpeg is unavailable on
-- Vercel serverless (see src/lib/conditioning/elevenlabs.ts), so the composite
-- is NOT a single rendered mp3. Instead:
--   1. The `self-echo-mixer` edge fn renders mommy_script_text via ElevenLabs to
--      a real Mommy-voice mp3 in the private `audio` bucket, stored on the new
--      `mommy_render_path` column below.
--   2. It writes a small JSON manifest (mommy_render_path + own_voice_path +
--      loop_count + gain_db) into mixed_audio_path — NOT a fake single-file mp3
--      path — and flips mix_status='mixed'. For self-echo, mix_status='mixed'
--      means "manifest ready to play".
--   3. SelfEchoPlayer (client, Web Audio API) plays the Mommy track at full gain
--      with her own clip looped underneath (~-9dB, gentle fades) — a REAL
--      layered composite, produced at play time in the browser.
--
-- NOTHING marks a session mixed without a real, playable Mommy render on disk.

ALTER TABLE self_echo_sessions
  ADD COLUMN IF NOT EXISTS mommy_render_path text;

COMMENT ON COLUMN self_echo_sessions.mommy_render_path IS
  'Storage path (private `audio` bucket) of the ElevenLabs Mommy-voice render of mommy_script_text. Set by the self-echo-mixer edge fn. The own-voice bed is layered UNDER this at play time (SelfEchoPlayer, Web Audio) — no single-file composite exists.';

COMMENT ON COLUMN self_echo_sessions.mixed_audio_path IS
  'For self-echo: a JSON manifest (kind=self_echo_manifest) referencing mommy_render_path + own_voice_path + loop_count + gain_db, NOT a single-file mp3 path. The composite is layered client-side (Web Audio). mix_status=''mixed'' means this manifest is ready to play. Never a fabricated single-file path.';

-- ─── self-echo-mixer cron (portable form) ──────────────────────────────────
-- Drains pending_mix sessions → renders the Mommy track → flips to 'mixed'.
-- Every 5 minutes (short cron so a freshly-offered session becomes playable
-- soon after goon-voice-loop files it). As with mig 641/642, the LIVE job is
-- installed self-contained by pgcron-setup (JOBS list — 'self-echo-mixer-drain')
-- because the app.settings GUCs are NULL in this project; this block is the
-- portable equivalent and pgcron-setup unschedules/reschedules by the same name
-- so the two forms never double-fire. pg_cron/pg_net guarded via DO/EXCEPTION.

DO $do$
BEGIN
  PERFORM cron.unschedule('self-echo-mixer-drain');
EXCEPTION WHEN OTHERS THEN NULL; -- not scheduled yet / no pg_cron in this env
END $do$;

DO $do$
BEGIN
  PERFORM cron.schedule(
    'self-echo-mixer-drain',
    '*/5 * * * *',
    $job$SELECT net.http_post(
      url := current_setting('app.settings.supabase_url') || '/functions/v1/self-echo-mixer',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')
      ),
      body := jsonb_build_object('trigger', 'pg_cron')
    ) WHERE EXISTS (
      SELECT 1 FROM self_echo_sessions
      WHERE mix_status = 'pending_mix' AND own_voice_path IS NOT NULL
    );$job$
  );
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE '643: self-echo-mixer cron skipped (pg_cron/pg_net unavailable): %', SQLERRM;
END $do$;

NOTIFY pgrst, 'reload schema';
