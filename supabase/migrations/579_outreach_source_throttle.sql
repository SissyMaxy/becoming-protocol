-- 579 — Outreach source dynamic throttle (engagement_quota fix).
--
-- The 2026-05-10 mommy_code_wishes audit flagged that engagement_quota
-- alone produces 67% (134/200) of expired undelivered messages. Single
-- source is monopolizing delivery capacity, crowding out higher-signal
-- outreach (decree deadlines, leak cascade, hookup-prehookup).
--
-- This migration ships an adaptive throttle:
--
--   1. outreach_source_throttle table — per (user_id, source) row with
--      throttle_until + throttle_factor + reason + evidence.
--   2. outreach_source_rebalancer_eval() — hourly. Counts expired rows
--      by source in last 7d. If any source > 60% of total expired AND
--      total expired > 20 in that window → throttle 0.5 for 48h.
--      Auto-extends if still dominant after window.
--   3. BEFORE INSERT trigger on handler_outreach_queue — when a row's
--      source is currently throttled, with probability (1-throttle_factor)
--      either (a) skip the insert outright (return NULL) or (b) push
--      scheduled_for +12h and force urgency to 'low'. Generators don't
--      need to change.
--   4. Telemetry view: outreach_throttle_state — current throttles + the
--      expired-volume breakdown that drove each one.

