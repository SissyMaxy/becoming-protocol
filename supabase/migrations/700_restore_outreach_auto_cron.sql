-- 700 — restore handler-outreach-auto's cron.
--
-- Found 2026-07-22 while wiring the turnout_desire reframe angle: NOTHING
-- calls handler-outreach-auto — no cron.job row, no workflow, no code path.
-- The mig 326/327 prune record shows the job was deliberately KEPT
-- ('handler-outreach-auto-hourly', rescheduled :17 → :47, "reduced" not
-- "unscheduled"), but it is absent from live cron. It silently vanished
-- mid-May: the newest confessions-authored reframe is 2026-05-15, and every
-- generator inside (expiry sweep, autonomous outreach, the 12h reframe
-- author, funnel previews) has been dead since. The 675 retrieval feed was
-- wired in July on top of an author that no longer ran.
--
-- Restores the job at its last sanctioned schedule (:47, off the :00 lane
-- per the 326 collision analysis). invoke_edge_function sends the service
-- key, satisfying the fn's requireServiceRole gate. All pacing lives inside
-- the fn (per-generator dedup windows, 12h reframe gate), so hourly is the
-- designed cadence, not a new load.

DO $$
BEGIN
  PERFORM cron.unschedule('handler-outreach-auto-hourly');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'handler-outreach-auto-hourly',
  '47 * * * *',
  $$SELECT invoke_edge_function('handler-outreach-auto', '{}'::jsonb)$$
);
