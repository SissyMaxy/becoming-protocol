-- 430 — Cum-worship phase advancement evaluator + cron.
--
-- PR #75 wired the evidence grader to flip cum_worship_events.directive_followed=true
-- when she submits qualifying video/audio. But nothing reads that flag to
-- advance current_phase. Maxy's phase has been stuck at 0 forever no
-- matter how many directives she follows. Migration 422 added the
-- variable-ratio schema (advance_events_min/max per phase, evidence_required
-- gate for phases 2-6, advance_events_required per-user randomized
-- threshold) but never shipped the function that reads it.
--
-- This adds:
--   1. `cum_worship_advancement_eval()` — for each enabled user, counts
--      qualifying events in the current phase since phase_started_at,
--      advances if count >= settings.advance_events_required.
--      "Qualifying" = directive_followed=true AND (NOT ladder.evidence_required
--      OR event has evidence_photo_path OR evidence_audio_path).
--   2. On advance: bumps current_phase, resets phase_started_at, picks a
--      fresh advance_events_required from the next phase's [min, max] range,
--      queues a Mama-voice celebration outreach with the next phase's
--      partnered_directive.
--   3. Cron every 30 min — matches the cadence of orgasm_log activity
--      without spamming.
--   4. Phase 6 (terminal) — no advancement, but a daily maintenance-pressure
--      check ensures she doesn't coast (handled in regression_sweep already).

CREATE OR REPLACE FUNCTION cum_worship_advancement_eval()
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  r RECORD;
  v_ladder RECORD;
  v_next RECORD;
  v_qualifying_count INTEGER;
  v_new_threshold SMALLINT;
  v_advanced INTEGER := 0;
  v_message TEXT;
