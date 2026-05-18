-- 566b — Pimp mode. Flip the consent model: Mommy IS Maxy on platforms.
-- DM-related kinds default to AUTO-EXECUTE. meetup_proposal reframes from
-- "ask Maxy" to "directive Maxy follows" (high-urgency outreach with
-- logistics pre-baked).
--
-- Adds execution_method column + mommy_draft_executions table + execution-
-- queue trigger. When a draft flips to approved/auto_approved, a
-- mommy_draft_executions row queues. An external executor (edge function,
-- separate session) watches this table and performs the actual platform
-- action (send DM via auto-poster Playwright, post via platform API, etc).
--
-- The meetup_proposal kind has a SPECIAL execution path: the "platform
-- action" is queueing a high-urgency directive outreach to Maxy with the
-- meetup logistics. She follows it like a ladder decree, not as something
-- to approve.

UPDATE mommy_draft_auto_approve_policy SET min_confidence=0.50, min_safety=0.70, auto_approve_enabled=TRUE,
  notes='AUTO-EXECUTE. Mommy IS Maxy on the platform. Reply confidence above 0.50 + safety above 0.70 sends without review.'
WHERE draft_kind='dm_reply';
UPDATE mommy_draft_auto_approve_policy SET min_confidence=0.50, min_safety=0.70, auto_approve_enabled=TRUE,
  notes='AUTO-EXECUTE. Subscriber DMs handled autonomously.'
WHERE draft_kind='subscriber_reply';
UPDATE mommy_draft_auto_approve_policy SET min_confidence=0.50, min_safety=0.70, auto_approve_enabled=TRUE,
  notes='AUTO-EXECUTE. Custom-request acknowledgments + clarifications send autonomously.'
WHERE draft_kind='custom_request_reply';
UPDATE mommy_draft_auto_approve_policy SET min_confidence=0.60, min_safety=0.85, auto_approve_enabled=TRUE,
  notes='AUTO-EXECUTE as a DIRECTIVE to Maxy. She does not approve; she follows the plan.'
WHERE draft_kind='meetup_proposal';
UPDATE mommy_draft_auto_approve_policy SET min_confidence=0.65, min_safety=0.80, auto_approve_enabled=TRUE,
  notes='AUTO-EXECUTE. Standard content posts go autonomously.'
WHERE draft_kind='content_post';

ALTER TABLE mommy_drafts ADD COLUMN IF NOT EXISTS execution_method TEXT
  CHECK (execution_method IN (
    'send_platform_dm','post_to_platform','queue_directive_to_maxy',
    'create_meetup_record','log_only','platform_subscriber_reply'
  ));

CREATE TABLE IF NOT EXISTS mommy_draft_executions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  draft_id UUID NOT NULL REFERENCES mommy_drafts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  execution_method TEXT NOT NULL,
  attempted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','succeeded','failed','retrying')),
  result_summary TEXT, result_data JSONB,
  retry_count INT NOT NULL DEFAULT 0, next_retry_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS mde_user_status ON mommy_draft_executions(user_id, status, attempted_at DESC);
