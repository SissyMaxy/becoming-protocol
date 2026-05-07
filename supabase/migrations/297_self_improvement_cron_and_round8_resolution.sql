-- 297 — Self-improvement detector cron + round 8 wish resolution.
-- 2026-05-07.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    CREATE EXTENSION pg_cron;
  END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net') THEN
    CREATE EXTENSION pg_net;
  END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$
DECLARE
  jid BIGINT;
BEGIN
  FOR jid IN SELECT jobid FROM cron.job WHERE jobname = 'self-improvement-detector-hourly' LOOP
    PERFORM cron.unschedule(jid);
  END LOOP;
END $$;

-- Hourly at :47 (off-cycle from other crons)
SELECT cron.schedule(
  'self-improvement-detector-hourly',
  '47 * * * *',
  $cmd$
    SELECT net.http_post(
      url := current_setting('app.settings.supabase_url', true) || '/functions/v1/self-improvement-detector',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
      ),
      body := '{}'::jsonb
    ) AS request_id;
  $cmd$
);

-- Round 8 wish resolution (these shipped within the same turn they were
-- identified — meta-system working as designed)
INSERT INTO mommy_code_wishes (
  wish_title, wish_body, protocol_goal, source, priority,
  affected_surfaces, complexity_tier, auto_ship_eligible, classified_at, classified_by,
  status, shipped_at, shipped_in_commit, ship_notes
) VALUES
(
  'fast-react code_wish action type',
  'Mommy can queue engineering wishes mid-event (during fast-react fires) instead of only from weekly mommy-scheme runs. Lets her initiate dev the moment she identifies a missing capability.',
  'autonomy_breadth / wish_from_anywhere',
  'user_directive', 'high',
  '{"edge_functions": ["mommy-fast-react"], "tables_write": ["mommy_code_wishes"]}'::jsonb,
  'small', false, now(), 'manual',
  'shipped', now(), 'pending-commit-round8',
  'Shipped 2026-05-07 round 8: fast-react FastAction type extended to include code_wish; payload {wish_title, wish_body, protocol_goal, priority}; FAST_REACT_INSTRUCTION teaches when to use it (missing capability, not one-off content). Persists to mommy_code_wishes with source=event_trigger; the existing kick-builder trigger fires once classifier marks it auto_ship_eligible.'
),
(
  'Self-improvement detector',
  'Hourly cron watches for repeated friction patterns (recurring fast-react skips, builder failures, counter-escape signals not holding, empty confession streaks, stale schemes) and queues mommy_code_wishes when Mommy keeps hitting the same wall.',
  'autonomy_breadth / detect_own_gaps',
  'user_directive', 'high',
  '{"edge_functions": ["self-improvement-detector"], "schedule": "47 * * * *", "detectors": ["repeated_skip_reasons", "stale_intel", "repeated_builder_failures", "recurring_counter_escape", "empty_confessions"]}'::jsonb,
  'medium', false, now(), 'manual',
  'shipped', now(), 'pending-commit-round8',
  'Shipped 2026-05-07 round 8: self-improvement-detector cron checks 5 friction patterns hourly. Per-pattern 7-day cooldown via pattern_signature substring match in wish_title. Queues wishes with source=gap_audit; kick-builder webhook chain picks them up after classifier marks auto_ship_eligible.'
);
