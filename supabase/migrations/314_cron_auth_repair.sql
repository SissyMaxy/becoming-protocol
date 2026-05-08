-- 314 — Cron auth repair + schedule staggering. 2026-05-08.
--
-- Two production issues addressed:
--
-- (1) AUTH 401s. Several pg_cron jobs were registered with the literal
--     string 'PLACEHOLDER_SERVICE_KEY' in the Authorization header — or via
--     the Supabase dashboard with stale tokens — and 401 every fire. This
--     killed the autonomous self-heal + monitoring loops.
--       Source-tracked offenders:
--         - 213: handler-self-audit-daily, handler-outreach-auto-hourly
--         - 215: content-generator-daily, workout-prescriber-daily
--         - 309: calendar-sync-daily, calendar-place-rituals-daily
--                (already repaired by 312)
--       Dashboard-registered (not in any source migration):
--         - mommy-praise (function expects ~10-min cadence)
--         - mommy-bedtime (function expects 22:00 UTC daily)
--       Possibly-duplicated (313 registered correctly; logs still show 401
--       so something else is firing under the same function name):
--         - auto-healer, deploy-health-monitor
--
--     Fix: defensive sweep drops EVERY cron whose command embeds the
--     literal 'PLACEHOLDER_SERVICE_KEY' (catches both source-tracked and
--     dashboard-registered jobs), then re-register via the
--     invoke_edge_function() helper from 044 — pulls service_role_key
--     from app.settings, so there is one chokepoint for auth.
--
-- (2) pg_cron startup timeouts. ~16 jobs all fire at minute :00 (every */5,
--     */10, */15, */30, plus '0 * * * *' hourlies). The pg_cron worker
--     pool exhausts and Postgres logs 'cron job XXX job startup timeout'
--     for 14+ unique job IDs. This migration staggers every-N-minute jobs
--     across distinct minute offsets so minute :00 only handles the
--     daily-cron load.
--
--     Stagger plan (5-min cycle minute offsets 0..4 used by */5 jobs;
--     */10 jobs placed on minute offsets that fall in the lightest */5
--     buckets; */15 + */30 + hourly jobs placed on otherwise-unoccupied
--     minute offsets):
--       offset 0 (0,5,10,…)  device-control-check, outreach-expiry-janitor-5min
--       offset 1 (1,6,11,…)  confession-watcher-5min, autonomous-compliance-check
--       offset 2 (2,7,12,…)  surface-guarantor-5min, autonomous-execute-posts
--       offset 3 (3,8,13,…)  response-capture-5min
--                            + slip-cluster-detector (10-min, fires at 3,13,23…)
--                            + auto-healer (10-min, fires at 8,18,28…)
--       offset 4 (4,9,14,…)  force-processor-5min
--                            + deploy-health-monitor (10-min, fires at 9,19,29…)
--       15-min offsets:  6 handler-task-processor-run, 7 handler-enforcement,
--                       11 autonomous-quick-task-check, 12 meet-evidence,
--                       13 revenue-ai-queue, 14 mommy-ambient
--       30-min offsets: 15 handler-outreach-eval, 25 handler-calendar-enforce
--       hourly offsets: 17 handler-outreach-auto, 18 autonomous-hourly-analytics,
--                       19 autonomous-bleeding, 20 handler-commitment-enforce
--                       (existing: 12 bind-enforcer, 23 counter-escape,
--                                  47 self-improvement)
--     Daily collisions (two jobs sharing 'H 0' for some H) get spread by
--     pushing the second job to minute :05.
--
-- Idempotent: every job is unscheduled-then-rescheduled; jobs not listed
-- here are left alone.

-- ============================================
-- 0. Bootstrap — extensions must exist
-- ============================================

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    CREATE EXTENSION pg_cron;
  END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net') THEN
    CREATE EXTENSION pg_net;
  END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- ============================================
-- 1. Defensive sweep — drop ANY cron job whose command embeds
--    PLACEHOLDER_SERVICE_KEY. Catches source-tracked AND
--    dashboard-registered offenders.
-- ============================================

