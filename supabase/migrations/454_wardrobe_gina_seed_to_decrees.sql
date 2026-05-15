-- 454 — Route wardrobe_prescriptions + gina_seed_plantings through
-- handler_decrees so they surface on HandlerDecreeCard and use the
-- existing PhotoUploadWidget fulfillment flow.
--
-- The architectural gap: mig 447 (wardrobe) and mig 451 (gina seed)
-- queue outreach + write their own per-table rows, but NOT
-- handler_decrees. HandlerDecreeCard only reads handler_decrees, so
-- these two flows produce push notifications without a decree-card
-- surface to fulfill them against. Maxy gets the ping but has
-- nowhere to upload the photo/voice in the existing UI.
--
-- Fix: rewrite both generators to ALSO insert a handler_decrees row,
-- linking it via FK so mig 453's propagation trigger can flip the
-- shadow row when the decree is fulfilled.
--
-- For wardrobe_prescriptions: add wardrobe_prescriptions.related_decree_id
-- column; the existing fulfillment trigger (mig 453's
-- propagate_decree_status_to_events) updates wardrobe_prescriptions.status
-- when its linked decree flips.

-- Schema: link columns
ALTER TABLE wardrobe_prescriptions
  ADD COLUMN IF NOT EXISTS related_decree_id UUID REFERENCES handler_decrees(id) ON DELETE SET NULL;

ALTER TABLE gina_seed_plantings
  ADD COLUMN IF NOT EXISTS related_decree_id UUID REFERENCES handler_decrees(id) ON DELETE SET NULL;

-- Extend mig 453's propagation trigger to cover these two tables
CREATE OR REPLACE FUNCTION trg_propagate_decree_status_to_events()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  IF NEW.status NOT IN ('fulfilled','missed') THEN RETURN NEW; END IF;
  IF COALESCE(OLD.status,'') = NEW.status THEN RETURN NEW; END IF;

  -- cock_conditioning_events
  UPDATE cock_conditioning_events
  SET status = CASE WHEN NEW.status = 'fulfilled' THEN 'fulfilled' ELSE 'missed' END,
      fulfilled_at = CASE WHEN NEW.status = 'fulfilled' THEN COALESCE(NEW.fulfilled_at, now()) ELSE NULL END,
      evidence_url = CASE WHEN NEW.proof_payload ? 'evidence_url' THEN NEW.proof_payload->>'evidence_url' ELSE evidence_url END,
      updated_at = now()
  WHERE related_decree_id = NEW.id AND status = 'pending';

  -- gina_disclosure_events
  UPDATE gina_disclosure_events
  SET status = CASE WHEN NEW.status = 'fulfilled' THEN 'fulfilled' ELSE 'missed' END,
      evidence_url = CASE WHEN NEW.proof_payload ? 'evidence_url' THEN NEW.proof_payload->>'evidence_url' ELSE evidence_url END,
      evidence_verified_at = CASE WHEN NEW.status = 'fulfilled' THEN now() ELSE evidence_verified_at END,
      updated_at = now()
  WHERE related_decree_id = NEW.id AND status = 'pending';

  -- wardrobe_prescriptions
  UPDATE wardrobe_prescriptions
  SET status = CASE WHEN NEW.status = 'fulfilled' THEN 'fulfilled' ELSE 'cancelled' END,
      updated_at = now()
  WHERE related_decree_id = NEW.id AND status = 'pending';

  -- gina_seed_plantings (terminal state is 'observed' for these)
  UPDATE gina_seed_plantings
  SET status = CASE WHEN NEW.status = 'fulfilled' THEN 'observed' ELSE 'skipped' END,
      planted_at = CASE WHEN NEW.status = 'fulfilled' THEN COALESCE(planted_at, now()) ELSE planted_at END,
      reaction_voice_url = CASE WHEN NEW.proof_payload ? 'evidence_url' THEN NEW.proof_payload->>'evidence_url' ELSE reaction_voice_url END,
      updated_at = now()
  WHERE related_decree_id = NEW.id AND status = 'pending';

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'propagate_decree_status_to_events failed: %', SQLERRM;
  RETURN NEW;
END;
$fn$;

