-- 317_emergency_cron_relief.sql
-- Emergency relief 2026-04-30 — pg_cron worker pool exhausted, edge functions
-- hitting 150s cap, MCP timeouts. Three classes of relief here:
--
--   A) Unschedule duplicates — migration 314 staggered some critical crons
--      onto new offsets but didn't unschedule the original */10 versions, so
--      auto-healer / deploy-health-monitor / mommy-praise / mommy-bedtime
--      were all double-firing.
--
--   B) Stretch low-priority engagement crons (mommy-tease, mommy-recall,
--      mommy-touch-cycle, streak-break-recovery) from every-2-3h to every 6h.
--
--   C) Halve cadence on the watchdog and cycle crons that dominate compute
--      after pg_net cleanup (system_invariants, david_suppression, etc.).
--
-- Hard-rule whitelist (NEVER paused or reduced):
--   * auto-healer (jobid 254 staggered remains active)
--   * deploy-health-monitor (jobid 255 staggered remains active)
--   * mommy-praise (jobid 244 staggered remains active)
--   * mommy-builder (GitHub-Actions cron, not in pg_cron)
--
-- Coordinate with: 314 (cron auth fix); 316 (pg_net bloat purge)

-- ============================================================
-- A) UNSCHEDULE DUPLICATE CRONS
-- ============================================================
-- These four jobs were superseded by staggered replacements in migration 314
-- but the originals were never unscheduled, so each was firing twice as often.

DO $$
DECLARE
  jobname_to_drop TEXT;
  drop_targets TEXT[] := ARRAY[
    'auto-healer-10m',                -- replaced by auto-healer-10min (offset 8)
    'deploy-health-monitor-10m',      -- replaced by deploy-health-monitor-10min (offset 9)
    'mommy-praise-burst',             -- replaced by mommy-praise-10min (offset 4)
    'mommy-bedtime-goodnight'         -- replaced by mommy-bedtime-daily-22 (10 22 * * *)
  ];
BEGIN
  FOREACH jobname_to_drop IN ARRAY drop_targets
  LOOP
    BEGIN
      PERFORM cron.unschedule(jobname_to_drop);
      RAISE NOTICE 'unscheduled duplicate: %', jobname_to_drop;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'skip % (not present): %', jobname_to_drop, SQLERRM;
    END;
  END LOOP;
END $$;

-- ============================================================
-- B) STRETCH LOW-PRIORITY ENGAGEMENT CRONS (every 2-3h → every 6h)
-- ============================================================

SELECT cron.alter_job(
  job_id := (SELECT jobid FROM cron.job WHERE jobname = 'mommy-tease-engine'),
  schedule := '23 */6 * * *'
);
SELECT cron.alter_job(
  job_id := (SELECT jobid FROM cron.job WHERE jobname = 'mommy-recall-surprise'),
  schedule := '42 */6 * * *'
);
SELECT cron.alter_job(
  job_id := (SELECT jobid FROM cron.job WHERE jobname = 'mommy-touch-cycle'),
  schedule := '17 */6 * * *'
);
SELECT cron.alter_job(
  job_id := (SELECT jobid FROM cron.job WHERE jobname = 'streak_break_recovery'),
  schedule := '34 */6 * * *'
);

-- ============================================================
-- C) HALVE WATCHDOG / CYCLE CRONS THAT DOMINATE COMPUTE
-- ============================================================
-- Each of these runs an expensive PL/pgSQL function (200-440ms mean).
-- Halving cadence cuts their compute proportionally.

SELECT cron.alter_job(
  job_id := (SELECT jobid FROM cron.job WHERE jobname = 'system_invariants_watchdog'),
  schedule := '*/30 * * * *'  -- was */15
);
SELECT cron.alter_job(
  job_id := (SELECT jobid FROM cron.job WHERE jobname = 'david_suppression_watchdog'),
  schedule := '1-59/30 * * * *'  -- was 1-59/15
);
SELECT cron.alter_job(
  job_id := (SELECT jobid FROM cron.job WHERE jobname = 'v31_freshness_watchdog'),
  schedule := '2-59/30 * * * *'  -- was 2-59/15
);
SELECT cron.alter_job(
  job_id := (SELECT jobid FROM cron.job WHERE jobname = 'body_evidence_freshness_watchdog'),
  schedule := '6-59/30 * * * *'  -- was 6-59/15
);
SELECT cron.alter_job(
  job_id := (SELECT jobid FROM cron.job WHERE jobname = 'receptive_window_classifier'),
  schedule := '4-59/30 * * * *'  -- was 4-59/15
);
SELECT cron.alter_job(
  job_id := (SELECT jobid FROM cron.job WHERE jobname = 'compute_daily_compliance_score'),
  schedule := '0 * * * *'  -- was */30 — hourly is plenty for daily score
);
SELECT cron.alter_job(
  job_id := (SELECT jobid FROM cron.job WHERE jobname = 'outreach-expiry-janitor-5min'),
  schedule := '0-59/15 * * * *'  -- was 0-59/5; mark_expired_outreach @ 717ms mean
);
SELECT cron.alter_job(
  job_id := (SELECT jobid FROM cron.job WHERE jobname = 'memory-implant-audit-cron'),
  schedule := '17 */2 * * *'  -- was */30 — every 2 hours is plenty for an audit
);
SELECT cron.alter_job(
  job_id := (SELECT jobid FROM cron.job WHERE jobname = 'defection_proof_demand'),
  schedule := '7,37 * * * *'  -- was every 15 min → every 30 min
);
SELECT cron.alter_job(
  job_id := (SELECT jobid FROM cron.job WHERE jobname = 'anti_procrastination_shame'),
  schedule := '11 * * * *'  -- was 11,41 every 30 → hourly
);
SELECT cron.alter_job(
  job_id := (SELECT jobid FROM cron.job WHERE jobname = 'sanctuary_delivery_regression'),
  schedule := '11 * * * *'  -- was every 30 → hourly
);
SELECT cron.alter_job(
  job_id := (SELECT jobid FROM cron.job WHERE jobname = 'defection_sanctuary_amplification'),
  schedule := '26 * * * *'  -- was every 30 → hourly
);
SELECT cron.alter_job(
  job_id := (SELECT jobid FROM cron.job WHERE jobname = 'held_evidence_surfacing_engine'),
  schedule := '8 * * * *'  -- was every 30 → hourly
);
SELECT cron.alter_job(
  job_id := (SELECT jobid FROM cron.job WHERE jobname = 'predictive_defection_lockdown'),
  schedule := '23 * * * *'  -- was every 30 → hourly
);
SELECT cron.alter_job(
  job_id := (SELECT jobid FROM cron.job WHERE jobname = 'daily_confession_auto_prompt'),
  schedule := '15 * * * *'  -- was every 30 → hourly
);

