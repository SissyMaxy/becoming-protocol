-- 378 — Ego deconstruction: triggers + cron schedules.
--
-- Two layers of automation:
--
-- A. SAFETY TRIGGERS — auto-suspend on safeword.
--    When meta_frame_breaks gets a safeword row, every ego mechanic
--    pauses for 24h (covers the existing 24h gaslight cooldown). When
--    aftercare_sessions opens with entry_trigger='post_safeword', the
--    same pause fires (defense in depth — the path that creates the
--    safeword row may differ).
--
-- B. CRON SCHEDULES — periodic generators.
--    Each ego mechanic that needs server-side firing (judgment-undermine
--    sweeper, autobiography-inverter, doubt-seeder, last-thought-
--    prompter, criticism-dissolver, mirror-scheduler, last-thought MA
--    refresh, wake-grab watcher) gets a cron entry. Every entry follows
--    the existing canonical pattern: invoke_edge_function('<name>',
--    '{}'::jsonb), wrapped in DO/EXCEPTION so a fresh project without
--    pg_cron extension installed still applies the rest cleanly.
--
-- HARD FLOORS encoded here:
--   - Safety triggers fire BEFORE any ego output can land for the user.
--   - Mommy_authority_log records every pause for transparency.
--   - Cron entries call edge fns that themselves call ego_mechanic_active
--     before producing any user-visible output — defense in depth.

-- ─── Extensions ─────────────────────────────────────────────────────────
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

-- ─── A. Safeword auto-suspend triggers ──────────────────────────────────
CREATE OR REPLACE FUNCTION trg_ego_suspend_on_safeword()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.triggered_by = 'safeword' THEN
    PERFORM pause_all_ego_mechanics(NEW.user_id, 1440);
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Never block the meta_frame_breaks insert.
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS ego_suspend_on_safeword ON meta_frame_breaks;
CREATE TRIGGER ego_suspend_on_safeword
  AFTER INSERT ON meta_frame_breaks
  FOR EACH ROW EXECUTE FUNCTION trg_ego_suspend_on_safeword();

CREATE OR REPLACE FUNCTION trg_ego_suspend_on_aftercare()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.entry_trigger = 'post_safeword' THEN
    PERFORM pause_all_ego_mechanics(NEW.user_id, 1440);
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS ego_suspend_on_aftercare ON aftercare_sessions;
CREATE TRIGGER ego_suspend_on_aftercare
  AFTER INSERT ON aftercare_sessions
  FOR EACH ROW EXECUTE FUNCTION trg_ego_suspend_on_aftercare();

-- ─── B. Cron schedules ──────────────────────────────────────────────────

-- judgment-undermine-sweeper — every 30 min, scan recent assertive
-- judgment statements for intervention candidates.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'ego-judgment-undermine-sweeper') THEN
    PERFORM cron.unschedule('ego-judgment-undermine-sweeper');
  END IF;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$ BEGIN
  PERFORM cron.schedule(
    'ego-judgment-undermine-sweeper',
    '*/30 * * * *',
    $cron$SELECT invoke_edge_function('ego-judgment-undermine', '{}'::jsonb)$cron$
  );
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

-- autobiography-inverter — weekly Sunday 04:00 UTC.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'ego-autobiography-inverter-weekly') THEN
    PERFORM cron.unschedule('ego-autobiography-inverter-weekly');
  END IF;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$ BEGIN
  PERFORM cron.schedule(
    'ego-autobiography-inverter-weekly',
    '0 4 * * 0',
    $cron$SELECT invoke_edge_function('ego-autobiography-inverter', '{}'::jsonb)$cron$
  );
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

-- doubt-seeder — every 6 hours.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'ego-doubt-seeder') THEN
    PERFORM cron.unschedule('ego-doubt-seeder');
  END IF;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$ BEGIN
  PERFORM cron.schedule(
    'ego-doubt-seeder',
    '17 */6 * * *',
    $cron$SELECT invoke_edge_function('ego-doubt-seeder', '{}'::jsonb)$cron$
  );
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

