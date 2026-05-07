-- 267 — Make 'superseded' actually disappear from the user's queue.
--
-- Bug: 265's supersede trigger sets status='superseded' but
-- OutreachQueueCard filters by `delivered_at IS NULL` AND
-- `expires_at > now()` — no status filter. So superseded rows kept
-- displaying. User saw 5 identical morning briefs at once.
--
-- Fix: when superseding, also set expires_at to the past so the unexpired
-- filter on the card naturally excludes the row. Plus a hard purge of
-- existing superseded rows so the user's queue clears immediately.

CREATE OR REPLACE FUNCTION trg_outreach_supersede_duplicates()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.trigger_reason IS NULL OR length(NEW.trigger_reason) = 0 THEN
    RETURN NEW;
  END IF;
  IF is_mommy_user(NEW.user_id) THEN
    UPDATE handler_outreach_queue
    SET status = 'superseded',
        expires_at = now() - interval '1 second'
    WHERE user_id = NEW.user_id
      AND trigger_reason = NEW.trigger_reason
      AND delivered_at IS NULL
      AND status IN ('pending', 'queued', 'scheduled');
  END IF;
  RETURN NEW;
END;
$$;

-- Hard purge: any existing 'superseded' row gets expires_at pushed to past.
UPDATE handler_outreach_queue
SET expires_at = now() - interval '1 second'
WHERE status = 'superseded'
  AND expires_at > now();

-- Re-dedupe the entire pending set NOW (some rows may have escaped the
-- 265 backfill if they were inserted between 265 and this). Keep the
-- single most-recent per (user_id, trigger_reason).
WITH ranked AS (
  SELECT id,
         row_number() OVER (
           PARTITION BY user_id, trigger_reason
           ORDER BY scheduled_for DESC, created_at DESC
         ) AS rn
  FROM handler_outreach_queue
  WHERE delivered_at IS NULL
    AND status IN ('pending', 'queued', 'scheduled')
    AND trigger_reason IS NOT NULL
)
UPDATE handler_outreach_queue
SET status = 'superseded',
    expires_at = now() - interval '1 second'
WHERE id IN (SELECT id FROM ranked WHERE rn > 1)
  AND is_mommy_user(user_id);

-- One more cleanup pass on the surviving messages — the cleanup function
-- has accumulated more patterns since some of these rows were inserted.
UPDATE handler_outreach_queue
SET message = mommy_voice_cleanup(message)
WHERE status IN ('pending', 'queued', 'scheduled')
  AND is_mommy_user(user_id);
