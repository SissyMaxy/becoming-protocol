-- 316_pg_net_response_bloat_relief.sql
-- Emergency relief 2026-04-30 — pg_net._http_response bloat was consuming 75.4%
-- of all database compute. The cleanup query (DELETE FROM net._http_response
-- WHERE created < now() - $ttl) was hitting 893ms mean × 46k+ calls because the
-- table held 76 MB of stale HTTP-response rows. The (created) index already
-- exists; the fix is bloat purge so the working set stays small. The pg_net
-- worker then keeps it small using the existing index.
--
-- See: design_assets/hot-queries-2026-04-30.md
-- Sibling: 314 (cron auth fix) lands first; 317 (cron schedule relief) is paired.
--
-- NOT done here: pg_net.ttl is a postmaster GUC and cannot be changed at
-- runtime (SQLSTATE 55P02). To shrink the steady-state working set further,
-- ask Supabase support to set pg_net.ttl to '1 hour' on cluster restart, or
-- run a periodic purge cron (followup migration).

-- ============================================================
-- 1) One-shot purge — chunked DELETE so we never trip statement timeout.
--    The existing _http_response_created_idx makes each chunk index-driven.
-- ============================================================

DO $$
DECLARE
  deleted_count INT;
  total_deleted BIGINT := 0;
BEGIN
  LOOP
    DELETE FROM net._http_response
    WHERE ctid IN (
      SELECT ctid FROM net._http_response
      WHERE created < now() - interval '1 hour'
      ORDER BY created
      LIMIT 2000
    );
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    total_deleted := total_deleted + deleted_count;
    EXIT WHEN deleted_count = 0;
  END LOOP;
  RAISE NOTICE 'pg_net response bloat purge: % rows deleted', total_deleted;
END $$;

-- ============================================================
-- 2) Restart pg_net worker so it picks up the now-empty table cleanly.
-- ============================================================

DO $$
BEGIN
  PERFORM net.worker_restart();
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'net.worker_restart() skipped: %', SQLERRM;
END $$;

-- ============================================================
-- 3) ANALYZE so the planner has fresh stats for the post-purge table.
-- ============================================================

ANALYZE net._http_response;

-- ============================================================
-- 4) Reset pg_stat_statements so post-apply hot-query verification reflects
--    only the post-relief workload.
--
-- 2026-04-30 patch (perf-data-driven branch, while reconciling against
-- upstream 316): pg_stat_statements_reset() raises 42883 when applied
-- via the Supabase Management API's temporary login role, blocking
-- the migration. Wrap so failure is non-fatal.
-- ============================================================

DO $$
BEGIN
  PERFORM pg_stat_statements_reset();
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_stat_statements_reset() skipped: %', SQLERRM;
END $$;