DO $$
DECLARE
  jrec RECORD;
BEGIN
  FOR jrec IN
    SELECT jobid, jobname, command FROM cron.job
    WHERE command ILIKE '%PLACEHOLDER_SERVICE_KEY%'
  LOOP
    PERFORM cron.unschedule(jrec.jobid);
    RAISE NOTICE '314: dropped placeholder-auth job % (id %)', jrec.jobname, jrec.jobid;
  END LOOP;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

-- ============================================
-- 2. Defensive sweep — drop any duplicate cron jobs that point at
--    the four edge functions whose logs still showed 401s. 313
--    correctly registered auto-healer-10min and
--    deploy-health-monitor-10min via invoke_edge_function(); if a
--    dashboard-registered duplicate exists with a different jobname
--    pointing at the same function, this drops it. Same for
--    mommy-praise and mommy-bedtime.
-- ============================================

DO $$
DECLARE
  jrec RECORD;
BEGIN
  FOR jrec IN
    SELECT jobid, jobname, command FROM cron.job
    WHERE jobname NOT IN (
      'auto-healer-10min',
      'deploy-health-monitor-10min',
      'mommy-praise-10min',
      'mommy-bedtime-daily-22'
    )
    AND (
      command ILIKE '%/functions/v1/auto-healer%'
      OR command ILIKE '%/functions/v1/deploy-health-monitor%'
      OR command ILIKE '%/functions/v1/mommy-praise%'
      OR command ILIKE '%/functions/v1/mommy-bedtime%'
    )
  LOOP
    PERFORM cron.unschedule(jrec.jobid);
    RAISE NOTICE '314: dropped duplicate-fn job % (id %)', jrec.jobname, jrec.jobid;
  END LOOP;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

-- ============================================
-- 3. Re-register the auth-broken jobs from migrations 213, 215
--    and the dashboard-registered mommy-praise / mommy-bedtime.
--    All use invoke_edge_function() so auth comes from app.settings.
-- ============================================

-- handler-self-audit-daily — was 'PLACEHOLDER' '0 5 * * *', collided with
-- handler-task-cleanup at the same time → move to :05 of hour 5.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'handler-self-audit-daily') THEN
    PERFORM cron.unschedule('handler-self-audit-daily');
  END IF;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$ BEGIN
  PERFORM cron.schedule(
    'handler-self-audit-daily',
    '5 5 * * *',
    $cmd$SELECT invoke_edge_function('handler-self-audit', '{}'::jsonb)$cmd$
  );
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

-- handler-outreach-auto-hourly — was '30 * * * *' (collided with
-- autonomous-hourly-analytics + handler-outreach-eval) → move to :17.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'handler-outreach-auto-hourly') THEN
    PERFORM cron.unschedule('handler-outreach-auto-hourly');
  END IF;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$ BEGIN
  PERFORM cron.schedule(
    'handler-outreach-auto-hourly',
    '17 * * * *',
    $cmd$SELECT invoke_edge_function('handler-outreach-auto', '{}'::jsonb)$cmd$
  );
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

-- content-generator-daily — was '0 3 * * *', single daily, no collision,
-- but had PLACEHOLDER auth.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'content-generator-daily') THEN
    PERFORM cron.unschedule('content-generator-daily');
  END IF;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$ BEGIN
  PERFORM cron.schedule(
    'content-generator-daily',
    '0 3 * * *',
    $cmd$SELECT invoke_edge_function('content-generator', '{}'::jsonb)$cmd$
  );
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

-- workout-prescriber-daily — was '0 11 * * *', collided with
-- autonomous-daily-cycle (also '0 11 * * *') → move to :05.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'workout-prescriber-daily') THEN
    PERFORM cron.unschedule('workout-prescriber-daily');
  END IF;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$ BEGIN
  PERFORM cron.schedule(
    'workout-prescriber-daily',
    '5 11 * * *',
    $cmd$SELECT invoke_edge_function('workout-prescriber', '{}'::jsonb)$cmd$
  );
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

