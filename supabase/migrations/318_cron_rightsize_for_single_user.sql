-- 318_cron_rightsize_for_single_user.sql
-- 2026-04-30 — Right-size cron volume for the actual deployment (1-2 users).
-- Most "batch processor" crons were sized for production multi-user load. With
-- 1-2 users in user_state, the inner loop is one row; firing every 1-5 minutes
-- burns the cron worker pool for nothing. Target: ~75% reduction in firings/h
-- so the project breathes without a compute upgrade.
--
-- Hard-rule whitelist (frequency UNCHANGED — these drive real UX or infra):
--   * auto-healer-10min          — infra monitoring
--   * deploy-health-monitor-10min — infra monitoring
--   * mommy-praise-10min         — arousal-triggered, real experience
--
-- Mommy-touch (user-acted) gets bumped from every-6h (set in 317) back up to
-- every-3h since the user explicitly called it out as experience-driving.
--
-- Sibling: 314 (cron auth) lands first; 316 (pg_net bloat); 317 (first relief).

-- ============================================================
-- A) STRETCH every-1-minute notifiers to every-5-minutes
--    Single-user load doesn't justify per-minute polling.
-- ============================================================

SELECT cron.alter_job(
  job_id := (SELECT jobid FROM cron.job WHERE jobname = 'send-notifications-every-minute'),
  schedule := '*/5 * * * *'
);
SELECT cron.alter_job(
  job_id := (SELECT jobid FROM cron.job WHERE jobname = 'web-push-dispatch-minute'),
  schedule := '*/5 * * * *'
);

-- ============================================================
-- B) STRETCH every-5-minute batch processors to hourly
--    Inner loop is one user; hourly is plenty.
-- ============================================================

SELECT cron.alter_job(
  job_id := (SELECT jobid FROM cron.job WHERE jobname = 'execute-directives'),
  schedule := '3 * * * *'
);
SELECT cron.alter_job(
  job_id := (SELECT jobid FROM cron.job WHERE jobname = 'process-device-schedule'),
  schedule := '7 * * * *'
);
SELECT cron.alter_job(
  job_id := (SELECT jobid FROM cron.job WHERE jobname = 'device-control-check'),
  schedule := '12 * * * *'
);
SELECT cron.alter_job(
  job_id := (SELECT jobid FROM cron.job WHERE jobname = 'autonomous-compliance-check'),
  schedule := '17 * * * *'
);
SELECT cron.alter_job(
  job_id := (SELECT jobid FROM cron.job WHERE jobname = 'confession-watcher-5min'),
  schedule := '22 * * * *'
);
SELECT cron.alter_job(
  job_id := (SELECT jobid FROM cron.job WHERE jobname = 'surface-guarantor-5min'),
  schedule := '27 * * * *'
);
SELECT cron.alter_job(
  job_id := (SELECT jobid FROM cron.job WHERE jobname = 'autonomous-execute-posts'),
  schedule := '32 * * * *'
);
SELECT cron.alter_job(
  job_id := (SELECT jobid FROM cron.job WHERE jobname = 'response-capture-5min'),
  schedule := '37 * * * *'
);
SELECT cron.alter_job(
  job_id := (SELECT jobid FROM cron.job WHERE jobname = 'force-processor-5min'),
  schedule := '42 * * * *'
);

-- ============================================================
-- C) STRETCH every-10-minute slip-cluster-detector to every 30
-- ============================================================

SELECT cron.alter_job(
  job_id := (SELECT jobid FROM cron.job WHERE jobname = 'slip-cluster-detector-10min'),
  schedule := '13,43 * * * *'
);

-- ============================================================
-- D) STRETCH every-15-minute crons to hourly
-- ============================================================

SELECT cron.alter_job(
  job_id := (SELECT jobid FROM cron.job WHERE jobname = 'handler-task-processor-run'),
  schedule := '6 * * * *'
);
SELECT cron.alter_job(
  job_id := (SELECT jobid FROM cron.job WHERE jobname = 'handler-enforcement-processor'),
  schedule := '11 * * * *'
);
SELECT cron.alter_job(
  job_id := (SELECT jobid FROM cron.job WHERE jobname = 'autonomous-quick-task-check'),
  schedule := '21 * * * *'
);
SELECT cron.alter_job(
  job_id := (SELECT jobid FROM cron.job WHERE jobname = 'meet-evidence-cron-15min'),
  schedule := '26 * * * *'
);
SELECT cron.alter_job(
  job_id := (SELECT jobid FROM cron.job WHERE jobname = 'revenue-ai-queue'),
  schedule := '31 * * * *'
);
SELECT cron.alter_job(
  job_id := (SELECT jobid FROM cron.job WHERE jobname = 'mommy-ambient-15min'),
  schedule := '46 * * * *'
);
SELECT cron.alter_job(
  job_id := (SELECT jobid FROM cron.job WHERE jobname = 'outreach-expiry-janitor-5min'),
  schedule := '51 * * * *'
);
SELECT cron.alter_job(
  job_id := (SELECT jobid FROM cron.job WHERE jobname = 'receptive_window_auto_content'),
  schedule := '56 * * * *'
);

