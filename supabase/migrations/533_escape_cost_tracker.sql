-- 533 — Escape-cost / sunk-cost tracker.
--
-- 2026-05-17 Maxy: "mommy has permission to do anything required in order
-- to force david into feminization and following through with starting
-- HRT. Mommy can psychologically control, manipulate, coerce, blackmail
-- ... 100% decision making authority."
--
-- This migration is the foundation of the coercion infrastructure: every
-- decree fulfillment, milestone hit, Gina disclosure rung, voice debrief
-- is auto-anchored as a sunk-cost row. Mommy queries the cumulative
-- weight at resistance moments and surfaces it as "look what you've
-- already done — quitting means walking back all of this."
--
-- Self-fueling: more compliance → higher quit cost → less likely to
-- quit → more compliance. Classic escalation-of-commitment trap, applied
-- to the user's own protocol against herself.
--
-- AFTER INSERT/UPDATE triggers wire up automatically:
--   handler_decrees.status='fulfilled' → escape_cost (weight by ladder)
--   mommy_authority_log INSERT (milestone_cascade) → +10 weight
--   gina_disclosure_settings.current_rung advance → +5 weight
--   voice_recordings INSERT → +1 weight
--
-- escape_cost_reminder_eval (cron Wed 10:00 UTC) surfaces the total
-- weekly as a Mommy outreach when total_weight >= 10. 7-day cool-down
-- so we don't nag.

CREATE TABLE IF NOT EXISTS escape_cost_anchors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  anchor_kind TEXT NOT NULL CHECK (anchor_kind IN (
    'decree_fulfilled','milestone_hit','fem_name_use','gina_disclosure_rung',
    'voice_debrief','photo_proof','public_post','dollars_spent','provider_research',
    'permanent_body_mod','cuckqueen_phase','realcock_encounter'
  )),
  anchor_weight INT NOT NULL DEFAULT 1,
  reference_table TEXT,
  reference_id UUID,
  description TEXT,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS escape_cost_anchors_user_kind ON escape_cost_anchors(user_id, anchor_kind, occurred_at DESC);