-- mommy-praise — register fresh. Function expects ~10-min cadence; place
-- on the same lightly-loaded offset bucket as auto-healer/deploy-health.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'mommy-praise-10min') THEN
    PERFORM cron.unschedule('mommy-praise-10min');
  END IF;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$ BEGIN
  PERFORM cron.schedule(
    'mommy-praise-10min',
    '4-59/10 * * * *',  -- 4,14,24,34,44,54 — bucket-4 (light)
    $cmd$SELECT invoke_edge_function('mommy-praise', '{}'::jsonb)$cmd$
  );
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

-- mommy-bedtime — register fresh. Function expects 22:00 UTC daily.
-- Collides with nightly-sleep-prescription + wardrobe-expiry-daily at
-- '0 22 * * *' so push to :10.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'mommy-bedtime-daily-22') THEN
    PERFORM cron.unschedule('mommy-bedtime-daily-22');
  END IF;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$ BEGIN
  PERFORM cron.schedule(
    'mommy-bedtime-daily-22',
    '10 22 * * *',
    $cmd$SELECT invoke_edge_function('mommy-bedtime', '{}'::jsonb)$cmd$
  );
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

-- ============================================
-- 4. Stagger every-5-minute jobs across offsets 0..4. (Several were on
--    plain '*/5 * * * *' and all fired at minute 0 simultaneously.)
-- ============================================

-- device-control-check — was '*/5 * * * *' → keep at offset 0.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'device-control-check') THEN
    PERFORM cron.unschedule('device-control-check');
  END IF;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$ BEGIN
  PERFORM cron.schedule(
    'device-control-check',
    '0-59/5 * * * *',  -- offset 0
    $cmd$SELECT invoke_edge_function('device-control', '{"action":"check_schedule"}'::jsonb)$cmd$
  );
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

-- outreach-expiry-janitor-5min — was '*/5 * * * *' → offset 0 too
-- (different SQL — calls a local fn, not an edge function — so NO auth
-- needed; just re-register at the same minute).
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'outreach-expiry-janitor-5min') THEN
    PERFORM cron.unschedule('outreach-expiry-janitor-5min');
  END IF;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$ BEGIN
  PERFORM cron.schedule(
    'outreach-expiry-janitor-5min',
    '0-59/5 * * * *',
    $cmd$SELECT mark_expired_outreach()$cmd$
  );
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

-- autonomous-compliance-check — was '*/5 * * * *' → offset 1.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'autonomous-compliance-check') THEN
    PERFORM cron.unschedule('autonomous-compliance-check');
  END IF;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$ BEGIN
  PERFORM cron.schedule(
    'autonomous-compliance-check',
    '1-59/5 * * * *',
    $cmd$SELECT invoke_edge_function('handler-autonomous', '{"action":"compliance_check"}'::jsonb)$cmd$
  );
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

-- confession-watcher-5min — already at '1-59/5 * * * *'. Re-register to
-- normalize auth via invoke_edge_function (was inline).
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'confession-watcher-5min') THEN
    PERFORM cron.unschedule('confession-watcher-5min');
  END IF;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$ BEGIN
  PERFORM cron.schedule(
    'confession-watcher-5min',
    '1-59/5 * * * *',
    $cmd$SELECT invoke_edge_function('confession-watcher-cron', '{}'::jsonb)$cmd$
  );
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

-- surface-guarantor-5min — already at '2-59/5 * * * *'. Normalize.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'surface-guarantor-5min') THEN
    PERFORM cron.unschedule('surface-guarantor-5min');
  END IF;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$ BEGIN
  PERFORM cron.schedule(
    'surface-guarantor-5min',
    '2-59/5 * * * *',
    $cmd$SELECT invoke_edge_function('surface-guarantor-cron', '{}'::jsonb)$cmd$
  );
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

-- autonomous-execute-posts — was '2,7,12,17,22,27,32,37,42,47,52,57 * * * *'.
-- Normalize to '2-59/5 * * * *' and use helper.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'autonomous-execute-posts') THEN
    PERFORM cron.unschedule('autonomous-execute-posts');
  END IF;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$ BEGIN
  PERFORM cron.schedule(
    'autonomous-execute-posts',
    '2-59/5 * * * *',
    $cmd$SELECT invoke_edge_function('handler-platform', '{"action":"execute_posts"}'::jsonb)$cmd$
  );
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

