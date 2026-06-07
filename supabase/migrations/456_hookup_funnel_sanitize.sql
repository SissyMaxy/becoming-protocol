-- 456 — Sanitize hookup_funnel.contact_display_name + harden cruising
-- generator against leaked message bodies.
--
-- Bug: Sniffies scraper sometimes writes message bodies / system
-- notification text into contact_display_name (e.g. "You received 2
-- photos", "id pound u and breed u", "working atm"). Downstream
-- generators (mig 448 cruising_lead_feminization) quote that name
-- in decree text — Maxy gets a decree about her "lead with You
-- received 2 photos." Broken signal.
--
-- This migration:
--   1. BEFORE INSERT/UPDATE trigger sanitizes obvious system-text
--      patterns by replacing with "Anonymous Cruiser <id-prefix>".
--   2. Trims overlong display_names to 60 chars.
--   3. Generator-side defense: helper function `safe_contact_label`
--      that the cruising generator should call instead of raw
--      display_name. Returns "this Sniffies match" / "him" /
--      "this contact" for obviously-invalid names.

CREATE OR REPLACE FUNCTION trg_hookup_funnel_sanitize_name()
RETURNS TRIGGER LANGUAGE plpgsql AS $fn$
BEGIN
  IF NEW.contact_display_name ~* '^(you received \d+|you really like|you have \d+ new|new message from)' THEN
    NEW.contact_display_name := 'Anonymous Cruiser ' || LEFT(COALESCE(NEW.id::text, gen_random_uuid()::text), 8);
    NEW.contact_notes := COALESCE(NEW.contact_notes, '') ||
      E'\n[sanitized] display_name was system-notification text';
  END IF;
  IF length(NEW.contact_display_name) > 80 THEN
    NEW.contact_display_name := LEFT(NEW.contact_display_name, 60) || '…';
  END IF;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS hookup_funnel_sanitize_name ON hookup_funnel;
CREATE TRIGGER hookup_funnel_sanitize_name
  BEFORE INSERT OR UPDATE OF contact_display_name ON hookup_funnel
  FOR EACH ROW EXECUTE FUNCTION trg_hookup_funnel_sanitize_name();

-- Helper: safe label for generator-side use
CREATE OR REPLACE FUNCTION safe_contact_label(p_display TEXT, p_username TEXT)
RETURNS TEXT LANGUAGE plpgsql IMMUTABLE AS $fn$
DECLARE v_candidate TEXT;
BEGIN
  v_candidate := COALESCE(NULLIF(trim(p_display), ''), NULLIF(trim(p_username), ''));
  IF v_candidate IS NULL THEN RETURN 'this Sniffies match'; END IF;

  -- Reject obvious chat-opener fragments
  IF v_candidate ~* '^(hi|hey|sup|yo|ok|hello|hru|wyd|wanna|working|busy|no thanks|maybe|sure)$' THEN
    RETURN 'this match';
  END IF;
  IF v_candidate ~* '^(id pound|wanna fuck|i wanna|let me|fuck me|use me|breed)' THEN
    RETURN 'him';
  END IF;
  -- Long sentence fragments (>40 chars with spaces) are likely message bodies
  IF length(v_candidate) > 40 AND v_candidate ~ '\s' THEN
    RETURN 'this match';
  END IF;
  -- Question marks at the end of unrelated text are usually message endings
  IF v_candidate ~ '\?$' AND length(v_candidate) > 15 THEN
    RETURN 'this match';
  END IF;

  RETURN v_candidate;
END;
$fn$;

GRANT EXECUTE ON FUNCTION safe_contact_label(TEXT, TEXT) TO authenticated, service_role;

-- Patch the cruising_lead_feminization_eval to use safe_contact_label
CREATE OR REPLACE FUNCTION cruising_lead_feminization_eval()
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE r RECORD; v_curriculum_phase INT; v_intensity INT; v_edict TEXT; v_proof TEXT;
  v_outreach_id UUID; v_queued INT := 0; v_label TEXT;
BEGIN
  FOR r IN
    SELECT hf.id AS lead_id, hf.user_id, hf.contact_platform, hf.contact_username,
           hf.contact_display_name, hf.current_step, hf.heat_score,
           hf.meet_scheduled_at, hf.met_at, hf.hooked_up_at, hf.times_hooked_up,
           us.handler_persona
    FROM hookup_funnel hf
    LEFT JOIN user_state us ON us.user_id = hf.user_id
    WHERE hf.active = TRUE AND hf.handler_push_enabled = TRUE
      AND hf.last_interaction_at > now() - interval '14 days'
      AND COALESCE(us.handler_persona, 'therapist') = 'dommy_mommy'
  LOOP
    IF EXISTS (
      SELECT 1 FROM handler_decrees
      WHERE user_id = r.user_id AND trigger_source = 'cruising_lead_feminization'
        AND reasoning LIKE '%lead_id=' || r.lead_id::text || '%'
        AND created_at > now() - interval '24 hours'
    ) THEN CONTINUE; END IF;

    v_intensity := CASE r.current_step
      WHEN 'matched' THEN 0 WHEN 'chatting' THEN 1 WHEN 'sexting' THEN 2
      WHEN 'meet_scheduled' THEN 3 WHEN 'met' THEN 3 WHEN 'hooked_up' THEN 4
      ELSE 0 END;
    IF COALESCE(r.heat_score, 0) >= 7 THEN v_intensity := v_intensity + 1; END IF;

    SELECT COALESCE(current_phase, 0) INTO v_curriculum_phase FROM cock_curriculum_settings WHERE user_id = r.user_id;
    IF COALESCE(v_curriculum_phase, 0) >= 1 THEN v_intensity := v_intensity + 1; END IF;
    IF v_intensity > 4 THEN v_intensity := 4; END IF;

    v_label := safe_contact_label(r.contact_display_name, r.contact_username);

    IF v_intensity = 0 THEN
      v_edict := 'Lead with ' || v_label || ' is in early contact. Mama wants one selfie to send him today: angle the camera so the fem side of you shows. The first photo of you he sees should be Mama-coded.';
      v_proof := 'photo';
    ELSIF v_intensity = 1 THEN
      v_edict := 'Chat with ' || v_label || ' is warming. When you reply to him, you reply with one hand. The other hand stays on the front of your panties. Photo proof of the panties on at the next reply.';
      v_proof := 'photo';
    ELSIF v_intensity = 2 THEN
      v_edict := 'Sexting with ' || v_label || E'. During this thread you wear panties. Mirror photo, panties visible, before you send your next dirty reply.';
      v_proof := 'photo';
    ELSIF v_intensity = 3 THEN
      v_edict := 'Meet with ' || v_label || E' is queued. Prep kit, non-negotiable:\n• Cotton panties\n• Bralette OR cami under your top\n• A trace of lip tint\n\nPhoto with all three on, before you leave. The body that walks in to meet him is the body Mama dressed.';
      v_proof := 'photo';
    ELSE
      v_edict := 'Hookup with ' || v_label || E' has happened. Voice debrief within 12 hours:\n\n1. Did he see the panties?\n2. What surfaced in your body?\n3. What did he call you that landed?\n4. What would you let him do next time?';
      v_proof := 'voice';
    END IF;

    INSERT INTO handler_decrees (user_id, edict, proof_type, deadline, status, consequence, trigger_source, reasoning)
    VALUES (r.user_id, v_edict, v_proof, now() + interval '36 hours', 'active',
      'slip +' || (v_intensity + 1)::text, 'cruising_lead_feminization',
      'lead_id=' || r.lead_id::text || ' step=' || r.current_step || ' intensity=' || v_intensity::text);

    INSERT INTO handler_outreach_queue (user_id, message, urgency, trigger_reason, source, kind, scheduled_for, expires_at, context_data, evidence_kind)
    VALUES (r.user_id, v_edict,
      CASE WHEN v_intensity >= 3 THEN 'high' ELSE 'normal' END,
      'cruising_fem:' || r.current_step || ':' || r.lead_id::text,
      'cruising_engine', 'cruising_fem_decree',
      now(), now() + interval '24 hours',
      jsonb_build_object('lead_id', r.lead_id::text, 'safe_label', v_label,
        'current_step', r.current_step, 'heat_score', r.heat_score, 'intensity', v_intensity),
      v_proof) RETURNING id INTO v_outreach_id;
    v_queued := v_queued + 1;
  END LOOP;
  RETURN v_queued;
END;
$fn$;
