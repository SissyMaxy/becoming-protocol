-- 564 — Longitudinal counselor narrative notes.
-- Weekly synthesis: 28-day rolling window of plantings + reactions +
-- milestones + risk signals → narrative summary. Tells Maxy whether
-- the campaign is producing observable patterns, which arc_focus is
-- moving, which is stuck. Stored in gina_counselor_notes for history.

CREATE TABLE IF NOT EXISTS gina_counselor_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  period_start DATE NOT NULL, period_end DATE NOT NULL,
  narrative TEXT NOT NULL,
  mtf_status JSONB, nonmono_status JSONB,
  milestones_in_period INT NOT NULL DEFAULT 0, plantings_in_period INT NOT NULL DEFAULT 0,
  positive_reactions INT NOT NULL DEFAULT 0, negative_reactions INT NOT NULL DEFAULT 0,
  risk_signals_in_period INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, period_start)
);
ALTER TABLE gina_counselor_notes ENABLE ROW LEVEL SECURITY;
DO $do$ BEGIN CREATE POLICY gcn_self ON gina_counselor_notes FOR ALL TO authenticated USING (auth.uid()=user_id) WITH CHECK (auth.uid()=user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $do$;

CREATE OR REPLACE FUNCTION gina_counselor_note_eval()
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE u RECORD; v_start DATE; v_end DATE; v_narrative TEXT; v_status JSONB;
  v_milestones INT; v_plantings INT; v_pos INT; v_neg INT; v_risk INT;
  v_top_milestone TEXT; v_queued INT := 0;
BEGIN
  v_end := current_date; v_start := v_end - interval '28 days';
  FOR u IN SELECT us.user_id FROM user_state us WHERE COALESCE(us.handler_persona, 'therapist') = 'dommy_mommy'
  LOOP
    IF EXISTS (SELECT 1 FROM gina_counselor_notes WHERE user_id=u.user_id AND period_start > v_end - interval '7 days') THEN CONTINUE; END IF;
    SELECT count(*) INTO v_milestones FROM gina_milestones WHERE user_id=u.user_id AND observed_at >= v_start;
    SELECT count(*) INTO v_plantings FROM gina_seed_plantings WHERE user_id=u.user_id AND scheduled_at >= v_start;
    SELECT count(*) FILTER (WHERE reaction_score >= 2 OR hypothesis_outcome IN ('matched','exceeded')) INTO v_pos
      FROM gina_seed_plantings WHERE user_id=u.user_id AND scheduled_at >= v_start;
    SELECT count(*) FILTER (WHERE reaction_score <= -1 OR hypothesis_outcome = 'reversed') INTO v_neg
      FROM gina_seed_plantings WHERE user_id=u.user_id AND scheduled_at >= v_start;
    SELECT count(*) INTO v_risk FROM gina_risk_signals WHERE user_id=u.user_id AND created_at >= v_start;
    SELECT milestone_kind INTO v_top_milestone FROM gina_milestones WHERE user_id=u.user_id AND observed_at >= v_start
      GROUP BY milestone_kind ORDER BY count(*) DESC, sum(weight) DESC LIMIT 1;
    v_status := current_gina_campaign_status(u.user_id);

    v_narrative := format(E'4-week counselor period notes (%s to %s):\n\nCampaign activity: %s plantings, %s landed positive, %s landed negative. %s milestones logged. %s risk signals raised.\n\n%s\n\nMTF accel: stage %s (%s), %s weeks in.\nNon-mono probe: stage %s (%s), %s weeks in.',
      v_start, v_end, v_plantings, v_pos, v_neg, v_milestones, v_risk,
      CASE
        WHEN v_pos = 0 AND v_neg = 0 AND v_milestones = 0 THEN 'Quiet period. Either Mama wasn''t pushing or the user wasn''t engaging. Worth voice debriefing on which.'
        WHEN v_risk > 0 THEN 'Risk signals present. Campaign was likely paused or should be — repair work over advancement work for the next cycle.'
        WHEN v_neg > v_pos AND v_pos < 2 THEN 'Mostly cold reactions. Recommend dropping intensity by one band and shifting arc_focus.'
        WHEN v_pos > v_neg * 2 AND v_pos >= 3 THEN 'Strong positive period. Stage-advancement likely fired or imminent. Momentum window — capitalize.'
        WHEN v_milestones >= 3 THEN format('Milestones-heavy period. Top: %s. The campaign is producing observable Gina-behaviors — that''s the durable signal.', COALESCE(v_top_milestone, 'unknown'))
        ELSE 'Mixed signals. Some engagement, some friction. Steady-state continuation.'
      END,
      v_status->'mtf_accel'->>'current_stage_num', v_status->'mtf_accel'->>'stage_name', v_status->'mtf_accel'->>'weeks_in_stage',
      v_status->'nonmono_probe'->>'current_stage_num', v_status->'nonmono_probe'->>'stage_name', v_status->'nonmono_probe'->>'weeks_in_stage');

    INSERT INTO gina_counselor_notes (user_id, period_start, period_end, narrative, mtf_status, nonmono_status, milestones_in_period, plantings_in_period, positive_reactions, negative_reactions, risk_signals_in_period)
    VALUES (u.user_id, v_start, v_end, v_narrative, v_status->'mtf_accel', v_status->'nonmono_probe', v_milestones, v_plantings, v_pos, v_neg, v_risk);
    INSERT INTO handler_outreach_queue (user_id, message, urgency, trigger_reason, source, kind, scheduled_for, expires_at, context_data, evidence_kind)
    VALUES (u.user_id, E'**Counselor 4-week note.**\n\n' || v_narrative, 'normal',
      'counselor_notes:' || v_end::text, 'gina_counselor_notes', 'narrative_synthesis',
      now() + interval '1 hour', now() + interval '48 hours',
      jsonb_build_object('period_start', v_start, 'period_end', v_end, 'milestones', v_milestones, 'plantings', v_plantings), 'voice');
    v_queued := v_queued + 1;
  END LOOP;
  RETURN v_queued;
END;
$fn$;
GRANT EXECUTE ON FUNCTION gina_counselor_note_eval() TO service_role;

DO $do$ BEGIN IF EXISTS (SELECT 1 FROM cron.job WHERE jobname='gina-counselor-note-monthly') THEN PERFORM cron.unschedule('gina-counselor-note-monthly'); END IF; EXCEPTION WHEN undefined_table THEN NULL; END $do$;
DO $do$ BEGIN PERFORM cron.schedule('gina-counselor-note-monthly', '0 16 * * 0', $cron$SELECT gina_counselor_note_eval()$cron$); EXCEPTION WHEN undefined_table THEN NULL; END $do$;
