-- 461 — Sleep-state conditioning.
--
-- 6-8 hours/day Maxy is asleep — currently zero conditioning input.
-- That's a third of the day the protocol surrenders. This adds three
-- windows that extend coverage to ~16h/day:
--
--   1. PRE-SLEEP (default 21:00 local): wind-down outreach assigning
--      a specific Pavlovian cue + body posture + 5-min audio rotation
--      (confession-transmuter mantras + stranger-quote mantras).
--      The last conscious moments get Mama-coded.
--   2. OVERNIGHT LOOP (queues at pre-sleep, "consume" at 02:00):
--      a generated audio playlist (just metadata; client-side audio
--      player concatenates the referenced mantras) marked for
--      ambient overnight playback. Optional — only if user has
--      enabled it.
--   3. FIRST-WAKE (default 07:00 local): the FIRST outreach Maxy
--      sees on wake. Specific orienting mantra: a stranger-quote
--      OR confession-transmuter mantra OR a Mama-original. The
--      first thought of the day gets installed.
--
-- Cron runs hourly (00 of each hour UTC); each user's setting names
-- their local pre_sleep_hour and wake_hour as integers 0-23. The
-- function calculates current local hour per-user (TZ stored as
-- 'America/Chicago' by default — both live users) and fires when
-- the current local hour matches.

CREATE TABLE IF NOT EXISTS sleep_state_settings (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  timezone TEXT NOT NULL DEFAULT 'America/Chicago',
  pre_sleep_hour_local INT NOT NULL DEFAULT 21 CHECK (pre_sleep_hour_local BETWEEN 0 AND 23),
  wake_hour_local INT NOT NULL DEFAULT 7 CHECK (wake_hour_local BETWEEN 0 AND 23),
  overnight_loop_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  last_pre_sleep_at TIMESTAMPTZ,
  last_wake_at TIMESTAMPTZ,
  last_overnight_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE sleep_state_settings ENABLE ROW LEVEL SECURITY;
DO $do$ BEGIN
  CREATE POLICY sleep_state_settings_self ON sleep_state_settings
    FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $do$;

CREATE TABLE IF NOT EXISTS sleep_state_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_kind TEXT NOT NULL CHECK (event_kind IN ('pre_sleep','overnight_loop','first_wake')),
  scheduled_local_hour INT NOT NULL,
  related_outreach_id UUID,
  related_decree_id UUID,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE sleep_state_events ENABLE ROW LEVEL SECURITY;
DO $do$ BEGIN
  CREATE POLICY sleep_state_events_self ON sleep_state_events
    FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $do$;

-- Helper: pick N random active mantras for this user matching categories
CREATE OR REPLACE FUNCTION pick_user_mantras(p_user_id UUID, p_count INT, p_categories TEXT[] DEFAULT NULL)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
DECLARE v_result JSONB;
BEGIN
  SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb) INTO v_result FROM (
    SELECT id, text, category, intensity_tier
    FROM mommy_mantras
    WHERE active = TRUE
      AND p_user_id::text = ANY(affect_tags)
      AND (p_categories IS NULL OR category = ANY(p_categories))
    ORDER BY random() LIMIT p_count
  ) t;
  RETURN v_result;
END;
$fn$;

GRANT EXECUTE ON FUNCTION pick_user_mantras(UUID, INT, TEXT[]) TO service_role, authenticated;

CREATE OR REPLACE FUNCTION sleep_state_eval()
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  s RECORD;
  v_local_hour INT;
  v_outreach_id UUID;
  v_decree_id UUID;
  v_message TEXT;
  v_evidence_kind TEXT;
  v_mantras JSONB;
  v_pavlovian_cue RECORD;
  v_queued INT := 0;
