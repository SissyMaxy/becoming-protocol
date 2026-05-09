-- 329_drastic_cron_prune.sql
-- 2026-05-09 — Drastic prune to right-size pg_cron volume for the actual
-- 1-2 user deployment under tier compute limits.
--
-- Symptom (2026-05-09):
--   * 142 active cron jobs registered.
--   * 83% failure rate over the last 15 minutes; 19 of 20 failures are
--     `job startup timeout`.
--   * cron.use_background_workers = off, max_worker_processes = 6,
--     max_connections = 60. Pro plan upgrade did not change compute defaults.
--   * Architecturally, jobs collide on minute boundaries faster than the
--     6-worker libpq pool can handshake them.
--
-- The Supabase support ticket to enable cron.use_background_workers cannot
-- be filed; the user is not paying for a compute upgrade. So we right-size
-- aggressively: keep only the loops that monitor the system and the surfaces
-- the user actually sees in real time. Everything else is paused
-- (reversibly, with full original schedule + command captured) until either
-- user count grows or compute increases.
--
-- Hard rule whitelist — NEVER paused by this or any future emergency-prune
-- migration (the loop that monitors itself + the arousal-trigger loop):
--   * auto-healer-10min
--   * deploy-health-monitor-10min
--   * mommy-praise-10min
--
-- Plan:
--   A) Convert public.cron_paused_during_emergency from VIEW → TABLE so the
--      dynamic mass-prune can capture jobname + schedule + command for jobs
--      the migration does not enumerate by name. (View was static VALUES;
--      table lets us INSERT arbitrary rows.) Backfill 317/318/326 history.
--   B) Mass-prune: for every active cron NOT in the protected_names array,
--      capture (jobname, schedule, command) into the audit table, then
--      cron.unschedule. Idempotent — replay no-ops on rows already gone.
--   C) Re-stagger surviving jobs onto unique minute offsets that don't
--      collide with the */5 notifier lanes (1-59/5 web-push,
--      2-59/5 send-notifications) or the */10 infra lanes (mommy-praise :4,
--      auto-healer :8, deploy-health :9 + the same offsets every 10 min).
--      Restore mommy-mantra-daily and mommy-mood-daily from weekly (318)
--      back to daily — user-facing experience drivers. Move
--      wardrobe-expiry-daily off :22:00 to clear collision with
--      mommy-bedtime-daily-22.
--
-- Critical core kept active (target: 20-25 total jobs):
--   10-min loops:  auto-healer / deploy-health-monitor / mommy-praise
--   5-min push:    send-notifications-every-minute (2-59/5),
--                  web-push-dispatch-minute (1-59/5)
--   Hourly maint:  outreach-expiry-janitor-5min (mark_expired_outreach @ :51),
--                  prune_cron_run_details_hourly (@ :47)
--   3-hour:        mommy-touch-cycle (17 */3)
--   Daily:         mommy-mantra-daily (5 13), mommy-mood-daily (5 11),
--                  compute_daily_compliance_score (15 5),
--                  mommy-bedtime-daily-22 (0 22),
--                  wardrobe-expiry-daily (10 23 — moved off 22:00),
--                  calendar-sync-daily (15 4),
--                  calendar-place-rituals-daily (30 4),
--                  capability-digest-daily-7am30 (30 7),
--                  handler-self-audit-daily (5 6),
--                  workout-prescriber-daily (10 7),
--                  prune_perf_log_tables_daily (13 4)
--   Weekly:        content-generator-daily, witness-fabrication-daily,
--                  cross-platform-consistency-daily, loophole-hunter-daily,
--                  disclosure-rehearsal-sunday-9am (kept at weekly)
--
-- Replay (operator runbook): the audit table records every paused job's
-- jobname + old_schedule + command. To restore one:
--   SELECT cron.schedule(jobname, old_schedule, command)
--   FROM public.cron_paused_during_emergency
--   WHERE jobname = '<job-to-restore>'
--   ORDER BY created_at DESC LIMIT 1;
-- (Or restore in batches by migration: WHERE migration = '329'.)

-- ============================================================
-- A) Convert audit view → table; preserve 317/318/326 history.
-- ============================================================

DROP VIEW IF EXISTS public.cron_paused_during_emergency;