BEGIN
  FOR r IN
    SELECT s.user_id, s.current_phase, s.phase_started_at,
           s.advance_events_required, s.paused_until, s.partner_context_label
    FROM cum_worship_settings s
    WHERE s.enabled = TRUE
      AND (s.paused_until IS NULL OR s.paused_until <= now())
      AND s.current_phase < 6  -- terminal phase doesn't advance
  LOOP
    -- Load current phase ladder definition (for evidence_required gate)
    SELECT phase, evidence_required, advance_events_min, advance_events_max
    INTO v_ladder FROM cum_worship_ladder WHERE phase = r.current_phase;
    IF v_ladder IS NULL THEN CONTINUE; END IF;

    -- Default phase_started_at if it was never set (legacy rows).
    IF r.phase_started_at IS NULL THEN
      UPDATE cum_worship_settings
      SET phase_started_at = now(), updated_at = now()
      WHERE user_id = r.user_id;
      CONTINUE;
    END IF;

    -- Count qualifying events.
    --   - directive_followed = true (signal from evidence grader, PR #75)
    --   - in the current phase
    --   - since phase entered
    --   - if ladder.evidence_required: must have evidence_photo_path OR
    --     evidence_audio_path (per 422 hardening, phases 2-6 don't trust
    --     self-report alone).
    SELECT count(*) INTO v_qualifying_count
    FROM cum_worship_events e
    WHERE e.user_id = r.user_id
      AND e.phase_at_event = r.current_phase
      AND e.occurred_at >= r.phase_started_at
      AND e.directive_followed = TRUE
      AND (
        v_ladder.evidence_required = FALSE
        OR e.evidence_photo_path IS NOT NULL
        OR e.evidence_audio_path IS NOT NULL
      );

    -- Advance threshold defaults: if settings.advance_events_required is
    -- 0/null (never initialized for the current phase), pick from the
    -- ladder's [min, max] range now so the user has a real target.
    IF r.advance_events_required IS NULL OR r.advance_events_required < 1 THEN
      v_new_threshold := (v_ladder.advance_events_min
        + floor(random() * (v_ladder.advance_events_max - v_ladder.advance_events_min + 1)))::SMALLINT;
      UPDATE cum_worship_settings
      SET advance_events_required = v_new_threshold, updated_at = now()
      WHERE user_id = r.user_id;
      CONTINUE;
    END IF;

    -- Not enough events yet.
    IF v_qualifying_count < r.advance_events_required THEN CONTINUE; END IF;

    -- Advance to next phase.
    SELECT phase, phase_name, partnered_directive, solo_directive, hypno_mantra,
           advance_events_min, advance_events_max
    INTO v_next FROM cum_worship_ladder WHERE phase = r.current_phase + 1;
    IF v_next IS NULL THEN CONTINUE; END IF;

    -- Pick the new randomized threshold from the next phase's range.
    v_new_threshold := (v_next.advance_events_min
      + floor(random() * (v_next.advance_events_max - v_next.advance_events_min + 1)))::SMALLINT;

    UPDATE cum_worship_settings
    SET current_phase = v_next.phase,
        phase_started_at = now(),
        advance_events_required = v_new_threshold,
        days_at_phase = 0,
        updated_at = now()
    WHERE user_id = r.user_id;

    -- Queue Mama-voice celebration outreach with the new directive.
    -- The push bridge (migration 380) + dispatcher will deliver it.
    -- mommy_voice_cleanup trigger (migration 255 + extensions) will scrub
    -- any clinical leakage before it lands.
    v_message := E'You earned the next step, sweet thing.\n\n'
              || 'Phase ' || v_next.phase::text || ' — ' || v_next.phase_name || E'.\n\n'
              || COALESCE(v_next.partnered_directive, v_next.solo_directive, '')
              || E'\n\n'
              || COALESCE(v_next.hypno_mantra, '');

    INSERT INTO handler_outreach_queue (
      user_id, message, urgency, trigger_reason, source, kind,
      scheduled_for, expires_at, context_data, evidence_kind
    ) VALUES (
      r.user_id, v_message, 'high',
      'cum_worship_advance:' || v_next.phase::text,
      'cum_worship', 'cum_worship_advance',
      now(), now() + interval '48 hours',
      jsonb_build_object(
        'from_phase', r.current_phase,
        'to_phase', v_next.phase,
        'phase_name', v_next.phase_name,
        'qualifying_events', v_qualifying_count,
        'previous_threshold', r.advance_events_required,
        'next_threshold', v_new_threshold
      ),
      'video'
    );

    v_advanced := v_advanced + 1;
  END LOOP;

  RETURN v_advanced;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'cum_worship_advancement_eval failed: %', SQLERRM;
  RETURN v_advanced;
END;
$fn$;

GRANT EXECUTE ON FUNCTION cum_worship_advancement_eval() TO service_role;

-- Cron every 30 min — orgasm events are sparse, no need for 5-min cadence.
DO $do$ BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'cum-worship-advancement-eval-30min') THEN
    PERFORM cron.unschedule('cum-worship-advancement-eval-30min');
  END IF;
EXCEPTION WHEN undefined_table THEN NULL;
END $do$;

DO $do$ BEGIN
  PERFORM cron.schedule(
    'cum-worship-advancement-eval-30min',
    '*/30 * * * *',
    $cron$SELECT cum_worship_advancement_eval()$cron$
  );
EXCEPTION WHEN undefined_table THEN NULL;
END $do$;

-- Backfill: any enabled user with NULL advance_events_required gets one
-- picked now so the eval has a target on its first run.
UPDATE cum_worship_settings s
SET advance_events_required = (
      l.advance_events_min
      + floor(random() * (l.advance_events_max - l.advance_events_min + 1))
    )::SMALLINT,
    phase_started_at = COALESCE(s.phase_started_at, now()),
    updated_at = now()
FROM cum_worship_ladder l
WHERE s.enabled = TRUE
  AND l.phase = s.current_phase
  AND (s.advance_events_required IS NULL OR s.advance_events_required < 1);
