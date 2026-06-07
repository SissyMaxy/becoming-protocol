-- 471 — Period mimicry 28-day cycle.
--
-- Sympathetic body-clock conditioning. Maxy's body doesn't have a
-- biological cycle. The protocol gives it a synthetic one — 28 days,
-- 4 phases that mirror female cycle rhythm. Each phase has its own
-- daily prompt themes and conditioning emphasis. Over months, the
-- body learns to feel cyclical the way fem bodies do.
--
-- Phases:
--   1-5    menstruation_week    — tender, slowdown, soft fabrics, no chasing
--   6-13   follicular           — energy returning, fem self-presentation work
--   14-16  ovulation_peak       — peak desire, cruising encouraged, fertility-coded
--   17-28  luteal               — introspection, denial discipline, mommy proximity
--
-- Daily 06:00 local cron picks the day's theme and queues a single
-- short prompt with the cycle context.

CREATE TABLE IF NOT EXISTS period_mimicry_settings (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  cycle_start_date DATE NOT NULL DEFAULT current_date,
  timezone TEXT NOT NULL DEFAULT 'America/Chicago',
  daily_hour_local INT NOT NULL DEFAULT 6 CHECK (daily_hour_local BETWEEN 0 AND 23),
  last_fired_at TIMESTAMPTZ,
  paused_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS period_mimicry_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  cycle_day INT NOT NULL CHECK (cycle_day BETWEEN 1 AND 28),
  phase TEXT NOT NULL,
  theme TEXT NOT NULL,
  related_outreach_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE period_mimicry_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE period_mimicry_events ENABLE ROW LEVEL SECURITY;
DO $do$ BEGIN CREATE POLICY period_mimicry_settings_self ON period_mimicry_settings FOR ALL TO authenticated USING (auth.uid()=user_id) WITH CHECK (auth.uid()=user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $do$;
DO $do$ BEGIN CREATE POLICY period_mimicry_events_self ON period_mimicry_events FOR ALL TO authenticated USING (auth.uid()=user_id) WITH CHECK (auth.uid()=user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $do$;

CREATE OR REPLACE FUNCTION period_mimicry_eval()
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  s RECORD; v_local_hour INT; v_today_local DATE;
  v_cycle_day INT; v_phase TEXT; v_theme TEXT;
  v_outreach UUID; v_msg TEXT; v_queued INT := 0;
BEGIN
  FOR s IN
    SELECT pms.*, us.handler_persona FROM period_mimicry_settings pms
    LEFT JOIN user_state us ON us.user_id = pms.user_id
    WHERE pms.enabled = TRUE AND (pms.paused_until IS NULL OR pms.paused_until <= now())
      AND COALESCE(us.handler_persona, 'therapist') = 'dommy_mommy'
  LOOP
    v_local_hour := EXTRACT(HOUR FROM (now() AT TIME ZONE s.timezone))::int;
    IF v_local_hour <> s.daily_hour_local THEN CONTINUE; END IF;
    IF s.last_fired_at IS NOT NULL AND s.last_fired_at > now() - interval '18 hours' THEN CONTINUE; END IF;

    v_today_local := (now() AT TIME ZONE s.timezone)::date;
    v_cycle_day := ((v_today_local - s.cycle_start_date) % 28) + 1;

    -- Phase + theme based on cycle day
    IF v_cycle_day BETWEEN 1 AND 5 THEN
      v_phase := 'menstruation_week';
      v_theme := CASE v_cycle_day
        WHEN 1 THEN E'Day 1 of your cycle, sweet thing. Mama wants you tender today. Wear something soft against your skin all day — softest panties, softest tee. No chasing, no decrees, no proving. The body is being given permission to be slow. Voice check-in at end of day: did the slowness feel like loss or like rest?'
        WHEN 2 THEN E'Day 2. Hot drink + soft clothes + a moment alone with your hand on your belly. Mama wants you noticing the body the way fem bodies notice theirs during this week — as a thing to take care of, not a thing to use.'
        WHEN 3 THEN E'Day 3. Mama wants a 10-minute warm bath. Body soft, hair down, eyes closed. No phone. The cycle is teaching the body that there are days where the conditioning is rest.'
        WHEN 4 THEN E'Day 4. Take a selfie with no filter, no makeup, no posing — just the body at rest. Save it. In 6 months, this photo is going to look like a different person.'
        WHEN 5 THEN E'Day 5. Tomorrow the energy returns. Tonight Mama wants you setting an intention for the next phase: ONE feminine thing you''ll do this follicular week that you wouldn''t have done last cycle.'
        ELSE 'baseline rest day'
      END;
    ELSIF v_cycle_day BETWEEN 6 AND 13 THEN
      v_phase := 'follicular';
      v_theme := CASE
        WHEN v_cycle_day = 6 THEN E'Day 6 — follicular week starts. Energy returning. Mama wants the morning mantra spoken in fullest voice today.'
        WHEN v_cycle_day = 7 THEN E'Day 7. Feminine self-presentation work — try one new fem-coded look today (eyeliner / nail polish / a fitted top). Photo before, photo after a few hours wearing it.'
        WHEN v_cycle_day = 8 THEN E'Day 8. Cruising platforms: scroll without obligation. Mama wants you noticing who you''re drawn to without acting yet. Voice debrief on the patterns.'
        WHEN v_cycle_day = 9 THEN E'Day 9. Public-presence drift work today — review your bios, propose ONE change to apply this week.'
        WHEN v_cycle_day = 10 THEN E'Day 10. Pavlovian cue + practice combo. Deploy your strongest cue + 10 min mouth practice + identity mantra. The energy is high; the conditioning lands deeper.'
        WHEN v_cycle_day = 11 THEN E'Day 11. Mama wants a confession recording today — 90 seconds, eyes closed, the thing you didn''t say last week.'
        WHEN v_cycle_day = 12 THEN E'Day 12. Build energy for ovulation. Mama wants the bralette under the regular shirt, all day.'
        WHEN v_cycle_day = 13 THEN E'Day 13 — last follicular day. Pre-ovulation prep: panties + bralette + lip tint, ready for tomorrow. Photo with kit before bed.'
        ELSE 'follicular fem-presentation push'
      END;
    ELSIF v_cycle_day BETWEEN 14 AND 16 THEN
      v_phase := 'ovulation_peak';
      v_theme := CASE
        WHEN v_cycle_day = 14 THEN E'Ovulation peak, sweet thing. Day 14 of the cycle. Mama wants you cruising actively today — Sniffies open, profile bright, replies fast. The body is supposed to chase right now.'
        WHEN v_cycle_day = 15 THEN E'Day 15 — peak fertility-coded. Mama wants a heat-state debrief: rate the body''s want today on its own scale. Voice clip, 60 seconds.'
        WHEN v_cycle_day = 16 THEN E'Day 16 — ovulation closing. If a meet is queueable this week, this is the window. Mama wants you reaching out to your warmest lead today.'
        ELSE 'peak'
      END;
    ELSE  -- 17-28 luteal
      v_phase := 'luteal';
      v_theme := CASE
        WHEN v_cycle_day = 17 THEN E'Day 17 — luteal begins. Energy turning inward. Mama wants journal work today: write the version of yourself you want to be in 6 months. No editing.'
        WHEN v_cycle_day = 18 THEN E'Day 18. Denial discipline emphasized. Cage on if it isn''t already. Cock-conditioning identity mantra recorded today.'
        WHEN v_cycle_day = 20 THEN E'Day 20. Mama proximity day — re-read your last 3 confessions. Voice debrief on what changed across them.'
        WHEN v_cycle_day = 22 THEN E'Day 22. Cum-capture session if it''s been more than 4 days. The body has accumulated; the discipline is using it.'
        WHEN v_cycle_day = 25 THEN E'Day 25. End-of-cycle reflection: what got lived this month that wouldn''t have been lived last month?'
        WHEN v_cycle_day = 27 THEN E'Day 27. Pre-bleed prep — soft clothes ready, hot drink prepped for tomorrow. The cycle is teaching you to honor the slow days before they arrive.'
        WHEN v_cycle_day = 28 THEN E'Day 28 — cycle reset. Tonight: clean closet of one masc thing. Replace with fem. Voice debrief: what does it feel like to lose one more piece of who you were?'
        ELSE E'Day ' || v_cycle_day::text || E' — luteal. Mama wants quiet today. Cage check-in + one mantra spoken aloud. That''s enough.'
      END;
    END IF;

    v_msg := v_theme || E'\n\n_(Cycle day ' || v_cycle_day::text || ' of 28 — ' || v_phase || ')_';

    INSERT INTO handler_outreach_queue (user_id, message, urgency, trigger_reason, source, kind, scheduled_for, expires_at, context_data, evidence_kind)
    VALUES (s.user_id, v_msg, 'normal',
      'period_mimicry:d' || v_cycle_day::text || ':' || v_today_local::text,
      'period_mimicry_engine', 'period_mimicry_daily',
      now(), now() + interval '24 hours',
      jsonb_build_object('cycle_day', v_cycle_day, 'phase', v_phase),
      'voice') RETURNING id INTO v_outreach;

    INSERT INTO period_mimicry_events (user_id, cycle_day, phase, theme, related_outreach_id)
    VALUES (s.user_id, v_cycle_day, v_phase, LEFT(v_theme, 200), v_outreach);

    UPDATE period_mimicry_settings SET last_fired_at = now(), updated_at = now() WHERE user_id = s.user_id;
    v_queued := v_queued + 1;
  END LOOP;
  RETURN v_queued;
END;
$fn$;
GRANT EXECUTE ON FUNCTION period_mimicry_eval() TO service_role;

-- Both users enabled, cycle started today
INSERT INTO period_mimicry_settings (user_id, enabled, cycle_start_date)
VALUES ('8c69b9c8-34eb-4147-9fec-3c1a5bc74b6f', TRUE, current_date),
       ('93327332-7d0d-4888-889a-1607a5776216', TRUE, current_date)
ON CONFLICT (user_id) DO UPDATE SET enabled = TRUE, updated_at = now();

DO $do$ BEGIN IF EXISTS (SELECT 1 FROM cron.job WHERE jobname='period-mimicry-hourly') THEN PERFORM cron.unschedule('period-mimicry-hourly'); END IF; EXCEPTION WHEN undefined_table THEN NULL; END $do$;
DO $do$ BEGIN PERFORM cron.schedule('period-mimicry-hourly', '5 * * * *', $cron$SELECT period_mimicry_eval()$cron$); EXCEPTION WHEN undefined_table THEN NULL; END $do$;