CREATE TABLE IF NOT EXISTS public.cron_paused_during_emergency (
  id              bigserial PRIMARY KEY,
  effective_date  date        NOT NULL,
  migration       text        NOT NULL,
  change_type     text        NOT NULL CHECK (change_type IN ('unscheduled','reduced','increased')),
  jobname         text        NOT NULL,
  old_schedule    text,
  new_schedule    text,
  command         text,
  reason          text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS cron_paused_during_emergency_jobname_idx
  ON public.cron_paused_during_emergency (jobname);
CREATE INDEX IF NOT EXISTS cron_paused_during_emergency_migration_idx
  ON public.cron_paused_during_emergency (migration);
-- One row per (migration, jobname). Lets us use ON CONFLICT DO NOTHING for
-- idempotent INSERT on replay.
CREATE UNIQUE INDEX IF NOT EXISTS cron_paused_during_emergency_mig_job_uniq
  ON public.cron_paused_during_emergency (migration, jobname);

COMMENT ON TABLE public.cron_paused_during_emergency IS
  'Cron emergency-relief audit (mig 317/318/326/329). Replay paused jobs with cron.schedule(jobname, old_schedule, command).';

-- Backfill 317 + 318 + 326 history (idempotent: skipped if any of those
-- migrations already populated).
INSERT INTO public.cron_paused_during_emergency
  (effective_date, migration, change_type, jobname, old_schedule, new_schedule, command, reason)
SELECT * FROM (VALUES
  -- ---- Migration 317 ----
  ('2026-04-30'::date, '317', 'unscheduled', 'auto-healer-10m',                  '*/10 * * * *',                 NULL,                   NULL, 'duplicate of auto-healer-10min (mig 314 staggered)'),
  ('2026-04-30'::date, '317', 'unscheduled', 'deploy-health-monitor-10m',        '*/10 * * * *',                 NULL,                   NULL, 'duplicate of deploy-health-monitor-10min (mig 314 staggered)'),
  ('2026-04-30'::date, '317', 'unscheduled', 'mommy-praise-burst',               '*/10 * * * *',                 NULL,                   NULL, 'duplicate of mommy-praise-10min (mig 314 staggered)'),
  ('2026-04-30'::date, '317', 'unscheduled', 'mommy-bedtime-goodnight',          '0 22 * * *',                   NULL,                   NULL, 'duplicate of mommy-bedtime-daily-22'),
  -- ---- Migration 318 (1-2 user right-size) ----
  ('2026-04-30'::date, '318', 'reduced',     'send-notifications-every-minute',  '* * * * *',                    '*/5 * * * *',          NULL, '1-2 users; minute polling not justified'),
  ('2026-04-30'::date, '318', 'reduced',     'web-push-dispatch-minute',         '* * * * *',                    '*/5 * * * *',          NULL, '1-2 users; minute polling not justified'),
  ('2026-04-30'::date, '318', 'reduced',     'execute-directives',               '3-59/5 * * * *',               '3 * * * *',            NULL, '1-user batch; hourly is plenty'),
  ('2026-04-30'::date, '318', 'reduced',     'process-device-schedule',          '2-59/5 * * * *',               '7 * * * *',            NULL, '1-user batch; hourly'),
  ('2026-04-30'::date, '318', 'reduced',     'device-control-check',             '0-59/5 * * * *',               '12 * * * *',           NULL, '1-user batch; hourly'),
  ('2026-04-30'::date, '318', 'reduced',     'autonomous-compliance-check',      '1-59/5 * * * *',               '17 * * * *',           NULL, '1-user batch; hourly'),
  ('2026-04-30'::date, '318', 'reduced',     'confession-watcher-5min',          '1-59/5 * * * *',               '22 * * * *',           NULL, '1-user batch; hourly'),
  ('2026-04-30'::date, '318', 'reduced',     'surface-guarantor-5min',           '2-59/5 * * * *',               '27 * * * *',           NULL, '1-user batch; hourly'),
  ('2026-04-30'::date, '318', 'reduced',     'autonomous-execute-posts',         '2-59/5 * * * *',               '32 * * * *',           NULL, '1-user batch; hourly'),
  ('2026-04-30'::date, '318', 'reduced',     'response-capture-5min',            '3-59/5 * * * *',               '37 * * * *',           NULL, '1-user batch; hourly'),
  ('2026-04-30'::date, '318', 'reduced',     'force-processor-5min',             '4-59/5 * * * *',               '42 * * * *',           NULL, '1-user batch; hourly'),
  ('2026-04-30'::date, '318', 'reduced',     'slip-cluster-detector-10min',      '3-59/10 * * * *',              '13,43 * * * *',        NULL, '1-user; every 30 min plenty'),
  ('2026-04-30'::date, '318', 'reduced',     'handler-task-processor-run',       '6-59/15 * * * *',              '6 * * * *',            NULL, 'task processor; hourly'),
  ('2026-04-30'::date, '318', 'reduced',     'handler-enforcement-processor',    '7-59/15 * * * *',              '11 * * * *',           NULL, 'enforcement; hourly'),
  ('2026-04-30'::date, '318', 'reduced',     'autonomous-quick-task-check',      '11-59/15 * * * *',             '21 * * * *',           NULL, 'quick check; hourly'),
  ('2026-04-30'::date, '318', 'reduced',     'meet-evidence-cron-15min',         '12-59/15 * * * *',             '26 * * * *',           NULL, 'evidence cron; hourly'),
  ('2026-04-30'::date, '318', 'reduced',     'revenue-ai-queue',                 '13-59/15 * * * *',             '31 * * * *',           NULL, 'AI queue; hourly'),
  ('2026-04-30'::date, '318', 'reduced',     'mommy-ambient-15min',              '14-59/15 * * * *',             '46 * * * *',           NULL, 'ambient; hourly'),
  ('2026-04-30'::date, '318', 'reduced',     'outreach-expiry-janitor-5min',     '0-59/15 * * * *',              '51 * * * *',           NULL, 'mark_expired_outreach; hourly'),
  ('2026-04-30'::date, '318', 'reduced',     'receptive_window_auto_content',    '*/20 * * * *',                 '56 * * * *',           NULL, 'auto-content; hourly'),
  ('2026-04-30'::date, '318', 'reduced',     'system_invariants_watchdog',       '*/30 * * * *',                 '0 * * * *',            NULL, 'watchdog; hourly'),
  ('2026-04-30'::date, '318', 'reduced',     'david_suppression_watchdog',       '1-59/30 * * * *',              '1 * * * *',            NULL, 'watchdog; hourly'),
  ('2026-04-30'::date, '318', 'reduced',     'v31_freshness_watchdog',           '2-59/30 * * * *',              '2 * * * *',            NULL, 'watchdog; hourly'),
  ('2026-04-30'::date, '318', 'reduced',     'body_evidence_freshness_watchdog', '6-59/30 * * * *',              '4 * * * *',            NULL, 'watchdog; hourly'),
  ('2026-04-30'::date, '318', 'reduced',     'receptive_window_classifier',      '4-59/30 * * * *',              '8 * * * *',            NULL, 'classifier; hourly'),
  ('2026-04-30'::date, '318', 'reduced',     'confession_debt_enforcement',      '*/30 * * * *',                 '14 * * * *',           NULL, 'enforcement; hourly'),
  ('2026-04-30'::date, '318', 'reduced',     'witness_defection_alerts',         '*/30 * * * *',                 '19 * * * *',           NULL, 'alerts; hourly'),
  ('2026-04-30'::date, '318', 'reduced',     'handler-outreach-eval',            '15-59/30 * * * *',             '24 * * * *',           NULL, 'outreach eval; hourly'),
  ('2026-04-30'::date, '318', 'reduced',     'handler-calendar-enforce',         '25-59/30 * * * *',             '29 * * * *',           NULL, 'calendar enforce; hourly'),
  ('2026-04-30'::date, '318', 'reduced',     'compute_daily_compliance_score',   '0 * * * *',                    '15 5 * * *',           NULL, '"daily" compliance; daily'),
  ('2026-04-30'::date, '318', 'reduced',     'mommy-gaslight-6h',                '7 */6 * * *',                  '7 11 * * *',           NULL, 'gaslight; daily'),
  ('2026-04-30'::date, '318', 'reduced',     'auto-loophole-closer-4h',          '47 */4 * * *',                 '47 6 * * *',           NULL, 'loophole closer; daily'),
  ('2026-04-30'::date, '318', 'reduced',     'persona-shift-auto-4h',            '37 */4 * * *',                 '37 12 * * *',          NULL, 'persona shift; daily'),
  ('2026-04-30'::date, '318', 'reduced',     'slip_cluster_intervention',        '17 7,11,15,19,23 * * *',       '17 19 * * *',          NULL, '5x daily -> 1x daily'),
  ('2026-04-30'::date, '318', 'reduced',     'revenue-engagement',               '0 */3 * * *',                  '0 9 * * *',            NULL, 'revenue engagement; daily'),
  ('2026-04-30'::date, '318', 'reduced',     'sanctuary_baseline_delivery',      '13 7,9,11,13,15,17,19,21 * * *', '13 13 * * *',        NULL, '8x daily -> 1x daily'),
  ('2026-04-30'::date, '318', 'reduced',     'today-ui-audit-6h',                '37 */6 * * *',                 '37 5 * * *',           NULL, 'UI audit; daily'),
  ('2026-04-30'::date, '318', 'reduced',     'autonomous-hourly-analytics',      '18 * * * *',                   '18 0,6,12,18 * * *',   NULL, 'analytics; 4x daily'),
  ('2026-04-30'::date, '318', 'reduced',     'leak-pattern-extractor-hourly',    '7 * * * *',                    '7 4 * * *',            NULL, 'leak pattern; daily'),
  ('2026-04-30'::date, '318', 'reduced',     'hourly-compliance-check',          '0 * * * *',                    '0 0,6,12,18 * * *',    NULL, 'compliance check; 4x daily'),
  ('2026-04-30'::date, '318', 'reduced',     'hrt_advance_pressure',             '53 6,18 * * *',                '53 18 * * *',          NULL, '2x daily -> 1x daily'),
  ('2026-04-30'::date, '318', 'reduced',     'voice_cadence_watchdog',           '8 8,14,20 * * *',              '8 14 * * *',           NULL, '3x daily -> 1x daily'),
  ('2026-04-30'::date, '318', 'increased',   'mommy-tease-engine',               '23 */6 * * *',                 '23 * * * *',           NULL, 'over-reduced in 317; user wants hourly'),
  ('2026-04-30'::date, '318', 'increased',   'mommy-recall-surprise',            '42 */6 * * *',                 '42 * * * *',           NULL, 'over-reduced in 317; user wants hourly'),
  ('2026-04-30'::date, '318', 'increased',   'mommy-touch-cycle',                '17 */6 * * *',                 '17 */3 * * *',         NULL, 'user said keep frequent'),
  ('2026-04-30'::date, '318', 'reduced',     'streak_break_recovery',            '34 */6 * * *',                 '34 7 * * *',           NULL, 'recovery cycle; daily'),
  ('2026-04-30'::date, '318', 'reduced',     'content-generator-daily',          '0 3 * * *',                    '0 3 * * 1',            NULL, 'content for 1-user; weekly'),
  ('2026-04-30'::date, '318', 'reduced',     'witness-fabrication-daily',        '11 6 * * *',                   '11 6 * * 1',           NULL, 'fabrication for 1-user; weekly'),
  ('2026-04-30'::date, '318', 'reduced',     'cross-platform-consistency-daily', '11 7 * * *',                   '11 7 * * 1',           NULL, 'consistency for 1-user; weekly'),
  ('2026-04-30'::date, '318', 'reduced',     'loophole-hunter-daily',            '23 11 * * *',                  '23 11 * * 1',          NULL, 'loophole hunter; weekly'),
  ('2026-04-30'::date, '318', 'reduced',     'mommy-mood-daily',                 '0 11 * * *',                   '0 11 * * 1',           NULL, 'mood for 1-user; weekly'),
  ('2026-04-30'::date, '318', 'reduced',     'mommy-mantra-daily',               '0 13 * * *',                   '0 13 * * 1',           NULL, 'mantra for 1-user; weekly'),
  -- ---- Migration 326 (peak-collision elimination 2026-05-08) ----
  ('2026-05-08'::date, '326', 'reduced',     'send-notifications-every-minute',  '*/5 * * * *',                  '2-59/5 * * * *',       NULL, 'shift off :00 high-collision lane; avoid */10 offsets'),
  ('2026-05-08'::date, '326', 'reduced',     'web-push-dispatch-minute',         '*/5 * * * *',                  '1-59/5 * * * *',       NULL, 'shift off :00 (kept 5-min real-time); avoid */10 offsets'),
  ('2026-05-08'::date, '326', 'reduced',     'handler-outreach-auto-hourly',     '17 * * * *',                   '47 * * * *',           NULL, 'resolve :17 collision (autonomous-compliance-check stays)'),
  ('2026-05-08'::date, '326', 'reduced',     'predictive_defection_lockdown',    '23 * * * *',                   '49 * * * *',           NULL, 'resolve :23 collision (mommy-tease-engine stays)'),
  ('2026-05-08'::date, '326', 'reduced',     'defection_sanctuary_amplification','26 * * * *',                   '53 * * * *',           NULL, 'resolve :26 collision (meet-evidence-cron-15min stays)'),
  ('2026-05-08'::date, '326', 'unscheduled', 'night-block-execution',            'unknown',                      NULL,                   NULL, 'failing in last 30 min; nightly enforcement; can lapse 24h'),
  ('2026-05-08'::date, '326', 'unscheduled', 'mommy-ambient-15min',              '46 * * * *',                   NULL,                   NULL, 'failing; ambient low-stakes; can lapse 24h'),
  ('2026-05-08'::date, '326', 'unscheduled', 'mommy-recall-surprise',            '42 * * * *',                   NULL,                   NULL, 'failing; recoverable engagement; can lapse 24h'),
  ('2026-05-08'::date, '326', 'unscheduled', 'held_evidence_surfacing_engine',   '8 * * * *',                    NULL,                   NULL, 'failing; surfacing engine can lapse 24h'),
  ('2026-05-08'::date, '326', 'unscheduled', 'anti_procrastination_shame',       '11 * * * *',                   NULL,                   NULL, 'failing; shame cycle can lapse 24h'),
  ('2026-05-08'::date, '326', 'unscheduled', 'sanctuary_delivery_regression',    '11 * * * *',                   NULL,                   NULL, 'failing; sanctuary regression can lapse 24h'),
  ('2026-05-08'::date, '326', 'unscheduled', 'receptive_window_classifier',      '8 * * * *',                    NULL,                   NULL, 'failing; classifier can lapse 24h')
) AS t(effective_date, migration, change_type, jobname, old_schedule, new_schedule, command, reason)
ON CONFLICT (migration, jobname) DO NOTHING;

-- ============================================================
-- B) Mass prune. Whitelist + capture-and-unschedule everything else.
--    Captures jobname + schedule + command so the operator can replay
--    any subset later via cron.schedule(jobname, old_schedule, command).
-- ============================================================

