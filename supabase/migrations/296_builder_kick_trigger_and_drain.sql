-- 296 — Kick the builder on wish insert; tighten polling cron.
-- 2026-05-07.
--
-- With the user's Anthropic Max 20x plan, the bottleneck is no longer
-- token throughput — it's the latency between "wish queued" and "wish
-- shipped." Two changes:
--   1. Trigger on mommy_code_wishes INSERT calls kick-builder edge fn,
--      which fires a GH repository_dispatch — the builder workflow runs
--      immediately instead of waiting for the next 4-hour cron tick.
--   2. The cron schedule drops from every 4h to every 30 min as a
--      backstop in case the dispatch path fails.

-- ---------------------------------------------------------------
-- 1. Postgres trigger: wish insert → kick-builder
-- ---------------------------------------------------------------

CREATE OR REPLACE FUNCTION kick_builder_on_wish_insert()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  request_id BIGINT;
BEGIN
  -- Only fire if the wish is auto-ship-eligible. Manually-classified review
  -- wishes don't need the builder woken up.
  IF NEW.status = 'queued' AND NEW.auto_ship_eligible = true THEN
    BEGIN
      SELECT net.http_post(
        url := current_setting('app.settings.supabase_url', true) || '/functions/v1/kick-builder',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
        ),
        body := jsonb_build_object(
          'wish_id', NEW.id,
          'reason', 'wish_inserted'
        )
      ) INTO request_id;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'kick_builder_on_wish_insert: %', SQLERRM;
    END;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_kick_builder_on_wish_insert ON mommy_code_wishes;
CREATE TRIGGER trg_kick_builder_on_wish_insert
  AFTER INSERT ON mommy_code_wishes
  FOR EACH ROW EXECUTE FUNCTION kick_builder_on_wish_insert();

-- Also fire on UPDATE that flips a wish from non-eligible to eligible
-- (e.g. classifier just marked it auto_ship_eligible=true)
CREATE OR REPLACE FUNCTION kick_builder_on_wish_update()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  request_id BIGINT;
BEGIN
  IF NEW.status = 'queued'
     AND NEW.auto_ship_eligible = true
     AND (OLD.auto_ship_eligible IS DISTINCT FROM NEW.auto_ship_eligible
          OR OLD.status IS DISTINCT FROM NEW.status) THEN
    BEGIN
      SELECT net.http_post(
        url := current_setting('app.settings.supabase_url', true) || '/functions/v1/kick-builder',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
        ),
        body := jsonb_build_object(
          'wish_id', NEW.id,
          'reason', 'wish_became_eligible'
        )
      ) INTO request_id;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'kick_builder_on_wish_update: %', SQLERRM;
    END;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_kick_builder_on_wish_update ON mommy_code_wishes;
CREATE TRIGGER trg_kick_builder_on_wish_update
  AFTER UPDATE ON mommy_code_wishes
  FOR EACH ROW EXECUTE FUNCTION kick_builder_on_wish_update();

-- ---------------------------------------------------------------
-- 2. Tighten the backstop cron from 4h to 30 min
-- ---------------------------------------------------------------
-- (The GH workflow already runs on schedule, but its cron string lives in
-- the YAML, not the DB. The "every 30 min" change ships in
-- .github/workflows/mommy-builder.yml as part of round 7.)

-- ---------------------------------------------------------------
-- 3. Mark round 7 wishes
-- ---------------------------------------------------------------

INSERT INTO mommy_code_wishes (
  wish_title, wish_body, protocol_goal, source, priority,
  affected_surfaces, complexity_tier, auto_ship_eligible, classified_at, classified_by,
  status, shipped_at, shipped_in_commit, ship_notes
) VALUES (
  'Drain mode + webhook trigger for instant builder kickoff',
  'Replace 4-hour polling cron with: (a) --drain mode in builder.ts that loops the queue in one run, (b) Postgres trigger on mommy_code_wishes insert/eligibility-change → kick-builder edge fn → GH repository_dispatch event → builder workflow immediately. Backstop cron drops to 30 min.',
  'autonomy_throughput / drain_not_poll',
  'user_directive', 'critical',
  '{"scripts": ["scripts/mommy/builder.ts"], "edge_functions": ["kick-builder"], "workflows": [".github/workflows/mommy-builder.yml"], "triggers": ["kick_builder_on_wish_insert", "kick_builder_on_wish_update"]}'::jsonb,
  'medium', false, now(), 'manual',
  'shipped', now(), 'pending-commit-round7',
  'Shipped 2026-05-07 round 7: builder.ts processOneWish() factored out + --drain loop with safety caps (--max 20 ships, --max-wall-min 60, --stop-on-fail default on). npm run mommy:drain. kick-builder edge fn fires GH repository_dispatch on wish insert/eligibility-change via Postgres trigger. mommy-builder.yml gains repository_dispatch listener + drops cron to */30. Latency from wish-insert to build-start: ~5-10s instead of up to 4h.'
);
