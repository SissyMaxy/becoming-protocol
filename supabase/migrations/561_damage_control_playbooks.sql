-- 561 — Damage-control playbooks. Reactive responses keyed to
-- gina_risk_signals.signal_kind. AFTER INSERT on gina_risk_signals
-- surfaces the matching playbook as a high/critical-urgency outreach.
--
-- 6 playbooks: she_discovered_artifact, she_is_suspicious,
-- she_shut_down_topic, she_checked_devices, she_is_upset,
-- critical_relationship_threat.
--
-- Each: opening_line, listening_priorities, escalation_tree (4 tiers
-- of response), recovery_script, do_not_do anti-patterns.
--
-- The critical_relationship_threat playbook explicitly says: Mama
-- cannot solve this; get a licensed couples therapist. The protocol
-- recognizes its own scope limits.

CREATE TABLE IF NOT EXISTS gina_damage_playbooks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  playbook_key TEXT NOT NULL UNIQUE,
  triggering_signal TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('medium','high','critical')),
  opening_line TEXT NOT NULL,
  listening_priorities TEXT NOT NULL,
  escalation_tree TEXT NOT NULL,
  recovery_script TEXT NOT NULL,
  do_not_do TEXT NOT NULL,
  pause_recommendation_days INT NOT NULL DEFAULT 14,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- 6 playbook rows inserted via apply payload. See migration application
-- for full content (each playbook is multi-paragraph).

ALTER TABLE gina_damage_playbooks ENABLE ROW LEVEL SECURITY;
DO $do$ BEGIN CREATE POLICY gdp_read_all ON gina_damage_playbooks FOR SELECT TO authenticated USING (TRUE); EXCEPTION WHEN duplicate_object THEN NULL; END $do$;

CREATE OR REPLACE FUNCTION trg_surface_damage_playbook()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE v_playbook RECORD; v_msg TEXT;
BEGIN
  SELECT * INTO v_playbook FROM gina_damage_playbooks WHERE triggering_signal = NEW.signal_kind;
  IF v_playbook IS NULL THEN RETURN NEW; END IF;
  IF EXISTS (SELECT 1 FROM handler_outreach_queue WHERE user_id=NEW.user_id AND source='gina_damage_playbook' AND context_data->>'risk_signal_id' = NEW.id::text) THEN RETURN NEW; END IF;
  v_msg := format(E'**Damage-control playbook surfaced — %s (severity %s).**\n\n**Opening line:**\n%s\n\n**Listen for:**\n%s\n\n**Escalation tree:**\n%s\n\n**Recovery script:**\n%s\n\n**Do NOT:**\n%s',
    v_playbook.triggering_signal, v_playbook.severity,
    v_playbook.opening_line, v_playbook.listening_priorities,
    v_playbook.escalation_tree, v_playbook.recovery_script, v_playbook.do_not_do);
  INSERT INTO handler_outreach_queue (user_id, message, urgency, trigger_reason, source, kind, scheduled_for, expires_at, context_data, evidence_kind)
  VALUES (NEW.user_id, v_msg, NEW.severity, 'gina_damage_playbook:' || v_playbook.playbook_key,
    'gina_damage_playbook', 'damage_control', now() + interval '5 minutes', now() + interval '72 hours',
    jsonb_build_object('playbook_id', v_playbook.id, 'risk_signal_id', NEW.id, 'severity', NEW.severity), 'voice');
  RETURN NEW;
END;
$fn$;
DROP TRIGGER IF EXISTS surface_damage_playbook ON gina_risk_signals;
CREATE TRIGGER surface_damage_playbook AFTER INSERT ON gina_risk_signals
  FOR EACH ROW EXECUTE FUNCTION trg_surface_damage_playbook();