CREATE TABLE IF NOT EXISTS outreach_source_throttle (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source TEXT NOT NULL,
  throttle_factor REAL NOT NULL DEFAULT 0.5
    CHECK (throttle_factor > 0 AND throttle_factor <= 1.0),
  throttle_until TIMESTAMPTZ NOT NULL,
  reason TEXT NOT NULL,
  evidence JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  superseded_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_throttle_active
  ON outreach_source_throttle (user_id, source, throttle_until DESC)
  WHERE superseded_at IS NULL;
ALTER TABLE outreach_source_throttle ENABLE ROW LEVEL SECURITY;
DO $do$ BEGIN
  CREATE POLICY ost_self ON outreach_source_throttle FOR SELECT TO authenticated USING (auth.uid()=user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $do$;
DO $do$ BEGIN
  CREATE POLICY ost_service ON outreach_source_throttle FOR ALL TO service_role USING (TRUE) WITH CHECK (TRUE);
EXCEPTION WHEN duplicate_object THEN NULL; END $do$;

-- Audit log of trigger-level throttle hits (drop / delay decisions).
CREATE TABLE IF NOT EXISTS outreach_throttle_hits (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL,
  source TEXT NOT NULL,
  decision TEXT NOT NULL CHECK (decision IN ('passed','dropped','deferred')),
  throttle_factor REAL,
  original_scheduled_for TIMESTAMPTZ,
  adjusted_scheduled_for TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_throttle_hits_recent
  ON outreach_throttle_hits (user_id, created_at DESC);
ALTER TABLE outreach_throttle_hits ENABLE ROW LEVEL SECURITY;
DO $do$ BEGIN
  CREATE POLICY oth_self ON outreach_throttle_hits FOR SELECT TO authenticated USING (auth.uid()=user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $do$;
DO $do$ BEGIN
  CREATE POLICY oth_service ON outreach_throttle_hits FOR ALL TO service_role USING (TRUE) WITH CHECK (TRUE);
EXCEPTION WHEN duplicate_object THEN NULL; END $do$;

-- Helper: is this (user, source) currently throttled? Returns factor or 1.0.
CREATE OR REPLACE FUNCTION current_throttle_factor(p_user_id UUID, p_source TEXT)
RETURNS REAL LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT COALESCE(
    (SELECT throttle_factor
       FROM outreach_source_throttle
      WHERE user_id = p_user_id AND source = p_source
        AND superseded_at IS NULL
        AND throttle_until > now()
      ORDER BY throttle_until DESC LIMIT 1),
    1.0
  );
$fn$;

-- Hourly rebalancer.
CREATE OR REPLACE FUNCTION outreach_source_rebalancer_eval()
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  r RECORD;
  v_throttles_issued INT := 0;
  v_total_expired INT;
BEGIN
  -- For every user with any expired rows in the last 7 days, find the
  -- dominant expired source (if any source contributes >60% of expirations
  -- AND the absolute expired count is >= 20), and throttle it.
  FOR r IN
    WITH expired AS (
      SELECT user_id, source, COUNT(*) AS n
        FROM handler_outreach_queue
       WHERE expires_at < now()
         AND expires_at > now() - interval '7 days'
         AND COALESCE(status,'pending') NOT IN ('delivered','consumed','dismissed')
       GROUP BY user_id, source
    ),
    totals AS (
      SELECT user_id, SUM(n) AS total FROM expired GROUP BY user_id
    )
    SELECT e.user_id, e.source, e.n, t.total
      FROM expired e JOIN totals t USING (user_id)
     WHERE t.total >= 20
       AND e.n::float / t.total >= 0.6
  LOOP
    -- Mark any existing throttle for this (user, source) as superseded.
    UPDATE outreach_source_throttle
       SET superseded_at = now()
     WHERE user_id = r.user_id AND source = r.source
       AND superseded_at IS NULL
       AND throttle_until > now() - interval '24 hours';

    INSERT INTO outreach_source_throttle (
      user_id, source, throttle_factor, throttle_until, reason, evidence
    ) VALUES (
      r.user_id, r.source, 0.5, now() + interval '48 hours',
      'dominant_expired_source',
      jsonb_build_object('expired_7d', r.n, 'total_expired_7d', r.total,
                         'share', round((r.n::numeric / r.total) * 100, 1))
    );
    v_throttles_issued := v_throttles_issued + 1;
  END LOOP;

  RETURN v_throttles_issued;
END $fn$;

-- BEFORE-INSERT trigger on handler_outreach_queue.
CREATE OR REPLACE FUNCTION apply_outreach_source_throttle()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_factor REAL;
  v_roll REAL;
BEGIN
  -- Never throttle critical urgency or system-required sources.
  IF COALESCE(NEW.urgency, 'normal') = 'critical' THEN RETURN NEW; END IF;
  IF NEW.source IN ('decree_deadline','prehookup_intensifier','leak_cascade',
                    'protocol_health','focus_picker') THEN
    RETURN NEW;
  END IF;

  v_factor := current_throttle_factor(NEW.user_id, NEW.source);
  IF v_factor >= 1.0 THEN
    -- Not throttled.
    INSERT INTO outreach_throttle_hits (user_id, source, decision)
    VALUES (NEW.user_id, NEW.source, 'passed');
    RETURN NEW;
  END IF;

  v_roll := random();
  IF v_roll < v_factor THEN
    -- Survived the throttle.
    INSERT INTO outreach_throttle_hits (user_id, source, decision, throttle_factor)
    VALUES (NEW.user_id, NEW.source, 'passed', v_factor);
    RETURN NEW;
  END IF;

  -- Throttle hit: 70% defer, 30% drop.
  IF random() < 0.7 THEN
    INSERT INTO outreach_throttle_hits (
      user_id, source, decision, throttle_factor,
      original_scheduled_for, adjusted_scheduled_for
    ) VALUES (
      NEW.user_id, NEW.source, 'deferred', v_factor,
      NEW.scheduled_for, COALESCE(NEW.scheduled_for, now()) + interval '12 hours'
    );
    NEW.scheduled_for := COALESCE(NEW.scheduled_for, now()) + interval '12 hours';
    NEW.urgency := 'low';
    RETURN NEW;
  ELSE
    INSERT INTO outreach_throttle_hits (user_id, source, decision, throttle_factor)
    VALUES (NEW.user_id, NEW.source, 'dropped', v_factor);
    RETURN NULL; -- skip the insert entirely
  END IF;
END $fn$;

DROP TRIGGER IF EXISTS trg_outreach_source_throttle ON handler_outreach_queue;
CREATE TRIGGER trg_outreach_source_throttle
BEFORE INSERT ON handler_outreach_queue
FOR EACH ROW EXECUTE FUNCTION apply_outreach_source_throttle();

-- View: current throttles + recent expired breakdown driving them.
CREATE OR REPLACE VIEW outreach_throttle_state AS
SELECT
  t.user_id,
  t.source,
  t.throttle_factor,
  t.throttle_until,
  t.reason,
  t.evidence,
  (t.throttle_until - now()) AS time_remaining
  FROM outreach_source_throttle t
 WHERE t.superseded_at IS NULL
   AND t.throttle_until > now();

-- Schedule hourly rebalancer.
DO $cron$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('outreach_source_rebalancer_eval');
  END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END $cron$;
DO $cron$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.schedule('outreach_source_rebalancer_eval', '20 * * * *',
      $$SELECT outreach_source_rebalancer_eval();$$);
  END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END $cron$;

-- Run once immediately so existing engagement_quota over-volume is caught.
SELECT outreach_source_rebalancer_eval();