-- ============================================================
-- D) AUDIT VIEW — what was paused/reduced
-- ============================================================
-- Rebuild the view so it reflects the post-relief state. Operators can
-- inspect this to know the emergency cadence is in effect.

CREATE OR REPLACE VIEW public.cron_paused_during_emergency AS
SELECT
  '2026-04-30'::date AS effective_date,
  change_type,
  jobname,
  old_schedule,
  new_schedule,
  reason
FROM (VALUES
  ('unscheduled', 'auto-healer-10m',                 '*/10 * * * *',          NULL,                       'duplicate of auto-healer-10min (mig 314 staggered)'),
  ('unscheduled', 'deploy-health-monitor-10m',       '*/10 * * * *',          NULL,                       'duplicate of deploy-health-monitor-10min (mig 314 staggered)'),
  ('unscheduled', 'mommy-praise-burst',              '*/10 * * * *',          NULL,                       'duplicate of mommy-praise-10min (mig 314 staggered)'),
  ('unscheduled', 'mommy-bedtime-goodnight',         '0 22 * * *',            NULL,                       'duplicate of mommy-bedtime-daily-22'),
  ('reduced',     'mommy-tease-engine',              '23 */2 * * *',          '23 */6 * * *',             'low-priority engagement; emergency stretch'),
  ('reduced',     'mommy-recall-surprise',           '42 */2 * * *',          '42 */6 * * *',             'low-priority engagement; emergency stretch'),
  ('reduced',     'mommy-touch-cycle',               '17 */3 * * *',          '17 */6 * * *',             'low-priority engagement; emergency stretch'),
  ('reduced',     'streak_break_recovery',           '34 */2 * * *',          '34 */6 * * *',             'low-priority recovery; emergency stretch'),
  ('reduced',     'system_invariants_watchdog',      '*/15 * * * *',          '*/30 * * * *',             'invariant check; halve cadence'),
  ('reduced',     'david_suppression_watchdog',      '1-59/15 * * * *',       '1-59/30 * * * *',          'invariant check; halve cadence'),
  ('reduced',     'v31_freshness_watchdog',          '2-59/15 * * * *',       '2-59/30 * * * *',          'invariant check; halve cadence'),
  ('reduced',     'body_evidence_freshness_watchdog','6-59/15 * * * *',       '6-59/30 * * * *',          'invariant check; halve cadence'),
  ('reduced',     'receptive_window_classifier',     '4-59/15 * * * *',       '4-59/30 * * * *',          'classification job; halve cadence'),
  ('reduced',     'compute_daily_compliance_score',  '*/30 * * * *',          '0 * * * *',                '"daily" score running every 30 min was wasteful'),
  ('reduced',     'outreach-expiry-janitor-5min',    '0-59/5 * * * *',        '0-59/15 * * * *',          'mark_expired_outreach @ 717ms mean; trim cadence'),
  ('reduced',     'memory-implant-audit-cron',       '*/30 * * * *',          '17 */2 * * *',             'audit; every-2-hours is plenty'),
  ('reduced',     'defection_proof_demand',          '7,22,37,52 * * * *',    '7,37 * * * *',             'demand cycle; halve cadence'),
  ('reduced',     'anti_procrastination_shame',      '11,41 * * * *',         '11 * * * *',               'shame cycle; halve cadence'),
  ('reduced',     'sanctuary_delivery_regression',   '11,41 * * * *',         '11 * * * *',               'sanctuary delivery; halve cadence'),
  ('reduced',     'defection_sanctuary_amplification','26,56 * * * *',        '26 * * * *',               'amplification; halve cadence'),
  ('reduced',     'held_evidence_surfacing_engine',  '8,38 * * * *',          '8 * * * *',                'surfacing; halve cadence'),
  ('reduced',     'predictive_defection_lockdown',   '23,53 * * * *',         '23 * * * *',               'lockdown trigger; halve cadence'),
  ('reduced',     'daily_confession_auto_prompt',    '15,45 * * * *',         '15 * * * *',               'confession prompt; halve cadence')
) AS t(change_type, jobname, old_schedule, new_schedule, reason);

COMMENT ON VIEW public.cron_paused_during_emergency IS
  'Post-2026-04-30 emergency-relief audit: jobs unscheduled or with cadence reduced. Restore by replaying schedules with cron.alter_job once compute headroom returns.';