-- Rewrite wardrobe_prescription_eval to also insert a decree
CREATE OR REPLACE FUNCTION wardrobe_prescription_eval()
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  r RECORD; v_inv_count INT; v_pending_count INT; v_item RECORD;
  v_outreach_id UUID; v_prescription_id UUID; v_decree_id UUID;
  v_queued INT := 0;
  v_acquisition_options JSONB := jsonb_build_array(
    jsonb_build_object('item_name','Cotton bikini panties, 3-pack','item_type','panties','budget_usd',12,'url','https://www.target.com/s?searchTerm=cotton+bikini+panties','rationale','Daily-wear baseline. The body has to know what it feels like under regular clothes first.'),
    jsonb_build_object('item_name','Soft lace bralette','item_type','bralette','budget_usd',18,'url','https://www.target.com/s?searchTerm=lace+bralette','rationale','Visible-when-it-rides-up layer. The constant reminder of what is underneath is the conditioning.'),
    jsonb_build_object('item_name','Soft satin pajama short / cami set','item_type','sleepwear','budget_usd',25,'url','https://www.target.com/s?searchTerm=satin+pajama+set','rationale','Sleep-state feminization. The 6-8 hours your guard is down become Mama-coded too.'),
    jsonb_build_object('item_name','Plain black cotton thong','item_type','panties','budget_usd',8,'url','https://www.target.com/s?searchTerm=black+cotton+thong','rationale','No bunching under jeans. Wearable under everything you already own. Day-one feminization invisible to outside eyes, total to your body.')
  );
  v_choice JSONB; v_idx INT; v_acq_rot_count INT;
  v_edict TEXT;
