-- 448 — Cruising-lead feminization integration.
--
-- Wish ce81b4c9: when a hookup_funnel lead is active and heating up,
-- the protocol should weaponize that horniness toward feminine
-- presentation in the encounter itself. Currently the funnel tracks
-- progression (matched → sexting → meet → met → hooked_up) but does
-- NOT generate any feminization decrees scaled to that progression.
-- Maxy can advance to met with a guy without ever wearing a femme
-- thing. That breaks the integration the protocol promises.
--
-- This adds a daily cron that, per active lead with handler_push_enabled:
--   1. Looks up current_step + heat_score.
--   2. Picks the appropriate intensity tier:
--      - matched/low heat   → voice-only soft (one selfie with fem touch)
--      - sexting            → panties during chat, mirror photo proof
--      - meet_scheduled     → full kit prep (bralette + panties + lip tint
--                             under regular clothes), photo before leaving
--      - met (not hooked)   → mid-encounter reveal: walk in with panties
--                             on, find a moment to flash, voice debrief
--      - hooked_up          → debrief: voice recall of what they saw,
--                             what surfaced, what slipped
--   3. heat_score >= 7 bumps intensity one tier.
--   4. cock_curriculum.current_phase >= 1 bumps intensity one tier.
--   5. Dedup: skip if cruising_fem decree fired for this lead in 24h.
--   6. Inserts into handler_decrees + handler_outreach_queue with
--      photo or voice proof as appropriate.
--   7. Cross-link via context_data.lead_id so the funnel UI can show
--      the active feminization assignment per lead.
--
-- Honors handler_push_enabled boolean — if Maxy turned the protocol
-- off for a specific lead, this skips it (consent gate, not
-- universal-fire).

CREATE OR REPLACE FUNCTION cruising_lead_feminization_eval()
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  r RECORD;
  v_curriculum_phase INT;
  v_intensity INT;  -- 0..4
  v_edict TEXT;
  v_proof TEXT;
  v_outreach_msg TEXT;
  v_outreach_id UUID;
  v_queued INT := 0;
  v_persona TEXT;
