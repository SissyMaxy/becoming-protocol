-- 639: cron wiring + cutover helpers (P7 of PLAN_REARCH_2026-07-01).
--
-- Three jobs:
--   1. Register the safety-critical pg_cron JOB NAMES in safety_exempt_systems
--      so any future prune (the mig-329 class killed surface-guarantor for six
--      weeks) has one registry to consult — systems AND job names in one place.
--   2. `enforcement_chokepoints_enforce()` — the one-call WARN→ENFORCE flip for
--      the obligation-ledger chokepoint triggers (mig 627 ships them in WARN).
--      Run it manually after a clean shadow week:
--        SELECT enforcement_chokepoints_enforce();
--      It refuses to flip while unresolved penalty_without_obligation alarms
--      from the last 72h exist — the shadow week has to actually be clean.
--   3. PORTABLE http-post cron bodies for the new dispatchers, in the
--      current_setting() pattern. HOW THIS IS ACTUALLY APPLIED in this project:
--      the app.settings GUCs are NULL (mig-619 finding), so the LIVE jobs are
--      installed self-contained by the pgcron-setup edge function (URL + key
--      baked from fn env; see supabase/functions/pgcron-setup/index.ts JOBS
--      list). This file is the portable equivalent for environments where the
--      settings exist; pgcron-setup unschedules/reschedules by the same names,
--      so the two forms never double-fire.
--
-- DEFERRED (explicitly NOT in this migration): the arousal 0→10 scale cutover.
-- current_arousal has 60+ readers with mixed scale assumptions; that change
-- must ship atomically with every reader in its own train (future migration —
-- see PLAN_REARCH progress log). Machine bridge writes validated 0–5 until then.

-- ─── 1. Prune whitelist: cron job names ─────────────────────────────────
INSERT INTO safety_exempt_systems (system, note) VALUES
  ('cron:meet-safety-watch',            'pg_cron job — meet check-in watcher, every 1 min. NEVER prune/pause; runs during pause+safeword by design (mig 626).'),
  ('cron:meet-safety-dispatch-drain',   'pg_cron job — stage-3 trusted-contact send drain, every 1 min guarded. NEVER prune (mig 626 / pgcron-setup).'),
  ('cron:machine_deadman_sweep',        'pg_cron job — machine tick-gap dead-man, every 1 min. NEVER prune; runs during pause+safeword (mig 625).'),
  ('cron:blind-spot-monitor-safety',    'pg_cron job — safeword-reactivation heal, every 5 min. NEVER prune (mig 619).'),
  ('cron:obligation_pause_shift_accruer','pg_cron job — freezes obligation clocks during pause. Pruning it silently converts pauses into missed deadlines (mig 627).')
ON CONFLICT (system) DO UPDATE SET note = EXCLUDED.note;

-- ─── 2. WARN→ENFORCE flip helper ────────────────────────────────────────
CREATE OR REPLACE FUNCTION enforcement_chokepoints_enforce()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_recent_violations INT;
BEGIN
  SELECT count(*) INTO v_recent_violations
  FROM mommy_supervisor_log
  WHERE event_kind = 'penalty_without_obligation'
    AND created_at > now() - interval '72 hours';

  IF v_recent_violations > 0 THEN
    RETURN format(
      'REFUSED: %s penalty_without_obligation alarms in the last 72h — fix the offending generators first, then re-run. The shadow week has to be clean.',
      v_recent_violations
    );
  END IF;

  INSERT INTO enforcement_settings (key, value, updated_at)
  VALUES ('chokepoint_mode', 'enforce', now())
  ON CONFLICT (key) DO UPDATE SET value = 'enforce', updated_at = now();

  RETURN 'chokepoint_mode = enforce. Penalty writes without a valid obligation now RAISE.';
END;
$fn$;

COMMENT ON FUNCTION enforcement_chokepoints_enforce() IS
  'One-call WARN→ENFORCE flip for the mig-627 chokepoint triggers. Refuses while unresolved penalty_without_obligation alarms exist in the last 72h. Run manually after a clean shadow week.';

-- ─── 3. Portable http-post cron bodies ──────────────────────────────────
-- LIVE installation is pgcron-setup (self-contained). Portable form below for
-- environments with the GUCs set. Idempotent: unschedule-if-exists first.
DO $do$
BEGIN
  PERFORM cron.unschedule('evening-prescribe-dispatch');
EXCEPTION WHEN OTHERS THEN NULL; -- not scheduled yet / no pg_cron in this env
END $do$;

DO $do$
BEGIN
  PERFORM cron.unschedule('outward-consequence-dispatcher');
EXCEPTION WHEN OTHERS THEN NULL;
END $do$;

DO $do$
BEGIN
  PERFORM cron.schedule(
    'evening-prescribe-dispatch',
    '30 1 * * *',
    $job$SELECT net.http_post(
      url := current_setting('app.settings.supabase_url') || '/functions/v1/evening-prescribe-dispatch',
      headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' || current_setting('app.settings.service_role_key')),
      body := jsonb_build_object('trigger','pg_cron')
    );$job$
  );
  PERFORM cron.schedule(
    'outward-consequence-dispatcher',
    '*/15 * * * *',
    $job$SELECT net.http_post(
      url := current_setting('app.settings.supabase_url') || '/functions/v1/outward-consequence-dispatcher',
      headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' || current_setting('app.settings.service_role_key')),
      body := jsonb_build_object('trigger','pg_cron')
    );$job$
  );
EXCEPTION WHEN OTHERS THEN NULL; -- pg_cron absent in this env (extension guard only)
END $do$;

NOTIFY pgrst, 'reload schema';