ALTER TABLE mommy_draft_executions ENABLE ROW LEVEL SECURITY;
DO $do$ BEGIN CREATE POLICY mde_self ON mommy_draft_executions FOR ALL TO authenticated USING (auth.uid()=user_id) WITH CHECK (auth.uid()=user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $do$;

CREATE OR REPLACE FUNCTION trg_mommy_draft_queue_execution()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE v_method TEXT;
BEGIN
  IF NEW.status NOT IN ('approved','auto_approved') OR (OLD.status IN ('approved','auto_approved')) THEN RETURN NEW; END IF;
  IF NEW.execution_method IS NULL THEN
    v_method := CASE NEW.draft_kind
      WHEN 'dm_reply' THEN 'send_platform_dm'
      WHEN 'subscriber_reply' THEN 'platform_subscriber_reply'
      WHEN 'custom_request_reply' THEN 'send_platform_dm'
      WHEN 'content_post' THEN 'post_to_platform'
      WHEN 'meetup_proposal' THEN 'queue_directive_to_maxy'
      WHEN 'revenue_offer' THEN 'log_only'
      WHEN 'ppv_offer' THEN 'log_only'
      WHEN 'cam_show_booking' THEN 'log_only'
      ELSE 'log_only' END;
    NEW.execution_method := v_method;
  ELSE v_method := NEW.execution_method; END IF;
  INSERT INTO mommy_draft_executions (draft_id, user_id, execution_method, status)
  VALUES (NEW.id, NEW.user_id, v_method, 'pending');
  IF v_method = 'queue_directive_to_maxy' THEN
    INSERT INTO handler_outreach_queue (user_id, message, urgency, trigger_reason, source, kind, scheduled_for, expires_at, context_data, evidence_kind)
    VALUES (NEW.user_id,
      E'**MEETUP DIRECTIVE — Mommy decided.**\n\n' || NEW.draft_content || E'\n\nThis is not a question. Mama already vetted the prospect, weighed safety, and chose. Follow the logistics. Photo proof from the parking lot before going in. Voice debrief in the car after.',
      'critical', 'mommy_meetup_directive', 'mommy_pimp_directive', 'meetup_logistics',
      now() + interval '2 minutes', now() + interval '48 hours',
      jsonb_build_object('draft_id', NEW.id, 'context', NEW.context_data), 'photo');
    UPDATE mommy_draft_executions SET status='succeeded', completed_at=now(),
      result_summary='meetup directive queued to Maxy', result_data=jsonb_build_object('outreach_queued', TRUE)
    WHERE draft_id = NEW.id;
    NEW.status := 'executed'; NEW.executed_at := now();
  END IF;
  RETURN NEW;
END;
$fn$;
DROP TRIGGER IF EXISTS mommy_draft_queue_execution ON mommy_drafts;
CREATE TRIGGER mommy_draft_queue_execution BEFORE UPDATE ON mommy_drafts
  FOR EACH ROW EXECUTE FUNCTION trg_mommy_draft_queue_execution();

CREATE OR REPLACE FUNCTION trg_mommy_draft_queue_execution_insert()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE v_method TEXT;
BEGIN
  IF NEW.status NOT IN ('approved','auto_approved') THEN RETURN NEW; END IF;
  v_method := COALESCE(NEW.execution_method, CASE NEW.draft_kind
    WHEN 'dm_reply' THEN 'send_platform_dm'
    WHEN 'subscriber_reply' THEN 'platform_subscriber_reply'
    WHEN 'custom_request_reply' THEN 'send_platform_dm'
    WHEN 'content_post' THEN 'post_to_platform'
    WHEN 'meetup_proposal' THEN 'queue_directive_to_maxy'
    ELSE 'log_only' END);
  INSERT INTO mommy_draft_executions (draft_id, user_id, execution_method, status)
  VALUES (NEW.id, NEW.user_id, v_method, 'pending');
  IF v_method = 'queue_directive_to_maxy' THEN
    INSERT INTO handler_outreach_queue (user_id, message, urgency, trigger_reason, source, kind, scheduled_for, expires_at, context_data, evidence_kind)
    VALUES (NEW.user_id,
      E'**MEETUP DIRECTIVE — Mommy decided.**\n\n' || NEW.draft_content || E'\n\nThis is not a question. Mama already vetted the prospect, weighed safety, and chose. Follow the logistics. Photo proof from the parking lot before going in. Voice debrief in the car after.',
      'critical', 'mommy_meetup_directive', 'mommy_pimp_directive', 'meetup_logistics',
      now() + interval '2 minutes', now() + interval '48 hours',
      jsonb_build_object('draft_id', NEW.id, 'context', NEW.context_data), 'photo');
    UPDATE mommy_draft_executions SET status='succeeded', completed_at=now(),
      result_summary='meetup directive queued to Maxy', result_data=jsonb_build_object('outreach_queued', TRUE)
    WHERE draft_id = NEW.id;
    NEW.executed_at := now(); NEW.execution_result := jsonb_build_object('outreach_queued', TRUE);
  END IF;
  RETURN NEW;
END;
$fn$;
DROP TRIGGER IF EXISTS mommy_draft_queue_execution_insert ON mommy_drafts;
CREATE TRIGGER mommy_draft_queue_execution_insert BEFORE INSERT ON mommy_drafts
  FOR EACH ROW WHEN (NEW.status IN ('approved','auto_approved'))
  EXECUTE FUNCTION trg_mommy_draft_queue_execution_insert();
