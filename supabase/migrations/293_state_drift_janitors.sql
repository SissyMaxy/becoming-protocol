-- 293 — State-drift janitors for outreach expiry + chastity lock sync.
--
-- 2026-05-07 CI invariant failures, persistent across runs:
--   1. handler_outreach_queue rows where expires_at < now() but status
--      stays 'pending'/'queued'/'scheduled'. The OutreachQueueCard hides
--      them via expires_at filter, but the invariant check finds them
--      and flags. Need to actually flip status='expired' so DB state is
--      consistent with display state.
--   2. user_state.chastity_locked drifts from chastity_sessions reality:
--      a session row exists with unlocked_at IS NULL but
--      user_state.chastity_locked = false. Some path closes the session
--      without writing to user_state, or vice versa.
--
-- Fixes:
--   - mark_expired_outreach() function + scheduled cron every 5 min
--   - chastity_session sync trigger: ANY write to chastity_sessions
--     reconciles user_state.chastity_locked + chastity_streak_days
--   - One-time backfill of current drifted rows
--   - Both invariant queries should clear after this lands

-- ─── 1. Outreach expiry janitor ────────────────────────────────────
CREATE OR REPLACE FUNCTION mark_expired_outreach()
RETURNS INT LANGUAGE plpgsql AS $$
DECLARE
  flipped INT;
BEGIN
  UPDATE handler_outreach_queue
  SET status = 'expired'
  WHERE delivered_at IS NULL
    AND expires_at < now()
    AND status IN ('pending', 'queued', 'scheduled');
  GET DIAGNOSTICS flipped = ROW_COUNT;
  RETURN flipped;
END;
$$;

-- One-time backfill — clean up any current drift
SELECT mark_expired_outreach();

-- Schedule every 5 min via pg_cron (idempotent unschedule then create)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    CREATE EXTENSION pg_cron;
  END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$
DECLARE jid BIGINT;
BEGIN
  FOR jid IN SELECT jobid FROM cron.job WHERE jobname = 'outreach-expiry-janitor-5min' LOOP
    PERFORM cron.unschedule(jid);
  END LOOP;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$
BEGIN
  PERFORM cron.schedule(
    'outreach-expiry-janitor-5min',
    '*/5 * * * *',
    $cmd$ SELECT mark_expired_outreach() $cmd$
  );
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- ─── 2. Chastity session ↔ user_state sync ─────────────────────────
-- Triggers on chastity_sessions write-paths so user_state always
-- reflects the session reality. Whichever side is canonical, this
-- pulls the other into agreement.

CREATE OR REPLACE FUNCTION trg_sync_user_state_from_chastity()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  has_active BOOLEAN;
  streak_days INT;
  earliest_lock TIMESTAMPTZ;
BEGIN
  -- After any change to chastity_sessions for this user, re-derive
  -- user_state from current sessions.
  SELECT EXISTS (
    SELECT 1 FROM chastity_sessions
    WHERE user_id = COALESCE(NEW.user_id, OLD.user_id)
      AND unlocked_at IS NULL
  ) INTO has_active;

  -- Streak = days since the EARLIEST currently-active lock_at, or 0 if none
  IF has_active THEN
    SELECT MIN(locked_at) INTO earliest_lock
    FROM chastity_sessions
    WHERE user_id = COALESCE(NEW.user_id, OLD.user_id)
      AND unlocked_at IS NULL;
    streak_days := GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (now() - earliest_lock)) / 86400)::INT);
  ELSE
    streak_days := 0;
  END IF;

  UPDATE user_state
  SET chastity_locked = has_active,
      chastity_streak_days = streak_days,
      updated_at = now()
  WHERE user_id = COALESCE(NEW.user_id, OLD.user_id);

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS sync_user_state_from_chastity_ins ON chastity_sessions;
CREATE TRIGGER sync_user_state_from_chastity_ins
  AFTER INSERT ON chastity_sessions
  FOR EACH ROW EXECUTE FUNCTION trg_sync_user_state_from_chastity();

DROP TRIGGER IF EXISTS sync_user_state_from_chastity_upd ON chastity_sessions;
CREATE TRIGGER sync_user_state_from_chastity_upd
  AFTER UPDATE ON chastity_sessions
  FOR EACH ROW EXECUTE FUNCTION trg_sync_user_state_from_chastity();

DROP TRIGGER IF EXISTS sync_user_state_from_chastity_del ON chastity_sessions;
CREATE TRIGGER sync_user_state_from_chastity_del
  AFTER DELETE ON chastity_sessions
  FOR EACH ROW EXECUTE FUNCTION trg_sync_user_state_from_chastity();

-- One-time backfill: reconcile every user where drift exists right now.
DO $$
DECLARE
  uid UUID;
BEGIN
  FOR uid IN
    SELECT DISTINCT us.user_id
    FROM user_state us
    LEFT JOIN LATERAL (
      SELECT EXISTS (
        SELECT 1 FROM chastity_sessions cs
        WHERE cs.user_id = us.user_id AND cs.unlocked_at IS NULL
      ) AS active
    ) sess ON TRUE
    WHERE COALESCE(us.chastity_locked, FALSE) <> COALESCE(sess.active, FALSE)
  LOOP
    UPDATE user_state
    SET chastity_locked = EXISTS (
          SELECT 1 FROM chastity_sessions
          WHERE user_id = uid AND unlocked_at IS NULL
        ),
        chastity_streak_days = COALESCE((
          SELECT GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (now() - MIN(locked_at))) / 86400)::INT)
          FROM chastity_sessions
          WHERE user_id = uid AND unlocked_at IS NULL
        ), 0),
        updated_at = now()
    WHERE user_id = uid;
  END LOOP;
END $$;

-- ─── 3. Optional: opportunistic janitor on outreach inserts ────────
-- When a new outreach row is inserted, also flip expired peers in the
-- same user's queue. Cheap (single UPDATE), keeps the queue clean
-- between cron ticks. Doesn't replace the cron — extension of it.
CREATE OR REPLACE FUNCTION trg_outreach_opportunistic_expiry()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  UPDATE handler_outreach_queue
  SET status = 'expired'
  WHERE user_id = NEW.user_id
    AND id <> NEW.id
    AND delivered_at IS NULL
    AND expires_at < now()
    AND status IN ('pending', 'queued', 'scheduled');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS outreach_opportunistic_expiry ON handler_outreach_queue;
CREATE TRIGGER outreach_opportunistic_expiry
  AFTER INSERT ON handler_outreach_queue
  FOR EACH ROW EXECUTE FUNCTION trg_outreach_opportunistic_expiry();