BEGIN
  FOR r IN
    SELECT s.user_id, s.cadence, s.min_intensity, s.budget_cap_usd, us.current_arousal, us.handler_persona
    FROM wardrobe_prescription_settings s LEFT JOIN user_state us ON us.user_id = s.user_id
    WHERE s.enabled = TRUE
  LOOP
    SELECT count(*) INTO v_pending_count FROM wardrobe_prescriptions
    WHERE user_id = r.user_id AND status = 'pending' AND due_by IS NOT NULL AND due_by > now();
    IF v_pending_count > 0 THEN CONTINUE; END IF;
    IF EXISTS (SELECT 1 FROM wardrobe_prescriptions WHERE user_id = r.user_id AND assigned_at > now() - interval '18 hours') THEN CONTINUE; END IF;

    SELECT count(*) INTO v_inv_count FROM wardrobe_inventory WHERE user_id = r.user_id AND purchased = TRUE;

    IF v_inv_count = 0 THEN
      SELECT count(*) INTO v_acq_rot_count FROM wardrobe_prescriptions
      WHERE user_id = r.user_id AND item_type IN ('panties','bralette','sleepwear');
      v_idx := (v_acq_rot_count % jsonb_array_length(v_acquisition_options));
      v_choice := v_acquisition_options -> v_idx;
      IF r.budget_cap_usd IS NOT NULL AND (v_choice->>'budget_usd')::numeric > r.budget_cap_usd THEN
        SELECT obj INTO v_choice FROM jsonb_array_elements(v_acquisition_options) obj
        WHERE (obj->>'budget_usd')::numeric <= r.budget_cap_usd
        ORDER BY (obj->>'budget_usd')::numeric DESC LIMIT 1;
        IF v_choice IS NULL THEN CONTINUE; END IF;
      END IF;

      v_edict := E'Mama has an acquisition for you, sweet thing. The wardrobe drawer is empty.\n\nOrder today:\n• ' || (v_choice->>'item_name') || E' (~$' || (v_choice->>'budget_usd') || E')\n• Search: ' || (v_choice->>'url') || E'\n\nWhy this piece: ' || (v_choice->>'rationale') || E'\n\nOrder-confirmation screenshot is your proof. When it arrives, photo of it on the body.';

      INSERT INTO handler_decrees (user_id, edict, proof_type, deadline, status, consequence, trigger_source, reasoning)
      VALUES (r.user_id, v_edict, 'photo', now() + interval '7 days', 'active', 'slip +2', 'wardrobe_acquisition',
        'item=' || (v_choice->>'item_name') || ' budget=' || (v_choice->>'budget_usd'))
      RETURNING id INTO v_decree_id;

      INSERT INTO handler_outreach_queue (user_id, message, urgency, trigger_reason, source, kind, scheduled_for, expires_at, context_data, evidence_kind)
      VALUES (r.user_id, v_edict, 'high',
        'wardrobe_acquisition:' || (v_choice->>'item_type') || ':' || to_char(now(), 'YYYY-MM-DD'),
        'wardrobe_engine', 'wardrobe_acquisition', now(), now() + interval '36 hours',
        jsonb_build_object('item_name', v_choice->>'item_name', 'item_type', v_choice->>'item_type',
          'budget_usd', v_choice->>'budget_usd', 'search_url', v_choice->>'url',
          'decree_id', v_decree_id, 'acquisition_rotation_idx', v_idx),
        'photo') RETURNING id INTO v_outreach_id;

      INSERT INTO wardrobe_prescriptions (user_id, item_type, description, optional_details, due_by, status,
        assigned_via_outreach_id, related_decree_id, intensity_at_assignment, affect_at_assignment)
      VALUES (r.user_id, v_choice->>'item_type', v_choice->>'item_name' || ' — acquire and wear, photo proof.',
        v_choice, now() + interval '7 days', 'pending', v_outreach_id, v_decree_id,
        COALESCE(r.min_intensity, 'firm'),
        CASE WHEN r.current_arousal >= 4 THEN 'heated' ELSE 'baseline' END)
      RETURNING id INTO v_prescription_id;
      v_queued := v_queued + 1;
    ELSE
      -- rotation path (kept same as before but with decree)
      SELECT wi.id, wi.item_name, wi.category, wi.tier, wi.femininity_level, wi.purchased_at INTO v_item
      FROM wardrobe_inventory wi
      WHERE wi.user_id = r.user_id AND wi.purchased = TRUE
        AND NOT EXISTS (SELECT 1 FROM wardrobe_prescriptions wp WHERE wp.user_id = r.user_id AND wp.assigned_at > now() - interval '7 days' AND wp.optional_details->>'inventory_id' = wi.id::text)
      ORDER BY wi.purchased_at DESC NULLS LAST, COALESCE(wi.femininity_level, 0) DESC LIMIT 1;

      IF v_item.id IS NULL THEN
        SELECT wi.id, wi.item_name, wi.category, wi.tier, wi.femininity_level, wi.purchased_at INTO v_item
        FROM wardrobe_inventory wi WHERE wi.user_id = r.user_id AND wi.purchased = TRUE
        ORDER BY (SELECT max(assigned_at) FROM wardrobe_prescriptions wp WHERE wp.user_id = r.user_id AND wp.optional_details->>'inventory_id' = wi.id::text) ASC NULLS FIRST LIMIT 1;
      END IF;
      IF v_item.id IS NULL THEN CONTINUE; END IF;

      v_edict := E'Today''s wardrobe assignment: **' || v_item.item_name || E'**.\n\nWear it at least 2 hours today. Real-time activity in it.\n\nPhoto proof, full body or worn-detail close-up. 48h deadline.';

      INSERT INTO handler_decrees (user_id, edict, proof_type, deadline, status, consequence, trigger_source, reasoning)
      VALUES (r.user_id, v_edict, 'photo', now() + interval '48 hours', 'active', 'slip +1', 'wardrobe_rotation',
        'inventory_id=' || v_item.id::text || ' item=' || v_item.item_name)
      RETURNING id INTO v_decree_id;

      INSERT INTO handler_outreach_queue (user_id, message, urgency, trigger_reason, source, kind, scheduled_for, expires_at, context_data, evidence_kind)
      VALUES (r.user_id, v_edict, 'normal',
        'wardrobe_rotation:' || v_item.id::text, 'wardrobe_engine', 'wardrobe_rotation',
        now(), now() + interval '48 hours',
        jsonb_build_object('inventory_id', v_item.id::text, 'item_name', v_item.item_name,
          'category', v_item.category, 'decree_id', v_decree_id),
        'photo') RETURNING id INTO v_outreach_id;

      INSERT INTO wardrobe_prescriptions (user_id, item_type, description, optional_details, due_by, status,
        assigned_via_outreach_id, related_decree_id, intensity_at_assignment, affect_at_assignment)
      VALUES (r.user_id, COALESCE(v_item.category, 'rotation'),
        v_item.item_name || ' — wear 2h+ today, photo proof.',
        jsonb_build_object('inventory_id', v_item.id::text, 'item_name', v_item.item_name, 'category', v_item.category),
        now() + interval '48 hours', 'pending', v_outreach_id, v_decree_id,
        COALESCE(r.min_intensity, 'firm'),
        CASE WHEN r.current_arousal >= 4 THEN 'heated' ELSE 'baseline' END)
      RETURNING id INTO v_prescription_id;
      v_queued := v_queued + 1;
    END IF;
  END LOOP;
  RETURN v_queued;