-- response-capture-5min — was '*/5 * * * *' → offset 3.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'response-capture-5min') THEN
    PERFORM cron.unschedule('response-capture-5min');
  END IF;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$ BEGIN
  PERFORM cron.schedule(
    'response-capture-5min',
    '3-59/5 * * * *',
    $cmd$SELECT invoke_edge_function('response-capture-cron', '{}'::jsonb)$cmd$
  );
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

-- force-processor-5min — was '*/5 * * * *' → offset 4.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'force-processor-5min') THEN
    PERFORM cron.unschedule('force-processor-5min');
  END IF;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$ BEGIN
  PERFORM cron.schedule(
    'force-processor-5min',
    '4-59/5 * * * *',
    $cmd$SELECT invoke_edge_function('force-processor', '{}'::jsonb)$cmd$
  );
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

-- ============================================
-- 5. Stagger every-10-minute jobs onto offsets 3, 8, 9 (which fall in
--    the lighter */5 buckets 3 and 4).
-- ============================================

-- auto-healer-10min — was '*/10 * * * *' → offset 8 (bucket-3 minute 8,18,…)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'auto-healer-10min') THEN
    PERFORM cron.unschedule('auto-healer-10min');
  END IF;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$ BEGIN
  PERFORM cron.schedule(
    'auto-healer-10min',
    '8-59/10 * * * *',
    $cmd$SELECT invoke_edge_function('auto-healer', '{}'::jsonb)$cmd$
  );
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

-- deploy-health-monitor-10min — was '*/10 * * * *' (collided with
-- auto-healer at minute 0) → offset 9.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'deploy-health-monitor-10min') THEN
    PERFORM cron.unschedule('deploy-health-monitor-10min');
  END IF;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$ BEGIN
  PERFORM cron.schedule(
    'deploy-health-monitor-10min',
    '9-59/10 * * * *',
    $cmd$SELECT invoke_edge_function('deploy-health-monitor', '{}'::jsonb)$cmd$
  );
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

-- slip-cluster-detector-10min — was '4-59/10 * * * *' → offset 3 (move
-- off bucket-4 since force-processor is there now).
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'slip-cluster-detector-10min') THEN
    PERFORM cron.unschedule('slip-cluster-detector-10min');
  END IF;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$ BEGIN
  PERFORM cron.schedule(
    'slip-cluster-detector-10min',
    '3-59/10 * * * *',
    $cmd$SELECT invoke_edge_function('slip-cluster-detector', '{}'::jsonb)$cmd$
  );
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

-- ============================================
-- 6. Stagger every-15-minute jobs across offsets 6, 7, 11, 12, 13, 14.
--    (Avoid 0..4 since those are saturated by */5 jobs.)
-- ============================================

-- handler-task-processor-run — was '*/15' → offset 6.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'handler-task-processor-run') THEN
    PERFORM cron.unschedule('handler-task-processor-run');
  END IF;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$ BEGIN
  PERFORM cron.schedule(
    'handler-task-processor-run',
    '6-59/15 * * * *',
    $cmd$SELECT invoke_edge_function('handler-task-processor', '{}'::jsonb)$cmd$
  );
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

-- handler-enforcement-processor — was '7,22,37,52 * * * *' → keep at 7
-- but normalize to '7-59/15' format, route via helper.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'handler-enforcement-processor') THEN
    PERFORM cron.unschedule('handler-enforcement-processor');
  END IF;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$ BEGIN
  PERFORM cron.schedule(
    'handler-enforcement-processor',
    '7-59/15 * * * *',
    $cmd$SELECT invoke_edge_function('handler-enforcement', '{}'::jsonb)$cmd$
  );
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