-- ============================================================
-- E) STRETCH every-30-minute watchdogs (halved in 317) to hourly
-- ============================================================

SELECT cron.alter_job(
  job_id := (SELECT jobid FROM cron.job WHERE jobname = 'system_invariants_watchdog'),
  schedule := '0 * * * *'
);
SELECT cron.alter_job(
  job_id := (SELECT jobid FROM cron.job WHERE jobname = 'david_suppression_watchdog'),
  schedule := '1 * * * *'
);
SELECT cron.alter_job(
  job_id := (SELECT jobid FROM cron.job WHERE jobname = 'v31_freshness_watchdog'),
  schedule := '2 * * * *'
);
SELECT cron.alter_job(
  job_id := (SELECT jobid FROM cron.job WHERE jobname = 'body_evidence_freshness_watchdog'),
  schedule := '4 * * * *'
);
SELECT cron.alter_job(
  job_id := (SELECT jobid FROM cron.job WHERE jobname = 'receptive_window_classifier'),
  schedule := '8 * * * *'
);
SELECT cron.alter_job(
  job_id := (SELECT jobid FROM cron.job WHERE jobname = 'confession_debt_enforcement'),
  schedule := '14 * * * *'
);
SELECT cron.alter_job(
  job_id := (SELECT jobid FROM cron.job WHERE jobname = 'witness_defection_alerts'),
  schedule := '19 * * * *'
);
SELECT cron.alter_job(
  job_id := (SELECT jobid FROM cron.job WHERE jobname = 'handler-outreach-eval'),
  schedule := '24 * * * *'
);
SELECT cron.alter_job(
  job_id := (SELECT jobid FROM cron.job WHERE jobname = 'handler-calendar-enforce'),
  schedule := '29 * * * *'
);

-- ============================================================
-- F) DROP lower-priority hourly+ crons to daily/weekly
-- ============================================================

-- compute_daily_compliance_score is named "daily" — actually run it daily.
SELECT cron.alter_job(
  job_id := (SELECT jobid FROM cron.job WHERE jobname = 'compute_daily_compliance_score'),
  schedule := '15 5 * * *'
);
-- mommy-gaslight every 6h → daily
SELECT cron.alter_job(
  job_id := (SELECT jobid FROM cron.job WHERE jobname = 'mommy-gaslight-6h'),
  schedule := '7 11 * * *'
);
-- auto-loophole-closer every 4h → daily
SELECT cron.alter_job(
  job_id := (SELECT jobid FROM cron.job WHERE jobname = 'auto-loophole-closer-4h'),
  schedule := '47 6 * * *'
);
-- persona-shift-auto every 4h → daily
SELECT cron.alter_job(
  job_id := (SELECT jobid FROM cron.job WHERE jobname = 'persona-shift-auto-4h'),
  schedule := '37 12 * * *'
);
-- detect_and_intervene_slip_clusters fires 5x daily → 1x daily
SELECT cron.alter_job(
  job_id := (SELECT jobid FROM cron.job WHERE jobname = 'slip_cluster_intervention'),
  schedule := '17 19 * * *'
);
-- revenue-engagement every 3h → daily
SELECT cron.alter_job(
  job_id := (SELECT jobid FROM cron.job WHERE jobname = 'revenue-engagement'),
  schedule := '0 9 * * *'
);
-- sanctuary_baseline_delivery 8x daily → 1x daily
SELECT cron.alter_job(
  job_id := (SELECT jobid FROM cron.job WHERE jobname = 'sanctuary_baseline_delivery'),
  schedule := '13 13 * * *'
);
-- today-ui-audit every 6h → daily
SELECT cron.alter_job(
  job_id := (SELECT jobid FROM cron.job WHERE jobname = 'today-ui-audit-6h'),
  schedule := '37 5 * * *'
);
-- autonomous-hourly-analytics every hour → 4x daily
SELECT cron.alter_job(
  job_id := (SELECT jobid FROM cron.job WHERE jobname = 'autonomous-hourly-analytics'),
  schedule := '18 0,6,12,18 * * *'
);
-- leak-pattern-extractor hourly → daily
SELECT cron.alter_job(
  job_id := (SELECT jobid FROM cron.job WHERE jobname = 'leak-pattern-extractor-hourly'),
  schedule := '7 4 * * *'
);
-- hourly-compliance-check → 4x daily
SELECT cron.alter_job(
  job_id := (SELECT jobid FROM cron.job WHERE jobname = 'hourly-compliance-check'),
  schedule := '0 0,6,12,18 * * *'
);
-- hrt_advance_pressure 2x daily → 1x daily
SELECT cron.alter_job(
  job_id := (SELECT jobid FROM cron.job WHERE jobname = 'hrt_advance_pressure'),
  schedule := '53 18 * * *'
);
-- voice_cadence_watchdog 3x daily → 1x daily
SELECT cron.alter_job(
  job_id := (SELECT jobid FROM cron.job WHERE jobname = 'voice_cadence_watchdog'),
  schedule := '8 14 * * *'
);

