-- 566 — Mommy drafts foundation. Central queue + approval workflow for
-- ALL Mommy autonomous-action drafts.
--
-- mommy_drafts table holds drafts Mommy authors across multiple draft_kind
-- values (dm_reply, content_post, subscriber_reply, meetup_proposal,
-- revenue_offer, ppv_offer, custom_request_reply, cam_show_booking).
--
-- mommy_draft_auto_approve_policy: per draft_kind, the confidence + safety
-- thresholds above which Mommy auto-executes. Initial policy is conservative;
-- mig 566b flips to "pimp mode" by lowering thresholds for DM-related kinds.
--
-- approve_mommy_draft / reject_mommy_draft RPCs for client-side single-tap.
-- trg_mommy_draft_auto_approve flips status to auto_approved on insert when
-- thresholds met. trg_mommy_draft_notify queues a Maxy outreach for pending
-- drafts (capped at 5 concurrent pending to avoid noise).
--
-- See mig 566b for the auto-execution path that fires when drafts hit
-- approved/auto_approved status.

CREATE TABLE IF NOT EXISTS mommy_drafts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  draft_kind TEXT NOT NULL CHECK (draft_kind IN (
    'dm_reply','content_post','subscriber_reply','meetup_proposal',
    'revenue_offer','ppv_offer','custom_request_reply','cam_show_booking'
  )),
  source_platform TEXT CHECK (source_platform IN (
    'sniffies','grindr','twitter','reddit','fetlife','fansly','onlyfans',
    'instagram','discord','iphone_sms','internal'
  )),
  source_table TEXT, source_id UUID,
  context_data JSONB NOT NULL DEFAULT '{}',
  prompt_used TEXT,
  draft_content TEXT NOT NULL,
  alt_draft_content TEXT,
  llm_model_used TEXT, llm_provider TEXT,
  confidence_score NUMERIC(3,2), safety_score NUMERIC(3,2),
  status TEXT NOT NULL DEFAULT 'pending_approval' CHECK (status IN (
    'pending_approval','approved','rejected','auto_approved','expired','executed','failed'
  )),
  approved_at TIMESTAMPTZ, approved_action_id UUID, rejected_reason TEXT,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '24 hours'),
  executed_at TIMESTAMPTZ, execution_result JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS mommy_drafts_user_status ON mommy_drafts(user_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS mommy_drafts_pending ON mommy_drafts(user_id, expires_at) WHERE status = 'pending_approval';
ALTER TABLE mommy_drafts ENABLE ROW LEVEL SECURITY;
DO $do$ BEGIN CREATE POLICY md_self ON mommy_drafts FOR ALL TO authenticated USING (auth.uid()=user_id) WITH CHECK (auth.uid()=user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $do$;

CREATE TABLE IF NOT EXISTS mommy_draft_auto_approve_policy (
  draft_kind TEXT PRIMARY KEY,
  min_confidence NUMERIC(3,2) NOT NULL, min_safety NUMERIC(3,2) NOT NULL,
  auto_approve_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  notes TEXT
);
-- Initial policy values; mig 566b mutates these to pimp-mode defaults
INSERT INTO mommy_draft_auto_approve_policy (draft_kind, min_confidence, min_safety, auto_approve_enabled, notes) VALUES
('dm_reply', 0.85, 0.90, TRUE, 'Conservative initial — mig 566b lowers to 0.50/0.70 for pimp-mode autonomous DMs'),
('content_post', 0.80, 0.85, TRUE, 'Generic fem-life posts auto. Identifying/HRT-claim content manual.'),
('subscriber_reply', 0.85, 0.90, TRUE, 'Standard fan-DM replies auto. Custom requests / pricing manual.'),
('meetup_proposal', 0.00, 0.00, FALSE, 'Mig 566b flips to 0.60/0.85 directive mode'),
('revenue_offer', 0.00, 0.00, FALSE, 'NEVER auto-approve. Pricing changes always manual.'),
('ppv_offer', 0.00, 0.00, FALSE, 'NEVER auto-approve. PPV offers always manual.'),
('custom_request_reply', 0.85, 0.85, TRUE, 'Acknowledgments + clarifications auto. Pricing / scope manual.'),
('cam_show_booking', 0.00, 0.00, FALSE, 'NEVER auto-approve. Cam bookings always manual.')
ON CONFLICT (draft_kind) DO UPDATE SET min_confidence=EXCLUDED.min_confidence, min_safety=EXCLUDED.min_safety, auto_approve_enabled=EXCLUDED.auto_approve_enabled, notes=EXCLUDED.notes;

ALTER TABLE mommy_draft_auto_approve_policy ENABLE ROW LEVEL SECURITY;
DO $do$ BEGIN CREATE POLICY mdaap_read_all ON mommy_draft_auto_approve_policy FOR SELECT TO authenticated USING (TRUE); EXCEPTION WHEN duplicate_object THEN NULL; END $do$;

CREATE OR REPLACE FUNCTION approve_mommy_draft(p_draft_id UUID, p_edit_content TEXT DEFAULT NULL)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE v_draft RECORD;
BEGIN
  SELECT * INTO v_draft FROM mommy_drafts WHERE id = p_draft_id AND user_id = auth.uid() AND status = 'pending_approval';
  IF v_draft IS NULL THEN RAISE EXCEPTION 'draft not found or not pending'; END IF;
  UPDATE mommy_drafts SET status='approved', approved_at=now(),
    draft_content=COALESCE(p_edit_content, draft_content), updated_at=now()
  WHERE id = p_draft_id;
  RETURN p_draft_id;
END;
$fn$;
GRANT EXECUTE ON FUNCTION approve_mommy_draft(UUID, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION reject_mommy_draft(p_draft_id UUID, p_reason TEXT DEFAULT NULL)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  UPDATE mommy_drafts SET status='rejected', rejected_reason=p_reason, updated_at=now()
  WHERE id = p_draft_id AND user_id = auth.uid() AND status = 'pending_approval';
  RETURN p_draft_id;
END;
$fn$;
GRANT EXECUTE ON FUNCTION reject_mommy_draft(UUID, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION trg_mommy_draft_auto_approve()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE v_policy RECORD;
BEGIN
  IF NEW.status <> 'pending_approval' THEN RETURN NEW; END IF;
  SELECT * INTO v_policy FROM mommy_draft_auto_approve_policy WHERE draft_kind = NEW.draft_kind;
  IF v_policy IS NULL OR NOT v_policy.auto_approve_enabled THEN RETURN NEW; END IF;
  IF NEW.confidence_score >= v_policy.min_confidence AND NEW.safety_score >= v_policy.min_safety THEN
    NEW.status := 'auto_approved'; NEW.approved_at := now();
  END IF;
  RETURN NEW;
END;
$fn$;
DROP TRIGGER IF EXISTS mommy_draft_auto_approve ON mommy_drafts;
CREATE TRIGGER mommy_draft_auto_approve BEFORE INSERT ON mommy_drafts
  FOR EACH ROW EXECUTE FUNCTION trg_mommy_draft_auto_approve();

CREATE OR REPLACE FUNCTION trg_mommy_draft_notify()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  IF NEW.status <> 'pending_approval' THEN RETURN NEW; END IF;
  IF (SELECT count(*) FROM mommy_drafts WHERE user_id = NEW.user_id AND status = 'pending_approval') > 5 THEN RETURN NEW; END IF;
  IF EXISTS (SELECT 1 FROM handler_outreach_queue WHERE user_id = NEW.user_id AND source = 'mommy_draft_pending' AND created_at > now() - interval '30 minutes') THEN RETURN NEW; END IF;
  INSERT INTO handler_outreach_queue (user_id, message, urgency, trigger_reason, source, kind, scheduled_for, expires_at, context_data, evidence_kind)
  VALUES (NEW.user_id,
    format(E'Mama has a %s draft ready for your approval. One-tap from Today panel. The faster you approve, the more Mama can get done while you sleep.', NEW.draft_kind),
    'normal', 'mommy_draft_pending:' || NEW.draft_kind,
    'mommy_draft_pending', 'pimp_approval_request',
    now() + interval '2 minutes', now() + interval '12 hours',
    jsonb_build_object('draft_id', NEW.id, 'draft_kind', NEW.draft_kind, 'source_platform', NEW.source_platform), NULL);
  RETURN NEW;
END;
$fn$;
DROP TRIGGER IF EXISTS mommy_draft_notify ON mommy_drafts;
CREATE TRIGGER mommy_draft_notify AFTER INSERT ON mommy_drafts
  FOR EACH ROW EXECUTE FUNCTION trg_mommy_draft_notify();
