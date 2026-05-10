-- Migration: 347_revoke_security_definer_executes.sql
-- Pass-2 advisor fix §3: anon_security_definer_function_executable × 139 +
--                         authenticated_security_definer_function_executable × 139
--
-- All 139 SECURITY DEFINER functions in `public` had EXECUTE granted to PUBLIC,
-- which means anon and authenticated callers could invoke them via
-- /rest/v1/rpc/<name>. SECURITY DEFINER means the function runs as `postgres`
-- regardless of caller, so any RLS-bypass logic the function does is exposed
-- to whoever can call it.
--
-- Strategy:
--   1. REVOKE EXECUTE FROM PUBLIC, anon, authenticated on all 139 functions.
--   2. GRANT EXECUTE TO authenticated for the 23 functions that frontend code
--      (src/) actually calls via supabase.rpc(...).
--   3. GRANT EXECUTE TO anon for the 2 functions designed for token-based
--      public access: get_shared_wishlist + claim_wishlist_item.
--
-- The remaining ~116 functions are called from one of:
--   - server-side edge functions or pg_cron jobs (run as service_role / postgres)
--   - SQL triggers (run as the table-modifier's role, no PostgREST involved)
-- so revoking client grants does not break their call paths.
--
-- Frontend rpc-call inventory (src/**/*) was the source of truth for the
-- keep-list:
--   add_to_fund, append_param_history (debug only — service-only ok),
--   can_use_haptics, claim_wishlist_item (anon),
--   complete_ambush, end_current_streak, get_haptic_stats,
--   get_next_brief_number, get_pending_ambushes, get_prescribable_templates,
--   get_shared_wishlist (anon), increment_session_count,
--   initialize_autonomous_system (test fixture), initialize_gina_ladder,
--   log_service, record_engagement, record_gina_milestone,
--   record_template_completion, reset_gfe_daily_flags, reset_weekly_sessions,
--   schedule_daily_ambushes, snooze_ambush, start_new_streak,
--   update_noncompliance_streak.
--
-- ROLLBACK:
--   GRANT EXECUTE ON FUNCTION public.<name>(<args>) TO PUBLIC;
--   for every function below restores the prior open state (and the lint).

BEGIN;

-- ============================================================================
-- Step 1 — REVOKE EXECUTE on all 139 SD functions from PUBLIC, anon, authenticated.
-- ============================================================================

REVOKE EXECUTE ON FUNCTION public.abandon_goal(p_goal_id uuid, p_reason text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.add_to_fund(p_user_id uuid, p_amount numeric, p_type text, p_description text, p_reference_id uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.age_merge_pipeline() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.amplify_sanctuary_on_defection_spike() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.append_param_history(p_user_id uuid, p_key text, p_entry jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.auto_allocate_revenue_to_budget() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.autodiscover_triggers() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.bridge_contradictions_to_implants(p_user_id uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.bridge_findings_to_implants(p_user_id uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.bridge_loopholes_to_confessions(p_user_id uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.bridge_strategist_to_decrees(p_user_id uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.bump_good_girl_points(p_user_id uuid, p_amount integer, p_reason text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.can_start_session(p_user_id uuid, p_session_type character varying) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.can_use_haptics(p_user_id uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.capture_body_evidence_snapshot() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.check_body_evidence_freshness() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.check_david_suppression() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.check_goal_graduation(p_goal_id uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.check_goal_streaks(p_user_id uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.check_system_invariants() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.check_v31_freshness() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.claim_wishlist_item(p_token text, p_item_id uuid, p_claimer_email text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.classify_receptive_window() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.cleanup_old_handler_tasks() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.complete_ambush(p_ambush_id uuid, p_proof_url text, p_felt_good boolean, p_difficulty integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.complete_goal(p_goal_id uuid, p_drill_id uuid, p_notes text, p_felt_good boolean) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.compute_daily_compliance_score() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.compute_defection_risk() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.create_goal_from_template(p_template_id uuid, p_user_id uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.create_user_state_on_signup() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.debug_chastity_invariant_view() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.debug_chastity_locked_count(uid uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.deliver_sanctuary_baseline() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.deliver_sanctuary_on_regression() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.detect_and_intervene_slip_clusters() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.detect_identity_dimension_decay() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.discover_recurring_phrases(p_user_id uuid, p_min_occurrences integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.dismiss_notification(p_notification_id uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.end_current_streak(p_user_id uuid, p_ended_by text, p_orgasm_id uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enforce_confession_debt() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enforce_user_task_skip_list() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.erode_identity_aspect(p_user_id uuid, p_aspect text, p_erosion_amount integer, p_event_description text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.escalate_stale_audit_findings(p_user_id uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.expire_overdue_body_directives() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.expire_overdue_confessions() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fire_anti_procrastination_shame() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fire_daily_confession_prompt() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fire_defection_proof_demand() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fire_hrt_advance_pressure() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fire_implant_repetition_cycle() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fire_milestone_disclosure_drafts() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fire_photo_freshness_demand() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fire_predictive_defection_lockdown() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fire_receptive_window_content() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fire_sanctuary_receipt_cycle() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fire_streak_break_recovery() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fire_voice_cadence_decree() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fire_wardrobe_rotation_decree() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fire_witness_defection_alerts() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.generate_sanctuary_messages() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_current_streak_days(p_user_id uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_decree_difficulty_bump(p_user_id uuid, p_category text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_due_posts() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_haptic_stats(p_user_id uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_least_used_capsule(p_user_id uuid, p_capsule_type text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_next_brief_number(p_user_id uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_noncompliance_tier(p_user_id uuid, p_domain text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_pending_ambushes(p_user_id uuid, p_current_time timestamp with time zone) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_pending_mood_checks(p_user_id uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_prescribable_templates(p_user_id uuid, p_user_phase integer, p_domains public.task_domain[], p_max_difficulty public.task_difficulty, p_limit integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_reminder_stats(p_user_id uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_reminder_streak(p_user_id uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_service_count(p_user_id uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_session_evidence(p_user_id uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_shared_wishlist(p_token text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_todays_goals(p_user_id uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_todays_plan(p_user_id uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.increment_session_count(p_user_id uuid, p_field text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.initialize_autonomous_system(p_user_id uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.initialize_consequence_state() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.initialize_gina_arcs(p_user_id uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.initialize_gina_ladder(p_user_id uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.initialize_user_data() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.invoke_edge_function(p_function_name text, p_body jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.is_mommy_user(uid uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.log_service(p_user_id uuid, p_service_type text, p_description text, p_duration_minutes integer, p_task_id text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.mark_notification_sent(p_notification_id uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.prune_cron_run_details() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.prune_perf_log_tables() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.record_engagement(p_user_id uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.record_gina_milestone(p_user_id uuid, p_milestone text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.record_template_completion(p_user_id uuid, p_template_id uuid, p_task_id uuid, p_duration_minutes integer, p_rating integer, p_notes text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.reinforce_reality_frame(p_user_id uuid, p_domain text, p_reinforcement_strength integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.request_sanctuary_dose(p_user_id uuid, p_urgency text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.reset_gfe_daily_flags() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.reset_weekly_sessions(p_user_id uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.schedule_daily_ambushes(p_user_id uuid, p_date date) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.schedule_trigger_reinforcement() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.score_identity_dimensions() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_protocol_start_date() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.snooze_ambush(p_ambush_id uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.start_new_streak(p_user_id uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.surface_held_evidence_for_defection_risk() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trg_amplify_slip_during_hard_mode() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trg_arousal_spike_binds_commitment() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trg_auto_promote_chat() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trg_auto_promote_confession() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trg_auto_promote_journal() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trg_capture_admission_to_held() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trg_capture_confession_verbatim() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trg_capture_initiation_as_held_evidence() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trg_cleanup_confessions_on_slip_delete() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trg_confession_quality_gate() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trg_decree_completion_ratchet() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trg_detect_arousal_in_chat() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trg_detect_slips_in_chat() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trg_extract_commitment_from_chat() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trg_extract_desire_from_chat() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trg_extract_key_admission_from_chat() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trg_extract_key_admission_from_confession() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trg_extract_key_admission_from_journal() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trg_identity_drift_cascade() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trg_implant_importance_compound() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trg_inflate_topology_on_vibe() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trg_initiation_cross_promote() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trg_outreach_queue_dispatch_tts() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trg_outreach_queue_render_tts() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trg_pair_triggers_on_implant_ref() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trg_sync_slip_points() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trigger_daily_plan_generation() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trigger_enforcement_run(p_run_type text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trigger_update_denial_state_from_chastity() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trigger_update_denial_state_from_tracking() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_compliance_hours() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_denial_state(p_user_id uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_gina_integration_after_session() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_noncompliance_streak(p_user_id uuid, p_domain text, p_is_compliant boolean) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_vector_progress(p_user_id uuid, p_vector_id text, p_level_delta numeric, p_sub_component_id text, p_sub_component_delta numeric, p_engagement_minutes integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.vacuum_david_coded_reframings() FROM PUBLIC, anon, authenticated;

-- ============================================================================
-- Step 2 — GRANT EXECUTE TO authenticated for the functions called from
-- frontend src/* via supabase.rpc(). 23 functions.
-- ============================================================================

GRANT EXECUTE ON FUNCTION public.add_to_fund(p_user_id uuid, p_amount numeric, p_type text, p_description text, p_reference_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_use_haptics(p_user_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.complete_ambush(p_ambush_id uuid, p_proof_url text, p_felt_good boolean, p_difficulty integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.end_current_streak(p_user_id uuid, p_ended_by text, p_orgasm_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_haptic_stats(p_user_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_next_brief_number(p_user_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_pending_ambushes(p_user_id uuid, p_current_time timestamp with time zone) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_prescribable_templates(p_user_id uuid, p_user_phase integer, p_domains public.task_domain[], p_max_difficulty public.task_difficulty, p_limit integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.increment_session_count(p_user_id uuid, p_field text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.initialize_autonomous_system(p_user_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.initialize_gina_ladder(p_user_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.log_service(p_user_id uuid, p_service_type text, p_description text, p_duration_minutes integer, p_task_id text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_engagement(p_user_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_gina_milestone(p_user_id uuid, p_milestone text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_template_completion(p_user_id uuid, p_template_id uuid, p_task_id uuid, p_duration_minutes integer, p_rating integer, p_notes text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reset_gfe_daily_flags() TO authenticated;
GRANT EXECUTE ON FUNCTION public.reset_weekly_sessions(p_user_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.schedule_daily_ambushes(p_user_id uuid, p_date date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.snooze_ambush(p_ambush_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.start_new_streak(p_user_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_noncompliance_streak(p_user_id uuid, p_domain text, p_is_compliant boolean) TO authenticated;

-- ============================================================================
-- Step 3 — GRANT EXECUTE TO anon AND authenticated for the public-token
-- wishlist sharing flow (intentional unauthenticated access via share token).
-- ============================================================================

GRANT EXECUTE ON FUNCTION public.get_shared_wishlist(p_token text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_wishlist_item(p_token text, p_item_id uuid, p_claimer_email text) TO anon, authenticated;

COMMIT;
