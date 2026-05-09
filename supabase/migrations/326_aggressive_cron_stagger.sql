-- 326_aggressive_cron_stagger.sql
-- 2026-05-08 — Third cron-relief pass. Pool still exhausted.
--
-- Symptom: 18 of 27 cron runs in last 30 min failed with `job startup
-- timeout` even after 317 + 318 reduced volume.
--
-- Root cause: cron.use_background_workers = off (cannot be flipped without
-- a Supabase support ticket — superuser-only). Each cron job opens a fresh
-- libpq connection. When N jobs fire on the same minute boundary the auth
-- handshake queue exceeds the timeout. Two specific minute-of-hour slots
-- still concentrate failures:
--
--   :00 — send-notifications-every-minute (*/5) +
--          web-push-dispatch-minute (*/5) + every hourly-at-:00 cohort
--          + every daily-at-H:00 (system_invariants_watchdog and friends)
--   :09 — deploy-health-monitor-10min on offset 9; previously safe but
--          adjacent to :08 (auto-healer) → handshake queue carries over.
--
-- Three relief levers in this migration:
--
--   A) Push the two */5 notifier crons OFF minute :00 onto sparse lanes
--      that don't overlap each other or the */10 jobs:
--        send-notifications  → 2-59/5 (fires :02,07,12,17,22,27,32,37,42,47,52,57)
--        web-push-dispatch   → 1-59/5 (fires :01,06,11,16,21,26,31,36,41,46,51,56)
--      Both keep their 5-minute cadence; web-push stays real-time. Lane
--      analysis: at every fire time the slot has at most 1 hourly job
--      already scheduled, so peak is 2 jobs / minute. Neither lane touches
--      the */10 offsets (3, 4, 8, 9) so auto-healer / mommy-praise /
--      deploy-health-monitor / slip-cluster-detector are isolated.
--
--   B) Resolve the 2+ hourly-job collisions left over from 317+318:
--        :17 — autonomous-compliance-check + handler-outreach-auto-hourly
--              → move handler-outreach-auto-hourly to :47 (empty)
--        :23 — mommy-tease-engine + predictive_defection_lockdown
--              → move predictive_defection_lockdown to :49 (empty)
--        :26 — meet-evidence-cron-15min + defection_sanctuary_amplification
--              → move defection_sanctuary_amplification to :53 (empty)
--      In each case the mommy-* / handler-* / evidence job stays put and
--      the analytics/lockdown job moves — protects user-facing cadence.
--
--   C) Pause seven hourly jobs that dominate the failure list AND can
--      lapse 24h without protocol regression. Each job is unscheduled
--      (cron.unschedule); audit row recorded in cron_paused_during_emergency
--      so a future migration can replay the schedule once the support
--      ticket lands and cron.use_background_workers = on.
--
-- Hard-rule whitelist (NEVER changed by this migration):
--   * auto-healer-10min, deploy-health-monitor-10min, mommy-praise-10min
--     (infra/arousal — must keep 10-min cadence)
--   * mommy-mantra-*, mommy-touch-*  (real experience drivers)
--   * mark_expired_outreach (the local SQL fn — already hourly, cheap)
--   * web-push-dispatch lane is RE-STAGGERED, NOT paused — still real-time
--
-- Sibling: 314 (cron auth + initial stagger), 317 (emergency relief),
-- 318 (1-2 user right-size), this 326 (peak-collision elimination).
-- If failure rate stays > 10% after this migration the next move is the
-- Supabase support ticket to enable cron.use_background_workers.
--
-- Idempotent: every cron.alter_job is no-op if job already on target
-- schedule; every cron.unschedule is wrapped in EXCEPTION handler so
-- replay does not error if a job was already paused.

-- ============================================
-- A) Re-stagger the two */5 notifier crons off minute :00
-- ============================================

-- send-notifications-every-minute: */5 (hits :00) → 2-59/5 (avoids :00,03,04,08,09)
DO $$ BEGIN
  PERFORM cron.alter_job(
    job_id   := (SELECT jobid FROM cron.job WHERE jobname = 'send-notifications-every-minute'),
    schedule := '2-59/5 * * * *'
  );
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE '326: send-notifications-every-minute alter skipped: %', SQLERRM;
END $$;