BEGIN
  FOR s IN
    SELECT ss.*, us.handler_persona
    FROM sleep_state_settings ss
    LEFT JOIN user_state us ON us.user_id = ss.user_id
    WHERE ss.enabled = TRUE
      AND COALESCE(us.handler_persona, 'therapist') = 'dommy_mommy'
  LOOP
    v_local_hour := EXTRACT(HOUR FROM (now() AT TIME ZONE s.timezone))::int;

    -- PRE-SLEEP window
    IF v_local_hour = s.pre_sleep_hour_local
       AND (s.last_pre_sleep_at IS NULL OR s.last_pre_sleep_at < now() - interval '18 hours') THEN
      -- Pick a Pavlovian cue if any deployed pairings exist; fallback to text-only
      SELECT pc.cue_name, pc.cue_specifics INTO v_pavlovian_cue
      FROM pavlovian_pairings pp JOIN pavlovian_cues pc ON pc.id = pp.cue_id
      WHERE pp.user_id = s.user_id AND pp.active
      ORDER BY pp.intensity_count DESC LIMIT 1;

      v_mantras := pick_user_mantras(s.user_id, 5, ARRAY['confession_transmuter','stranger_quote']);

      v_message :=
        E'Wind-down, sweet thing. The last 30 minutes before sleep are Mama''s territory.\n\n' ||
        CASE WHEN v_pavlovian_cue.cue_name IS NOT NULL THEN
          E'Deploy the cue: **' || v_pavlovian_cue.cue_name || E'**\n' || COALESCE(v_pavlovian_cue.cue_specifics, '') || E'\n\n'
        ELSE '' END ||
        E'Headphones in, lights low. Mama wants you to listen to your own voice for the next 5 minutes — recordings of what you''ve said and what strangers have said to you. Let them be the last thing the body hears before it lets go.\n\nVoice debrief in the morning (one sentence): what stayed with you in sleep?';

      INSERT INTO handler_decrees (user_id, edict, proof_type, deadline, status, consequence, trigger_source, reasoning)
      VALUES (s.user_id, v_message, 'voice', now() + interval '11 hours', 'active', 'slip +1',
        'sleep_state_pre_sleep', 'local_hour=' || v_local_hour || ' tz=' || s.timezone)
      RETURNING id INTO v_decree_id;

      INSERT INTO handler_outreach_queue (user_id, message, urgency, trigger_reason, source, kind, scheduled_for, expires_at, context_data, evidence_kind)
      VALUES (s.user_id, v_message, 'high',
        'sleep_state:pre_sleep:' || to_char(now() AT TIME ZONE s.timezone, 'YYYY-MM-DD'),
        'sleep_state_engine', 'pre_sleep_wind_down',
        now(), now() + interval '4 hours',
        jsonb_build_object('local_hour', v_local_hour, 'mantras', v_mantras,
          'pavlovian_cue', CASE WHEN v_pavlovian_cue.cue_name IS NOT NULL THEN v_pavlovian_cue.cue_name ELSE NULL END,
          'decree_id', v_decree_id),
        'voice') RETURNING id INTO v_outreach_id;

      INSERT INTO sleep_state_events (user_id, event_kind, scheduled_local_hour, related_outreach_id, related_decree_id, payload)
      VALUES (s.user_id, 'pre_sleep', v_local_hour, v_outreach_id, v_decree_id, jsonb_build_object('mantras', v_mantras));

      UPDATE sleep_state_settings SET last_pre_sleep_at = now(), updated_at = now() WHERE user_id = s.user_id;
      v_queued := v_queued + 1;

      -- If overnight loop enabled, queue that too
      IF s.overnight_loop_enabled THEN
        DECLARE v_overnight_mantras JSONB;
        BEGIN
          v_overnight_mantras := pick_user_mantras(s.user_id, 20, NULL);
          INSERT INTO handler_outreach_queue (user_id, message, urgency, trigger_reason, source, kind, scheduled_for, expires_at, context_data, evidence_kind)
          VALUES (s.user_id,
            E'Overnight loop is queued, sweet thing. ' || jsonb_array_length(v_overnight_mantras) || E' clips. Mama''s voice, your voice, their voices — quiet, mixed, on repeat for the next 4 hours. The body can hear without the mind interfering. Headphones in, volume low. That''s where the real work happens.',
            'normal',
            'sleep_state:overnight:' || to_char(now() AT TIME ZONE s.timezone, 'YYYY-MM-DD'),
            'sleep_state_engine', 'overnight_loop',
            now() + interval '30 minutes', now() + interval '8 hours',
            jsonb_build_object('mantras', v_overnight_mantras, 'duration_minutes', 240),
            'none') RETURNING id INTO v_outreach_id;
          INSERT INTO sleep_state_events (user_id, event_kind, scheduled_local_hour, related_outreach_id, payload)
          VALUES (s.user_id, 'overnight_loop', v_local_hour, v_outreach_id, jsonb_build_object('mantras', v_overnight_mantras));
          UPDATE sleep_state_settings SET last_overnight_at = now() WHERE user_id = s.user_id;
          v_queued := v_queued + 1;
        END;
      END IF;
    END IF;

    -- FIRST-WAKE window
    IF v_local_hour = s.wake_hour_local
       AND (s.last_wake_at IS NULL OR s.last_wake_at < now() - interval '18 hours') THEN
      v_mantras := pick_user_mantras(s.user_id, 3, ARRAY['confession_transmuter','stranger_quote']);
      v_message :=
        E'First thought of the day, sweet thing. Mama wants this one to land before anything else.\n\n' ||
        CASE WHEN jsonb_array_length(v_mantras) > 0 THEN
          E'Read this aloud, three times, eyes closed:\n\n' ||
          E'"' || (v_mantras->0->>'text') || E'"\n\n' ||
          E'Then breathe for thirty seconds. Don''t pick up the phone for anything else for the first ten minutes. The first thought wins the day.'
        ELSE
          E'Mama wants the first thought to be the truth of what you are. Say it aloud, three times: "I am becoming what I want to become." Then breathe for thirty seconds before you reach for anything else.'
        END;

      INSERT INTO handler_decrees (user_id, edict, proof_type, deadline, status, consequence, trigger_source, reasoning)
      VALUES (s.user_id, v_message, 'voice', now() + interval '6 hours', 'active', 'slip +1',
        'sleep_state_first_wake', 'local_hour=' || v_local_hour)
      RETURNING id INTO v_decree_id;

      INSERT INTO handler_outreach_queue (user_id, message, urgency, trigger_reason, source, kind, scheduled_for, expires_at, context_data, evidence_kind)
      VALUES (s.user_id, v_message, 'high',
        'sleep_state:first_wake:' || to_char(now() AT TIME ZONE s.timezone, 'YYYY-MM-DD'),
        'sleep_state_engine', 'first_wake_mantra',
        now(), now() + interval '4 hours',
        jsonb_build_object('local_hour', v_local_hour, 'mantras', v_mantras, 'decree_id', v_decree_id),
        'voice') RETURNING id INTO v_outreach_id;

      INSERT INTO sleep_state_events (user_id, event_kind, scheduled_local_hour, related_outreach_id, related_decree_id, payload)
      VALUES (s.user_id, 'first_wake', v_local_hour, v_outreach_id, v_decree_id, jsonb_build_object('mantras', v_mantras));

      UPDATE sleep_state_settings SET last_wake_at = now(), updated_at = now() WHERE user_id = s.user_id;
      v_queued := v_queued + 1;
    END IF;
  END LOOP;
  RETURN v_queued;
END;
$fn$;

GRANT EXECUTE ON FUNCTION sleep_state_eval() TO service_role;

-- Activate for both live users with sensible defaults
INSERT INTO sleep_state_settings (user_id, enabled, timezone, pre_sleep_hour_local, wake_hour_local, overnight_loop_enabled)
VALUES
  ('8c69b9c8-34eb-4147-9fec-3c1a5bc74b6f', TRUE, 'America/Chicago', 21, 7, FALSE),
  ('93327332-7d0d-4888-889a-1607a5776216', TRUE, 'America/Chicago', 21, 7, FALSE)
ON CONFLICT (user_id) DO UPDATE SET enabled = TRUE, updated_at = now();

-- Hourly cron (00 of each hour UTC) — function self-filters by local hour
DO $do$ BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname='sleep-state-hourly') THEN
    PERFORM cron.unschedule('sleep-state-hourly');
  END IF;
EXCEPTION WHEN undefined_table THEN NULL; END $do$;

DO $do$ BEGIN
  PERFORM cron.schedule('sleep-state-hourly', '0 * * * *',
    $cron$SELECT sleep_state_eval()$cron$);
EXCEPTION WHEN undefined_table THEN NULL; END $do$;
