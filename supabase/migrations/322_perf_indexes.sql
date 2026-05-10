-- Migration 318: data-driven perf indexes (audit 2026-04-30)
-- See design_assets/perf-audit-2026-04-30.md for the analysis.
--
-- Plain CREATE INDEX (not CONCURRENTLY) because Supabase migrations
-- run inside a transaction and CONCURRENTLY is incompatible. Tables
-- being indexed are all <5k rows, so the AccessExclusive lock is brief
-- (single-digit ms). Safe to apply live.

-- handler_messages: hot pgrst query "WHERE user_id=$1 AND role=$2"
-- (6,644 calls × 26ms in pg_stat_statements). Existing index covers
-- (conversation_id, message_index) only, so the user_id+role lookup
-- seq-scans the table on every call.
CREATE INDEX IF NOT EXISTS idx_handler_messages_user_role_created
  ON public.handler_messages (user_id, role, created_at DESC);

-- handler_outreach_queue: mark_expired_outreach() runs UPDATE on
-- (delivered_at IS NULL AND expires_at < now() AND status IN (...)).
-- Existing (user_id, status, scheduled_for) doesn't help the
-- expires_at filter. Partial index keeps it tiny — only pending rows.
CREATE INDEX IF NOT EXISTS idx_outreach_queue_expires_pending
  ON public.handler_outreach_queue (expires_at)
  WHERE delivered_at IS NULL AND status IN ('pending', 'queued', 'scheduled');

-- Note: indexes on cron.job_run_details(start_time) and
-- net._http_response(created) would also help, but Supabase blocks
-- CREATE on cron/net schemas (verified: has_schema_privilege returns
-- false for both). Worked around by rewriting prune_cron_run_details()
-- in migration 321 to use the runid PK instead of start_time.