DO $$
DECLARE
  protected_names text[] := ARRAY[
    -- Hard rule (NEVER pause):
    'auto-healer-10min',
    'deploy-health-monitor-10min',
    'mommy-praise-10min',
    -- 5-min push delivery:
    'send-notifications-every-minute',
    'web-push-dispatch-minute',
    -- Hourly maintenance:
    'outreach-expiry-janitor-5min',     -- mark_expired_outreach
    'prune_cron_run_details_hourly',    -- log table maintenance
    -- Real-time micro-task:
    'mommy-touch-cycle',
    -- Daily user-facing:
    'mommy-mantra-daily',
    'mommy-mood-daily',
    'compute_daily_compliance_score',
    'mommy-bedtime-daily-22',
    'wardrobe-expiry-daily',
    'calendar-sync-daily',
    'calendar-place-rituals-daily',
    'capability-digest-daily-7am30',
    'handler-self-audit-daily',
    'workout-prescriber-daily',
    'prune_perf_log_tables_daily',
    -- Weekly content (already weekly post-318; low load):
    'content-generator-daily',
    'witness-fabrication-daily',
    'cross-platform-consistency-daily',
    'loophole-hunter-daily',
    'disclosure-rehearsal-sunday-9am'
  ];
  rec record;
  paused_count int := 0;
