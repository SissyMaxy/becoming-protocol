-- 247 — kill duplicate scheduled_daily confessions, prevent recurrence.
--
-- Bug: handler-autonomous fires daily-confession scheduling at midnight via
-- cron. Two near-simultaneous invocations both pass the .maybeSingle()
-- "does today already exist?" check (returns null when 0 rows OR when 2+
-- rows already exist via PGRST116), so both insert. After the first dupe,
-- the guard fails-open on every subsequent run and dupes compound (we
-- observed 4× rows for one user_id in the wild).
--
-- Fix: partial unique index keyed on (user_id, calendar day) for
-- category='scheduled_daily'. Daily insert in the edge fn becomes
-- ON CONFLICT DO NOTHING.
--
-- Cleanup: collapse existing same-day dupes to one row (prefer answered
-- copy, else earliest).
--
-- Note: bare `created_at::date` cast on timestamptz is STABLE, not
-- IMMUTABLE, so postgres rejects it in an index expression. Wrap with
-- `(... AT TIME ZONE 'UTC')::date` — AT TIME ZONE with a literal collapses
-- to an immutable timestamp-without-tz, which casts to date deterministically.

WITH ranked AS (
  SELECT id, user_id, (created_at AT TIME ZONE 'UTC')::date AS sched_date,
         created_at, confessed_at,
         ROW_NUMBER() OVER (
           PARTITION BY user_id, (created_at AT TIME ZONE 'UTC')::date
           ORDER BY (confessed_at IS NOT NULL) DESC,  -- prefer answered
                    created_at ASC                     -- then earliest
         ) AS rn
  FROM confession_queue
  WHERE category = 'scheduled_daily'
)
DELETE FROM confession_queue
WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

CREATE UNIQUE INDEX IF NOT EXISTS uq_confession_queue_scheduled_daily_per_day
  ON confession_queue (user_id, ((created_at AT TIME ZONE 'UTC')::date))
  WHERE category = 'scheduled_daily';