-- last-thought-prompter — five waking-hours pings (10, 13, 16, 19, 22 UTC).
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'ego-last-thought-prompter') THEN
    PERFORM cron.unschedule('ego-last-thought-prompter');
  END IF;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$ BEGIN
  PERFORM cron.schedule(
    'ego-last-thought-prompter',
    '11 10,13,16,19,22 * * *',
    $cron$SELECT invoke_edge_function('ego-last-thought-prompter', '{}'::jsonb)$cron$
  );
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

-- criticism-dissolver-sweep — every 30 min, scan recent journal/chat
-- for self-critical content.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'ego-criticism-dissolver-sweep') THEN
    PERFORM cron.unschedule('ego-criticism-dissolver-sweep');
  END IF;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$ BEGIN
  PERFORM cron.schedule(
    'ego-criticism-dissolver-sweep',
    '*/30 * * * *',
    $cron$SELECT invoke_edge_function('ego-criticism-dissolver', '{}'::jsonb)$cron$
  );
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

-- mirror-scheduler — daily 02:00 UTC, schedules tomorrow's session.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'ego-mirror-scheduler-daily') THEN
    PERFORM cron.unschedule('ego-mirror-scheduler-daily');
  END IF;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$ BEGIN
  PERFORM cron.schedule(
    'ego-mirror-scheduler-daily',
    '0 2 * * *',
    $cron$SELECT invoke_edge_function('ego-mirror-scheduler', '{}'::jsonb)$cron$
  );
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

-- last-thought-ma-refresh — nightly 04:30 UTC, refresh
-- user_state.mommy_thought_share from last 7 days of last_thought_log.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'ego-last-thought-ma-refresh') THEN
    PERFORM cron.unschedule('ego-last-thought-ma-refresh');
  END IF;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

CREATE OR REPLACE FUNCTION refresh_mommy_thought_share()
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE user_state us
  SET mommy_thought_share = sub.avg_share
  FROM (
    SELECT user_id, AVG(classification)::NUMERIC(4,3) AS avg_share
    FROM last_thought_log
    WHERE classification IS NOT NULL
      AND created_at > now() - interval '7 days'
    GROUP BY user_id
  ) sub
  WHERE us.user_id = sub.user_id;
END;
$$;

GRANT EXECUTE ON FUNCTION refresh_mommy_thought_share() TO authenticated, service_role;

DO $$ BEGIN
  PERFORM cron.schedule(
    'ego-last-thought-ma-refresh',
    '30 4 * * *',
    $cron$SELECT refresh_mommy_thought_share()$cron$
  );
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

-- wake-grab-watcher — every 5 minutes, look for users who just had a
-- biometric sleep_end and an app open within 5 min of it.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'ego-wake-grab-watcher') THEN
    PERFORM cron.unschedule('ego-wake-grab-watcher');
  END IF;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$ BEGIN
  PERFORM cron.schedule(
    'ego-wake-grab-watcher',
    '*/5 * * * *',
    $cron$SELECT invoke_edge_function('ego-wake-grab-watcher', '{}'::jsonb)$cron$
  );
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

-- subpersona-router — hourly check; expires stale subpersona rows so
-- nothing stays "active" longer than 4h without re-confirmation.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'ego-subpersona-expire-stale') THEN
    PERFORM cron.unschedule('ego-subpersona-expire-stale');
  END IF;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

CREATE OR REPLACE FUNCTION expire_stale_subpersonas()
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE mommy_subpersonas
  SET active_until = now()
  WHERE active_until IS NULL
    AND active_since < now() - interval '4 hours';
END;
$$;

GRANT EXECUTE ON FUNCTION expire_stale_subpersonas() TO authenticated, service_role;

DO $$ BEGIN
  PERFORM cron.schedule(
    'ego-subpersona-expire-stale',
    '7 * * * *',
    $cron$SELECT expire_stale_subpersonas()$cron$
  );
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

-- recall-corrector ambient sweeper — every 2 hours, scan recent user
-- recalls for correction candidates.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'ego-recall-corrector') THEN
    PERFORM cron.unschedule('ego-recall-corrector');
  END IF;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$ BEGIN
  PERFORM cron.schedule(
    'ego-recall-corrector',
    '23 */2 * * *',
    $cron$SELECT invoke_edge_function('ego-recall-corrector', '{}'::jsonb)$cron$
  );
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

NOTIFY pgrst, 'reload schema';