BEGIN
  FOR rec IN
    SELECT jobid, jobname, schedule, command
    FROM cron.job
    WHERE jobname IS NOT NULL
      AND jobname != ALL(protected_names)
  LOOP
    BEGIN
      INSERT INTO public.cron_paused_during_emergency
        (effective_date, migration, change_type, jobname, old_schedule, new_schedule, command, reason)
      VALUES
        ('2026-05-09', '329', 'unscheduled', rec.jobname, rec.schedule, NULL, rec.command,
         'mass prune: 142 -> <=25 active for 1-2 user deployment; tier compute insufficient')
      ON CONFLICT (migration, jobname) DO NOTHING;

      PERFORM cron.unschedule(rec.jobid);
      paused_count := paused_count + 1;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE '329: skip % (already gone or error): %', rec.jobname, SQLERRM;
    END;
  END LOOP;
  RAISE NOTICE '329: paused % jobs', paused_count;
END $$;

-- ============================================================
-- C) Re-stagger surviving daily jobs onto unique minute offsets.
--    Hourly survivors (outreach-expiry-janitor :51, prune_cron :47) stay
--    at their post-325/post-318 schedules — already on unique slots.
--    Daily fires use unique minute offsets distinct from the */5 lanes
--    (web-push 1-59/5: :01,06,11,16,21,26,31,36,41,46,51,56;
--     send-notif 2-59/5: :02,07,12,17,22,27,32,37,42,47,52,57) and the
--    */10 infra lanes (mommy-praise :04,14,...; auto-healer :08,18,...;
--    deploy-health :09,19,...).
-- ============================================================

