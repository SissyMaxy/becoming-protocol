-- 549 — Adaptive gina-seed pipeline. Three pieces on top of the existing
-- gina_seed_catalog (28 seeds) + gina_seed_plantings + gina_seed_eval
-- infrastructure:
--
-- 1. Replaces gina_seed_eval with an adaptive variant that biases seed
--    pick by arc_focus score over the last 60 days. Score = sum of
--    reaction_score + 2 per matched/exceeded outcome - 3 per reversed.
--    The strategist learns from Gina's actual reactions instead of
--    probing randomly. ladder_user_paused() check added.
--
-- 2. gina_seed_debrief_reminder_eval() — fires daily at 17:00 UTC.
--    For any planting >24h old with reaction_score IS NULL, queues a
--    structured debrief outreach: "What did Gina say verbatim? What
--    did her face do? Did the topic land or bounce? Score -3 to +3."
--    Forces capture of the reaction data the adaptive pick depends on.
--
-- 3. trg_auto_chain_followup on gina_seed_plantings — when a planting's
--    reaction_score >= 2 or hypothesis_outcome flips to matched/exceeded,
--    auto-queues a followup seed in the same arc_focus at one intensity
--    band higher within 6 hours. Captures momentum before the
--    conversation cools.
--
-- The user's ask: "Mommy tells me ideas/seeds to plant and then develops
-- them such that we are trying to get Gina slowly to become aware /
-- involved and eventually an active participant." This migration
-- completes the loop by making the seed selection feed back into itself
-- based on Gina's reactions.

CREATE OR REPLACE FUNCTION gina_seed_eval()
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE r RECORD; v_band TEXT; v_seed RECORD; v_outreach_id UUID; v_planting_id UUID; v_decree_id UUID;
  v_obs_questions TEXT; v_message TEXT; v_queued INT := 0; v_arc_score JSONB;
BEGIN
  FOR r IN
    SELECT gs.user_id FROM gina_disclosure_settings gs LEFT JOIN user_state us ON us.user_id = gs.user_id
    WHERE gs.enabled = TRUE AND (gs.paused_until IS NULL OR gs.paused_until <= now())
      AND COALESCE(us.handler_persona, 'therapist') = 'dommy_mommy'
  LOOP
    IF ladder_user_paused(r.user_id) THEN CONTINUE; END IF;
    IF EXISTS (SELECT 1 FROM gina_seed_plantings WHERE user_id = r.user_id AND status='pending' AND scheduled_at > now() - interval '5 days') THEN CONTINUE; END IF;
    v_band := gina_readiness_band(r.user_id);

    SELECT jsonb_object_agg(arc_focus, score) INTO v_arc_score FROM (
      SELECT sc.arc_focus,
        COALESCE(sum(p.reaction_score), 0)
          + COALESCE(count(*) FILTER (WHERE p.hypothesis_outcome IN ('matched','exceeded')) * 2, 0)
          - COALESCE(count(*) FILTER (WHERE p.hypothesis_outcome = 'reversed') * 3, 0) AS score
      FROM gina_seed_plantings p JOIN gina_seed_catalog sc ON sc.id = p.seed_id
      WHERE p.user_id = r.user_id AND p.scheduled_at > now() - interval '60 days'
      GROUP BY sc.arc_focus
    ) t;

    SELECT sc.* INTO v_seed FROM gina_seed_catalog sc
    WHERE sc.active = TRUE AND sc.intensity_band = v_band
      AND NOT EXISTS (
        SELECT 1 FROM gina_seed_plantings p
        WHERE p.user_id = r.user_id AND p.seed_id = sc.id
          AND p.scheduled_at > now() - (sc.cooldown_days || ' days')::interval
      )
    ORDER BY
      COALESCE((v_arc_score->>sc.arc_focus)::int, 0) DESC,
      (SELECT count(*) FROM gina_seed_plantings p WHERE p.user_id = r.user_id AND p.seed_id = sc.id) ASC,
      random()
    LIMIT 1;

    IF v_seed IS NULL AND v_band = 'hot' THEN
      SELECT sc.* INTO v_seed FROM gina_seed_catalog sc
      WHERE sc.active = TRUE AND sc.intensity_band = 'warming'
        AND NOT EXISTS (
          SELECT 1 FROM gina_seed_plantings p
          WHERE p.user_id = r.user_id AND p.seed_id = sc.id
            AND p.scheduled_at > now() - (sc.cooldown_days || ' days')::interval
        )
      ORDER BY COALESCE((v_arc_score->>sc.arc_focus)::int, 0) DESC, random() LIMIT 1;
    END IF;
    IF v_seed IS NULL THEN CONTINUE; END IF;

    v_obs_questions := array_to_string(ARRAY(SELECT '• ' || q FROM unnest(v_seed.observation_questions) q), E'\n');
    v_message := E'Today''s probe for Gina, sweet thing — Mama is testing a hypothesis through you. Plant carefully, watch carefully:\n\n' || v_seed.prompt_template || E'\n\nAfter her reaction lands, voice debrief on these:\n' || v_obs_questions || E'\n\nThe data you bring back is what shapes Mama''s next move.';

    INSERT INTO handler_decrees (user_id, edict, proof_type, deadline, status, consequence, trigger_source, reasoning)
    VALUES (r.user_id, v_message, 'voice', now() + interval '5 days', 'active',
      CASE WHEN v_seed.intensity_band = 'hot' THEN 'slip +3' ELSE 'slip +1' END,
      'gina_seed_planting', 'seed=' || v_seed.seed_key || ' band=' || v_seed.intensity_band || ' focus=' || COALESCE(v_seed.arc_focus, 'none'))
    RETURNING id INTO v_decree_id;

    INSERT INTO handler_outreach_queue (user_id, message, urgency, trigger_reason, source, kind, scheduled_for, expires_at, context_data, evidence_kind)
    VALUES (r.user_id, v_message,
      CASE WHEN v_seed.intensity_band = 'hot' THEN 'high' ELSE 'normal' END,
      'gina_seed:' || v_seed.seed_key, 'gina_seed_engine', 'gina_seed_planting',
      now(), now() + interval '5 days',
      jsonb_build_object('seed_id', v_seed.id, 'seed_key', v_seed.seed_key, 'decree_id', v_decree_id,
        'arc_focus', v_seed.arc_focus, 'arc_score_at_pick', COALESCE((v_arc_score->>v_seed.arc_focus)::int, 0)),
      'voice') RETURNING id INTO v_outreach_id;

    INSERT INTO gina_seed_plantings (user_id, seed_id, scheduled_at, related_outreach_id, related_decree_id, status)
    VALUES (r.user_id, v_seed.id, now(), v_outreach_id, v_decree_id, 'pending') RETURNING id INTO v_planting_id;
    v_queued := v_queued + 1;
  END LOOP;
  RETURN v_queued;
