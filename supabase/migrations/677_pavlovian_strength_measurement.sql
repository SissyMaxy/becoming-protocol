-- 677 — close the pavlovian_strength indicator's data gap.
--
-- DESIGN_RECONDITIONING_ENGINE_2026-07-02.md §2.3: "The existing eval already
-- does PAIRING (arousal>=4) -> DEPLOY-at-neutral -> measures
-- arousal_30min_later. Wire that measurement into the target's indicator
-- (§5)." §5's table names `pavlovian_strength` as "trigger-alone arousal
-- response: arousal_30min_later - arousal_at_event ... pavlovian_events
-- (already recorded)". Mig 648 already seeds a real target
-- (arousal_is_the_becoming) on this exact indicator kind, and
-- recon-measure/index.ts's pavlovian_strength branch already reads
-- arousal_30min_later off pavlovian_events. But nothing anywhere ever WRITES
-- arousal_30min_later — pavlovian_eval() only INSERTs pavlovian_events rows
-- with arousal_at_event set. So the column has been permanently NULL since
-- mig 458, and the indicator has been silently starved of data (recon-measure
-- returns null below MIN_SAMPLES, forever) for every target on this kind.
--
-- This migration adds the missing half: pavlovian_measure_eval() finds
-- trigger_deploy events 30-180 minutes old with arousal_30min_later still
-- unset, and fills it from the arousal_log sample closest to the +30min mark
-- (10-50min after the event — a self-reported reading, not a guess). Events
-- older than 3h with no nearby reading are left alone rather than retried
-- forever. Same direct-SQL-cron pattern as pavlovian-pairing-15min (mig 458).

CREATE OR REPLACE FUNCTION pavlovian_measure_eval()
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  e RECORD;
  v_value INT;
  v_measured INT := 0;
BEGIN
  FOR e IN
    SELECT pe.id, pe.user_id, pe.created_at
    FROM pavlovian_events pe
    WHERE pe.event_kind = 'trigger_deploy'
      AND pe.arousal_30min_later IS NULL
      AND pe.created_at <= now() - interval '30 minutes'
      AND pe.created_at >  now() - interval '3 hours'
  LOOP
    SELECT al.value INTO v_value
    FROM arousal_log al
    WHERE al.user_id = e.user_id
      AND al.created_at BETWEEN e.created_at + interval '10 minutes' AND e.created_at + interval '50 minutes'
    ORDER BY abs(extract(epoch FROM (al.created_at - (e.created_at + interval '30 minutes'))))
    LIMIT 1;

    IF FOUND THEN
      UPDATE pavlovian_events SET arousal_30min_later = v_value WHERE id = e.id;
      v_measured := v_measured + 1;
    END IF;
  END LOOP;
  RETURN v_measured;
END;
$fn$;
GRANT EXECUTE ON FUNCTION pavlovian_measure_eval() TO service_role;

DO $do$ BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname='pavlovian-measure-10min') THEN
    PERFORM cron.unschedule('pavlovian-measure-10min');
  END IF;
EXCEPTION WHEN undefined_table THEN NULL; END $do$;

DO $do$ BEGIN
  PERFORM cron.schedule('pavlovian-measure-10min', '*/10 * * * *',
    $cron$SELECT pavlovian_measure_eval()$cron$);
EXCEPTION WHEN undefined_table THEN NULL; END $do$;