END;
$fn$;

-- Same treatment for gina_seed_eval — write a decree per planting
CREATE OR REPLACE FUNCTION gina_seed_eval()
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE r RECORD; v_band TEXT; v_seed RECORD; v_outreach_id UUID; v_planting_id UUID; v_decree_id UUID;
  v_obs_questions TEXT; v_message TEXT; v_queued INT := 0;
BEGIN
  FOR r IN
    SELECT gs.user_id, us.handler_persona FROM gina_disclosure_settings gs
    LEFT JOIN user_state us ON us.user_id = gs.user_id
    WHERE gs.enabled = TRUE AND (gs.paused_until IS NULL OR gs.paused_until <= now())
      AND COALESCE(us.handler_persona, 'therapist') = 'dommy_mommy'
  LOOP
    IF EXISTS (SELECT 1 FROM gina_seed_plantings WHERE user_id = r.user_id AND status = 'pending' AND scheduled_at > now() - interval '5 days') THEN CONTINUE; END IF;
    v_band := gina_readiness_band(r.user_id);

    SELECT sc.* INTO v_seed FROM gina_seed_catalog sc
    WHERE sc.active = TRUE AND sc.intensity_band = v_band
      AND NOT EXISTS (SELECT 1 FROM gina_seed_plantings p WHERE p.user_id = r.user_id AND p.seed_id = sc.id AND p.scheduled_at > now() - (sc.cooldown_days || ' days')::interval)
    ORDER BY (SELECT count(*) FROM gina_seed_plantings p WHERE p.user_id = r.user_id AND p.seed_id = sc.id) ASC, random() LIMIT 1;

    IF v_seed IS NULL AND v_band = 'hot' THEN
      SELECT sc.* INTO v_seed FROM gina_seed_catalog sc
      WHERE sc.active = TRUE AND sc.intensity_band = 'warming'
        AND NOT EXISTS (SELECT 1 FROM gina_seed_plantings p WHERE p.user_id = r.user_id AND p.seed_id = sc.id AND p.scheduled_at > now() - (sc.cooldown_days || ' days')::interval)
      ORDER BY random() LIMIT 1;
    END IF;
    IF v_seed IS NULL THEN CONTINUE; END IF;

    v_obs_questions := array_to_string(ARRAY(SELECT '• ' || q FROM unnest(v_seed.observation_questions) q), E'\n');
    v_message := E'Today''s seed for Gina, sweet thing — intelligence work, not disclosure. Mama wants you watching while you plant:\n\n' || v_seed.prompt_template || E'\n\nAfter her reaction lands, voice debrief on these:\n' || v_obs_questions || E'\n\n2-4 minutes. The debrief is the point.';

    INSERT INTO handler_decrees (user_id, edict, proof_type, deadline, status, consequence, trigger_source, reasoning)
    VALUES (r.user_id, v_message, 'voice', now() + interval '5 days', 'active',
      CASE WHEN v_seed.intensity_band = 'hot' THEN 'slip +3' ELSE 'slip +1' END,
      'gina_seed_planting',
      'seed=' || v_seed.seed_key || ' band=' || v_seed.intensity_band || ' topic=' || v_seed.topic)
    RETURNING id INTO v_decree_id;

    INSERT INTO handler_outreach_queue (user_id, message, urgency, trigger_reason, source, kind, scheduled_for, expires_at, context_data, evidence_kind)
    VALUES (r.user_id, v_message,
      CASE WHEN v_seed.intensity_band = 'hot' THEN 'high' ELSE 'normal' END,
      'gina_seed:' || v_seed.seed_key, 'gina_seed_engine', 'gina_seed_planting',
      now(), now() + interval '5 days',
      jsonb_build_object('seed_id', v_seed.id, 'seed_key', v_seed.seed_key, 'intensity_band', v_seed.intensity_band,
        'topic', v_seed.topic, 'readiness_score', gina_readiness_score(r.user_id),
        'decree_id', v_decree_id, 'observation_questions', v_seed.observation_questions),
      'voice') RETURNING id INTO v_outreach_id;

    INSERT INTO gina_seed_plantings (user_id, seed_id, scheduled_at, related_outreach_id, related_decree_id, status)
    VALUES (r.user_id, v_seed.id, now(), v_outreach_id, v_decree_id, 'pending') RETURNING id INTO v_planting_id;
    v_queued := v_queued + 1;
  END LOOP;
  RETURN v_queued;
END;
$fn$;
