-- Migration 590: device_schedule status lifecycle reconcile (audit #16)
--
-- The device_schedule table was processed by multiple engines keyed on
-- incompatible status values:
--   - device-control.ts            wrote/read status='scheduled'
--   - conditioning-engine.ts cron  read status='pending', wrote 'executed'
--   - handler-autonomous.ts        wrote status='pending'
--   - variable-ratio-device.ts     wrote NO status (defaulted to 'scheduled')
--                                  and read on the legacy fired BOOLEAN
--   - arousal-maintenance.ts       wrote NO status (defaulted to 'scheduled')
--
-- A row inserted with 'scheduled' was invisible to the live cron fire engine
-- (which only sees 'pending'), so it silently never fired. And the legacy
-- fired-boolean readers grabbed rows from every writer regardless of status,
-- creating a two-reader race.
--
-- Canonical lifecycle status is now 'pending' (the value the live cron engine,
-- the autonomous planner, and the Today/calendar display readers all already
-- use). Lifecycle:
--     pending -> executing -> executed | expired | failed
--
-- This migration (a) backfills every legacy / non-canonical status onto the
-- canonical vocabulary so stuck rows fire and historical rows survive the new
-- constraint, and (b) installs a CHECK constraint on status. Idempotent.

-- ── 1. Make sure the legacy columns this backfill reads exist ────────────
ALTER TABLE device_schedule ADD COLUMN IF NOT EXISTS status TEXT;
ALTER TABLE device_schedule ADD COLUMN IF NOT EXISTS fired BOOLEAN DEFAULT FALSE;
ALTER TABLE device_schedule ADD COLUMN IF NOT EXISTS fired_at TIMESTAMPTZ;
ALTER TABLE device_schedule ADD COLUMN IF NOT EXISTS executed_at TIMESTAMPTZ;

-- ── 2. Drop any pre-existing CHECK so the backfill can rewrite freely and
--       so re-running this migration is safe ─────────────────────────────
ALTER TABLE device_schedule DROP CONSTRAINT IF EXISTS device_schedule_status_check;

-- ── 3. Backfill non-canonical / legacy status onto the canonical vocab ───
-- 3a. Legacy success markers -> terminal 'executed'. The fired BOOLEAN was the
--     only completion signal for variable-ratio rows; old device-control used
--     status='completed'. Both become 'executed'. Stamp fired_at if missing so
--     downstream "done" checks (Today card keys on executed | fired_at) agree.
UPDATE device_schedule
SET status   = 'executed',
    fired_at = COALESCE(fired_at, executed_at, NOW())
WHERE status = 'completed'
   OR (fired = TRUE AND (status IS NULL OR status NOT IN ('executed', 'expired', 'failed')));

-- 3b. Old device-control expiry marker 'skipped' -> 'expired'.
UPDATE device_schedule
SET status = 'expired'
WHERE status = 'skipped';

-- 3c. Everything still not in the canonical vocabulary and not yet fired
--     (status 'scheduled', NULL, or any other stray value) -> 'pending' so the
--     fire engine picks it up. 'executing' is left alone (in-flight).
UPDATE device_schedule
SET status = 'pending'
WHERE status IS NULL
   OR status NOT IN ('pending', 'executing', 'executed', 'expired', 'failed');

-- 3d. Keep the legacy fired BOOLEAN in sync with terminal status so the older
--     stats/UI readers that still look at `fired` agree with `status`.
UPDATE device_schedule
SET fired = TRUE
WHERE status IN ('executed', 'expired', 'failed')
  AND fired IS DISTINCT FROM TRUE;

-- ── 4. Enforce the canonical lifecycle vocabulary going forward ──────────
ALTER TABLE device_schedule
  ADD CONSTRAINT device_schedule_status_check
  CHECK (status IN ('pending', 'executing', 'executed', 'expired', 'failed'));

-- ── 5. Default new inserts to the canonical status (belt + suspenders for
--       any writer that forgets to set it) ───────────────────────────────
ALTER TABLE device_schedule ALTER COLUMN status SET DEFAULT 'pending';

-- ── 6. Index supporting the canonical fire query (status + scheduled_at) ─
CREATE INDEX IF NOT EXISTS idx_device_schedule_pending_fire
  ON device_schedule (user_id, scheduled_at)
  WHERE status = 'pending';
