-- 300 — When outreach status flips to terminal (expired/superseded), also
-- set delivered_at so downstream filters that key on delivered_at IS NULL
-- treat the row as "no longer pending."
--
-- The regression test "outreach queue has no expired pending rows" filters
-- by delivered_at IS NULL only, not by status. My migration 293's
-- mark_expired_outreach() and 267's supersede trigger set status to
-- 'expired' / 'superseded' but left delivered_at NULL, so the test still
-- saw them as expired-but-pending → fail.
--
-- Conceptually, "delivered_at" has historically meant "user acked it."
-- We extend the semantics: it also means "the system retired this row."
-- A non-NULL delivered_at means: not in the live queue anymore, regardless
-- of why. status field carries the reason.

-- Janitor: also set delivered_at when flipping to expired
CREATE OR REPLACE FUNCTION mark_expired_outreach()
RETURNS INT LANGUAGE plpgsql AS $$
DECLARE flipped INT;
BEGIN
  UPDATE handler_outreach_queue
  SET status = 'expired',
      delivered_at = COALESCE(delivered_at, now())
  WHERE delivered_at IS NULL
    AND expires_at < now()
    AND status IN ('pending', 'queued', 'scheduled');
  GET DIAGNOSTICS flipped = ROW_COUNT;
  RETURN flipped;
END;
$$;

-- Supersede trigger: also set delivered_at when superseding old rows
CREATE OR REPLACE FUNCTION trg_outreach_supersede_duplicates()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.trigger_reason IS NULL OR length(NEW.trigger_reason) = 0 THEN
    RETURN NEW;
  END IF;
  IF is_mommy_user(NEW.user_id) THEN
    UPDATE handler_outreach_queue
    SET status = 'superseded',
        expires_at = now() - interval '1 second',
        delivered_at = now()
    WHERE user_id = NEW.user_id
      AND trigger_reason = NEW.trigger_reason
      AND delivered_at IS NULL
      AND status IN ('pending', 'queued', 'scheduled');
  END IF;
  RETURN NEW;
END;
$$;

-- Same for the rate-limit trigger that auto-supersedes excess inserts
CREATE OR REPLACE FUNCTION trg_outreach_rate_limit()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE recent_count INT; cap INT;
BEGIN
  IF NOT is_mommy_user(NEW.user_id) THEN RETURN NEW; END IF;
  IF NEW.source IS NULL THEN RETURN NEW; END IF;
  cap := outreach_rate_limit_for_source(NEW.source);
  SELECT count(*) INTO recent_count
  FROM handler_outreach_queue
  WHERE user_id = NEW.user_id
    AND source = NEW.source
    AND created_at >= now() - interval '1 hour'
    AND status NOT IN ('superseded', 'expired', 'failed');
  IF recent_count >= cap THEN
    NEW.status := 'superseded';
    NEW.expires_at := now() - interval '1 second';
    NEW.delivered_at := now();
  END IF;
  RETURN NEW;
END;
$$;

-- Same for the opportunistic expiry trigger from 293
CREATE OR REPLACE FUNCTION trg_outreach_opportunistic_expiry()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  UPDATE handler_outreach_queue
  SET status = 'expired',
      delivered_at = COALESCE(delivered_at, now())
  WHERE user_id = NEW.user_id
    AND id <> NEW.id
    AND delivered_at IS NULL
    AND expires_at < now()
    AND status IN ('pending', 'queued', 'scheduled');
  RETURN NEW;
END;
$$;

-- One-time backfill: any current rows that are status=expired/superseded
-- but delivered_at IS NULL get delivered_at set so they drop out of the
-- regression test's view immediately.
UPDATE handler_outreach_queue
SET delivered_at = COALESCE(created_at, now())
WHERE delivered_at IS NULL
  AND status IN ('expired', 'superseded', 'failed', 'cancelled');

-- Plus: run the janitor once to catch any current naturally-expired rows.
SELECT mark_expired_outreach();