-- web-push-dispatch-minute: */5 (hits :00) → 1-59/5 (avoids :00,03,04,08,09)
DO $$ BEGIN
  PERFORM cron.alter_job(
    job_id   := (SELECT jobid FROM cron.job WHERE jobname = 'web-push-dispatch-minute'),
    schedule := '1-59/5 * * * *'
  );
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE '326: web-push-dispatch-minute alter skipped: %', SQLERRM;
END $$;

-- ============================================
-- B) Resolve 2+ hourly-job collisions
-- ============================================

-- :17 collision — handler-outreach-auto-hourly → :47
DO $$ BEGIN
  PERFORM cron.alter_job(
    job_id   := (SELECT jobid FROM cron.job WHERE jobname = 'handler-outreach-auto-hourly'),
    schedule := '47 * * * *'
  );
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE '326: handler-outreach-auto-hourly alter skipped: %', SQLERRM;
END $$;

-- :23 collision — predictive_defection_lockdown → :49
DO $$ BEGIN
  PERFORM cron.alter_job(
    job_id   := (SELECT jobid FROM cron.job WHERE jobname = 'predictive_defection_lockdown'),
    schedule := '49 * * * *'
  );
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE '326: predictive_defection_lockdown alter skipped: %', SQLERRM;
END $$;

-- :26 collision — defection_sanctuary_amplification → :53
DO $$ BEGIN
  PERFORM cron.alter_job(
    job_id   := (SELECT jobid FROM cron.job WHERE jobname = 'defection_sanctuary_amplification'),
    schedule := '53 * * * *'
  );
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE '326: defection_sanctuary_amplification alter skipped: %', SQLERRM;
END $$;

-- ============================================
-- C) Pause non-critical hourly jobs from the failure list
-- ============================================

DO $$
DECLARE
  job_to_pause TEXT;
  pause_targets TEXT[] := ARRAY[
    'night-block-execution',           -- nightly enforcement, can lapse 24h
    'mommy-ambient-15min',             -- ambient checks, low-stakes
    'mommy-recall-surprise',           -- engagement, recoverable
    'held_evidence_surfacing_engine',  -- 317 reduced; still failing
    'anti_procrastination_shame',      -- 317 reduced; still failing
    'sanctuary_delivery_regression',   -- 317 reduced; still failing
    'receptive_window_classifier'      -- 318 reduced; still failing
  ];
BEGIN
  FOREACH job_to_pause IN ARRAY pause_targets
  LOOP
    BEGIN
      PERFORM cron.unschedule(job_to_pause);
      RAISE NOTICE '326: paused %', job_to_pause;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE '326: skip % (already absent or error): %', job_to_pause, SQLERRM;
    END;
  END LOOP;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

-- ============================================
-- D) Extend cron_paused_during_emergency view with 326 entries.
--    Preserves 317 + 318 history verbatim and appends 326 changes.
-- ============================================

DROP VIEW IF EXISTS public.cron_paused_during_emergency;

CREATE VIEW public.cron_paused_during_emergency AS
SELECT
  effective_date::date,
  migration,
  change_type,
  jobname,
  old_schedule,
  new_schedule,
  reason