-- Restore mommy-mantra-daily from weekly (318) -> daily (5 13)
DO $$ BEGIN
  PERFORM cron.alter_job(
    job_id   := (SELECT jobid FROM cron.job WHERE jobname = 'mommy-mantra-daily'),
    schedule := '5 13 * * *'
  );
EXCEPTION WHEN OTHERS THEN RAISE NOTICE '329: mommy-mantra-daily alter skipped: %', SQLERRM; END $$;

-- Restore mommy-mood-daily from weekly (318) -> daily (5 11)
DO $$ BEGIN
  PERFORM cron.alter_job(
    job_id   := (SELECT jobid FROM cron.job WHERE jobname = 'mommy-mood-daily'),
    schedule := '5 11 * * *'
  );
EXCEPTION WHEN OTHERS THEN RAISE NOTICE '329: mommy-mood-daily alter skipped: %', SQLERRM; END $$;

-- wardrobe-expiry-daily was registered at '0 22 * * *' (mig 312); collides
-- with mommy-bedtime-daily-22 at the same minute. Move to 23:10.
DO $$ BEGIN
  PERFORM cron.alter_job(
    job_id   := (SELECT jobid FROM cron.job WHERE jobname = 'wardrobe-expiry-daily'),
    schedule := '10 23 * * *'
  );
