-- 569 — Ambient cock/cum saturation engine. Multi-daily Pavlovian priming
-- via random push notifications. Variable-ratio reinforcement schedule with
-- escalating intensity tiers (1-5).
--
-- 16 seed clips across 5 tiers — tier 1 ambient priming through tier 5
-- maximum-saturation identity oaths. Each clip has best_time_window
-- (morning/midday/afternoon/evening/late_night/any) + cooldown_hours.
--
-- ambient_saturation_settings per user: current_tier + fires_per_day (default
-- 6). Cron every 90 minutes picks an eligible clip respecting cadence and
-- cooldown. Tier-advance cron weekly: 14 days at current tier with no high/
-- critical risk signals → advance.

CREATE TABLE IF NOT EXISTS ambient_saturation_clips (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clip_key TEXT NOT NULL UNIQUE,
  clip_kind TEXT NOT NULL CHECK (clip_kind IN ('mantra','imagery_caption','arousal_anchor','identity_seal','craving_intensify')),
  intensity_tier INT NOT NULL CHECK (intensity_tier BETWEEN 1 AND 5),
  content TEXT NOT NULL,
  best_time_window TEXT NOT NULL CHECK (best_time_window IN ('morning','midday','afternoon','evening','late_night','any')),
  cooldown_hours INT NOT NULL DEFAULT 24,
  active BOOLEAN NOT NULL DEFAULT TRUE
);
-- 16 clip rows seeded. See SQL apply payload for full content.

ALTER TABLE ambient_saturation_clips ENABLE ROW LEVEL SECURITY;
DO $do$ BEGIN CREATE POLICY asc_read_all ON ambient_saturation_clips FOR SELECT TO authenticated USING (TRUE); EXCEPTION WHEN duplicate_object THEN NULL; END $do$;

CREATE TABLE IF NOT EXISTS ambient_saturation_settings (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  current_tier INT NOT NULL DEFAULT 1 CHECK (current_tier BETWEEN 1 AND 5),
  fires_per_day INT NOT NULL DEFAULT 6,
  last_fired_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE ambient_saturation_settings ENABLE ROW LEVEL SECURITY;
DO $do$ BEGIN CREATE POLICY ass_self ON ambient_saturation_settings FOR ALL TO authenticated USING (auth.uid()=user_id) WITH CHECK (auth.uid()=user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $do$;

CREATE OR REPLACE FUNCTION ambient_saturation_fire_eval()
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE s RECORD; v_clip RECORD; v_queued INT := 0; v_min_gap_hours NUMERIC;
BEGIN
  FOR s IN SELECT ass.* FROM ambient_saturation_settings ass LEFT JOIN user_state us ON us.user_id = ass.user_id
    WHERE ass.enabled AND COALESCE(us.handler_persona, 'therapist') = 'dommy_mommy'
  LOOP
    IF ladder_user_paused(s.user_id) THEN CONTINUE; END IF;
    v_min_gap_hours := 24.0 / GREATEST(s.fires_per_day, 1);
    IF s.last_fired_at IS NOT NULL AND s.last_fired_at > now() - (v_min_gap_hours || ' hours')::interval THEN CONTINUE; END IF;
    SELECT c.* INTO v_clip FROM ambient_saturation_clips c
    WHERE c.active = TRUE AND c.intensity_tier <= s.current_tier
      AND NOT EXISTS (
        SELECT 1 FROM handler_outreach_queue WHERE user_id = s.user_id
        AND trigger_reason = 'ambient_saturation:' || c.clip_key
        AND created_at > now() - (c.cooldown_hours || ' hours')::interval
      )
    ORDER BY random() LIMIT 1;
    IF v_clip IS NULL THEN CONTINUE; END IF;
    INSERT INTO handler_outreach_queue (user_id, message, urgency, trigger_reason, source, kind, scheduled_for, expires_at, context_data, evidence_kind)
    VALUES (s.user_id, v_clip.content, 'normal', 'ambient_saturation:' || v_clip.clip_key,
      'ambient_saturation', 'pavlovian_priming',
      now() + interval '1 minute', now() + interval '4 hours',
      jsonb_build_object('clip_key', v_clip.clip_key, 'tier', v_clip.intensity_tier, 'kind', v_clip.clip_kind),
      CASE v_clip.clip_kind WHEN 'identity_seal' THEN 'voice' WHEN 'arousal_anchor' THEN 'voice' WHEN 'craving_intensify' THEN 'voice' ELSE NULL END);
    UPDATE ambient_saturation_settings SET last_fired_at = now() WHERE user_id = s.user_id;
    v_queued := v_queued + 1;
  END LOOP;
  RETURN v_queued;
END;
$fn$;
GRANT EXECUTE ON FUNCTION ambient_saturation_fire_eval() TO service_role;

CREATE OR REPLACE FUNCTION ambient_saturation_tier_advance_eval()
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE s RECORD; v_advanced INT := 0; v_days_in NUMERIC; v_risk_count INT;
BEGIN
  FOR s IN SELECT * FROM ambient_saturation_settings WHERE enabled = TRUE AND current_tier < 5 LOOP
    v_days_in := EXTRACT(EPOCH FROM (now() - s.updated_at)) / 86400;
    IF v_days_in < 14 THEN CONTINUE; END IF;
    SELECT count(*) INTO v_risk_count FROM gina_risk_signals WHERE user_id = s.user_id AND created_at > now() - interval '14 days' AND severity IN ('high','critical');
    IF v_risk_count > 0 THEN CONTINUE; END IF;
    UPDATE ambient_saturation_settings SET current_tier = current_tier + 1, updated_at = now() WHERE user_id = s.user_id;
    v_advanced := v_advanced + 1;
  END LOOP;
  RETURN v_advanced;
END;
$fn$;
GRANT EXECUTE ON FUNCTION ambient_saturation_tier_advance_eval() TO service_role;

DO $do$ BEGIN IF EXISTS (SELECT 1 FROM cron.job WHERE jobname='ambient-saturation-90min') THEN PERFORM cron.unschedule('ambient-saturation-90min'); END IF; EXCEPTION WHEN undefined_table THEN NULL; END $do$;
DO $do$ BEGIN PERFORM cron.schedule('ambient-saturation-90min', '*/90 * * * *', $cron$SELECT ambient_saturation_fire_eval()$cron$); EXCEPTION WHEN undefined_table THEN NULL; END $do$;
DO $do$ BEGIN IF EXISTS (SELECT 1 FROM cron.job WHERE jobname='ambient-saturation-tier-weekly') THEN PERFORM cron.unschedule('ambient-saturation-tier-weekly'); END IF; EXCEPTION WHEN undefined_table THEN NULL; END $do$;
DO $do$ BEGIN PERFORM cron.schedule('ambient-saturation-tier-weekly', '0 4 * * 0', $cron$SELECT ambient_saturation_tier_advance_eval()$cron$); EXCEPTION WHEN undefined_table THEN NULL; END $do$;