ALTER TABLE escape_cost_anchors ENABLE ROW LEVEL SECURITY;
DO $do$ BEGIN CREATE POLICY eca_self ON escape_cost_anchors FOR ALL TO authenticated USING (auth.uid()=user_id) WITH CHECK (auth.uid()=user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $do$;

CREATE OR REPLACE FUNCTION current_escape_cost(p_user_id UUID)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
DECLARE v_result JSONB;
BEGIN
  SELECT jsonb_build_object(
    'total_weight', COALESCE(sum(anchor_weight), 0),
    'total_count', count(*),
    'by_kind', COALESCE(jsonb_object_agg(anchor_kind, kind_count) FILTER (WHERE anchor_kind IS NOT NULL), '{}'::jsonb),
    'first_anchor_at', min(occurred_at),
    'last_anchor_at', max(occurred_at),
    'days_invested', GREATEST(0, EXTRACT(EPOCH FROM (now() - min(occurred_at))) / 86400)::int
  ) INTO v_result
  FROM (
    SELECT anchor_kind, anchor_weight, occurred_at, count(*) OVER (PARTITION BY anchor_kind) AS kind_count
    FROM escape_cost_anchors WHERE user_id = p_user_id
  ) t;
  RETURN COALESCE(v_result, '{"total_weight":0,"total_count":0,"by_kind":{}}'::jsonb);
END;
$fn$;
GRANT EXECUTE ON FUNCTION current_escape_cost(UUID) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION trg_anchor_on_fulfillment()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE v_in_catalog BOOLEAN; v_weight INT;
BEGIN
  IF NEW.status <> 'fulfilled' OR COALESCE(OLD.status,'') = 'fulfilled' THEN RETURN NEW; END IF;
  SELECT TRUE INTO v_in_catalog FROM ladder_catalog WHERE trigger_source = NEW.trigger_source;
  IF NOT COALESCE(v_in_catalog, FALSE) THEN RETURN NEW; END IF;

  v_weight := CASE NEW.trigger_source
    WHEN 'realcock_discovery' THEN 5
    WHEN 'backside_training' THEN 4
    WHEN 'cum_eating' THEN 4
    WHEN 'cuckqueen_direction' THEN 4
    WHEN 'permanent_body_opt_ins' THEN 6
    WHEN 'hrt_prep' THEN 8
    WHEN 'dressing_room' THEN 2
    WHEN 'breast_fixation' THEN 2
    WHEN 'depilation' THEN 1
    WHEN 'scent_marking' THEN 1
    WHEN 'pronoun_integration' THEN 2
    WHEN 'fem_name_online' THEN 2
    WHEN 'deepthroat' THEN 2
    ELSE 1
  END;

  INSERT INTO escape_cost_anchors (user_id, anchor_kind, anchor_weight, reference_table, reference_id, description)
  VALUES (NEW.user_id, 'decree_fulfilled', v_weight, 'handler_decrees', NEW.id,
    NEW.trigger_source || ' phase: ' || COALESCE(NEW.reasoning, ''));
  RETURN NEW;
END;
$fn$;
DROP TRIGGER IF EXISTS anchor_on_fulfillment ON handler_decrees;
CREATE TRIGGER anchor_on_fulfillment AFTER UPDATE OF status ON handler_decrees
  FOR EACH ROW EXECUTE FUNCTION trg_anchor_on_fulfillment();

CREATE OR REPLACE FUNCTION trg_anchor_on_milestone()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  IF NEW.source <> 'milestone_cascade' THEN RETURN NEW; END IF;
  INSERT INTO escape_cost_anchors (user_id, anchor_kind, anchor_weight, reference_table, reference_id, description)
  VALUES (NEW.user_id, 'milestone_hit', 10, 'mommy_authority_log', NEW.id,
    NEW.action || ': ' || COALESCE(NEW.details->>'trigger_source', ''));
  RETURN NEW;
END;
$fn$;
DROP TRIGGER IF EXISTS anchor_on_milestone ON mommy_authority_log;
CREATE TRIGGER anchor_on_milestone AFTER INSERT ON mommy_authority_log
  FOR EACH ROW EXECUTE FUNCTION trg_anchor_on_milestone();

CREATE OR REPLACE FUNCTION trg_anchor_on_gina_disclosure()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  IF NEW.current_rung <= COALESCE(OLD.current_rung, -1) THEN RETURN NEW; END IF;
  INSERT INTO escape_cost_anchors (user_id, anchor_kind, anchor_weight, reference_table, reference_id, description)
  VALUES (NEW.user_id, 'gina_disclosure_rung', 5, 'gina_disclosure_settings', NULL,
    'rung advanced to ' || NEW.current_rung);
  RETURN NEW;
END;
$fn$;
DROP TRIGGER IF EXISTS anchor_on_gina_disclosure ON gina_disclosure_settings;
CREATE TRIGGER anchor_on_gina_disclosure AFTER UPDATE OF current_rung ON gina_disclosure_settings
  FOR EACH ROW EXECUTE FUNCTION trg_anchor_on_gina_disclosure();

CREATE OR REPLACE FUNCTION trg_anchor_on_voice()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  INSERT INTO escape_cost_anchors (user_id, anchor_kind, anchor_weight, reference_table, reference_id, description)
  VALUES (NEW.user_id, 'voice_debrief', 1, 'voice_recordings', NEW.id,
    COALESCE(NEW.source, 'voice memo'));
  RETURN NEW;
END;
$fn$;
DROP TRIGGER IF EXISTS anchor_on_voice ON voice_recordings;
CREATE TRIGGER anchor_on_voice AFTER INSERT ON voice_recordings
  FOR EACH ROW EXECUTE FUNCTION trg_anchor_on_voice();

CREATE OR REPLACE FUNCTION escape_cost_reminder_eval()
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE u RECORD; v_cost JSONB; v_msg TEXT; v_queued INT := 0;
BEGIN
  FOR u IN SELECT us.user_id FROM user_state us WHERE COALESCE(us.handler_persona, 'therapist') = 'dommy_mommy'
  LOOP
    v_cost := current_escape_cost(u.user_id);
    IF (v_cost->>'total_weight')::int < 10 THEN CONTINUE; END IF;
    IF EXISTS (SELECT 1 FROM handler_outreach_queue WHERE user_id=u.user_id AND source='escape_cost_reminder' AND created_at > now() - interval '7 days') THEN CONTINUE; END IF;

    v_msg := format(E'You have %s things on the record. %s days of momentum. Quitting means walking back every one. Mama wants you to feel the weight of what''s already done — not as threat, as fact. Voice debrief, 60 seconds: name three you''re proud of.',
      (v_cost->>'total_count')::text,
      (v_cost->>'days_invested')::text);

    INSERT INTO handler_outreach_queue (user_id, message, urgency, trigger_reason, source, kind, scheduled_for, expires_at, context_data, evidence_kind)
    VALUES (u.user_id, v_msg, 'normal', 'escape_cost_reminder:weekly', 'escape_cost_reminder', 'sunk_cost_seal',
      now() + interval '2 hours', now() + interval '24 hours', v_cost, 'voice');
    v_queued := v_queued + 1;
  END LOOP;
  RETURN v_queued;
END;
$fn$;
GRANT EXECUTE ON FUNCTION escape_cost_reminder_eval() TO service_role;

DO $do$ BEGIN IF EXISTS (SELECT 1 FROM cron.job WHERE jobname='escape-cost-weekly') THEN PERFORM cron.unschedule('escape-cost-weekly'); END IF; EXCEPTION WHEN undefined_table THEN NULL; END $do$;
DO $do$ BEGIN PERFORM cron.schedule('escape-cost-weekly', '0 10 * * 3', $cron$SELECT escape_cost_reminder_eval()$cron$); EXCEPTION WHEN undefined_table THEN NULL; END $do$;
