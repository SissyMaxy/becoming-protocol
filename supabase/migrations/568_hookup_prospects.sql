-- 568 — Hookup prospect scoring + funnel infrastructure.
-- hookup_prospects (one row per platform×handle) + hookup_prospect_messages
-- (per-message inbound/outbound log). score_hookup_prospect(id) recomputes
-- safety + fit + comm_quality + composite (weighted 45/30/25). Auto-rescore
-- trigger fires on every new message insert.

CREATE TABLE IF NOT EXISTS hookup_prospects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  platform TEXT NOT NULL CHECK (platform IN ('sniffies','grindr','scruff','adam4adam','craigslist','reddit','fetlife','iphone_sms','telegram')),
  prospect_handle TEXT NOT NULL, prospect_display_name TEXT,
  prospect_profile_data JSONB,
  first_contact_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_inbound_at TIMESTAMPTZ, last_outbound_at TIMESTAMPTZ,
  message_count INT NOT NULL DEFAULT 0,
  fit_score NUMERIC(3,2), safety_score NUMERIC(3,2),
  comm_quality_score NUMERIC(3,2), composite_score NUMERIC(3,2),
  fit_factors JSONB, safety_factors JSONB,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN (
    'active','meetup_proposed','meetup_completed','ghosted_by_them','ghosted_by_us','blocked','unsafe_flagged','recurring'
  )),
  funnel_step INT NOT NULL DEFAULT 0,
  related_decree_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, platform, prospect_handle)
);
CREATE INDEX IF NOT EXISTS hp_user_status ON hookup_prospects(user_id, status, composite_score DESC);
CREATE INDEX IF NOT EXISTS hp_recent_inbound ON hookup_prospects(user_id, last_inbound_at DESC) WHERE status='active';
ALTER TABLE hookup_prospects ENABLE ROW LEVEL SECURITY;
DO $do$ BEGIN CREATE POLICY hp_self ON hookup_prospects FOR ALL TO authenticated USING (auth.uid()=user_id) WITH CHECK (auth.uid()=user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $do$;

CREATE TABLE IF NOT EXISTS hookup_prospect_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prospect_id UUID NOT NULL REFERENCES hookup_prospects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  direction TEXT NOT NULL CHECK (direction IN ('inbound','outbound')),
  content TEXT NOT NULL, draft_id UUID REFERENCES mommy_drafts(id),
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  platform_message_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS hpm_prospect_sent ON hookup_prospect_messages(prospect_id, sent_at);
ALTER TABLE hookup_prospect_messages ENABLE ROW LEVEL SECURITY;
DO $do$ BEGIN CREATE POLICY hpm_self ON hookup_prospect_messages FOR ALL TO authenticated USING (auth.uid()=user_id) WITH CHECK (auth.uid()=user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $do$;

CREATE OR REPLACE FUNCTION score_hookup_prospect(p_prospect_id UUID)
RETURNS NUMERIC LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE v_prospect RECORD; v_msg_count INT; v_age_days NUMERIC; v_composite NUMERIC;
  v_safety NUMERIC := 0.50; v_fit NUMERIC := 0.50; v_comm NUMERIC := 0.50;
BEGIN
  SELECT * INTO v_prospect FROM hookup_prospects WHERE id = p_prospect_id;
  IF v_prospect IS NULL THEN RETURN NULL; END IF;
  SELECT count(*) INTO v_msg_count FROM hookup_prospect_messages WHERE prospect_id = p_prospect_id;
  v_age_days := EXTRACT(EPOCH FROM (now() - v_prospect.first_contact_at)) / 86400;
  IF v_prospect.prospect_profile_data ? 'has_face_photo' AND (v_prospect.prospect_profile_data->>'has_face_photo')::boolean THEN v_safety := v_safety + 0.15; END IF;
  IF v_prospect.prospect_profile_data ? 'verified' AND (v_prospect.prospect_profile_data->>'verified')::boolean THEN v_safety := v_safety + 0.10; END IF;
  IF v_prospect.prospect_profile_data ? 'profile_completeness' THEN v_safety := v_safety + (v_prospect.prospect_profile_data->>'profile_completeness')::numeric * 0.15; END IF;
  IF v_age_days > 7 THEN v_safety := v_safety + 0.05; END IF;
  IF v_msg_count >= 5 THEN v_safety := v_safety + 0.10; END IF;
  v_safety := LEAST(1.0, v_safety);
  IF v_prospect.prospect_profile_data ? 'distance_miles' THEN
    v_fit := v_fit + GREATEST(0, 0.25 - (v_prospect.prospect_profile_data->>'distance_miles')::numeric / 100);
  END IF;
  IF v_prospect.prospect_profile_data ? 'looking_for' THEN
    IF (v_prospect.prospect_profile_data->>'looking_for') ILIKE '%trans%' OR (v_prospect.prospect_profile_data->>'looking_for') ILIKE '%femboy%' OR (v_prospect.prospect_profile_data->>'looking_for') ILIKE '%cd%' THEN
      v_fit := v_fit + 0.20;
    END IF;
  END IF;
  v_fit := LEAST(1.0, v_fit);
  IF v_msg_count >= 3 THEN v_comm := v_comm + 0.20; END IF;
  IF v_msg_count >= 8 THEN v_comm := v_comm + 0.15; END IF;
  IF v_prospect.last_inbound_at IS NOT NULL AND v_prospect.last_inbound_at > now() - interval '48 hours' THEN v_comm := v_comm + 0.15; END IF;
  v_comm := LEAST(1.0, v_comm);
  v_composite := (v_safety * 0.45 + v_fit * 0.30 + v_comm * 0.25);
  UPDATE hookup_prospects SET safety_score=v_safety, fit_score=v_fit, comm_quality_score=v_comm,
    composite_score=v_composite, updated_at=now() WHERE id = p_prospect_id;
  RETURN v_composite;
END;
$fn$;
GRANT EXECUTE ON FUNCTION score_hookup_prospect(UUID) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION trg_score_on_inbound()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  IF NEW.direction = 'inbound' THEN
    UPDATE hookup_prospects SET message_count=message_count+1, last_inbound_at=NEW.sent_at, updated_at=now() WHERE id = NEW.prospect_id;
    PERFORM score_hookup_prospect(NEW.prospect_id);
  ELSIF NEW.direction = 'outbound' THEN
    UPDATE hookup_prospects SET message_count=message_count+1, last_outbound_at=NEW.sent_at, updated_at=now() WHERE id = NEW.prospect_id;
  END IF;
  RETURN NEW;
END;
$fn$;
DROP TRIGGER IF EXISTS score_on_inbound ON hookup_prospect_messages;
CREATE TRIGGER score_on_inbound AFTER INSERT ON hookup_prospect_messages
  FOR EACH ROW EXECUTE FUNCTION trg_score_on_inbound();
