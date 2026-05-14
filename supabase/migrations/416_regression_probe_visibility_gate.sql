-- 416 — Regression probe visibility gate.
--
-- Incident 2026-05-14: user saw "Probe visibility marker for decree
-- 7f973b91-e1b9-4c52-bdc4-e80b47bc1bb2" rendered in her live UI.
-- Source: scripts/handler-regression/db.mjs inserts handler_outreach_queue
-- rows with source='regression_probe_visibility' and message starting
-- "Probe visibility marker..." to simulate visible-before-penalized
-- preconditions for decree-enforcement tests, then deletes them. Between
-- the insert and the delete, the row is fetched by any polling UI/push
-- consumer and surfaces to the user.
--
-- Per feedback_test_pollution_never_surfaces: probe-tagged rows must
-- NEVER surface to user-facing content. Three defenses, defense-in-depth:
--
--   1. BEFORE INSERT trigger on handler_outreach_queue clamps expires_at
--      on regression_% rows to 30s in the past, so every surface that
--      gates on expires_at >= now() drops them. surfaced_at is also
--      pre-stamped so visible-before-penalized checks treat them as
--      already-handled.
--   2. Auto-healer sweep (cron */5min) hard-deletes regression_% rows
--      older than 60s — cleans up after crashed tests.
--   3. bridge_outreach_to_push() (migration 380) updated to skip
--      regression sources entirely so they can never reach the push
--      pipeline.
--
-- Client-side: OutreachQueueCard.tsx and proactive-outreach.ts also
-- filter source LIKE 'regression_%' and trigger_reason LIKE 'probe_%'
-- as belt-and-suspenders, since the test code itself violates the
-- separation by inserting into the user-facing queue at all.

CREATE OR REPLACE FUNCTION trg_clamp_regression_probe_expiry()
RETURNS TRIGGER LANGUAGE plpgsql AS $fn$
BEGIN
  IF NEW.source IS NOT NULL AND NEW.source LIKE 'regression_%' THEN
    NEW.expires_at := now() - interval '30 seconds';
    IF NEW.surfaced_at IS NULL THEN
      NEW.surfaced_at := now() - interval '30 seconds';
    END IF;
  END IF;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS clamp_regression_probe_expiry ON handler_outreach_queue;
CREATE TRIGGER clamp_regression_probe_expiry
  BEFORE INSERT ON handler_outreach_queue
  FOR EACH ROW EXECUTE FUNCTION trg_clamp_regression_probe_expiry();

CREATE OR REPLACE FUNCTION purge_stale_regression_probe_rows()
RETURNS INT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE v_deleted INT;
BEGIN
  WITH del AS (
    DELETE FROM handler_outreach_queue
    WHERE source LIKE 'regression_%'
      AND created_at < now() - interval '60 seconds'
    RETURNING id
  )
  SELECT count(*) INTO v_deleted FROM del;
  RETURN v_deleted;
END;
$fn$;

GRANT EXECUTE ON FUNCTION purge_stale_regression_probe_rows() TO service_role;

DO $do$ BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'purge-regression-probe-rows') THEN
    PERFORM cron.unschedule('purge-regression-probe-rows');
  END IF;
EXCEPTION WHEN undefined_table THEN NULL;
END $do$;

DO $do$ BEGIN
  PERFORM cron.schedule(
    'purge-regression-probe-rows',
    '*/5 * * * *',
    $cron$SELECT purge_stale_regression_probe_rows()$cron$
  );
EXCEPTION WHEN undefined_table THEN NULL;
END $do$;

-- Patch bridge_outreach_to_push to skip regression sources entirely.
CREATE OR REPLACE FUNCTION bridge_outreach_to_push(
  p_outreach_id UUID,
  p_user_id UUID,
  p_message TEXT,
  p_urgency TEXT,
  p_source TEXT,
  p_kind TEXT,
  p_trigger_reason TEXT,
  p_expires_at TIMESTAMPTZ,
  p_scheduled_for TIMESTAMPTZ
) RETURNS VOID
LANGUAGE plpgsql AS $fn$
DECLARE
  v_title TEXT;
  v_body TEXT;
  v_persona TEXT;
BEGIN
  IF p_source IS NOT NULL AND (p_source LIKE 'regression_%' OR p_source = 'test_probe') THEN
    UPDATE handler_outreach_queue
    SET push_dispatched_at = COALESCE(push_dispatched_at, now())
    WHERE id = p_outreach_id;
    RETURN;
  END IF;

  IF p_urgency IS NULL OR p_urgency NOT IN ('high', 'critical', 'normal') THEN RETURN; END IF;
  IF p_message IS NULL OR length(trim(p_message)) = 0 THEN RETURN; END IF;

  IF EXISTS (
    SELECT 1 FROM scheduled_notifications
    WHERE (payload->'data'->>'outreach_id') = p_outreach_id::text
  ) THEN
    UPDATE handler_outreach_queue
    SET push_dispatched_at = COALESCE(push_dispatched_at, now())
    WHERE id = p_outreach_id;
    RETURN;
  END IF;

  v_persona := COALESCE((SELECT handler_persona FROM user_state WHERE user_id = p_user_id), '');

  v_title := CASE
    WHEN v_persona = 'dommy_mommy' THEN 'Mama'
    WHEN p_source LIKE 'mommy_%' OR p_kind LIKE 'mommy_%' THEN 'Mama'
    ELSE 'Handler'
  END;

  v_body := CASE
    WHEN length(p_message) <= 140 THEN p_message
    ELSE substring(p_message FROM 1 FOR 138) || '…'
  END;

  INSERT INTO scheduled_notifications (
    user_id, notification_type, scheduled_for, expires_at, payload, status
  ) VALUES (
    p_user_id,
    COALESCE(p_source, 'handler_outreach'),
    COALESCE(p_scheduled_for, now()),
    p_expires_at,
    jsonb_build_object(
      'title', v_title,
      'body', v_body,
      'data', jsonb_build_object(
        'outreach_id', p_outreach_id,
        'kind', p_kind,
        'source', p_source,
        'trigger_reason', p_trigger_reason
      )
    ),
    'pending'
  );

  UPDATE handler_outreach_queue
  SET push_dispatched_at = now()
  WHERE id = p_outreach_id;
END;
$fn$;

SELECT purge_stale_regression_probe_rows();