-- autonomous-quick-task-check — was '*/15' → offset 11.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'autonomous-quick-task-check') THEN
    PERFORM cron.unschedule('autonomous-quick-task-check');
  END IF;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$ BEGIN
  PERFORM cron.schedule(
    'autonomous-quick-task-check',
    '11-59/15 * * * *',
    $cmd$SELECT invoke_edge_function('handler-autonomous', '{"action":"quick_task_check"}'::jsonb)$cmd$
  );
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

-- meet-evidence-cron-15min — was '*/15' → offset 12.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'meet-evidence-cron-15min') THEN
    PERFORM cron.unschedule('meet-evidence-cron-15min');
  END IF;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$ BEGIN
  PERFORM cron.schedule(
    'meet-evidence-cron-15min',
    '12-59/15 * * * *',
    $cmd$SELECT invoke_edge_function('meet-evidence-cron', '{}'::jsonb)$cmd$
  );
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

-- revenue-ai-queue — was '*/15' → offset 13.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'revenue-ai-queue') THEN
    PERFORM cron.unschedule('revenue-ai-queue');
  END IF;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$ BEGIN
  PERFORM cron.schedule(
    'revenue-ai-queue',
    '13-59/15 * * * *',
    $cmd$SELECT invoke_edge_function('handler-revenue', '{"action":"process_ai_queue"}'::jsonb)$cmd$
  );
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

-- mommy-ambient-15min — was '*/15'. Function reads source_key built from
-- now() — keep that body intact.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'mommy-ambient-15min') THEN
    PERFORM cron.unschedule('mommy-ambient-15min');
  END IF;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$ BEGIN
  PERFORM cron.schedule(
    'mommy-ambient-15min',
    '14-59/15 * * * *',
    $cmd$
      SELECT invoke_edge_function(
        'mommy-fast-react',
        jsonb_build_object(
          'event_kind', 'ambient_check',
          'source_key', 'ambient:' || to_char(now(), 'YYYY-MM-DD"T"HH24":"') || lpad((extract(minute from now())::int / 15 * 15)::text, 2, '0'),
          'context', jsonb_build_object('cron_tick_at', now())
        )
      )
    $cmd$
  );
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

-- ============================================
-- 7. Stagger every-30-minute jobs onto offsets 15 and 25.
-- ============================================

-- handler-outreach-eval — was '*/30 * * * *' → offset 15.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'handler-outreach-eval') THEN
    PERFORM cron.unschedule('handler-outreach-eval');
  END IF;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$ BEGIN
  PERFORM cron.schedule(
    'handler-outreach-eval',
    '15-59/30 * * * *',
    $cmd$SELECT invoke_edge_function('handler-outreach', '{"action":"evaluate_outreach"}'::jsonb)$cmd$
  );
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

-- handler-calendar-enforce — was '*/30 * * * *' → offset 25.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'handler-calendar-enforce') THEN
    PERFORM cron.unschedule('handler-calendar-enforce');
  END IF;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$ BEGIN
  PERFORM cron.schedule(
    'handler-calendar-enforce',
    '25-59/30 * * * *',
    $cmd$SELECT invoke_edge_function('handler-calendar', '{"action":"enforce"}'::jsonb)$cmd$
  );
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

-- ============================================
-- 8. Stagger hourly '0 * * * *' jobs off minute :00.
-- ============================================

-- autonomous-bleeding-process — was '0 * * * *' → :19.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'autonomous-bleeding-process') THEN
    PERFORM cron.unschedule('autonomous-bleeding-process');
  END IF;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$ BEGIN
  PERFORM cron.schedule(
    'autonomous-bleeding-process',
    '19 * * * *',
    $cmd$SELECT invoke_edge_function('handler-autonomous', '{"action":"bleeding_process"}'::jsonb)$cmd$
  );
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

-- handler-commitment-enforce — was '0 * * * *' → :20.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'handler-commitment-enforce') THEN
    PERFORM cron.unschedule('handler-commitment-enforce');
  END IF;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$ BEGIN
  PERFORM cron.schedule(
    'handler-commitment-enforce',
    '20 * * * *',
    $cmd$SELECT invoke_edge_function('handler-commitment', '{"action":"advance_states"}'::jsonb)$cmd$
  );
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

