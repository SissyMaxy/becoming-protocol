-- ================================================================
-- DIAGNOSTIC: Check all tables from migrations 001-056
-- Paste into Supabase SQL Editor and run.
-- Filter results for MISSING.
-- ================================================================

WITH expected_tables(table_name, migration) AS (
  VALUES
    -- 001
    ('profile_foundation','001'),('profile_history','001'),('profile_arousal','001'),
    ('profile_psychology','001'),('profile_depth','001'),('intake_progress','001'),
    -- 002
    ('escalation_state','002'),('escalation_events','002'),('boundary_dissolution','002'),
    ('service_progression','002'),('service_encounters','002'),('content_escalation','002'),
    -- 003
    ('handler_strategies','003'),('planted_triggers','003'),('handler_experiments','003'),
    ('learned_vulnerabilities','003'),('scheduled_escalations','003'),('influence_attempts','003'),
    ('resistance_patterns','003'),('handler_daily_plans','003'),('handler_user_model','003'),
    ('handler_escalation_plans','003'),('arousal_commitment_extractions','003'),('escalation_experiments','003'),
    -- 004
    ('feminine_state_logs','004'),('state_streaks','004'),('regression_events','004'),
    ('identity_language_events','004'),('pronoun_stats','004'),('masculine_patterns','004'),('pattern_catches','004'),
    -- 005
    ('gina_emergence','005'),('gina_influence_pipeline','005'),('gina_commands','005'),
    ('gina_control_domains','005'),('gina_interactions','005'),('gina_opportunities','005'),
    -- 006
    ('arousal_states','006'),('intimate_sessions','006'),('arousal_commitments','006'),
    ('denial_tracking','006'),('chastity_sessions','006'),('session_content_log','006'),('edge_logs','006'),
    -- 007
    ('sensory_anchors','007'),('anchor_exposures','007'),('notifications_config','007'),
    ('notifications_sent','007'),('reward_unlocks','007'),('withdrawal_logs','007'),
    ('conditioning_pairs','007'),('affirmation_history','007'),
    -- 008
    ('investments','008'),('evidence_captures','008'),('sealed_letters','008'),
    ('ponr_milestones','008'),('timeline_events','008'),('transformation_journal','008'),('purchase_wishlist','008'),
    -- 009
    ('daily_arousal_plans','009'),('planned_edge_sessions','009'),('arousal_check_ins','009'),('chastity_milestones','009'),
    -- 011
    ('task_bank','011'),('daily_tasks','011'),('task_completions','011'),('task_resistance','011'),
    -- 012
    ('ceremonies','012'),('user_ceremonies','012'),
    -- 013
    ('goal_templates','013'),('drill_templates','013'),('goals','013'),('drills','013'),('daily_goal_completions','013'),
    -- 014
    ('lovense_connections','014'),('lovense_devices','014'),('haptic_patterns','014'),
    -- 015
    ('user_vector_states','015'),('daily_prescriptions','015'),('vector_progress_history','015'),
    ('irreversibility_markers','015'),('vector_lock_in_status','015'),('vector_engagement_records','015'),
    ('user_learning_patterns','015'),('user_learning_profiles','015'),
    -- 016
    ('reminder_settings','016'),
    -- 017
    ('handler_ai_logs','017'),
    -- 018
    ('handler_pending_tasks','018'),
    -- 019
    ('micro_task_templates','019'),('scheduled_ambushes','019'),('ambush_completions','019'),('ambush_user_settings','019'),
    -- 020
    ('denial_state','020'),
    -- 028
    ('voice_affirmations','028'),('voice_game_sessions','028'),('voice_game_attempts','028'),
    ('voice_game_progress','028'),('voice_game_settings','028'),('voice_game_achievements','028'),('voice_game_user_achievements','028'),
    -- 029
    ('handler_authority','029'),('automatic_decisions','029'),('assigned_tasks','029'),
    ('scheduled_sessions','029'),('required_interventions','029'),('automatic_commitments','029'),
    -- 030
    ('gina_conversion_state','030'),('gina_missions','030'),('behavioral_directives','030'),
    ('seed_scripts','030'),('gina_interaction_log','030'),
    -- 031
    ('manipulation_log','031'),('installed_reality_frames','031'),('identity_erosion','031'),
    ('handler_persona_effectiveness','031'),('gaslighting_effectiveness','031'),
    -- 033
    ('user_state','033'),('state_history','033'),('mood_checkins','033'),('daily_entries','033'),
    ('handler_interventions','033'),('baselines','033'),('commitments_v2','033'),('content_references','033'),
    -- 034
    ('failure_mode_events','034'),('time_capsules','034'),('activity_classification','034'),
    ('weekend_plans_v2','034'),('recovery_protocols','034'),('crisis_kit','034'),
    -- 035
    ('handler_budget','035'),('handler_action_log','035'),
    -- 036
    ('scheduled_notifications','036'),('session_guidance_log','036'),
    -- 037
    ('gina_ladder_state','037'),('gina_seed_log','037'),('gina_measurements','037'),
    ('gina_arc_state','037'),('gina_disclosure_map','037'),
    -- 039
    ('session_scripts','039'),('euphoria_captures','039'),('gina_evidence','039'),
    ('post_release_captures','039'),('denial_cycles','039'),('masculine_effort_log','039'),
    ('comfort_entries','039'),('involuntary_emergence','039'),('visibility_acts','039'),
    ('inspiration_feed','039'),('narrative_reflections','039'),('micro_checkins','039'),
    ('physical_state_log','039'),('self_reference_analysis','039'),('resistance_costs','039'),
    ('dependency_signals','039'),('handler_initiated_sessions','039'),('compliance_gates','039'),
    ('forced_escalations','039'),('compulsory_completions','039'),('punishments','039'),
    ('scene_completions','039'),('ownership_metrics','039'),('session_depth','039'),
    ('content_consumption','039'),('degradation_responses','039'),('physical_practice_log','039'),
    ('conditioning_progress','039'),('submission_metrics','039'),('arousal_identity_log','039'),
    -- 040
    ('partners','040'),('meetups','040'),('hookup_parameters','040'),('findom_relationships','040'),
    ('maxy_revenue','040'),('maxy_expenses','040'),('findom_state','040'),
    -- 041
    ('domain_state','041'),('gina_state','041'),('dynamic_task_state','041'),('event_log','041'),
    -- 043
    ('enforcement_config','043'),('enforcement_log','043'),('daily_enforcement_runs','043'),
    ('handler_narrations','043'),('financial_consequences','043'),('lovense_proactive_commands','043'),('noncompliance_streaks','043'),
    -- 045
    ('handler_decisions','045'),('content_library','045'),('content_briefs','045'),
    ('platform_accounts','045'),('scheduled_posts','045'),('revenue_events','045'),
    ('maxy_fund','045'),('fund_transactions','045'),('handler_strategy','045'),
    ('sex_work_progression','045'),('compliance_state','045'),('feminization_purchases','045'),
    -- 048
    ('content_vault','048'),('consequence_state','048'),('consequence_events','048'),('veto_log','048'),
    -- 049
    ('story_arcs','049'),('content_beats','049'),('funding_milestones','049'),
    -- 050
    ('cam_sessions','050'),('cam_revenue','050'),('fan_polls','050'),('revenue_log','050'),
    -- 051
    ('resistance_events','051'),
    -- 052
    ('gina_investments','052'),('gina_discovery_state','052'),('marriage_restructuring_milestones','052'),
    -- 053
    ('bambi_states','053'),('conditioning_triggers','053'),('content_library_audit','053'),
    -- 054
    ('content_permanence','054'),('permanence_acknowledgments','054'),('permanence_tier_transitions','054'),
    -- 055
    ('dynamic_levels','055'),('domain_escalation_state','055'),('escalation_advancement_events','055'),('domain_dependencies','055'),
    -- 056
    ('hrt_pipeline','056'),('hrt_daily_log','056'),('hrt_sober_checkpoints','056')
)
SELECT
  e.migration,
  e.table_name,
  CASE WHEN t.table_name IS NOT NULL THEN 'EXISTS' ELSE 'MISSING' END AS status
FROM expected_tables e
LEFT JOIN information_schema.tables t
  ON t.table_schema = 'public' AND t.table_name = e.table_name
ORDER BY e.migration, e.table_name;