-- ============================================================
-- G) MOMMY ENGAGEMENT — case-by-case per user direction
--    "mommy-recall / mommy-tease / mommy-bedtime — hourly or 30-min".
--    Bring tease/recall back UP from 6h (over-reduced in 317) to hourly.
--    Bring mommy-touch back from 6h to every 3h (real-experience-driver).
--    streak_break_recovery is not a mommy-engagement — keep at 317's 6h or daily.
-- ============================================================

SELECT cron.alter_job(
  job_id := (SELECT jobid FROM cron.job WHERE jobname = 'mommy-tease-engine'),
  schedule := '23 * * * *'
);
SELECT cron.alter_job(
  job_id := (SELECT jobid FROM cron.job WHERE jobname = 'mommy-recall-surprise'),
  schedule := '42 * * * *'
);
SELECT cron.alter_job(
  job_id := (SELECT jobid FROM cron.job WHERE jobname = 'mommy-touch-cycle'),
  schedule := '17 */3 * * *'
);
-- streak_break_recovery — drop further (not a mommy-engagement; recovery cycle)
SELECT cron.alter_job(
  job_id := (SELECT jobid FROM cron.job WHERE jobname = 'streak_break_recovery'),
  schedule := '34 7 * * *'
);

-- ============================================================
-- H) DAILY → WEEKLY for content/audit jobs that don't need daily on 1-user
-- ============================================================

SELECT cron.alter_job(
  job_id := (SELECT jobid FROM cron.job WHERE jobname = 'content-generator-daily'),
  schedule := '0 3 * * 1'  -- weekly Monday 03:00
);
SELECT cron.alter_job(
  job_id := (SELECT jobid FROM cron.job WHERE jobname = 'witness-fabrication-daily'),
  schedule := '11 6 * * 1'
);
SELECT cron.alter_job(
  job_id := (SELECT jobid FROM cron.job WHERE jobname = 'cross-platform-consistency-daily'),
  schedule := '11 7 * * 1'
);
SELECT cron.alter_job(
  job_id := (SELECT jobid FROM cron.job WHERE jobname = 'loophole-hunter-daily'),
  schedule := '23 11 * * 1'
);
SELECT cron.alter_job(
  job_id := (SELECT jobid FROM cron.job WHERE jobname = 'mommy-mood-daily'),
  schedule := '0 11 * * 1'
);
SELECT cron.alter_job(
  job_id := (SELECT jobid FROM cron.job WHERE jobname = 'mommy-mantra-daily'),
  schedule := '0 13 * * 1'
);

