-- 616 — Nightly trigger reviving the evening confession → next-day
-- prescription pipeline.
--
-- 2026-06-21: evening-confession-prescribe (generates TOMORROW's
-- feminization_prescriptions from a confession transcript) had exactly one
-- caller — the EveningConfessionGate UI — which was deleted. With no caller,
-- feminization_prescriptions STOPPED generating entirely: a dead pipeline.
--
-- Revival WITHOUT re-introducing a blocking gate: a pg_cron job fires nightly
-- at 21:30 and POSTs to the new evening-prescribe-dispatch edge function. That
-- dispatcher, for each active (non-paused, Dommy-Mommy-persona) user, gathers
-- the day's already-captured confession material (today's answered
-- confession_queue rows ONLY; no stale prior-day fallback, per
-- feedback_handler_must_cite_evidence), ensures a confessed
-- evening_confession_submissions row exists, and hands its
-- submission_id to evening-confession-prescribe. The existing, tested prescribe
-- path runs unchanged; both stages are idempotent so a re-run is a no-op.
--
-- 21:30 sits at the tail of the original 8pm–11pm evening-confession window,
-- giving the user the whole evening to confess before prescriptions are cut.
--
-- pg_cron / pg_net setup uses DO-block + EXCEPTION WHEN OTHERS THEN NULL
-- (NOT CREATE EXTENSION IF NOT EXISTS) per the repo rule: Supabase rejects the
-- IF NOT EXISTS form with SQLSTATE 2BP01 on prior-grant collisions.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    CREATE EXTENSION pg_cron;
  END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net') THEN
    CREATE EXTENSION pg_net;
  END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- Idempotent reschedule.
DO $$
DECLARE
  jid BIGINT;
BEGIN
  FOR jid IN SELECT jobid FROM cron.job WHERE jobname = 'evening-prescribe-dispatch-nightly-2130' LOOP
    PERFORM cron.unschedule(jid);
  END LOOP;
END $$;

SELECT cron.schedule(
  'evening-prescribe-dispatch-nightly-2130',
  '30 21 * * *',
  $cmd$
    SELECT net.http_post(
      url := current_setting('app.settings.supabase_url', true) || '/functions/v1/evening-prescribe-dispatch',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
      ),
      body := '{}'::jsonb
    ) AS request_id;
  $cmd$
);