-- autonomous-hourly-analytics — was '30 * * * *' (collided with
-- handler-outreach-eval, handler-outreach-auto-hourly) → :18.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'autonomous-hourly-analytics') THEN
    PERFORM cron.unschedule('autonomous-hourly-analytics');
  END IF;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$ BEGIN
  PERFORM cron.schedule(
    'autonomous-hourly-analytics',
    '18 * * * *',
    $cmd$SELECT invoke_edge_function('handler-autonomous', '{"action":"hourly_analytics"}'::jsonb)$cmd$
  );
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

-- ============================================
-- 9. Spread daily-cron collisions where two jobs shared 'H 0' for some H.
--    Only the SECOND job in each pair is moved; the first stays at :00.
-- ============================================

-- 7 UTC: revenue-gfe-morning ('0 7') stays; voice-pitch-watcher → :05.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'voice-pitch-watcher-daily-7am') THEN
    PERFORM cron.unschedule('voice-pitch-watcher-daily-7am');
  END IF;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$ BEGIN
  PERFORM cron.schedule(
    'voice-pitch-watcher-daily-7am',
    '5 7 * * *',
    $cmd$SELECT invoke_edge_function('voice-pitch-watcher', '{}'::jsonb)$cmd$
  );
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

-- 21 UTC: revenue-gfe-evening ('0 21') stays; daily-posthypnotic-check → :05.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'daily-posthypnotic-check') THEN
    PERFORM cron.unschedule('daily-posthypnotic-check');
  END IF;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$ BEGIN
  PERFORM cron.schedule(
    'daily-posthypnotic-check',
    '5 21 * * *',
    $cmd$SELECT invoke_edge_function('conditioning-engine', '{"action":"check_posthypnotic_activations"}'::jsonb)$cmd$
  );
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

-- 22 UTC: nightly-sleep-prescription ('0 22') stays; wardrobe-expiry → :15
-- (already scheduled at 0 22 by 312, mommy-bedtime now at :10, so :15).
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'wardrobe-expiry-daily') THEN
    PERFORM cron.unschedule('wardrobe-expiry-daily');
  END IF;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$ BEGIN
  PERFORM cron.schedule(
    'wardrobe-expiry-daily',
    '15 22 * * *',
    $cmd$SELECT invoke_edge_function('wardrobe-prescription-expiry', '{}'::jsonb)$cmd$
  );
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

-- Sun 3 UTC: handler-weekly-analysis ('0 3 * * 0') stays;
-- handler-memory-consolidation → :05.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'handler-memory-consolidation') THEN
    PERFORM cron.unschedule('handler-memory-consolidation');
  END IF;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$ BEGIN
  PERFORM cron.schedule(
    'handler-memory-consolidation',
    '5 3 * * 0',
    $cmd$SELECT invoke_edge_function('handler-memory', '{"action":"consolidate"}'::jsonb)$cmd$
  );
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

-- Sun 9 UTC: hrt-booking-daily-9am ('0 9' daily) stays;
-- disclosure-rehearsal-sunday-9am ('0 9 * * 0') → :05.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'disclosure-rehearsal-sunday-9am') THEN
    PERFORM cron.unschedule('disclosure-rehearsal-sunday-9am');
  END IF;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$ BEGIN
  PERFORM cron.schedule(
    'disclosure-rehearsal-sunday-9am',
    '5 9 * * 0',
    $cmd$SELECT invoke_edge_function('mommy-disclosure-rehearsal', '{}'::jsonb)$cmd$
  );
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

-- Sun 0 UTC: revenue-daily-batch ('0 0') stays;
-- weekly-hidden-increment ('0 0 * * 0') → :05.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'weekly-hidden-increment') THEN
    PERFORM cron.unschedule('weekly-hidden-increment');
  END IF;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$ BEGIN
  PERFORM cron.schedule(
    'weekly-hidden-increment',
    '5 0 * * 0',
    $cmd$SELECT invoke_edge_function('conditioning-engine', '{"action":"increment_hidden_parameters"}'::jsonb)$cmd$
  );
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

NOTIFY pgrst, 'reload schema';