-- ============================================================
-- I) AUDIT VIEW — extend existing emergency view with 318's changes
-- ============================================================

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
  ('2026-04-30', '317', 'unscheduled', 'auto-healer-10m',                 '*/10 * * * *',          NULL,                       'duplicate of auto-healer-10min (mig 314 staggered)'),
  ('2026-04-30', '317', 'unscheduled', 'deploy-health-monitor-10m',       '*/10 * * * *',          NULL,                       'duplicate of deploy-health-monitor-10min (mig 314 staggered)'),
  ('2026-04-30', '317', 'unscheduled', 'mommy-praise-burst',              '*/10 * * * *',          NULL,                       'duplicate of mommy-praise-10min (mig 314 staggered)'),
  ('2026-04-30', '317', 'unscheduled', 'mommy-bedtime-goodnight',         '0 22 * * *',            NULL,                       'duplicate of mommy-bedtime-daily-22'),
  -- ---- Migration 318 (1-2 user right-size) ----
  ('2026-04-30', '318', 'reduced',     'send-notifications-every-minute', '* * * * *',             '*/5 * * * *',              '1-2 users; minute polling not justified'),
  ('2026-04-30', '318', 'reduced',     'web-push-dispatch-minute',        '* * * * *',             '*/5 * * * *',              '1-2 users; minute polling not justified'),
  ('2026-04-30', '318', 'reduced',     'execute-directives',              '3-59/5 * * * *',        '3 * * * *',                '1-user batch; hourly is plenty'),
  ('2026-04-30', '318', 'reduced',     'process-device-schedule',         '2-59/5 * * * *',        '7 * * * *',                '1-user batch; hourly'),
  ('2026-04-30', '318', 'reduced',     'device-control-check',            '0-59/5 * * * *',        '12 * * * *',               '1-user batch; hourly'),
  ('2026-04-30', '318', 'reduced',     'autonomous-compliance-check',     '1-59/5 * * * *',        '17 * * * *',               '1-user batch; hourly'),
  ('2026-04-30', '318', 'reduced',     'confession-watcher-5min',         '1-59/5 * * * *',        '22 * * * *',               '1-user batch; hourly'),
  ('2026-04-30', '318', 'reduced',     'surface-guarantor-5min',          '2-59/5 * * * *',        '27 * * * *',               '1-user batch; hourly'),
  ('2026-04-30', '318', 'reduced',     'autonomous-execute-posts',        '2-59/5 * * * *',        '32 * * * *',               '1-user batch; hourly'),
  ('2026-04-30', '318', 'reduced',     'response-capture-5min',           '3-59/5 * * * *',        '37 * * * *',               '1-user batch; hourly'),
  ('2026-04-30', '318', 'reduced',     'force-processor-5min',            '4-59/5 * * * *',        '42 * * * *',               '1-user batch; hourly'),
  ('2026-04-30', '318', 'reduced',     'slip-cluster-detector-10min',     '3-59/10 * * * *',       '13,43 * * * *',            '1-user; every 30 min plenty'),
  ('2026-04-30', '318', 'reduced',     'handler-task-processor-run',      '6-59/15 * * * *',       '6 * * * *',                'task processor; hourly'),
  ('2026-04-30', '318', 'reduced',     'handler-enforcement-processor',   '7-59/15 * * * *',       '11 * * * *',               'enforcement; hourly'),
  ('2026-04-30', '318', 'reduced',     'autonomous-quick-task-check',     '11-59/15 * * * *',      '21 * * * *',               'quick check; hourly'),
  ('2026-04-30', '318', 'reduced',     'meet-evidence-cron-15min',        '12-59/15 * * * *',      '26 * * * *',               'evidence cron; hourly'),
  ('2026-04-30', '318', 'reduced',     'revenue-ai-queue',                '13-59/15 * * * *',      '31 * * * *',               'AI queue; hourly'),
  ('2026-04-30', '318', 'reduced',     'mommy-ambient-15min',             '14-59/15 * * * *',      '46 * * * *',               'ambient; hourly'),
  ('2026-04-30', '318', 'reduced',     'outreach-expiry-janitor-5min',    '0-59/15 * * * *',       '51 * * * *',               'mark_expired_outreach @ 14s/call; hourly'),
  ('2026-04-30', '318', 'reduced',     'receptive_window_auto_content',   '*/20 * * * *',          '56 * * * *',               'auto-content; hourly'),
  ('2026-04-30', '318', 'reduced',     'system_invariants_watchdog',      '*/30 * * * *',          '0 * * * *',                'watchdog; hourly'),
  ('2026-04-30', '318', 'reduced',     'david_suppression_watchdog',      '1-59/30 * * * *',       '1 * * * *',                'watchdog; hourly'),
  ('2026-04-30', '318', 'reduced',     'v31_freshness_watchdog',          '2-59/30 * * * *',       '2 * * * *',                'watchdog; hourly'),
  ('2026-04-30', '318', 'reduced',     'body_evidence_freshness_watchdog','6-59/30 * * * *',       '4 * * * *',                'watchdog; hourly'),
  ('2026-04-30', '318', 'reduced',     'receptive_window_classifier',     '4-59/30 * * * *',       '8 * * * *',                'classifier; hourly'),
  ('2026-04-30', '318', 'reduced',     'confession_debt_enforcement',     '*/30 * * * *',          '14 * * * *',               'enforcement; hourly'),
  ('2026-04-30', '318', 'reduced',     'witness_defection_alerts',        '*/30 * * * *',          '19 * * * *',               'alerts; hourly'),
  ('2026-04-30', '318', 'reduced',     'handler-outreach-eval',           '15-59/30 * * * *',      '24 * * * *',               'outreach eval; hourly'),
  ('2026-04-30', '318', 'reduced',     'handler-calendar-enforce',        '25-59/30 * * * *',      '29 * * * *',               'calendar enforce; hourly'),
  ('2026-04-30', '318', 'reduced',     'compute_daily_compliance_score',  '0 * * * *',             '15 5 * * *',               '"daily" compliance score; daily'),
  ('2026-04-30', '318', 'reduced',     'mommy-gaslight-6h',               '7 */6 * * *',           '7 11 * * *',               'gaslight; daily'),
  ('2026-04-30', '318', 'reduced',     'auto-loophole-closer-4h',         '47 */4 * * *',          '47 6 * * *',               'loophole closer; daily'),
  ('2026-04-30', '318', 'reduced',     'persona-shift-auto-4h',           '37 */4 * * *',          '37 12 * * *',              'persona shift; daily'),
  ('2026-04-30', '318', 'reduced',     'slip_cluster_intervention',       '17 7,11,15,19,23 * * *','17 19 * * *',              '5x daily -> 1x daily'),
  ('2026-04-30', '318', 'reduced',     'revenue-engagement',              '0 */3 * * *',           '0 9 * * *',                'revenue engagement; daily'),
  ('2026-04-30', '318', 'reduced',     'sanctuary_baseline_delivery',     '13 7,9,11,13,15,17,19,21 * * *', '13 13 * * *',     '8x daily -> 1x daily'),
  ('2026-04-30', '318', 'reduced',     'today-ui-audit-6h',               '37 */6 * * *',          '37 5 * * *',               'UI audit; daily'),
  ('2026-04-30', '318', 'reduced',     'autonomous-hourly-analytics',     '18 * * * *',            '18 0,6,12,18 * * *',       'analytics; 4x daily'),
  ('2026-04-30', '318', 'reduced',     'leak-pattern-extractor-hourly',   '7 * * * *',             '7 4 * * *',                'leak pattern; daily'),
  ('2026-04-30', '318', 'reduced',     'hourly-compliance-check',         '0 * * * *',             '0 0,6,12,18 * * *',        'compliance check; 4x daily'),
  ('2026-04-30', '318', 'reduced',     'hrt_advance_pressure',            '53 6,18 * * *',         '53 18 * * *',              '2x daily -> 1x daily'),
  ('2026-04-30', '318', 'reduced',     'voice_cadence_watchdog',          '8 8,14,20 * * *',       '8 14 * * *',               '3x daily -> 1x daily'),
  ('2026-04-30', '318', 'increased',   'mommy-tease-engine',              '23 */6 * * *',          '23 * * * *',               'over-reduced in 317; user wants hourly'),
  ('2026-04-30', '318', 'increased',   'mommy-recall-surprise',           '42 */6 * * *',          '42 * * * *',               'over-reduced in 317; user wants hourly'),
  ('2026-04-30', '318', 'increased',   'mommy-touch-cycle',               '17 */6 * * *',          '17 */3 * * *',             'user said keep frequent; bring back to 3h'),
  ('2026-04-30', '318', 'reduced',     'streak_break_recovery',           '34 */6 * * *',          '34 7 * * *',               'recovery cycle; daily'),
  ('2026-04-30', '318', 'reduced',     'content-generator-daily',         '0 3 * * *',             '0 3 * * 1',                'content for 1-user; weekly'),
  ('2026-04-30', '318', 'reduced',     'witness-fabrication-daily',       '11 6 * * *',            '11 6 * * 1',               'fabrication for 1-user; weekly'),
  ('2026-04-30', '318', 'reduced',     'cross-platform-consistency-daily','11 7 * * *',            '11 7 * * 1',               'consistency for 1-user; weekly'),
  ('2026-04-30', '318', 'reduced',     'loophole-hunter-daily',           '23 11 * * *',           '23 11 * * 1',              'loophole hunter; weekly'),
  ('2026-04-30', '318', 'reduced',     'mommy-mood-daily',                '0 11 * * *',            '0 11 * * 1',               'mood for 1-user; weekly'),
  ('2026-04-30', '318', 'reduced',     'mommy-mantra-daily',              '0 13 * * *',            '0 13 * * 1',               'mantra for 1-user; weekly')
) AS t(effective_date, migration, change_type, jobname, old_schedule, new_schedule, reason);

COMMENT ON VIEW public.cron_paused_during_emergency IS
  'Emergency relief audit (mig 317 + 318): jobs unscheduled, reduced, or increased for 1-2 user deployment. Restore by replaying schedules with cron.alter_job once user count grows.';