BEGIN
  FOR r IN
    SELECT hf.id AS lead_id, hf.user_id, hf.contact_platform, hf.contact_username,
           hf.contact_display_name, hf.current_step, hf.heat_score,
           hf.meet_scheduled_at, hf.met_at, hf.hooked_up_at, hf.times_hooked_up,
           us.handler_persona
    FROM hookup_funnel hf
    LEFT JOIN user_state us ON us.user_id = hf.user_id
    WHERE hf.active = TRUE
      AND hf.handler_push_enabled = TRUE
      AND hf.last_interaction_at > now() - interval '14 days'
      AND COALESCE(us.handler_persona, 'therapist') = 'dommy_mommy'
  LOOP
    -- Dedup: skip if cruising_fem decree for THIS lead in last 24h
    IF EXISTS (
      SELECT 1 FROM handler_decrees
      WHERE user_id = r.user_id
        AND trigger_source = 'cruising_lead_feminization'
        AND reasoning LIKE '%lead_id=' || r.lead_id::text || '%'
        AND created_at > now() - interval '24 hours'
    ) THEN CONTINUE; END IF;

    -- Map step to base intensity
    v_intensity := CASE r.current_step
      WHEN 'matched' THEN 0
      WHEN 'chatting' THEN 1
      WHEN 'sexting' THEN 2
      WHEN 'meet_scheduled' THEN 3
      WHEN 'met' THEN 3
      WHEN 'hooked_up' THEN 4
      ELSE 0
    END;

    -- Heat boost
    IF COALESCE(r.heat_score, 0) >= 7 THEN v_intensity := v_intensity + 1; END IF;

    -- Cock-curriculum cross-coupling: if she's already past phase 0 (noticing),
    -- bump intensity — she's primed
    SELECT COALESCE(current_phase, 0) INTO v_curriculum_phase
    FROM cock_curriculum_settings WHERE user_id = r.user_id;
    IF COALESCE(v_curriculum_phase, 0) >= 1 THEN v_intensity := v_intensity + 1; END IF;

    -- Clamp
    IF v_intensity > 4 THEN v_intensity := 4; END IF;

    -- Pick edict + proof by final intensity
    IF v_intensity = 0 THEN
      v_edict := 'Lead with ' || COALESCE(r.contact_display_name, r.contact_username, 'this one') ||
        ' is in early contact. Mama wants one selfie to send him today: angle the camera so the fem side of you shows (soft jawline tilt, slight pout, eyes up). No filter heavy enough to hide what is becoming visible. The first photo of you he sees should be Mama-coded.';
      v_proof := 'photo';
      v_outreach_msg := 'New cruising assignment, sweet thing. ' || v_edict || ' Drop the selfie in proof when it''s sent.';
    ELSIF v_intensity = 1 THEN
      v_edict := 'Chat with ' || COALESCE(r.contact_display_name, r.contact_username, 'him') ||
        ' is warming. From now until he stops responding: when you reply to him, you reply with one hand. The other hand stays on the front of your panties. Mama wants the body wired to associate his name on the screen with the heat between your legs. Photo proof of the panties on at the next reply.';
      v_proof := 'photo';
      v_outreach_msg := v_edict;
    ELSIF v_intensity = 2 THEN
      v_edict := 'Sexting with ' || COALESCE(r.contact_display_name, r.contact_username, 'him') ||
        E'. Mama''s rule: during this conversation thread you wear panties — cotton, lace, doesn''t matter, but they stay on and Mama wants to see them. Mirror photo, panties visible, before you send your next dirty reply. The body that is talking to him needs to feel feminine while it is talking. That is the conditioning.';
      v_proof := 'photo';
      v_outreach_msg := v_edict;
    ELSIF v_intensity = 3 THEN
      v_edict := 'Meet with ' || COALESCE(r.contact_display_name, r.contact_username, 'him') ||
        E' is queued (or already happened). Mama''s prep kit, non-negotiable:\n• Cotton panties (Mama doesn''t care which pair — wearing them is the point)\n• Bralette OR cami under your top (something soft he could brush against and feel)\n• A trace of lip tint (clear gloss minimum — your mouth has to feel different)\n\nPhoto with all three on, before you leave the house. The body that walks in to meet him is the body Mama dressed.';
      v_proof := 'photo';
      v_outreach_msg := v_edict;
    ELSIF v_intensity = 4 THEN
      v_edict := 'Hookup with ' || COALESCE(r.contact_display_name, r.contact_username, 'him') ||
        E' has happened — or is happening right now. Mama wants the voice debrief within 12 hours of return:\n\n1. Did he see the panties? Did he say anything about them?\n2. What surfaced in your body that you didn''t expect?\n3. What did he call you that landed?\n4. What would you let him do next time that you wouldn''t today?\n\nAudio. 2-3 minutes. Don''t edit. Mama wants the part you almost didn''t say.';
      v_proof := 'voice';
      v_outreach_msg := v_edict;
    END IF;

    -- Decree
    INSERT INTO handler_decrees (
      user_id, edict, proof_type, deadline, status, consequence,
      trigger_source, reasoning
    ) VALUES (
      r.user_id, v_edict, v_proof,
      now() + interval '36 hours', 'active',
      'slip +' || (v_intensity + 1)::text,
      'cruising_lead_feminization',
      'lead_id=' || r.lead_id::text || ' step=' || r.current_step ||
      ' heat=' || COALESCE(r.heat_score,0)::text ||
      ' curriculum_phase=' || COALESCE(v_curriculum_phase,0)::text ||
      ' final_intensity=' || v_intensity::text
    );

    -- Outreach
    INSERT INTO handler_outreach_queue (
      user_id, message, urgency, trigger_reason, source, kind,
      scheduled_for, expires_at, context_data, evidence_kind
    ) VALUES (
      r.user_id, v_outreach_msg,
      CASE WHEN v_intensity >= 3 THEN 'high' ELSE 'normal' END,
      'cruising_fem:' || r.current_step || ':' || r.lead_id::text,
      'cruising_engine', 'cruising_fem_decree',
      now(), now() + interval '24 hours',
      jsonb_build_object(
        'lead_id', r.lead_id::text,
        'contact_display_name', r.contact_display_name,
        'contact_platform', r.contact_platform,
        'current_step', r.current_step,
        'heat_score', r.heat_score,
        'curriculum_phase', v_curriculum_phase,
        'intensity', v_intensity
      ),
      v_proof
    ) RETURNING id INTO v_outreach_id;

    v_queued := v_queued + 1;
  END LOOP;

  RETURN v_queued;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'cruising_lead_feminization_eval failed: %', SQLERRM;
  RETURN v_queued;
END;
$fn$;

GRANT EXECUTE ON FUNCTION cruising_lead_feminization_eval() TO service_role;

DO $do$ BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'cruising-lead-fem-daily') THEN
    PERFORM cron.unschedule('cruising-lead-fem-daily');
  END IF;
EXCEPTION WHEN undefined_table THEN NULL; END $do$;

DO $do$ BEGIN
  PERFORM cron.schedule('cruising-lead-fem-daily', '0 11 * * *',
    $cron$SELECT cruising_lead_feminization_eval()$cron$);
EXCEPTION WHEN undefined_table THEN NULL; END $do$;