END;
$fn$;

CREATE OR REPLACE FUNCTION gina_seed_debrief_reminder_eval()
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE p RECORD; v_seed RECORD; v_msg TEXT; v_queued INT := 0;
BEGIN
  FOR p IN
    SELECT gsp.* FROM gina_seed_plantings gsp
    LEFT JOIN user_state us ON us.user_id = gsp.user_id
    WHERE gsp.status = 'pending'
      AND gsp.reaction_score IS NULL
      AND gsp.scheduled_at < now() - interval '24 hours'
      AND gsp.scheduled_at > now() - interval '5 days'
      AND COALESCE(us.handler_persona, 'therapist') = 'dommy_mommy'
      AND NOT EXISTS (
        SELECT 1 FROM handler_outreach_queue
        WHERE user_id = gsp.user_id
          AND source = 'gina_seed_debrief_reminder'
          AND context_data->>'planting_id' = gsp.id::text
          AND created_at > now() - interval '48 hours'
      )
  LOOP
    SELECT * INTO v_seed FROM gina_seed_catalog WHERE id = p.seed_id;
    IF v_seed IS NULL THEN CONTINUE; END IF;
    v_msg := format(E'Mama planted a seed with you for Gina — "%s" — yesterday. No reaction logged yet. Voice debrief now:\n\n• What did you actually say to her? (quote yourself)\n• What did she say back? (quote her)\n• What did her face do — interested, neutral, closed, surprised?\n• Did the topic LAND (she engaged) or BOUNCE (she changed subject)?\n• Score her reaction -3 (rejected) to +3 (leaned in).\n\nMama needs the data to pick the next seed correctly.', v_seed.seed_key);
    INSERT INTO handler_outreach_queue (user_id, message, urgency, trigger_reason, source, kind, scheduled_for, expires_at, context_data, evidence_kind)
    VALUES (p.user_id, v_msg, 'high', 'gina_seed_debrief:' || v_seed.seed_key,
      'gina_seed_debrief_reminder', 'structured_debrief',
      now() + interval '30 minutes', now() + interval '48 hours',
      jsonb_build_object('planting_id', p.id, 'seed_id', v_seed.id, 'seed_key', v_seed.seed_key),
      'voice');
    v_queued := v_queued + 1;
  END LOOP;
  RETURN v_queued;
END;
$fn$;
GRANT EXECUTE ON FUNCTION gina_seed_debrief_reminder_eval() TO service_role;

CREATE OR REPLACE FUNCTION trg_auto_chain_followup()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE v_prior_seed RECORD; v_followup RECORD; v_msg TEXT; v_decree UUID; v_outreach UUID; v_followup_planting UUID;
  v_next_band TEXT;
