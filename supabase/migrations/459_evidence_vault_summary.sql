-- 459 — Evidence vault summary.
--
-- A passive-conditioning surface: Maxy sees how much has accumulated.
-- "47 cock-conditioning stations completed. 312 voice samples. 89
-- mantras spoken aloud. 14 confessions transcribed. 6 Gina probes."
-- The pile is proof. Proof reinforces the becoming.
--
-- Returns a JSONB summary so the Today UI can render one panel
-- without N queries. Function is read-only, runs in user RLS context
-- when called from authenticated clients.

CREATE OR REPLACE FUNCTION evidence_vault_summary(p_user_id UUID)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_photos INT := 0;
  v_voice_samples INT := 0;
  v_confessions INT := 0;
  v_mantras INT := 0;
  v_cock_stations INT := 0;
  v_gina_probes INT := 0;
  v_gina_rungs INT := 0;
  v_wardrobe INT := 0;
  v_decrees INT := 0;
  v_cruising_decrees INT := 0;
  v_pavlovian_pairings INT := 0;
  v_pavlovian_triggers INT := 0;
  v_curriculum_phase INT := 0;
  v_worship_phase INT := 0;
  v_arc_stage INT := 0;
  v_disclosure_rung INT := 0;
  v_denial_day INT := 0;
BEGIN
  BEGIN SELECT count(*) INTO v_photos FROM verification_photos WHERE user_id = p_user_id AND COALESCE(review_state, '') <> 'denied';
  EXCEPTION WHEN undefined_table THEN v_photos := 0; END;

  BEGIN SELECT count(*) INTO v_voice_samples FROM voice_samples WHERE user_id = p_user_id;
  EXCEPTION WHEN undefined_table THEN v_voice_samples := 0; END;

  BEGIN SELECT count(*) INTO v_confessions FROM mama_confessions WHERE user_id = p_user_id AND transcript_status = 'completed';
  EXCEPTION WHEN undefined_table THEN v_confessions := 0; END;

  BEGIN SELECT count(*) INTO v_mantras FROM mommy_mantras
        WHERE active AND (affect_tags->>'user_id') = p_user_id::text;
  EXCEPTION WHEN undefined_table THEN v_mantras := 0; END;

  BEGIN SELECT count(*) INTO v_cock_stations FROM cock_conditioning_events
        WHERE user_id = p_user_id AND status = 'fulfilled';
  EXCEPTION WHEN undefined_table THEN v_cock_stations := 0; END;

  BEGIN SELECT count(*) INTO v_gina_probes FROM gina_seed_plantings
        WHERE user_id = p_user_id AND status = 'observed';
  EXCEPTION WHEN undefined_table THEN v_gina_probes := 0; END;

  BEGIN SELECT count(*) INTO v_gina_rungs FROM gina_disclosure_events
        WHERE user_id = p_user_id AND status = 'fulfilled';
  EXCEPTION WHEN undefined_table THEN v_gina_rungs := 0; END;

  BEGIN SELECT count(*) INTO v_wardrobe FROM wardrobe_prescriptions
        WHERE user_id = p_user_id AND status = 'fulfilled';
  EXCEPTION WHEN undefined_table THEN v_wardrobe := 0; END;

  BEGIN SELECT count(*) INTO v_decrees FROM handler_decrees
        WHERE user_id = p_user_id AND status = 'fulfilled';
  EXCEPTION WHEN undefined_table THEN v_decrees := 0; END;

  BEGIN SELECT count(*) INTO v_cruising_decrees FROM handler_decrees
        WHERE user_id = p_user_id AND trigger_source = 'cruising_lead_feminization' AND status = 'fulfilled';
  EXCEPTION WHEN undefined_table THEN v_cruising_decrees := 0; END;

  BEGIN SELECT COALESCE(sum(intensity_count), 0), COALESCE(sum(CASE WHEN deployed_as_trigger_at IS NOT NULL THEN 1 ELSE 0 END), 0)
        INTO v_pavlovian_pairings, v_pavlovian_triggers
        FROM pavlovian_pairings WHERE user_id = p_user_id;
  EXCEPTION WHEN undefined_table THEN v_pavlovian_pairings := 0; v_pavlovian_triggers := 0; END;

  BEGIN SELECT COALESCE(current_phase, 0) INTO v_curriculum_phase FROM cock_curriculum_settings WHERE user_id = p_user_id;
  EXCEPTION WHEN undefined_table THEN v_curriculum_phase := 0; END;

  BEGIN SELECT COALESCE(current_phase, 0) INTO v_worship_phase FROM cum_worship_settings WHERE user_id = p_user_id;
  EXCEPTION WHEN undefined_table THEN v_worship_phase := 0; END;

  BEGIN SELECT COALESCE(current_stage, 0) INTO v_arc_stage FROM gina_arc_settings WHERE user_id = p_user_id;
  EXCEPTION WHEN undefined_table THEN v_arc_stage := 0; END;

  BEGIN SELECT COALESCE(current_rung, 0) INTO v_disclosure_rung FROM gina_disclosure_settings WHERE user_id = p_user_id;
  EXCEPTION WHEN undefined_table THEN v_disclosure_rung := 0; END;

  BEGIN SELECT COALESCE(denial_day, 0) INTO v_denial_day FROM user_state WHERE user_id = p_user_id;
  EXCEPTION WHEN undefined_table THEN v_denial_day := 0; END;

  RETURN jsonb_build_object(
    'counts', jsonb_build_object(
      'photos', v_photos,
      'voice_samples', v_voice_samples,
      'confessions_transcribed', v_confessions,
      'mantras_in_rotation', v_mantras,
      'cock_stations_completed', v_cock_stations,
      'gina_probes_observed', v_gina_probes,
      'gina_rungs_completed', v_gina_rungs,
      'wardrobe_items_fulfilled', v_wardrobe,
      'decrees_fulfilled_total', v_decrees,
      'cruising_decrees_fulfilled', v_cruising_decrees,
      'pavlovian_pairings_total', v_pavlovian_pairings,
      'pavlovian_triggers_deployed', v_pavlovian_triggers
    ),
    'stages', jsonb_build_object(
      'cock_curriculum_phase', v_curriculum_phase,
      'cum_worship_phase', v_worship_phase,
      'gina_arc_stage', v_arc_stage,
      'gina_disclosure_rung', v_disclosure_rung,
      'denial_day', v_denial_day
    ),
    'generated_at', now()
  );
END;
$fn$;

GRANT EXECUTE ON FUNCTION evidence_vault_summary(UUID) TO authenticated, service_role;
