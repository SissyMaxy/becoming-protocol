-- Migration 226: notified_at flags for time-sensitive queues
-- Handler-autonomous compliance_check now enqueues scheduled_notifications for
-- commitments within 60m of by_when, playbook moves at fires_at, and warmup
-- queue entries coming due. Needs per-row notified_at to dedupe across the
-- 5-minute cron cycles. gina_playbook already has this column from migration
-- 225.

ALTER TABLE handler_commitments ADD COLUMN IF NOT EXISTS notified_at TIMESTAMPTZ;
ALTER TABLE gina_warmup_queue ADD COLUMN IF NOT EXISTS notified_at TIMESTAMPTZ;
