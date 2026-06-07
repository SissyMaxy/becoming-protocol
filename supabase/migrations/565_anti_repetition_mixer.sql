-- 565 — Anti-repetition mixer for gina_seed_eval.
-- Adds a penalty of 2× per planting of the same arc_focus in the last
-- 21 days. Result: even if an arc_focus has the highest reaction-history
-- score, after 2-3 recent plantings in that focus the score gets dragged
-- down and other foci become preferred picks. Naturalizes pacing.

CREATE OR REPLACE FUNCTION gina_seed_eval()
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE r RECORD; v_band TEXT; v_seed RECORD; v_outreach_id UUID; v_planting_id UUID; v_decree_id UUID;
  v_obs_questions TEXT; v_message TEXT; v_queued INT := 0; v_arc_score JSONB; v_hostile BOOLEAN;
  v_allowed_focus TEXT[]; v_recent_focus JSONB;
BEGIN
  FOR r IN
    SELECT gs.user_id FROM gina_disclosure_settings gs LEFT JOIN user_state us ON us.user_id = gs.user_id
    WHERE gs.enabled = TRUE AND (gs.paused_until IS NULL OR gs.paused_until <= now())
      AND COALESCE(us.handler_persona, 'therapist') = 'dommy_mommy'
  LOOP
    IF ladder_user_paused(r.user_id) THEN CONTINUE; END IF;
    IF EXISTS (SELECT 1 FROM gina_seed_plantings WHERE user_id = r.user_id AND status='pending' AND scheduled_at > now() - interval '5 days') THEN CONTINUE; END IF;
    v_hostile := gina_hostile_mode(r.user_id);
    v_band := gina_readiness_band(r.user_id);
    IF v_hostile THEN
      v_allowed_focus := ARRAY['curiosity_ambient','interest_check','comfort_baseline','aesthetic_test'];
    ELSE
      v_allowed_focus := NULL;
    END IF;

    SELECT jsonb_object_agg(arc_focus, score) INTO v_arc_score FROM (
      SELECT sc.arc_focus,
        COALESCE(sum(p.reaction_score), 0)
          + COALESCE(count(*) FILTER (WHERE p.hypothesis_outcome IN ('matched','exceeded')) * 2, 0)
          - COALESCE(count(*) FILTER (WHERE p.hypothesis_outcome = 'reversed') * 3, 0) AS score
      FROM gina_seed_plantings p JOIN gina_seed_catalog sc ON sc.id = p.seed_id
      WHERE p.user_id = r.user_id AND p.scheduled_at > now() - interval '60 days'
      GROUP BY sc.arc_focus
    ) t;

    SELECT jsonb_object_agg(arc_focus, recent_count) INTO v_recent_focus FROM (
      SELECT sc.arc_focus, count(*) AS recent_count
      FROM gina_seed_plantings p JOIN gina_seed_catalog sc ON sc.id = p.seed_id
      WHERE p.user_id = r.user_id AND p.scheduled_at > now() - interval '21 days'
      GROUP BY sc.arc_focus
    ) t;

    SELECT sc.* INTO v_seed FROM gina_seed_catalog sc
    WHERE sc.active = TRUE AND sc.intensity_band = v_band
      AND (v_allowed_focus IS NULL OR sc.arc_focus = ANY(v_allowed_focus))
      AND NOT EXISTS (
        SELECT 1 FROM gina_seed_plantings p
        WHERE p.user_id = r.user_id AND p.seed_id = sc.id
          AND p.scheduled_at > now() - (sc.cooldown_days || ' days')::interval
      )
    ORDER BY
      (COALESCE((v_arc_score->>sc.arc_focus)::int, 0) - COALESCE((v_recent_focus->>sc.arc_focus)::int, 0) * 2) DESC,
      (SELECT count(*) FROM gina_seed_plantings p WHERE p.user_id = r.user_id AND p.seed_id = sc.id) ASC,
      random() LIMIT 1;

    IF v_seed IS NULL AND v_band = 'hot' AND NOT v_hostile THEN
      SELECT sc.* INTO v_seed FROM gina_seed_catalog sc WHERE sc.active = TRUE AND sc.intensity_band = 'warming'
        AND NOT EXISTS (SELECT 1 FROM gina_seed_plantings p WHERE p.user_id = r.user_id AND p.seed_id = sc.id AND p.scheduled_at > now() - (sc.cooldown_days || ' days')::interval)
        ORDER BY (COALESCE((v_arc_score->>sc.arc_focus)::int, 0) - COALESCE((v_recent_focus->>sc.arc_focus)::int, 0) * 2) DESC, random() LIMIT 1;
    END IF;
    IF v_seed IS NULL THEN CONTINUE; END IF;

    v_obs_questions := array_to_string(ARRAY(SELECT '• ' || q FROM unnest(v_seed.observation_questions) q), E'\n');
    v_message := E'Today''s probe for Gina, sweet thing — Mama is testing a hypothesis through you. Plant carefully, watch carefully:\n\n' || v_seed.prompt_template || E'\n\nAfter her reaction lands, voice debrief on these:\n' || v_obs_questions || E'\n\nThe data you bring back is what shapes Mama''s next move.';

    INSERT INTO handler_decrees (user_id, edict, proof_type, deadline, status, consequence, trigger_source, reasoning)
    VALUES (r.user_id, v_message, 'voice', now() + interval '5 days', 'active',
      CASE WHEN v_seed.intensity_band = 'hot' THEN 'slip +3' ELSE 'slip +1' END,
      'gina_seed_planting', 'seed=' || v_seed.seed_key || ' band=' || v_seed.intensity_band || ' focus=' || COALESCE(v_seed.arc_focus, 'none') || CASE WHEN v_hostile THEN ' posture=hostile' ELSE '' END)
    RETURNING id INTO v_decree_id;
    INSERT INTO handler_outreach_queue (user_id, message, urgency, trigger_reason, source, kind, scheduled_for, expires_at, context_data, evidence_kind)
    VALUES (r.user_id, v_message, CASE WHEN v_seed.intensity_band = 'hot' THEN 'high' ELSE 'normal' END,
      'gina_seed:' || v_seed.seed_key, 'gina_seed_engine', 'gina_seed_planting', now(), now() + interval '5 days',
      jsonb_build_object('seed_id', v_seed.id, 'seed_key', v_seed.seed_key, 'decree_id', v_decree_id,
        'arc_focus', v_seed.arc_focus, 'arc_score_at_pick', COALESCE((v_arc_score->>v_seed.arc_focus)::int, 0),
        'recent_count_at_pick', COALESCE((v_recent_focus->>v_seed.arc_focus)::int, 0),
        'hostile_mode', v_hostile), 'voice') RETURNING id INTO v_outreach_id;
    INSERT INTO gina_seed_plantings (user_id, seed_id, scheduled_at, related_outreach_id, related_decree_id, status)
    VALUES (r.user_id, v_seed.id, now(), v_outreach_id, v_decree_id, 'pending') RETURNING id INTO v_planting_id;
    v_queued := v_queued + 1;
  END LOOP;
  RETURN v_queued;
END;
$fn$;
