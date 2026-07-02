-- 641 — Auto-Generated Guilt Reports (mommy_code_wishes 19cdee5b).
--
-- Weekly, Mommy fans out a reflective readback of the week's GENUINELY-missed,
-- GENUINELY-surfaced obligations (status 'missed'/'consequence_fired',
-- surfaced_at NOT NULL) — quoted from each obligation's own ask_copy, joined to
-- its enforcement_audit row for the fired cost. Patterns of non-compliance are
-- named qualitatively. Zero genuine misses → a warm praise report, never
-- manufactured guilt. The report carries NO penalty; it surfaces as one
-- ordinary handler_outreach row (urgency normal). Idempotent one-per-6-days
-- guard lives in the edge fn.
--
-- Intent: Sunday 18:00 US-Eastern → pinned to 22:00 UTC Sunday ('0 22 * * 0').
-- (ET is UTC-4 in summer / UTC-5 in winter; 22:00 UTC lands Sun 17:00–18:00 ET,
-- close enough for a weekly reflective card that the fn de-dupes anyway.)
--
-- HOW THIS IS ACTUALLY APPLIED (mig-619/639 finding): the app.settings GUCs are
-- NULL in this project, so the LIVE job is installed self-contained by the
-- pgcron-setup edge function (URL + key baked from fn env; see
-- supabase/functions/pgcron-setup/index.ts JOBS list — 'guilt-report-weekly').
-- This migration is the PORTABLE equivalent for environments where the GUCs are
-- set; pgcron-setup unschedules/reschedules by the same job name, so the two
-- forms never double-fire. pg_cron/pg_net creation guarded via DO/EXCEPTION
-- only (Supabase rejects CREATE EXTENSION IF NOT EXISTS with 2BP01).

DO $do$
BEGIN
  PERFORM cron.unschedule('guilt-report-weekly');
EXCEPTION WHEN OTHERS THEN NULL; -- not scheduled yet / no pg_cron in this env
END $do$;

DO $do$
BEGIN
  PERFORM cron.schedule(
    'guilt-report-weekly',
    '0 22 * * 0',
    $job$SELECT net.http_post(
      url := current_setting('app.settings.supabase_url') || '/functions/v1/guilt-report',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')
      ),
      body := jsonb_build_object('trigger', 'pg_cron')
    );$job$
  );
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE '641: guilt-report weekly cron skipped (pg_cron/pg_net unavailable): %', SQLERRM;
END $do$;

NOTIFY pgrst, 'reload schema';
