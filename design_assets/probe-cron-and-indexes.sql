SELECT
  (SELECT jsonb_agg(jsonb_build_object('name', indexname, 'def', indexdef))
   FROM pg_indexes WHERE schemaname='net' AND tablename='_http_response') AS net_indexes,
  (SELECT jsonb_agg(jsonb_build_object(
       'jobid', jobid,
       'jobname', jobname,
       'schedule', schedule,
       'active', active,
       'command', substring(command, 1, 120)
   ) ORDER BY jobid)
   FROM cron.job) AS crons,
  (SELECT jsonb_object_agg(name, setting)
   FROM pg_settings WHERE name LIKE 'pg_net%') AS pg_net_settings,
  (SELECT count(*) FROM pg_stat_activity WHERE datname='postgres') AS connection_count,
  (SELECT round(extract(epoch from (now() - stats_reset))/3600.0, 1)
   FROM pg_stat_statements_info LIMIT 1) AS stats_age_hours;
