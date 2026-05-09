-- Migration 320: per-table autovacuum tuning + one-time ANALYZE on
-- write-heavy tables (audit 2026-04-30).
--
-- Hard rule: per-table only, no globals. Targeted at the tables that
-- pg_stat_statements identifies as write-heavy (tens of thousands of
-- inserts + updates). Lower scale_factor causes autovacuum to fire on
-- ~5% dead tuples instead of the default 20%, keeping bloat down on
-- tables with frequent UPDATEs.

-- handler_outreach_queue: status flips on every delivery, expiry,
-- response. 2.7k rows but high churn.
ALTER TABLE public.handler_outreach_queue SET (
  autovacuum_vacuum_scale_factor = 0.05,
  autovacuum_analyze_scale_factor = 0.02
);

-- system_invariants_log: every cron tick INSERTs new check rows.
ALTER TABLE public.system_invariants_log SET (
  autovacuum_vacuum_scale_factor = 0.05,
  autovacuum_analyze_scale_factor = 0.02
);

-- handler_directives: written by every Handler decision cycle.
ALTER TABLE public.handler_directives SET (
  autovacuum_vacuum_scale_factor = 0.05,
  autovacuum_analyze_scale_factor = 0.02
);

-- handler_messages: hot read path; keep stats fresh for the new index.
ALTER TABLE public.handler_messages SET (
  autovacuum_analyze_scale_factor = 0.02
);

-- One-time ANALYZE so the planner picks up the migration-318 indexes
-- and re-estimates n_distinct on the recently-grown tables.
ANALYZE public.handler_messages;
ANALYZE public.handler_outreach_queue;
ANALYZE public.system_invariants_log;
ANALYZE public.handler_directives;
ANALYZE public.handler_ai_logs;

-- Note: no VACUUM FULL anywhere (locks the table). No tuning on cron
-- schema (no privilege; verified). No tuning on net schema (same).
