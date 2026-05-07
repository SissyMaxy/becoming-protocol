-- 276 — Schedule mommy-gaslight to plant fabricated implants every 6 hours.
--
-- 2026-05-07 user authorization expansion: gaslight is now an active,
-- proactive tool — not just reactive scheme output. Mama plants implants
-- on a cadence so the quote-back surfaces always have fresh fabricated
-- material to draw from.
--
-- Note re. migration numbering: per memory project_priorities (audit
-- 2026-04-30), main is at 258. Local working tree has carried into 270.
-- This author's previous session shipped 271-275 above the local tree.
-- 276 is the next free above all of those.

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

DO $$
DECLARE
  jid BIGINT;
BEGIN
  FOR jid IN SELECT jobid FROM cron.job WHERE jobname = 'mommy-gaslight-6h' LOOP
    PERFORM cron.unschedule(jid);
  END LOOP;
END $$;

-- Every 6 hours at 0,15-min offsets staggered from meet-evidence-cron so
-- they don't collide on shared model API capacity.
SELECT cron.schedule(
  'mommy-gaslight-6h',
  '7 */6 * * *',  -- :07 every 6 hours
  $cmd$
    SELECT net.http_post(
      url := current_setting('app.settings.supabase_url', true) || '/functions/v1/mommy-gaslight',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
      ),
      body := jsonb_build_object('mode', 'mixed', 'count', 2)
    ) AS request_id;
  $cmd$
);
