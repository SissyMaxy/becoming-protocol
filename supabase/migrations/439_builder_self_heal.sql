-- 439 — Mommy builder self-heal: auto-block jammed wishes + heartbeat view.
--
-- Root cause of the 2026-05-08→05-15 silent stall: builder.ts picked the
-- same wish ('b7d1c643', "Add cron job health auto-recovery worker") on
-- 12 consecutive runs, the drafter returned null each time, the builder
-- recorded `failed_drafted` and reset the wish back to `queued`. The
-- queue advanced nowhere. There's no attempt-count tracking and no
-- auto-skip on repeated failure.
--
-- Two pieces here:
--   1. `mommy_builder_auto_block_jammed_wishes()` — finds wishes with
--      ≥3 `failed_drafted` runs in the last 24h and flips them to
--      `needs_review` with auto_ship_eligible=false. Logs to
--      `mommy_supervisor_log` (the existing watchdog sink). Cron hourly.
--   2. `mommy_builder_health` view — surfaces last-ship-at, recent run
--      ratios, current queue depth. Easy supervisor read.
--
-- The 30-min backstop cron on the builder workflow then picks up the
-- next eligible wish automatically. Mommy doesn't stop building.

CREATE OR REPLACE FUNCTION mommy_builder_auto_block_jammed_wishes()
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  r RECORD;
  v_blocked INTEGER := 0;
BEGIN
  FOR r IN
    SELECT mbr.wish_id, count(*) AS fail_count, max(mbr.started_at) AS most_recent_fail
    FROM mommy_builder_run mbr
    JOIN mommy_code_wishes w ON w.id = mbr.wish_id
    WHERE mbr.status = 'failed_drafted'
      AND mbr.started_at > now() - interval '24 hours'
      AND w.status = 'queued'
      AND w.auto_ship_eligible = TRUE
    GROUP BY mbr.wish_id
    HAVING count(*) >= 3
  LOOP
    UPDATE mommy_code_wishes
    SET status = 'needs_review',
        auto_ship_eligible = FALSE,
        auto_ship_blockers = COALESCE(auto_ship_blockers, ARRAY[]::TEXT[]) ||
          ARRAY['drafter_returned_null_' || r.fail_count || 'x_' || to_char(now(), 'YYYY_MM_DD')]::TEXT[],
        denial_reason = COALESCE(denial_reason, '') ||
          E'\nAuto-blocked by mommy_builder_auto_block_jammed_wishes: ' ||
          r.fail_count || ' failed drafter runs in 24h (latest ' ||
          to_char(r.most_recent_fail, 'YYYY-MM-DD HH24:MI') || ' UTC).',
        updated_at = now()
    WHERE id = r.wish_id;

    -- Log to supervisor sink so the watchdog dashboard shows the event.
    BEGIN
      INSERT INTO mommy_supervisor_log (
        component, severity, event_kind, message, context_data
      ) VALUES (
        'mommy_builder', 'warning', 'wish_auto_blocked',
        'Wish ' || r.wish_id::text || ' auto-blocked after '
          || r.fail_count || ' drafter null-returns in 24h.',
        jsonb_build_object('wish_id', r.wish_id, 'fail_count', r.fail_count,
                           'most_recent_fail', r.most_recent_fail)
      );
    EXCEPTION WHEN undefined_table THEN
      NULL; -- supervisor log table optional
    END;

    v_blocked := v_blocked + 1;
  END LOOP;

  RETURN v_blocked;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'mommy_builder_auto_block_jammed_wishes failed: %', SQLERRM;
  RETURN v_blocked;
END;
$fn$;

GRANT EXECUTE ON FUNCTION mommy_builder_auto_block_jammed_wishes() TO service_role;

-- Hourly cron — runs even when the builder workflow is otherwise idle.
DO $do$ BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'mommy-builder-self-heal-hourly') THEN
    PERFORM cron.unschedule('mommy-builder-self-heal-hourly');
  END IF;
EXCEPTION WHEN undefined_table THEN NULL; END $do$;

DO $do$ BEGIN
  PERFORM cron.schedule('mommy-builder-self-heal-hourly', '17 * * * *',
    $cron$SELECT mommy_builder_auto_block_jammed_wishes()$cron$);
EXCEPTION WHEN undefined_table THEN NULL; END $do$;

-- Health view for the watchdog dashboard.
CREATE OR REPLACE VIEW mommy_builder_health AS
WITH recent AS (
  SELECT
    count(*) FILTER (WHERE status = 'shipped' AND started_at > now() - interval '24 hours') AS shipped_24h,
    count(*) FILTER (WHERE status = 'failed_drafted' AND started_at > now() - interval '24 hours') AS failed_drafted_24h,
    count(*) FILTER (WHERE status = 'failed_ci' AND started_at > now() - interval '24 hours') AS failed_ci_24h,
    max(started_at) FILTER (WHERE status = 'shipped') AS last_shipped_at,
    max(started_at) AS last_run_at
  FROM mommy_builder_run
), queue AS (
  SELECT
    count(*) FILTER (WHERE status = 'queued' AND auto_ship_eligible = TRUE) AS eligible_queued,
    count(*) FILTER (WHERE status = 'queued' AND auto_ship_eligible = FALSE) AS ineligible_queued,
    count(*) FILTER (WHERE status = 'needs_review') AS needs_review,
    count(*) FILTER (WHERE status = 'shipped' AND shipped_at > now() - interval '7 days') AS shipped_7d
  FROM mommy_code_wishes
)
SELECT
  r.shipped_24h, r.failed_drafted_24h, r.failed_ci_24h,
  r.last_shipped_at, r.last_run_at,
  EXTRACT(EPOCH FROM (now() - r.last_shipped_at)) / 3600 AS hours_since_last_ship,
  q.eligible_queued, q.ineligible_queued, q.needs_review, q.shipped_7d,
  CASE
    WHEN r.last_shipped_at IS NULL OR r.last_shipped_at < now() - interval '24 hours' THEN 'stalled'
    WHEN r.shipped_24h = 0 AND r.failed_drafted_24h >= 3 THEN 'jammed'
    WHEN q.eligible_queued = 0 THEN 'idle_clean'
    ELSE 'healthy'
  END AS state
FROM recent r CROSS JOIN queue q;

GRANT SELECT ON mommy_builder_health TO service_role, authenticated;
