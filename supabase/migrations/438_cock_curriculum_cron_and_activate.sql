-- 438 — Cock curriculum daily nudge cron + activate both users at phase 0.
-- Pairs with edge function `cock-curriculum-daily-nudge` (deployed
-- separately via MCP). Daily 14:00 UTC (09:00 CT) — lands before the
-- rest of the day's protocol queue.

DO $do$ BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'cock-curriculum-daily-nudge') THEN
    PERFORM cron.unschedule('cock-curriculum-daily-nudge');
  END IF;
EXCEPTION WHEN undefined_table THEN NULL; END $do$;
DO $do$ BEGIN
  PERFORM cron.schedule('cock-curriculum-daily-nudge', '0 14 * * *',
    $cron$SELECT invoke_edge_function('cock-curriculum-daily-nudge', '{}'::jsonb)$cron$);
EXCEPTION WHEN undefined_table THEN NULL; END $do$;

INSERT INTO cock_curriculum_settings (user_id, enabled, current_phase, phase_started_at, advance_events_required)
SELECT u, TRUE, 0, now(), 4
FROM (VALUES
  ('93327332-7d0d-4888-889a-1607a5776216'::uuid),
  ('8c69b9c8-34eb-4147-9fec-3c1a5bc74b6f'::uuid)
) AS u_tbl(u)
ON CONFLICT (user_id) DO UPDATE SET enabled = TRUE, updated_at = now();