FROM (VALUES
  -- ---- Migration 317 ----
  ('2026-04-30', '317', 'unscheduled', 'auto-healer-10m',                  '*/10 * * * *',                 NULL,                  'duplicate of auto-healer-10min (mig 314 staggered)'),
  ('2026-04-30', '317', 'unscheduled', 'deploy-health-monitor-10m',        '*/10 * * * *',                 NULL,                  'duplicate of deploy-health-monitor-10min (mig 314 staggered)'),
  ('2026-04-30', '317', 'unscheduled', 'mommy-praise-burst',               '*/10 * * * *',                 NULL,                  'duplicate of mommy-praise-10min (mig 314 staggered)'),
  ('2026-04-30', '317', 'unscheduled', 'mommy-bedtime-goodnight',          '0 22 * * *',                   NULL,                  'duplicate of mommy-bedtime-daily-22'),
  -- ---- Migration 318 (1-2 user right-size) ----
  ('2026-04-30', '318', 'reduced',     'send-notifications-every-minute',  '* * * * *',                    '*/5 * * * *',         '1-2 users; minute polling not justified'),
  ('2026-04-30', '318', 'reduced',     'web-push-dispatch-minute',         '* * * * *',                    '*/5 * * * *',         '1-2 users; minute polling not justified'),
  ('2026-04-30', '318', 'reduced',     'execute-directives',               '3-59/5 * * * *',               '3 * * * *',           '1-user batch; hourly is plenty'),
  ('2026-04-30', '318', 'reduced',     'process-device-schedule',          '2-59/5 * * * *',               '7 * * * *',           '1-user batch; hourly'),
  ('2026-04-30', '318', 'reduced',     'device-control-check',             '0-59/5 * * * *',               '12 * * * *',          '1-user batch; hourly'),
  ('2026-04-30', '318', 'reduced',     'autonomous-compliance-check',      '1-59/5 * * * *',               '17 * * * *',          '1-user batch; hourly'),
  ('2026-04-30', '318', 'reduced',     'confession-watcher-5min',          '1-59/5 * * * *',               '22 * * * *',          '1-user batch; hourly'),
  ('2026-04-30', '318', 'reduced',     'surface-guarantor-5min',           '2-59/5 * * * *',               '27 * * * *',          '1-user batch; hourly'),
  ('2026-04-30', '318', 'reduced',     'autonomous-execute-posts',         '2-59/5 * * * *',               '32 * * * *',          '1-user batch; hourly'),
  ('2026-04-30', '318', 'reduced',     'response-capture-5min',            '3-59/5 * * * *',               '37 * * * *',          '1-user batch; hourly'),
  ('2026-04-30', '318', 'reduced',     'force-processor-5min',             '4-59/5 * * * *',               '42 * * * *',          '1-user batch; hourly'),
  ('2026-04-30', '318', 'reduced',     'slip-cluster-detector-10min',      '3-59/10 * * * *',              '13,43 * * * *',       '1-user; every 30 min plenty'),
  ('2026-04-30', '318', 'reduced',     'handler-task-processor-run',       '6-59/15 * * * *',              '6 * * * *',           'task processor; hourly'),
  ('2026-04-30', '318', 'reduced',     'handler-enforcement-processor',    '7-59/15 * * * *',              '11 * * * *',          'enforcement; hourly'),
  ('2026-04-30', '318', 'reduced',     'autonomous-quick-task-check',      '11-59/15 * * * *',             '21 * * * *',          'quick check; hourly'),
  ('2026-04-30', '318', 'reduced',     'meet-evidence-cron-15min',         '12-59/15 * * * *',             '26 * * * *',          'evidence cron; hourly'),
  ('2026-04-30', '318', 'reduced',     'revenue-ai-queue',                 '13-59/15 * * * *',             '31 * * * *',          'AI queue; hourly'),
  ('2026-04-30', '318', 'reduced',     'mommy-ambient-15min',              '14-59/15 * * * *',             '46 * * * *',          'ambient; hourly'),
  ('2026-04-30', '318', 'reduced',     'outreach-expiry-janitor-5min',     '0-59/15 * * * *',              '51 * * * *',          'mark_expired_outreach; hourly'),
  ('2026-04-30', '318', 'reduced',     'receptive_window_auto_content',    '*/20 * * * *',                 '56 * * * *',          'auto-content; hourly'),
  ('2026-04-30', '318', 'reduced',     'system_invariants_watchdog',       '*/30 * * * *',                 '0 * * * *',           'watchdog; hourly'),
  ('2026-04-30', '318', 'reduced',     'david_suppression_watchdog',       '1-59/30 * * * *',              '1 * * * *',           'watchdog; hourly'),
  ('2026-04-30', '318', 'reduced',     'v31_freshness_watchdog',           '2-59/30 * * * *',              '2 * * * *',           'watchdog; hourly'),
  ('2026-04-30', '318', 'reduced',     'body_evidence_freshness_watchdog', '6-59/30 * * * *',              '4 * * * *',           'watchdog; hourly'),
  ('2026-04-30', '318', 'reduced',     'receptive_window_classifier',      '4-59/30 * * * *',              '8 * * * *',           'classifier; hourly'),
  ('2026-04-30', '318', 'reduced',     'confession_debt_enforcement',      '*/30 * * * *',                 '14 * * * *',          'enforcement; hourly'),
  ('2026-04-30', '318', 'reduced',     'witness_defection_alerts',         '*/30 * * * *',                 '19 * * * *',          'alerts; hourly'),
  ('2026-04-30', '318', 'reduced',     'handler-outreach-eval',            '15-59/30 * * * *',             '24 * * * *',          'outreach eval; hourly'),
  ('2026-04-30', '318', 'reduced',     'handler-calendar-enforce',         '25-59/30 * * * *',             '29 * * * *',          'calendar enforce; hourly'),
  ('2026-04-30', '318', 'reduced',     'compute_daily_compliance_score',   '0 * * * *',                    '15 5 * * *',          '"daily" compliance; daily'),
  ('2026-04-30', '318', 'reduced',     'mommy-gaslight-6h',                '7 */6 * * *',                  '7 11 * * *',          'gaslight; daily'),
  ('2026-04-30', '318', 'reduced',     'auto-loophole-closer-4h',          '47 */4 * * *',                 '47 6 * * *',          'loophole closer; daily'),
  ('2026-04-30', '318', 'reduced',     'persona-shift-auto-4h',            '37 */4 * * *',                 '37 12 * * *',         'persona shift; daily'),
  ('2026-04-30', '318', 'reduced',     'slip_cluster_intervention',        '17 7,11,15,19,23 * * *',       '17 19 * * *',         '5x daily -> 1x daily'),
  ('2026-04-30', '318', 'reduced',     'revenue-engagement',               '0 */3 * * *',                  '0 9 * * *',           'revenue engagement; daily'),
  ('2026-04-30', '318', 'reduced',     'sanctuary_baseline_delivery',      '13 7,9,11,13,15,17,19,21 * * *', '13 13 * * *',       '8x daily -> 1x daily'),
  ('2026-04-30', '318', 'reduced',     'today-ui-audit-6h',                '37 */6 * * *',                 '37 5 * * *',          'UI audit; daily'),
  ('2026-04-30', '318', 'reduced',     'autonomous-hourly-analytics',      '18 * * * *',                   '18 0,6,12,18 * * *',  'analytics; 4x daily'),
  ('2026-04-30', '318', 'reduced',     'leak-pattern-extractor-hourly',    '7 * * * *',                    '7 4 * * *',           'leak pattern; daily'),
  ('2026-04-30', '318', 'reduced',     'hourly-compliance-check',          '0 * * * *',                    '0 0,6,12,18 * * *',   'compliance check; 4x daily'),
  ('2026-04-30', '318', 'reduced',     'hrt_advance_pressure',             '53 6,18 * * *',                '53 18 * * *',         '2x daily -> 1x daily'),
  ('2026-04-30', '318', 'reduced',     'voice_cadence_watchdog',           '8 8,14,20 * * *',              '8 14 * * *',          '3x daily -> 1x daily'),
  ('2026-04-30', '318', 'increased',   'mommy-tease-engine',               '23 */6 * * *',                 '23 * * * *',          'over-reduced in 317; user wants hourly'),
  ('2026-04-30', '318', 'increased',   'mommy-recall-surprise',            '42 */6 * * *',                 '42 * * * *',          'over-reduced in 317; user wants hourly'),
  ('2026-04-30', '318', 'increased',   'mommy-touch-cycle',                '17 */6 * * *',                 '17 */3 * * *',        'user said keep frequent'),
  ('2026-04-30', '318', 'reduced',     'streak_break_recovery',            '34 */6 * * *',                 '34 7 * * *',          'recovery cycle; daily'),
  ('2026-04-30', '318', 'reduced',     'content-generator-daily',          '0 3 * * *',                    '0 3 * * 1',           'content for 1-user; weekly'),
  ('2026-04-30', '318', 'reduced',     'witness-fabrication-daily',        '11 6 * * *',                   '11 6 * * 1',          'fabrication for 1-user; weekly'),
  ('2026-04-30', '318', 'reduced',     'cross-platform-consistency-daily', '11 7 * * *',                   '11 7 * * 1',          'consistency for 1-user; weekly'),
  ('2026-04-30', '318', 'reduced',     'loophole-hunter-daily',            '23 11 * * *',                  '23 11 * * 1',         'loophole hunter; weekly'),
  ('2026-04-30', '318', 'reduced',     'mommy-mood-daily',                 '0 11 * * *',                   '0 11 * * 1',          'mood for 1-user; weekly'),
  ('2026-04-30', '318', 'reduced',     'mommy-mantra-daily',               '0 13 * * *',                   '0 13 * * 1',          'mantra for 1-user; weekly'),
  -- ---- Migration 326 (peak-collision elimination 2026-05-08) ----
  ('2026-05-08', '326', 'reduced',     'send-notifications-every-minute',  '*/5 * * * *',                  '2-59/5 * * * *',      'shift off :00 high-collision lane; avoid */10 offsets'),
  ('2026-05-08', '326', 'reduced',     'web-push-dispatch-minute',         '*/5 * * * *',                  '1-59/5 * * * *',      'shift off :00 (kept 5-min real-time); avoid */10 offsets'),
  ('2026-05-08', '326', 'reduced',     'handler-outreach-auto-hourly',     '17 * * * *',                   '47 * * * *',          'resolve :17 collision (autonomous-compliance-check stays)'),
  ('2026-05-08', '326', 'reduced',     'predictive_defection_lockdown',    '23 * * * *',                   '49 * * * *',          'resolve :23 collision (mommy-tease-engine stays)'),
  ('2026-05-08', '326', 'reduced',     'defection_sanctuary_amplification','26 * * * *',                   '53 * * * *',          'resolve :26 collision (meet-evidence-cron-15min stays)'),
  ('2026-05-08', '326', 'unscheduled', 'night-block-execution',            'unknown',                      NULL,                  'failing in last 30 min; nightly enforcement; can lapse 24h'),
  ('2026-05-08', '326', 'unscheduled', 'mommy-ambient-15min',              '46 * * * *',                   NULL,                  'failing; ambient low-stakes; can lapse 24h'),
  ('2026-05-08', '326', 'unscheduled', 'mommy-recall-surprise',            '42 * * * *',                   NULL,                  'failing; recoverable engagement; can lapse 24h'),
  ('2026-05-08', '326', 'unscheduled', 'held_evidence_surfacing_engine',   '8 * * * *',                    NULL,                  'failing; surfacing engine can lapse 24h'),
  ('2026-05-08', '326', 'unscheduled', 'anti_procrastination_shame',       '11 * * * *',                   NULL,                  'failing; shame cycle can lapse 24h'),
  ('2026-05-08', '326', 'unscheduled', 'sanctuary_delivery_regression',    '11 * * * *',                   NULL,                  'failing; sanctuary regression can lapse 24h'),
  ('2026-05-08', '326', 'unscheduled', 'receptive_window_classifier',      '8 * * * *',                    NULL,                  'failing; classifier can lapse 24h')
) AS t(effective_date, migration, change_type, jobname, old_schedule, new_schedule, reason);

COMMENT ON VIEW public.cron_paused_during_emergency IS
  'Cron emergency-relief audit (mig 317 + 318 + 326). Replay paused/reduced jobs by reading old_schedule and applying via cron.alter_job once cron.use_background_workers = on (Supabase support ticket required).';

NOTIFY pgrst, 'reload schema';
