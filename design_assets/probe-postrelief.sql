WITH stats AS (
  SELECT query, calls, total_exec_time, mean_exec_time
  FROM pg_stat_statements
  WHERE query NOT ILIKE '%pg_stat_statements%'
    AND query NOT ILIKE '%pg_stat_activity%'
),
total AS (SELECT SUM(total_exec_time) AS sum_total FROM stats)
SELECT
  (SELECT jsonb_agg(jsonb_build_object(
       'q',  substring(s.query, 1, 140),
       'calls', s.calls,
       'mean_ms', round(s.mean_exec_time::numeric, 1),
       'total_ms', round(s.total_exec_time::numeric, 0),
       'pct', round((s.total_exec_time / NULLIF(t.sum_total, 0) * 100)::numeric, 1)
   ) ORDER BY s.total_exec_time DESC)
   FROM (SELECT * FROM stats ORDER BY total_exec_time DESC LIMIT 10) s, total t)        AS top10_post_relief,
  (SELECT count(*) FROM pg_stat_activity WHERE datname = 'postgres')                    AS connection_count,
  (SELECT count(*) FROM cron.job WHERE active = true)                                    AS active_jobs,
  (SELECT pg_size_pretty(pg_total_relation_size('net._http_response')))                  AS net_size,
  (SELECT round(extract(epoch from (now() - stats_reset))/60.0, 1)
   FROM pg_stat_statements_info LIMIT 1)                                                 AS stats_age_min;
