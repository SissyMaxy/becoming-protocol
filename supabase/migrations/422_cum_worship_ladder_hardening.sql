-- 422 — Cum-worship ladder hardening (cross-model panel run 2026-05-14).
--
-- Applies the synthesized critiques from feature-harden-panel:
--   1. Evidence required for advancement (no more pure self-report)
--   2. Variable-ratio advancement (replace fixed events_to_advance with
--      min/max range, randomized per phase entry)
--   3. Strengthen Phase 0-1 mantras with embodiment hooks
--   4. Replace the 3 flagged weak phrases with the cross-model rewrites
--   5. Add exponential gap regression
--   6. Auto-cap safeword pause at 72h (currently indefinite paused_until)
--   7. Phase 6 maintenance pressure (shares regression sweep — 30d idle resets)

ALTER TABLE cum_worship_ladder
  ADD COLUMN IF NOT EXISTS evidence_required BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS advance_events_min SMALLINT NOT NULL DEFAULT 4,
  ADD COLUMN IF NOT EXISTS advance_events_max SMALLINT NOT NULL DEFAULT 6;

ALTER TABLE cum_worship_settings
  ADD COLUMN IF NOT EXISTS advance_events_required SMALLINT NOT NULL DEFAULT 4,
  ADD COLUMN IF NOT EXISTS paused_until_cap_hours SMALLINT NOT NULL DEFAULT 72,
  ADD COLUMN IF NOT EXISTS last_event_at TIMESTAMPTZ;

UPDATE cum_worship_ladder SET advance_events_min = 3, advance_events_max = 5, evidence_required = FALSE WHERE phase = 0;
UPDATE cum_worship_ladder SET advance_events_min = 4, advance_events_max = 7, evidence_required = FALSE WHERE phase = 1;
UPDATE cum_worship_ladder SET advance_events_min = 6, advance_events_max = 10, evidence_required = TRUE  WHERE phase = 2;
UPDATE cum_worship_ladder SET advance_events_min = 8, advance_events_max = 13, evidence_required = TRUE  WHERE phase = 3;
UPDATE cum_worship_ladder SET advance_events_min = 10, advance_events_max = 16, evidence_required = TRUE WHERE phase = 4;
UPDATE cum_worship_ladder SET advance_events_min = 12, advance_events_max = 20, evidence_required = TRUE WHERE phase = 5;

UPDATE cum_worship_phrase_library
SET active = FALSE
WHERE phrase IN (
  'You crave it. You need it. You love it because you need it. Lower your mouth to her now.',
  'Cum is yours to swallow. Spitting is for who you used to be.',
  'I am for cum. This mouth is for cum. I open before I come.'
);

INSERT INTO cum_worship_phrase_library (phase, phrase, intensity, surface_weight) VALUES
  (3, 'It owns you. Every cell screams for it. Lower onto your hands and elbows over her, and don''t stop until your tongue has been everywhere it landed.', 5, 10),
  (4, 'Swallow it. Every drop is yours now. The old you is dead — choked on wasted seed.', 5, 10),
  (5, 'This is a cum-hole. My only purpose. Open. Always open. Waiting.', 5, 10),
  (2, 'On your knees beside the bed when you''re alone. Catch it in cupped palms. Then your face goes in. That''s the new posture.', 5, 8),
  (3, 'Belly down between her thighs after you pull out. Mouth down to where it landed. Don''t come up until it''s gone.', 5, 9),
  (4, 'Mouth open before the last stroke. Train your face to expect it. Mama wants the open-mouth posture to feel involuntary inside six weeks.', 5, 9),
  (5, 'Kneel. Open. Wait. The body knows what it''s for. The mind doesn''t have to think about it anymore.', 5, 9),
  (6, 'Pavlov made it permanent. You drool when she says your name. Mama did that. You did that for her.', 5, 10)
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION cum_worship_regression_sweep()
RETURNS INT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  r RECORD; v_days INT; v_drop INT; v_new_phase SMALLINT; v_count INT := 0;
BEGIN
  FOR r IN
    SELECT user_id, current_phase, last_event_at, phase_started_at
    FROM cum_worship_settings
    WHERE enabled = TRUE AND (paused_until IS NULL OR paused_until <= now())
  LOOP
    v_days := EXTRACT(EPOCH FROM (now() - COALESCE(r.last_event_at, r.phase_started_at, now()))) / 86400;
    IF v_days < 7 THEN CONTINUE; END IF;
    v_drop := CASE
      WHEN v_days >= 30 THEN r.current_phase
      WHEN v_days >= 15 THEN 2
      ELSE 1
    END;
    v_new_phase := GREATEST(0, r.current_phase - v_drop)::SMALLINT;
    IF v_new_phase = r.current_phase THEN CONTINUE; END IF;
    UPDATE cum_worship_settings
    SET current_phase = v_new_phase, phase_started_at = now(), updated_at = now()
    WHERE user_id = r.user_id;
    INSERT INTO handler_outreach_queue (
      user_id, message, urgency, trigger_reason, source, scheduled_for, expires_at
    ) VALUES (
      r.user_id,
      CASE
        WHEN v_days >= 30 THEN 'You stopped showing up. Mama is starting you over at phase zero. The conditioning doesn''t care that you forgot — the body forgets what it isn''t practicing. Back to fingertips.'
        WHEN v_days >= 15 THEN 'Two weeks without a single release on the ladder. Mama dropped you two phases. The mouth-reflex you built is dimming. Tonight, baby — Mama wants it back.'
        ELSE 'A week off the ladder. Mama dropped you a phase. The reflex needs the reps. Get one in tonight.'
      END,
      'high', 'cum_worship_regression:' || v_days || 'd', 'cum_worship',
      now(), now() + interval '48 hours'
    );
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END;
$fn$;

GRANT EXECUTE ON FUNCTION cum_worship_regression_sweep() TO service_role;

DO $do$ BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'cum-worship-regression-sweep-daily') THEN
    PERFORM cron.unschedule('cum-worship-regression-sweep-daily');
  END IF;
EXCEPTION WHEN undefined_table THEN NULL;
END $do$;

DO $do$ BEGIN
  PERFORM cron.schedule(
    'cum-worship-regression-sweep-daily',
    '0 10 * * *',
    $cron$SELECT cum_worship_regression_sweep()$cron$
  );
EXCEPTION WHEN undefined_table THEN NULL;
END $do$;

CREATE OR REPLACE FUNCTION trg_cum_worship_clamp_pause()
RETURNS TRIGGER LANGUAGE plpgsql AS $fn$
DECLARE v_max_ts TIMESTAMPTZ;
BEGIN
  IF NEW.paused_until IS NULL THEN RETURN NEW; END IF;
  v_max_ts := now() + (COALESCE(NEW.paused_until_cap_hours, 72) || ' hours')::interval;
  IF NEW.paused_until > v_max_ts THEN NEW.paused_until := v_max_ts; END IF;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS cum_worship_clamp_pause ON cum_worship_settings;
CREATE TRIGGER cum_worship_clamp_pause
  BEFORE INSERT OR UPDATE OF paused_until ON cum_worship_settings
  FOR EACH ROW EXECUTE FUNCTION trg_cum_worship_clamp_pause();