EXCEPTION WHEN OTHERS THEN RAISE NOTICE '329: wardrobe-expiry-daily alter skipped: %', SQLERRM; END $$;

-- handler-self-audit-daily — pin to 5 6 (off the */5 lanes :02/:07 +
-- */10 :04/:08/:09)
DO $$ BEGIN
  PERFORM cron.alter_job(
    job_id   := (SELECT jobid FROM cron.job WHERE jobname = 'handler-self-audit-daily'),
    schedule := '5 6 * * *'
  );
EXCEPTION WHEN OTHERS THEN RAISE NOTICE '329: handler-self-audit-daily alter skipped: %', SQLERRM; END $$;

-- workout-prescriber-daily — pin to 10 7 (off the */5 lanes)
DO $$ BEGIN
  PERFORM cron.alter_job(
    job_id   := (SELECT jobid FROM cron.job WHERE jobname = 'workout-prescriber-daily'),
    schedule := '10 7 * * *'
  );
EXCEPTION WHEN OTHERS THEN RAISE NOTICE '329: workout-prescriber-daily alter skipped: %', SQLERRM; END $$;

NOTIFY pgrst, 'reload schema';

-- ============================================================
-- VERIFICATION (operator runs >=15 min after apply for steady state)
-- ============================================================
-- -- Should be <= 25
-- SELECT count(*) FROM cron.job WHERE active = true;
--
-- -- Should be < 5%
-- SELECT round(100.0 * count(*) FILTER (WHERE status='failed') / NULLIF(count(*), 0), 1) AS pct
-- FROM cron.job_run_details WHERE start_time > now() - interval '15 minutes';
--
-- -- Critical loops should all be hitting cadence with 0 failures:
-- SELECT j.jobname,
--        count(*) FILTER (WHERE jr.status='succeeded') AS ok,
--        count(*) FILTER (WHERE jr.status='failed')    AS failed
-- FROM cron.job_run_details jr JOIN cron.job j ON j.jobid = jr.jobid
-- WHERE jr.start_time > now() - interval '30 minutes'
--   AND j.jobname IN ('auto-healer-10min', 'deploy-health-monitor-10min', 'mommy-praise-10min')
-- GROUP BY j.jobname;
--
-- -- Audit of what was paused by 329:
-- SELECT jobname, old_schedule FROM public.cron_paused_during_emergency
-- WHERE migration = '329' ORDER BY jobname;
