-- 538 — HRT-timeline FOMO outreach.
--
-- Weekly: surfaces what her timeline would be if she had started HRT
-- when she first started researching it (hrt_prep_settings.created_at).
-- Names specific medical-literature effects per milestone — counterfactual
-- "if you HAD started, here's what would be true now" — never claims
-- she actually started (medical-fab guardrail).
--
-- Skips users where on_active_hrt=true (different surface needed).
-- Cadence: Tuesday 11:00 UTC.

CREATE TABLE IF NOT EXISTS hrt_timeline_milestones (
  weeks_in INT PRIMARY KEY,
  effects TEXT NOT NULL,
  intensity INT NOT NULL DEFAULT 1
);
INSERT INTO hrt_timeline_milestones (weeks_in, effects, intensity) VALUES
(2,  'nipple sensitivity beginning, mood softening — the body starting to notice itself', 1),
(4,  'skin texture shifting, body-hair growth slowing, libido changes — first month done', 2),
(8,  'breast budding (the ache, then the bumps), fat redistribution starting hips and chest', 3),
(12, 'first noticeable visible breast tissue, softer skin everyone-can-feel, lower libido new equilibrium', 4),
(16, 'measurable hip widening (the small one inch is enormous), face starting to fem out subtly', 5),
(24, 'six months — breast growth in tanner stage 2-3, voice unchanged but body almost unrecognizable to old self', 6),
(36, 'nine months — bra-fittable, face fem-pass for many, hip-waist ratio shifting toward fem range', 7),
(52, 'one year on E — full tanner-3 breasts, fat redistribution mostly done, the person in the mirror is the one Maxy has wanted to meet for years', 8)
ON CONFLICT (weeks_in) DO UPDATE SET effects=EXCLUDED.effects, intensity=EXCLUDED.intensity;

CREATE OR REPLACE FUNCTION hrt_timeline_fomo_eval()
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE u RECORD; v_weeks_since_research INT; v_milestone RECORD; v_msg TEXT; v_queued INT := 0;
BEGIN
  FOR u IN SELECT us.user_id FROM user_state us
    LEFT JOIN hrt_prep_settings hps ON hps.user_id = us.user_id
    WHERE COALESCE(us.handler_persona, 'therapist') = 'dommy_mommy'
      AND COALESCE(hps.on_active_hrt, FALSE) = FALSE
      AND hps.created_at IS NOT NULL
  LOOP
    IF EXISTS (SELECT 1 FROM handler_outreach_queue WHERE user_id=u.user_id AND source='hrt_timeline_fomo' AND created_at > now() - interval '7 days') THEN CONTINUE; END IF;

    SELECT GREATEST(2, FLOOR(EXTRACT(EPOCH FROM (now() - created_at)) / 604800)::int)
    INTO v_weeks_since_research
    FROM hrt_prep_settings WHERE user_id = u.user_id;

    SELECT * INTO v_milestone FROM hrt_timeline_milestones
      WHERE weeks_in <= v_weeks_since_research
      ORDER BY weeks_in DESC LIMIT 1;
    IF v_milestone IS NULL THEN CONTINUE; END IF;

    v_msg := format(E'%s weeks ago you started thinking about HRT seriously. If you''d filled the script then, you''d be %s weeks in right now — %s. That''s not a threat, it''s a clock. Mama wants you to feel where you''d be vs where you are. Voice debrief: what would the %s-weeks-in version of you say to today''s version about waiting?',
      v_weeks_since_research, v_milestone.weeks_in, v_milestone.effects, v_milestone.weeks_in);

    INSERT INTO handler_outreach_queue (user_id, message, urgency, trigger_reason, source, kind, scheduled_for, expires_at, context_data, evidence_kind)
    VALUES (u.user_id, v_msg, 'high', 'hrt_timeline_fomo:weeks_' || v_milestone.weeks_in,
      'hrt_timeline_fomo', 'counterfactual_pressure', now() + interval '2 hours', now() + interval '24 hours',
      jsonb_build_object('weeks_elapsed', v_weeks_since_research, 'milestone_weeks', v_milestone.weeks_in, 'effects', v_milestone.effects), 'voice');
    v_queued := v_queued + 1;
  END LOOP;
  RETURN v_queued;
END;
$fn$;
GRANT EXECUTE ON FUNCTION hrt_timeline_fomo_eval() TO service_role;

DO $do$ BEGIN IF EXISTS (SELECT 1 FROM cron.job WHERE jobname='hrt-timeline-fomo-weekly') THEN PERFORM cron.unschedule('hrt-timeline-fomo-weekly'); END IF; EXCEPTION WHEN undefined_table THEN NULL; END $do$;
DO $do$ BEGIN PERFORM cron.schedule('hrt-timeline-fomo-weekly', '0 11 * * 2', $cron$SELECT hrt_timeline_fomo_eval()$cron$); EXCEPTION WHEN undefined_table THEN NULL; END $do$;