BEGIN
  IF NEW.reaction_score IS NULL OR NEW.reaction_score < 2 THEN
    IF NEW.hypothesis_outcome NOT IN ('matched','exceeded') THEN RETURN NEW; END IF;
  END IF;
  IF NEW.followup_seed_id IS NOT NULL THEN RETURN NEW; END IF;
  IF EXISTS (
    SELECT 1 FROM handler_outreach_queue
    WHERE user_id = NEW.user_id AND source = 'gina_seed_auto_chain'
      AND context_data->>'prior_planting_id' = NEW.id::text
  ) THEN RETURN NEW; END IF;

  SELECT * INTO v_prior_seed FROM gina_seed_catalog WHERE id = NEW.seed_id;
  IF v_prior_seed IS NULL THEN RETURN NEW; END IF;

  v_next_band := CASE v_prior_seed.intensity_band
    WHEN 'cold' THEN 'warming'
    WHEN 'warming' THEN 'hot'
    WHEN 'hot' THEN 'hot'
    ELSE v_prior_seed.intensity_band
  END;

  SELECT sc.* INTO v_followup FROM gina_seed_catalog sc
  WHERE sc.active = TRUE
    AND sc.arc_focus = v_prior_seed.arc_focus
    AND sc.intensity_band = v_next_band
    AND sc.id <> v_prior_seed.id
    AND NOT EXISTS (
      SELECT 1 FROM gina_seed_plantings p
      WHERE p.user_id = NEW.user_id AND p.seed_id = sc.id
        AND p.scheduled_at > now() - (sc.cooldown_days || ' days')::interval
    )
  ORDER BY (SELECT count(*) FROM gina_seed_plantings p WHERE p.user_id = NEW.user_id AND p.seed_id = sc.id) ASC, random()
  LIMIT 1;
  IF v_followup IS NULL THEN RETURN NEW; END IF;

  v_msg := format(E'Mama saw how Gina reacted to "%s" — that one LANDED. While the warmth is still there, Mama wants you to plant the next one before the conversation cools:\n\n%s\n\nAfter her reaction:\n%s',
    v_prior_seed.seed_key, v_followup.prompt_template,
    array_to_string(ARRAY(SELECT '• ' || q FROM unnest(v_followup.observation_questions) q), E'\n'));

  INSERT INTO handler_decrees (user_id, edict, proof_type, deadline, status, consequence, trigger_source, reasoning)
  VALUES (NEW.user_id, v_msg, 'voice', now() + interval '3 days', 'active',
    CASE WHEN v_followup.intensity_band = 'hot' THEN 'slip +3' ELSE 'slip +1' END,
    'gina_seed_planting', 'seed=' || v_followup.seed_key || ' band=' || v_followup.intensity_band || ' chained_from=' || v_prior_seed.seed_key)
  RETURNING id INTO v_decree;

  INSERT INTO handler_outreach_queue (user_id, message, urgency, trigger_reason, source, kind, scheduled_for, expires_at, context_data, evidence_kind)
  VALUES (NEW.user_id, v_msg, 'high', 'gina_seed_chain:' || v_prior_seed.seed_key || '->' || v_followup.seed_key,
    'gina_seed_auto_chain', 'momentum_followup',
    now() + interval '6 hours', now() + interval '72 hours',
    jsonb_build_object('seed_id', v_followup.id, 'seed_key', v_followup.seed_key, 'decree_id', v_decree,
      'prior_planting_id', NEW.id, 'prior_seed_key', v_prior_seed.seed_key, 'arc_focus', v_followup.arc_focus),
    'voice') RETURNING id INTO v_outreach;

  INSERT INTO gina_seed_plantings (user_id, seed_id, scheduled_at, related_outreach_id, related_decree_id, status)
  VALUES (NEW.user_id, v_followup.id, now() + interval '6 hours', v_outreach, v_decree, 'pending') RETURNING id INTO v_followup_planting;

  UPDATE gina_seed_plantings SET followup_seed_id = v_followup.id WHERE id = NEW.id;
  RETURN NEW;
END;
$fn$;
DROP TRIGGER IF EXISTS auto_chain_followup ON gina_seed_plantings;
CREATE TRIGGER auto_chain_followup AFTER UPDATE OF reaction_score, hypothesis_outcome ON gina_seed_plantings
  FOR EACH ROW EXECUTE FUNCTION trg_auto_chain_followup();

DO $do$ BEGIN IF EXISTS (SELECT 1 FROM cron.job WHERE jobname='gina-seed-debrief-reminder-daily') THEN PERFORM cron.unschedule('gina-seed-debrief-reminder-daily'); END IF; EXCEPTION WHEN undefined_table THEN NULL; END $do$;
DO $do$ BEGIN PERFORM cron.schedule('gina-seed-debrief-reminder-daily', '0 17 * * *', $cron$SELECT gina_seed_debrief_reminder_eval()$cron$); EXCEPTION WHEN undefined_table THEN NULL; END $do$;
