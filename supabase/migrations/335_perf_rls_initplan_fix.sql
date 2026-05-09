-- 335_perf_rls_initplan_fix.sql
-- Rewrites every public.* RLS policy that calls auth.uid() / auth.jwt() / auth.role() /
-- auth.email() / current_setting() in its USING or WITH CHECK clauses, wrapping the
-- call in a (SELECT ...) subquery so the planner evaluates it ONCE per query rather
-- than once per row. Pure performance refactor, no semantic change.
--
-- Idempotent: each policy is dropped + recreated. The wrapping rewrite is a no-op when
-- the call is already wrapped in (SELECT ...).
--
-- Rollback: re-running the previous migration that defined each policy, or manually
-- removing the SELECT wrappers from auth.fn() calls.

DROP POLICY IF EXISTS "Users can read own ab tests" ON public."ab_tests";
CREATE POLICY "Users can read own ab tests" ON public."ab_tests"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Authenticated users can read achievements" ON public."achievements";
CREATE POLICY "Authenticated users can read achievements" ON public."achievements"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (((SELECT auth.role()) = 'authenticated'::text));

DROP POLICY IF EXISTS "Users access own activity_classification" ON public."activity_classification";
CREATE POLICY "Users access own activity_classification" ON public."activity_classification"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can view own affiliate events" ON public."affiliate_events";
CREATE POLICY "Users can view own affiliate events" ON public."affiliate_events"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users read own affiliate_links" ON public."affiliate_links";
CREATE POLICY "Users read own affiliate_links" ON public."affiliate_links"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users access own affirmations" ON public."affirmation_history";
CREATE POLICY "Users access own affirmations" ON public."affirmation_history"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "aftercare_sessions_owner" ON public."aftercare_sessions";
CREATE POLICY "aftercare_sessions_owner" ON public."aftercare_sessions"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id))
  WITH CHECK (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can view own conversations" ON public."ai_conversations";
CREATE POLICY "Users can view own conversations" ON public."ai_conversations"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users read own ai_generated_content" ON public."ai_generated_content";
CREATE POLICY "Users read own ai_generated_content" ON public."ai_generated_content"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can manage own insights" ON public."ai_insights";
CREATE POLICY "Users can manage own insights" ON public."ai_insights"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users own ai_suggestions" ON public."ai_intimate_suggestions";
CREATE POLICY "Users own ai_suggestions" ON public."ai_intimate_suggestions"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "ambient_audio_insert" ON public."ambient_audio_queue";
CREATE POLICY "ambient_audio_insert" ON public."ambient_audio_queue"
  AS PERMISSIVE
  FOR INSERT
  TO public
  WITH CHECK (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "ambient_audio_select" ON public."ambient_audio_queue";
CREATE POLICY "ambient_audio_select" ON public."ambient_audio_queue"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "ambient_audio_update" ON public."ambient_audio_queue";
CREATE POLICY "ambient_audio_update" ON public."ambient_audio_queue"
  AS PERMISSIVE
  FOR UPDATE
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users access own completions" ON public."ambush_completions";
CREATE POLICY "Users access own completions" ON public."ambush_completions"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users access own settings" ON public."ambush_user_settings";
CREATE POLICY "Users access own settings" ON public."ambush_user_settings"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can manage own anchor_effectiveness_log" ON public."anchor_effectiveness_log";
CREATE POLICY "Users can manage own anchor_effectiveness_log" ON public."anchor_effectiveness_log"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users access own exposures" ON public."anchor_exposures";
CREATE POLICY "Users access own exposures" ON public."anchor_exposures"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can delete own anchors" ON public."anchor_objects";
CREATE POLICY "Users can delete own anchors" ON public."anchor_objects"
  AS PERMISSIVE
  FOR DELETE
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can insert own anchors" ON public."anchor_objects";
CREATE POLICY "Users can insert own anchors" ON public."anchor_objects"
  AS PERMISSIVE
  FOR INSERT
  TO public
  WITH CHECK (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can update own anchors" ON public."anchor_objects";
CREATE POLICY "Users can update own anchors" ON public."anchor_objects"
  AS PERMISSIVE
  FOR UPDATE
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can view own anchors" ON public."anchor_objects";
CREATE POLICY "Users can view own anchors" ON public."anchor_objects"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can manage own arousal_auctions" ON public."arousal_auctions";
CREATE POLICY "Users can manage own arousal_auctions" ON public."arousal_auctions"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users access own arousal_check_ins" ON public."arousal_check_ins";
CREATE POLICY "Users access own arousal_check_ins" ON public."arousal_check_ins"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users access own check_ins" ON public."arousal_check_ins";
CREATE POLICY "Users access own check_ins" ON public."arousal_check_ins"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users own arousal_check_ins" ON public."arousal_check_ins";
CREATE POLICY "Users own arousal_check_ins" ON public."arousal_check_ins"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users access own arousal_commitment_extractions" ON public."arousal_commitment_extractions";
CREATE POLICY "Users access own arousal_commitment_extractions" ON public."arousal_commitment_extractions"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can access own commitments" ON public."arousal_commitment_extractions";
CREATE POLICY "Users can access own commitments" ON public."arousal_commitment_extractions"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users access own commitments" ON public."arousal_commitments";
CREATE POLICY "Users access own commitments" ON public."arousal_commitments"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can manage their own arousal_identity_log" ON public."arousal_identity_log";
CREATE POLICY "Users can manage their own arousal_identity_log" ON public."arousal_identity_log"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "arousal_log_owner" ON public."arousal_log";
CREATE POLICY "arousal_log_owner" ON public."arousal_log"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id))
  WITH CHECK (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "arousal_metrics_all" ON public."arousal_metrics";
CREATE POLICY "arousal_metrics_all" ON public."arousal_metrics"
  AS PERMISSIVE
  FOR ALL
  TO authenticated
  USING (((SELECT auth.uid()) = user_id))
  WITH CHECK (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users own arousal pulses" ON public."arousal_pulses";
CREATE POLICY "Users own arousal pulses" ON public."arousal_pulses"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can manage own arousal_sessions" ON public."arousal_sessions";
CREATE POLICY "Users can manage own arousal_sessions" ON public."arousal_sessions"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users access own arousal" ON public."arousal_states";
CREATE POLICY "Users access own arousal" ON public."arousal_states"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users own arousal_states" ON public."arousal_states";
CREATE POLICY "Users own arousal_states" ON public."arousal_states"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "arousal_touch_tasks_owner" ON public."arousal_touch_tasks";
CREATE POLICY "arousal_touch_tasks_owner" ON public."arousal_touch_tasks"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id))
  WITH CHECK (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can update own tasks" ON public."assigned_tasks";
CREATE POLICY "Users can update own tasks" ON public."assigned_tasks"
  AS PERMISSIVE
  FOR UPDATE
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can view own tasks" ON public."assigned_tasks";
CREATE POLICY "Users can view own tasks" ON public."assigned_tasks"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "audience_challenges_user" ON public."audience_challenges";
CREATE POLICY "audience_challenges_user" ON public."audience_challenges"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "audience_polls_user" ON public."audience_polls";
CREATE POLICY "audience_polls_user" ON public."audience_polls"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can manage own auto_challenges" ON public."auto_challenges";
CREATE POLICY "Users can manage own auto_challenges" ON public."auto_challenges"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Service role full access auto_poster_status" ON public."auto_poster_status";
CREATE POLICY "Service role full access auto_poster_status" ON public."auto_poster_status"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.role()) = 'service_role'::text));

DROP POLICY IF EXISTS "Users can insert own auto_poster_status" ON public."auto_poster_status";
CREATE POLICY "Users can insert own auto_poster_status" ON public."auto_poster_status"
  AS PERMISSIVE
  FOR INSERT
  TO public
  WITH CHECK (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can read own auto_poster_status" ON public."auto_poster_status";
CREATE POLICY "Users can read own auto_poster_status" ON public."auto_poster_status"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can update own auto_poster_status" ON public."auto_poster_status";
CREATE POLICY "Users can update own auto_poster_status" ON public."auto_poster_status"
  AS PERMISSIVE
  FOR UPDATE
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can update own commitments" ON public."automatic_commitments";
CREATE POLICY "Users can update own commitments" ON public."automatic_commitments"
  AS PERMISSIVE
  FOR UPDATE
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can view own commitments" ON public."automatic_commitments";
CREATE POLICY "Users can view own commitments" ON public."automatic_commitments"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can view own decisions" ON public."automatic_decisions";
CREATE POLICY "Users can view own decisions" ON public."automatic_decisions"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "service writes escalation" ON public."autonomous_escalation_log";
CREATE POLICY "service writes escalation" ON public."autonomous_escalation_log"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.role()) = 'service_role'::text))
  WITH CHECK (((SELECT auth.role()) = 'service_role'::text));

DROP POLICY IF EXISTS "user reads own escalation" ON public."autonomous_escalation_log";
CREATE POLICY "user reads own escalation" ON public."autonomous_escalation_log"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can insert their own bambi states" ON public."bambi_states";
CREATE POLICY "Users can insert their own bambi states" ON public."bambi_states"
  AS PERMISSIVE
  FOR INSERT
  TO public
  WITH CHECK (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can update their own bambi states" ON public."bambi_states";
CREATE POLICY "Users can update their own bambi states" ON public."bambi_states"
  AS PERMISSIVE
  FOR UPDATE
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can view their own bambi states" ON public."bambi_states";
CREATE POLICY "Users can view their own bambi states" ON public."bambi_states"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users access own baselines" ON public."baselines";
CREATE POLICY "Users access own baselines" ON public."baselines"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can view own directives" ON public."behavioral_directives";
CREATE POLICY "Users can view own directives" ON public."behavioral_directives"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "behavioral_triggers_insert" ON public."behavioral_triggers";
CREATE POLICY "behavioral_triggers_insert" ON public."behavioral_triggers"
  AS PERMISSIVE
  FOR INSERT
  TO public
  WITH CHECK (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "behavioral_triggers_select" ON public."behavioral_triggers";
CREATE POLICY "behavioral_triggers_select" ON public."behavioral_triggers"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "behavioral_triggers_update" ON public."behavioral_triggers";
CREATE POLICY "behavioral_triggers_update" ON public."behavioral_triggers"
  AS PERMISSIVE
  FOR UPDATE
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "body_change_owner" ON public."body_change_observations";
CREATE POLICY "body_change_owner" ON public."body_change_observations"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "body_dysphoria_owner" ON public."body_dysphoria_logs";
CREATE POLICY "body_dysphoria_owner" ON public."body_dysphoria_logs"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "bfd_owner" ON public."body_feminization_directives";
CREATE POLICY "bfd_owner" ON public."body_feminization_directives"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "bml_owner" ON public."body_measurement_log";
CREATE POLICY "bml_owner" ON public."body_measurement_log"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can delete own body measurements" ON public."body_measurements";
CREATE POLICY "Users can delete own body measurements" ON public."body_measurements"
  AS PERMISSIVE
  FOR DELETE
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can insert own body measurements" ON public."body_measurements";
CREATE POLICY "Users can insert own body measurements" ON public."body_measurements"
  AS PERMISSIVE
  FOR INSERT
  TO public
  WITH CHECK (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can update own body measurements" ON public."body_measurements";
CREATE POLICY "Users can update own body measurements" ON public."body_measurements"
  AS PERMISSIVE
  FOR UPDATE
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can view own body measurements" ON public."body_measurements";
CREATE POLICY "Users can view own body measurements" ON public."body_measurements"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "body_measurements_owner" ON public."body_measurements";
CREATE POLICY "body_measurements_owner" ON public."body_measurements"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id))
  WITH CHECK (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "body_targets_owner" ON public."body_targets";
CREATE POLICY "body_targets_owner" ON public."body_targets"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can delete own bookend config" ON public."bookend_config";
CREATE POLICY "Users can delete own bookend config" ON public."bookend_config"
  AS PERMISSIVE
  FOR DELETE
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can insert own bookend config" ON public."bookend_config";
CREATE POLICY "Users can insert own bookend config" ON public."bookend_config"
  AS PERMISSIVE
  FOR INSERT
  TO public
  WITH CHECK (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can update own bookend config" ON public."bookend_config";
CREATE POLICY "Users can update own bookend config" ON public."bookend_config"
  AS PERMISSIVE
  FOR UPDATE
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can view own bookend config" ON public."bookend_config";
CREATE POLICY "Users can view own bookend config" ON public."bookend_config"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can insert own bookend views" ON public."bookend_views";
CREATE POLICY "Users can insert own bookend views" ON public."bookend_views"
  AS PERMISSIVE
  FOR INSERT
  TO public
  WITH CHECK (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can view own bookend views" ON public."bookend_views";
CREATE POLICY "Users can view own bookend views" ON public."bookend_views"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users access own boundary_dissolution" ON public."boundary_dissolution";
CREATE POLICY "Users access own boundary_dissolution" ON public."boundary_dissolution"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can access own boundary_dissolution" ON public."boundary_dissolution";
CREATE POLICY "Users can access own boundary_dissolution" ON public."boundary_dissolution"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users own their data" ON public."calendar_credentials";
CREATE POLICY "Users own their data" ON public."calendar_credentials"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users own their data" ON public."calendar_events_managed";
CREATE POLICY "Users own their data" ON public."calendar_events_managed"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "cam_prompts_user" ON public."cam_handler_prompts";
CREATE POLICY "cam_prompts_user" ON public."cam_handler_prompts"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users own highlights" ON public."cam_highlights";
CREATE POLICY "Users own highlights" ON public."cam_highlights"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Service role full access" ON public."cam_revenue";
CREATE POLICY "Service role full access" ON public."cam_revenue"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING ((((SELECT auth.jwt()) ->> 'role'::text) = 'service_role'::text));

DROP POLICY IF EXISTS "Users can insert own cam revenue" ON public."cam_revenue";
CREATE POLICY "Users can insert own cam revenue" ON public."cam_revenue"
  AS PERMISSIVE
  FOR INSERT
  TO public
  WITH CHECK (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can update own cam revenue" ON public."cam_revenue";
CREATE POLICY "Users can update own cam revenue" ON public."cam_revenue"
  AS PERMISSIVE
  FOR UPDATE
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can view own cam revenue" ON public."cam_revenue";
CREATE POLICY "Users can view own cam revenue" ON public."cam_revenue"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Service role full access" ON public."cam_sessions";
CREATE POLICY "Service role full access" ON public."cam_sessions"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING ((((SELECT auth.jwt()) ->> 'role'::text) = 'service_role'::text));

DROP POLICY IF EXISTS "Users can insert own cam sessions" ON public."cam_sessions";
CREATE POLICY "Users can insert own cam sessions" ON public."cam_sessions"
  AS PERMISSIVE
  FOR INSERT
  TO public
  WITH CHECK (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can update own cam sessions" ON public."cam_sessions";
CREATE POLICY "Users can update own cam sessions" ON public."cam_sessions"
  AS PERMISSIVE
  FOR UPDATE
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can view own cam sessions" ON public."cam_sessions";
CREATE POLICY "Users can view own cam sessions" ON public."cam_sessions"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "cam_tips_user" ON public."cam_tips";
CREATE POLICY "cam_tips_user" ON public."cam_tips"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users access own chastity_milestones" ON public."chastity_milestones";
CREATE POLICY "Users access own chastity_milestones" ON public."chastity_milestones"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users access own milestones" ON public."chastity_milestones";
CREATE POLICY "Users access own milestones" ON public."chastity_milestones"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users own chastity_milestones" ON public."chastity_milestones";
CREATE POLICY "Users own chastity_milestones" ON public."chastity_milestones"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users own milestones" ON public."chastity_milestones";
CREATE POLICY "Users own milestones" ON public."chastity_milestones"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users access own chastity" ON public."chastity_sessions";
CREATE POLICY "Users access own chastity" ON public."chastity_sessions"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users own chastity" ON public."chastity_sessions";
CREATE POLICY "Users own chastity" ON public."chastity_sessions"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users own collab pipeline" ON public."collaboration_pipeline";
CREATE POLICY "Users own collab pipeline" ON public."collaboration_pipeline"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can manage their own comfort_entries" ON public."comfort_entries";
CREATE POLICY "Users can manage their own comfort_entries" ON public."comfort_entries"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "coming_out_owner" ON public."coming_out_letters";
CREATE POLICY "coming_out_owner" ON public."coming_out_letters"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id))
  WITH CHECK (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "commitment_floors_insert" ON public."commitment_floors";
CREATE POLICY "commitment_floors_insert" ON public."commitment_floors"
  AS PERMISSIVE
  FOR INSERT
  TO public
  WITH CHECK (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "commitment_floors_select" ON public."commitment_floors";
CREATE POLICY "commitment_floors_select" ON public."commitment_floors"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "commitment_floors_update" ON public."commitment_floors";
CREATE POLICY "commitment_floors_update" ON public."commitment_floors"
  AS PERMISSIVE
  FOR UPDATE
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users own their data" ON public."commitment_ladder_progress";
CREATE POLICY "Users own their data" ON public."commitment_ladder_progress"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users access own commitments_v2" ON public."commitments_v2";
CREATE POLICY "Users access own commitments_v2" ON public."commitments_v2"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "community_targets_user" ON public."community_targets";
CREATE POLICY "community_targets_user" ON public."community_targets"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can manage their own compliance_gates" ON public."compliance_gates";
CREATE POLICY "Users can manage their own compliance_gates" ON public."compliance_gates"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Service full compliance_state" ON public."compliance_state";
CREATE POLICY "Service full compliance_state" ON public."compliance_state"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.role()) = 'service_role'::text));

DROP POLICY IF EXISTS "Users read own compliance" ON public."compliance_state";
CREATE POLICY "Users read own compliance" ON public."compliance_state"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "compliance_trend_owner" ON public."compliance_trend_snapshots";
CREATE POLICY "compliance_trend_owner" ON public."compliance_trend_snapshots"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id))
  WITH CHECK (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users own compliance_verifications" ON public."compliance_verifications";
CREATE POLICY "Users own compliance_verifications" ON public."compliance_verifications"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can manage their own compulsory_completions" ON public."compulsory_completions";
CREATE POLICY "Users can manage their own compulsory_completions" ON public."compulsory_completions"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "ccw_own" ON public."compulsory_confession_windows";
CREATE POLICY "ccw_own" ON public."compulsory_confession_windows"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id))
  WITH CHECK (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users own conditioned triggers" ON public."conditioned_triggers";
CREATE POLICY "Users own conditioned triggers" ON public."conditioned_triggers"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "conditioning_intensity_owner" ON public."conditioning_intensity";
CREATE POLICY "conditioning_intensity_owner" ON public."conditioning_intensity"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "cws_own_all" ON public."conditioning_lockdown_sessions";
CREATE POLICY "cws_own_all" ON public."conditioning_lockdown_sessions"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id))
  WITH CHECK (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "cw_own_all" ON public."conditioning_lockdown_windows";
CREATE POLICY "cw_own_all" ON public."conditioning_lockdown_windows"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id))
  WITH CHECK (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users access own conditioning" ON public."conditioning_pairs";
CREATE POLICY "Users access own conditioning" ON public."conditioning_pairs"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can manage their own conditioning_progress" ON public."conditioning_progress";
CREATE POLICY "Users can manage their own conditioning_progress" ON public."conditioning_progress"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users own conditioning protocols" ON public."conditioning_protocols";
CREATE POLICY "Users own conditioning protocols" ON public."conditioning_protocols"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users own conditioning sessions" ON public."conditioning_sessions";
CREATE POLICY "Users own conditioning sessions" ON public."conditioning_sessions"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users own their data" ON public."conditioning_sessions_v2";
CREATE POLICY "Users own their data" ON public."conditioning_sessions_v2"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can insert their own conditioning triggers" ON public."conditioning_triggers";
CREATE POLICY "Users can insert their own conditioning triggers" ON public."conditioning_triggers"
  AS PERMISSIVE
  FOR INSERT
  TO public
  WITH CHECK (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can update their own conditioning triggers" ON public."conditioning_triggers";
CREATE POLICY "Users can update their own conditioning triggers" ON public."conditioning_triggers"
  AS PERMISSIVE
  FOR UPDATE
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can view their own conditioning triggers" ON public."conditioning_triggers";
CREATE POLICY "Users can view their own conditioning triggers" ON public."conditioning_triggers"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "confession_queue_owner" ON public."confession_queue";
CREATE POLICY "confession_queue_owner" ON public."confession_queue"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id))
  WITH CHECK (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can manage own confessions" ON public."confessions";
CREATE POLICY "Users can manage own confessions" ON public."confessions"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can insert own consequence events" ON public."consequence_events";
CREATE POLICY "Users can insert own consequence events" ON public."consequence_events"
  AS PERMISSIVE
  FOR INSERT
  TO public
  WITH CHECK (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can view own consequence events" ON public."consequence_events";
CREATE POLICY "Users can view own consequence events" ON public."consequence_events"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users own consequence_history" ON public."consequence_history";
CREATE POLICY "Users own consequence_history" ON public."consequence_history"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can insert own consequence state" ON public."consequence_state";
CREATE POLICY "Users can insert own consequence state" ON public."consequence_state"
  AS PERMISSIVE
  FOR INSERT
  TO public
  WITH CHECK (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can update own consequence state" ON public."consequence_state";
CREATE POLICY "Users can update own consequence state" ON public."consequence_state"
  AS PERMISSIVE
  FOR UPDATE
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can view own consequence state" ON public."consequence_state";
CREATE POLICY "Users can view own consequence state" ON public."consequence_state"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "consumption_mandates_insert" ON public."consumption_mandates";
CREATE POLICY "consumption_mandates_insert" ON public."consumption_mandates"
  AS PERMISSIVE
  FOR INSERT
  TO public
  WITH CHECK (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "consumption_mandates_select" ON public."consumption_mandates";
CREATE POLICY "consumption_mandates_select" ON public."consumption_mandates"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "consumption_mandates_update" ON public."consumption_mandates";
CREATE POLICY "consumption_mandates_update" ON public."consumption_mandates"
  AS PERMISSIVE
  FOR UPDATE
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "contact_events own" ON public."contact_events";
CREATE POLICY "contact_events own" ON public."contact_events"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id))
  WITH CHECK (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "contact_handles own" ON public."contact_handles";
CREATE POLICY "contact_handles own" ON public."contact_handles"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id))
  WITH CHECK (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "contact_intelligence own" ON public."contact_intelligence";
CREATE POLICY "contact_intelligence own" ON public."contact_intelligence"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id))
  WITH CHECK (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "contacts own" ON public."contacts";
CREATE POLICY "contacts own" ON public."contacts"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id))
  WITH CHECK (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can insert own beats" ON public."content_beats";
CREATE POLICY "Users can insert own beats" ON public."content_beats"
  AS PERMISSIVE
  FOR INSERT
  TO public
  WITH CHECK (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can update own beats" ON public."content_beats";
CREATE POLICY "Users can update own beats" ON public."content_beats"
  AS PERMISSIVE
  FOR UPDATE
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can view own beats" ON public."content_beats";
CREATE POLICY "Users can view own beats" ON public."content_beats"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Service full content_briefs" ON public."content_briefs";
CREATE POLICY "Service full content_briefs" ON public."content_briefs"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.role()) = 'service_role'::text));

DROP POLICY IF EXISTS "Users read own briefs" ON public."content_briefs";
CREATE POLICY "Users read own briefs" ON public."content_briefs"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users update own briefs" ON public."content_briefs";
CREATE POLICY "Users update own briefs" ON public."content_briefs"
  AS PERMISSIVE
  FOR UPDATE
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can manage own content_calendar" ON public."content_calendar";
CREATE POLICY "Users can manage own content_calendar" ON public."content_calendar"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users own calendar" ON public."content_calendar";
CREATE POLICY "Users own calendar" ON public."content_calendar"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can manage their own content_consumption" ON public."content_consumption";
CREATE POLICY "Users can manage their own content_consumption" ON public."content_consumption"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users own their data" ON public."content_curriculum";
CREATE POLICY "Users own their data" ON public."content_curriculum"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can manage own content_distribution" ON public."content_distribution";
CREATE POLICY "Users can manage own content_distribution" ON public."content_distribution"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users access own content_escalation" ON public."content_escalation";
CREATE POLICY "Users access own content_escalation" ON public."content_escalation"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can access own content_escalation" ON public."content_escalation";
CREATE POLICY "Users can access own content_escalation" ON public."content_escalation"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users manage own content events" ON public."content_events";
CREATE POLICY "Users manage own content events" ON public."content_events"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users own content grades" ON public."content_grades";
CREATE POLICY "Users own content grades" ON public."content_grades"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Service full content_library" ON public."content_library";
CREATE POLICY "Service full content_library" ON public."content_library"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.role()) = 'service_role'::text));

DROP POLICY IF EXISTS "Users insert own content" ON public."content_library";
CREATE POLICY "Users insert own content" ON public."content_library"
  AS PERMISSIVE
  FOR INSERT
  TO public
  WITH CHECK (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users read own content" ON public."content_library";
CREATE POLICY "Users read own content" ON public."content_library"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can insert their own content audits" ON public."content_library_audit";
CREATE POLICY "Users can insert their own content audits" ON public."content_library_audit"
  AS PERMISSIVE
  FOR INSERT
  TO public
  WITH CHECK (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can update their own content audits" ON public."content_library_audit";
CREATE POLICY "Users can update their own content audits" ON public."content_library_audit"
  AS PERMISSIVE
  FOR UPDATE
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can view their own content audits" ON public."content_library_audit";
CREATE POLICY "Users can view their own content audits" ON public."content_library_audit"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "content_multiplication_plans_user" ON public."content_multiplication_plans";
CREATE POLICY "content_multiplication_plans_user" ON public."content_multiplication_plans"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users own performance" ON public."content_performance";
CREATE POLICY "Users own performance" ON public."content_performance"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users own snapshots" ON public."content_performance_snapshots";
CREATE POLICY "Users own snapshots" ON public."content_performance_snapshots"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can insert their own content permanence" ON public."content_permanence";
CREATE POLICY "Users can insert their own content permanence" ON public."content_permanence"
  AS PERMISSIVE
  FOR INSERT
  TO public
  WITH CHECK (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can update their own content permanence" ON public."content_permanence";
CREATE POLICY "Users can update their own content permanence" ON public."content_permanence"
  AS PERMISSIVE
  FOR UPDATE
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can view their own content permanence" ON public."content_permanence";
CREATE POLICY "Users can view their own content permanence" ON public."content_permanence"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can manage own content_permissions" ON public."content_permissions";
CREATE POLICY "Users can manage own content_permissions" ON public."content_permissions"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "content_plan own" ON public."content_plan";
CREATE POLICY "content_plan own" ON public."content_plan"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id))
  WITH CHECK (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users own posts" ON public."content_posts";
CREATE POLICY "Users own posts" ON public."content_posts"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "content_production_briefs own" ON public."content_production_briefs";
CREATE POLICY "content_production_briefs own" ON public."content_production_briefs"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id))
  WITH CHECK (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "content_queue_user" ON public."content_queue";
CREATE POLICY "content_queue_user" ON public."content_queue"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users access own content_references" ON public."content_references";
CREATE POLICY "Users access own content_references" ON public."content_references"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users own strategy" ON public."content_strategy_state";
CREATE POLICY "Users own strategy" ON public."content_strategy_state"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "content_submissions own" ON public."content_submissions";
CREATE POLICY "content_submissions own" ON public."content_submissions"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id))
  WITH CHECK (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can insert own vault content" ON public."content_vault";
CREATE POLICY "Users can insert own vault content" ON public."content_vault"
  AS PERMISSIVE
  FOR INSERT
  TO public
  WITH CHECK (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can update own vault content" ON public."content_vault";
CREATE POLICY "Users can update own vault content" ON public."content_vault"
  AS PERMISSIVE
  FOR UPDATE
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can view own vault content" ON public."content_vault";
CREATE POLICY "Users can view own vault content" ON public."content_vault"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users own vault" ON public."content_vault";
CREATE POLICY "Users own vault" ON public."content_vault"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "conversation_classifications_user_policy" ON public."conversation_classifications";
CREATE POLICY "conversation_classifications_user_policy" ON public."conversation_classifications"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "conv_quality_insert" ON public."conversation_quality_scores";
CREATE POLICY "conv_quality_insert" ON public."conversation_quality_scores"
  AS PERMISSIVE
  FOR INSERT
  TO public
  WITH CHECK (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "conv_quality_select" ON public."conversation_quality_scores";
CREATE POLICY "conv_quality_select" ON public."conversation_quality_scores"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "conv_ss_service_all" ON public."conversation_screenshots";
CREATE POLICY "conv_ss_service_all" ON public."conversation_screenshots"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING ((((SELECT auth.jwt()) ->> 'role'::text) = 'service_role'::text))
  WITH CHECK ((((SELECT auth.jwt()) ->> 'role'::text) = 'service_role'::text));

DROP POLICY IF EXISTS "conv_ss_user_insert" ON public."conversation_screenshots";
CREATE POLICY "conv_ss_user_insert" ON public."conversation_screenshots"
  AS PERMISSIVE
  FOR INSERT
  TO public
  WITH CHECK (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "conv_ss_user_select" ON public."conversation_screenshots";
CREATE POLICY "conv_ss_user_select" ON public."conversation_screenshots"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "conv_ss_user_update" ON public."conversation_screenshots";
CREATE POLICY "conv_ss_user_update" ON public."conversation_screenshots"
  AS PERMISSIVE
  FOR UPDATE
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "corruption_events_user" ON public."corruption_events";
CREATE POLICY "corruption_events_user" ON public."corruption_events"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "corruption_maintenance_user" ON public."corruption_maintenance_log";
CREATE POLICY "corruption_maintenance_user" ON public."corruption_maintenance_log"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users manage own corruption milestones" ON public."corruption_milestones";
CREATE POLICY "Users manage own corruption milestones" ON public."corruption_milestones"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "corruption_state_user" ON public."corruption_state";
CREATE POLICY "corruption_state_user" ON public."corruption_state"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can manage own covenant" ON public."covenant";
CREATE POLICY "Users can manage own covenant" ON public."covenant"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "creator_outreach_user" ON public."creator_outreach";
CREATE POLICY "creator_outreach_user" ON public."creator_outreach"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users access own crisis_kit" ON public."crisis_kit";
CREATE POLICY "Users access own crisis_kit" ON public."crisis_kit"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "service writes incons" ON public."cross_platform_inconsistencies";
CREATE POLICY "service writes incons" ON public."cross_platform_inconsistencies"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.role()) = 'service_role'::text))
  WITH CHECK (((SELECT auth.role()) = 'service_role'::text));

DROP POLICY IF EXISTS "user reads own incons" ON public."cross_platform_inconsistencies";
CREATE POLICY "user reads own incons" ON public."cross_platform_inconsistencies"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users own their data" ON public."cross_system_correlations";
CREATE POLICY "Users own their data" ON public."cross_system_correlations"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users own crossover" ON public."crossover_tracking";
CREATE POLICY "Users own crossover" ON public."crossover_tracking"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users manage own custom orders" ON public."custom_orders";
CREATE POLICY "Users manage own custom orders" ON public."custom_orders"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users access own daily_arousal_plans" ON public."daily_arousal_plans";
CREATE POLICY "Users access own daily_arousal_plans" ON public."daily_arousal_plans"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users access own plans" ON public."daily_arousal_plans";
CREATE POLICY "Users access own plans" ON public."daily_arousal_plans"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users own daily_arousal_plans" ON public."daily_arousal_plans";
CREATE POLICY "Users own daily_arousal_plans" ON public."daily_arousal_plans"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "dcs_service_all" ON public."daily_compliance_scores";
CREATE POLICY "dcs_service_all" ON public."daily_compliance_scores"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING ((((SELECT auth.jwt()) ->> 'role'::text) = 'service_role'::text))
  WITH CHECK ((((SELECT auth.jwt()) ->> 'role'::text) = 'service_role'::text));

DROP POLICY IF EXISTS "dcs_user_select" ON public."daily_compliance_scores";
CREATE POLICY "dcs_user_select" ON public."daily_compliance_scores"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users own daily_cycles" ON public."daily_cycles";
CREATE POLICY "Users own daily_cycles" ON public."daily_cycles"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Service full access enforcement_runs" ON public."daily_enforcement_runs";
CREATE POLICY "Service full access enforcement_runs" ON public."daily_enforcement_runs"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.role()) = 'service_role'::text));

DROP POLICY IF EXISTS "Users read own enforcement_runs" ON public."daily_enforcement_runs";
CREATE POLICY "Users read own enforcement_runs" ON public."daily_enforcement_runs"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users access own daily_entries" ON public."daily_entries";
CREATE POLICY "Users access own daily_entries" ON public."daily_entries"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "daily_entries_all" ON public."daily_entries";
CREATE POLICY "daily_entries_all" ON public."daily_entries"
  AS PERMISSIVE
  FOR ALL
  TO authenticated
  USING (((SELECT auth.uid()) = user_id))
  WITH CHECK (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can delete own completions" ON public."daily_goal_completions";
CREATE POLICY "Users can delete own completions" ON public."daily_goal_completions"
  AS PERMISSIVE
  FOR DELETE
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can insert own completions" ON public."daily_goal_completions";
CREATE POLICY "Users can insert own completions" ON public."daily_goal_completions"
  AS PERMISSIVE
  FOR INSERT
  TO public
  WITH CHECK (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can update own completions" ON public."daily_goal_completions";
CREATE POLICY "Users can update own completions" ON public."daily_goal_completions"
  AS PERMISSIVE
  FOR UPDATE
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can view own completions" ON public."daily_goal_completions";
CREATE POLICY "Users can view own completions" ON public."daily_goal_completions"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "daily_mandates_insert" ON public."daily_mandates";
CREATE POLICY "daily_mandates_insert" ON public."daily_mandates"
  AS PERMISSIVE
  FOR INSERT
  TO public
  WITH CHECK (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "daily_mandates_select" ON public."daily_mandates";
CREATE POLICY "daily_mandates_select" ON public."daily_mandates"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "daily_mandates_update" ON public."daily_mandates";
CREATE POLICY "daily_mandates_update" ON public."daily_mandates"
  AS PERMISSIVE
  FOR UPDATE
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users own daily_obligations" ON public."daily_obligations";
CREATE POLICY "Users own daily_obligations" ON public."daily_obligations"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "outfit_mandates_owner" ON public."daily_outfit_mandates";
CREATE POLICY "outfit_mandates_owner" ON public."daily_outfit_mandates"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id))
  WITH CHECK (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can insert own data" ON public."daily_prescriptions";
CREATE POLICY "Users can insert own data" ON public."daily_prescriptions"
  AS PERMISSIVE
  FOR INSERT
  TO public
  WITH CHECK (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can update own data" ON public."daily_prescriptions";
CREATE POLICY "Users can update own data" ON public."daily_prescriptions"
  AS PERMISSIVE
  FOR UPDATE
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can view own data" ON public."daily_prescriptions";
CREATE POLICY "Users can view own data" ON public."daily_prescriptions"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users own their prescriptions" ON public."daily_prescriptions";
CREATE POLICY "Users own their prescriptions" ON public."daily_prescriptions"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can delete own protein" ON public."daily_protein";
CREATE POLICY "Users can delete own protein" ON public."daily_protein"
  AS PERMISSIVE
  FOR DELETE
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can insert own protein" ON public."daily_protein";
CREATE POLICY "Users can insert own protein" ON public."daily_protein"
  AS PERMISSIVE
  FOR INSERT
  TO public
  WITH CHECK (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can update own protein" ON public."daily_protein";
CREATE POLICY "Users can update own protein" ON public."daily_protein"
  AS PERMISSIVE
  FOR UPDATE
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can view own protein" ON public."daily_protein";
CREATE POLICY "Users can view own protein" ON public."daily_protein"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "report_cards_insert" ON public."daily_report_cards";
CREATE POLICY "report_cards_insert" ON public."daily_report_cards"
  AS PERMISSIVE
  FOR INSERT
  TO public
  WITH CHECK (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "report_cards_select" ON public."daily_report_cards";
CREATE POLICY "report_cards_select" ON public."daily_report_cards"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "report_cards_update" ON public."daily_report_cards";
CREATE POLICY "report_cards_update" ON public."daily_report_cards"
  AS PERMISSIVE
  FOR UPDATE
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can delete own daily tasks" ON public."daily_tasks";
CREATE POLICY "Users can delete own daily tasks" ON public."daily_tasks"
  AS PERMISSIVE
  FOR DELETE
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can insert own daily tasks" ON public."daily_tasks";
CREATE POLICY "Users can insert own daily tasks" ON public."daily_tasks"
  AS PERMISSIVE
  FOR INSERT
  TO public
  WITH CHECK (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can update own daily tasks" ON public."daily_tasks";
CREATE POLICY "Users can update own daily tasks" ON public."daily_tasks"
  AS PERMISSIVE
  FOR UPDATE
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can view own daily tasks" ON public."daily_tasks";
CREATE POLICY "Users can view own daily tasks" ON public."daily_tasks"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users own daily_tasks" ON public."daily_tasks";
CREATE POLICY "Users own daily_tasks" ON public."daily_tasks"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "david_events_owner" ON public."david_emergence_events";
CREATE POLICY "david_events_owner" ON public."david_emergence_events"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id))
  WITH CHECK (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "decision_log_insert" ON public."decision_log";
CREATE POLICY "decision_log_insert" ON public."decision_log"
  AS PERMISSIVE
  FOR INSERT
  TO public
  WITH CHECK (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "decision_log_select" ON public."decision_log";
CREATE POLICY "decision_log_select" ON public."decision_log"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "decision_log_update" ON public."decision_log";
CREATE POLICY "decision_log_update" ON public."decision_log"
  AS PERMISSIVE
  FOR UPDATE
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "ddp_service_all" ON public."decree_difficulty_progression";
CREATE POLICY "ddp_service_all" ON public."decree_difficulty_progression"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING ((((SELECT auth.jwt()) ->> 'role'::text) = 'service_role'::text))
  WITH CHECK ((((SELECT auth.jwt()) ->> 'role'::text) = 'service_role'::text));

DROP POLICY IF EXISTS "ddp_user_select" ON public."decree_difficulty_progression";
CREATE POLICY "ddp_user_select" ON public."decree_difficulty_progression"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can manage their own degradation_responses" ON public."degradation_responses";
CREATE POLICY "Users can manage their own degradation_responses" ON public."degradation_responses"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can manage own deletion_attempts" ON public."deletion_attempts";
CREATE POLICY "Users can manage own deletion_attempts" ON public."deletion_attempts"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users own their data" ON public."denial_cycle_analytics";
CREATE POLICY "Users own their data" ON public."denial_cycle_analytics"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can manage their own denial_cycles" ON public."denial_cycles";
CREATE POLICY "Users can manage their own denial_cycles" ON public."denial_cycles"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users access own denial_state" ON public."denial_state";
CREATE POLICY "Users access own denial_state" ON public."denial_state"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users own denial_streaks" ON public."denial_streaks";
CREATE POLICY "Users own denial_streaks" ON public."denial_streaks"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users access own denial" ON public."denial_tracking";
CREATE POLICY "Users access own denial" ON public."denial_tracking"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can manage their own dependency_signals" ON public."dependency_signals";
CREATE POLICY "Users can manage their own dependency_signals" ON public."dependency_signals"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Service writes deploy health" ON public."deploy_health_log";
CREATE POLICY "Service writes deploy health" ON public."deploy_health_log"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.role()) = 'service_role'::text))
  WITH CHECK (((SELECT auth.role()) = 'service_role'::text));

DROP POLICY IF EXISTS "Users see own deploy health" ON public."deploy_health_log";
CREATE POLICY "Users see own deploy health" ON public."deploy_health_log"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "witnesses_insert" ON public."designated_witnesses";
CREATE POLICY "witnesses_insert" ON public."designated_witnesses"
  AS PERMISSIVE
  FOR INSERT
  TO public
  WITH CHECK (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "witnesses_select" ON public."designated_witnesses";
CREATE POLICY "witnesses_select" ON public."designated_witnesses"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "witnesses_update" ON public."designated_witnesses";
CREATE POLICY "witnesses_update" ON public."designated_witnesses"
  AS PERMISSIVE
  FOR UPDATE
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "desire_log_service_all" ON public."desire_log";
CREATE POLICY "desire_log_service_all" ON public."desire_log"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING ((((SELECT auth.jwt()) ->> 'role'::text) = 'service_role'::text))
  WITH CHECK ((((SELECT auth.jwt()) ->> 'role'::text) = 'service_role'::text));

DROP POLICY IF EXISTS "desire_log_user_select" ON public."desire_log";
CREATE POLICY "desire_log_user_select" ON public."desire_log"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users own device events" ON public."device_events";
CREATE POLICY "Users own device events" ON public."device_events"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users own device schedules" ON public."device_schedule";
CREATE POLICY "Users own device schedules" ON public."device_schedule"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "diet_log_owner" ON public."diet_log";
CREATE POLICY "diet_log_owner" ON public."diet_log"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "directive_outcomes_insert" ON public."directive_outcomes";
CREATE POLICY "directive_outcomes_insert" ON public."directive_outcomes"
  AS PERMISSIVE
  FOR INSERT
  TO public
  WITH CHECK (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "directive_outcomes_select" ON public."directive_outcomes";
CREATE POLICY "directive_outcomes_select" ON public."directive_outcomes"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "directive_outcomes_update" ON public."directive_outcomes";
CREATE POLICY "directive_outcomes_update" ON public."directive_outcomes"
  AS PERMISSIVE
  FOR UPDATE
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "disclosure_drafts_owner" ON public."disclosure_drafts";
CREATE POLICY "disclosure_drafts_owner" ON public."disclosure_drafts"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id))
  WITH CHECK (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "distress_events_owner" ON public."distress_events";
CREATE POLICY "distress_events_owner" ON public."distress_events"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users own dm poll state" ON public."dm_poll_state";
CREATE POLICY "Users own dm poll state" ON public."dm_poll_state"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "dm_templates_owner" ON public."dm_templates";
CREATE POLICY "dm_templates_owner" ON public."dm_templates"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id))
  WITH CHECK (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can insert own domain dependencies" ON public."domain_dependencies";
CREATE POLICY "Users can insert own domain dependencies" ON public."domain_dependencies"
  AS PERMISSIVE
  FOR INSERT
  TO public
  WITH CHECK (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can update own domain dependencies" ON public."domain_dependencies";
CREATE POLICY "Users can update own domain dependencies" ON public."domain_dependencies"
  AS PERMISSIVE
  FOR UPDATE
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can view own domain dependencies" ON public."domain_dependencies";
CREATE POLICY "Users can view own domain dependencies" ON public."domain_dependencies"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can insert own escalation state" ON public."domain_escalation_state";
CREATE POLICY "Users can insert own escalation state" ON public."domain_escalation_state"
  AS PERMISSIVE
  FOR INSERT
  TO public
  WITH CHECK (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can update own escalation state" ON public."domain_escalation_state";
CREATE POLICY "Users can update own escalation state" ON public."domain_escalation_state"
  AS PERMISSIVE
  FOR UPDATE
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can view own escalation state" ON public."domain_escalation_state";
CREATE POLICY "Users can view own escalation state" ON public."domain_escalation_state"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can manage own domain practice" ON public."domain_practice_log";
CREATE POLICY "Users can manage own domain practice" ON public."domain_practice_log"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can insert own domain state" ON public."domain_state";
CREATE POLICY "Users can insert own domain state" ON public."domain_state"
  AS PERMISSIVE
  FOR INSERT
  TO public
  WITH CHECK (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can update own domain state" ON public."domain_state";
CREATE POLICY "Users can update own domain state" ON public."domain_state"
  AS PERMISSIVE
  FOR UPDATE
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can view own domain state" ON public."domain_state";
CREATE POLICY "Users can view own domain state" ON public."domain_state"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users own dopamine state" ON public."dopamine_state";
CREATE POLICY "Users own dopamine state" ON public."dopamine_state"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users own doses" ON public."dose_log";
CREATE POLICY "Users own doses" ON public."dose_log"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can delete drills for own goals" ON public."drills";
CREATE POLICY "Users can delete drills for own goals" ON public."drills"
  AS PERMISSIVE
  FOR DELETE
  TO public
  USING ((EXISTS ( SELECT 1
   FROM goals
  WHERE ((goals.id = drills.goal_id) AND (goals.user_id = (SELECT auth.uid()))))));

DROP POLICY IF EXISTS "Users can insert drills for own goals" ON public."drills";
CREATE POLICY "Users can insert drills for own goals" ON public."drills"
  AS PERMISSIVE
  FOR INSERT
  TO public
  WITH CHECK ((EXISTS ( SELECT 1
   FROM goals
  WHERE ((goals.id = drills.goal_id) AND (goals.user_id = (SELECT auth.uid()))))));

DROP POLICY IF EXISTS "Users can update drills for own goals" ON public."drills";
CREATE POLICY "Users can update drills for own goals" ON public."drills"
  AS PERMISSIVE
  FOR UPDATE
  TO public
  USING ((EXISTS ( SELECT 1
   FROM goals
  WHERE ((goals.id = drills.goal_id) AND (goals.user_id = (SELECT auth.uid()))))));

DROP POLICY IF EXISTS "Users can view drills for own goals" ON public."drills";
CREATE POLICY "Users can view drills for own goals" ON public."drills"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING ((EXISTS ( SELECT 1
   FROM goals
  WHERE ((goals.id = drills.goal_id) AND (goals.user_id = (SELECT auth.uid()))))));

DROP POLICY IF EXISTS "Users can insert own dynamic levels" ON public."dynamic_levels";
CREATE POLICY "Users can insert own dynamic levels" ON public."dynamic_levels"
  AS PERMISSIVE
  FOR INSERT
  TO public
  WITH CHECK (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can update own dynamic levels" ON public."dynamic_levels";
CREATE POLICY "Users can update own dynamic levels" ON public."dynamic_levels"
  AS PERMISSIVE
  FOR UPDATE
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can view own dynamic levels" ON public."dynamic_levels";
CREATE POLICY "Users can view own dynamic levels" ON public."dynamic_levels"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can insert own dynamic task state" ON public."dynamic_task_state";
CREATE POLICY "Users can insert own dynamic task state" ON public."dynamic_task_state"
  AS PERMISSIVE
  FOR INSERT
  TO public
  WITH CHECK (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can update own dynamic task state" ON public."dynamic_task_state";
CREATE POLICY "Users can update own dynamic task state" ON public."dynamic_task_state"
  AS PERMISSIVE
  FOR UPDATE
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can view own dynamic task state" ON public."dynamic_task_state";
CREATE POLICY "Users can view own dynamic task state" ON public."dynamic_task_state"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "dysphoria_diary_owner" ON public."dysphoria_diary_prompts";
CREATE POLICY "dysphoria_diary_owner" ON public."dysphoria_diary_prompts"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can insert own edge events" ON public."edge_events";
CREATE POLICY "Users can insert own edge events" ON public."edge_events"
  AS PERMISSIVE
  FOR INSERT
  TO public
  WITH CHECK (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can view own edge events" ON public."edge_events";
CREATE POLICY "Users can view own edge events" ON public."edge_events"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users access own edge_logs" ON public."edge_logs";
CREATE POLICY "Users access own edge_logs" ON public."edge_logs"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can insert own sessions" ON public."edge_sessions";
CREATE POLICY "Users can insert own sessions" ON public."edge_sessions"
  AS PERMISSIVE
  FOR INSERT
  TO public
  WITH CHECK (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can update own sessions" ON public."edge_sessions";
CREATE POLICY "Users can update own sessions" ON public."edge_sessions"
  AS PERMISSIVE
  FOR UPDATE
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can view own sessions" ON public."edge_sessions";
CREATE POLICY "Users can view own sessions" ON public."edge_sessions"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "encounter_content_delete" ON public."encounter_content";
CREATE POLICY "encounter_content_delete" ON public."encounter_content"
  AS PERMISSIVE
  FOR DELETE
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "encounter_content_insert" ON public."encounter_content";
CREATE POLICY "encounter_content_insert" ON public."encounter_content"
  AS PERMISSIVE
  FOR INSERT
  TO public
  WITH CHECK (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "encounter_content_select" ON public."encounter_content";
CREATE POLICY "encounter_content_select" ON public."encounter_content"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "encounter_content_update" ON public."encounter_content";
CREATE POLICY "encounter_content_update" ON public."encounter_content"
  AS PERMISSIVE
  FOR UPDATE
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "encounters_delete" ON public."encounters";
CREATE POLICY "encounters_delete" ON public."encounters"
  AS PERMISSIVE
  FOR DELETE
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "encounters_insert" ON public."encounters";
CREATE POLICY "encounters_insert" ON public."encounters"
  AS PERMISSIVE
  FOR INSERT
  TO public
  WITH CHECK (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "encounters_select" ON public."encounters";
CREATE POLICY "encounters_select" ON public."encounters"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "encounters_update" ON public."encounters";
CREATE POLICY "encounters_update" ON public."encounters"
  AS PERMISSIVE
  FOR UPDATE
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Service full access enforcement_config" ON public."enforcement_config";
CREATE POLICY "Service full access enforcement_config" ON public."enforcement_config"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.role()) = 'service_role'::text));

DROP POLICY IF EXISTS "Users insert own enforcement_config" ON public."enforcement_config";
CREATE POLICY "Users insert own enforcement_config" ON public."enforcement_config"
  AS PERMISSIVE
  FOR INSERT
  TO public
  WITH CHECK (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users read own enforcement_config" ON public."enforcement_config";
CREATE POLICY "Users read own enforcement_config" ON public."enforcement_config"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users update own enforcement_config" ON public."enforcement_config";
CREATE POLICY "Users update own enforcement_config" ON public."enforcement_config"
  AS PERMISSIVE
  FOR UPDATE
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Service full access enforcement_log" ON public."enforcement_log";
CREATE POLICY "Service full access enforcement_log" ON public."enforcement_log"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.role()) = 'service_role'::text));

DROP POLICY IF EXISTS "Users read own enforcement_log" ON public."enforcement_log";
CREATE POLICY "Users read own enforcement_log" ON public."enforcement_log"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users update own enforcement_log" ON public."enforcement_log";
CREATE POLICY "Users update own enforcement_log" ON public."enforcement_log"
  AS PERMISSIVE
  FOR UPDATE
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users read own engagement_targets" ON public."engagement_targets";
CREATE POLICY "Users read own engagement_targets" ON public."engagement_targets"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users own erotic preference profile" ON public."erotic_preference_profile";
CREATE POLICY "Users own erotic preference profile" ON public."erotic_preference_profile"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can insert own escalation events" ON public."escalation_advancement_events";
CREATE POLICY "Users can insert own escalation events" ON public."escalation_advancement_events"
  AS PERMISSIVE
  FOR INSERT
  TO public
  WITH CHECK (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can view own escalation events" ON public."escalation_advancement_events";
CREATE POLICY "Users can view own escalation events" ON public."escalation_advancement_events"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users access own escalation_events" ON public."escalation_events";
CREATE POLICY "Users access own escalation_events" ON public."escalation_events"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can access own escalation_events" ON public."escalation_events";
CREATE POLICY "Users can access own escalation_events" ON public."escalation_events"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users access own escalation_experiments" ON public."escalation_experiments";
CREATE POLICY "Users access own escalation_experiments" ON public."escalation_experiments"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can view own escalation experiments" ON public."escalation_experiments";
CREATE POLICY "Users can view own escalation experiments" ON public."escalation_experiments"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users access own escalation_state" ON public."escalation_state";
CREATE POLICY "Users access own escalation_state" ON public."escalation_state"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can access own escalation_state" ON public."escalation_state";
CREATE POLICY "Users can access own escalation_state" ON public."escalation_state"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "escrow_deposits_owner" ON public."escrow_deposits";
CREATE POLICY "escrow_deposits_owner" ON public."escrow_deposits"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can manage their own euphoria_captures" ON public."euphoria_captures";
CREATE POLICY "Users can manage their own euphoria_captures" ON public."euphoria_captures"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can insert own events" ON public."event_log";
CREATE POLICY "Users can insert own events" ON public."event_log"
  AS PERMISSIVE
  FOR INSERT
  TO public
  WITH CHECK (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can view own events" ON public."event_log";
CREATE POLICY "Users can view own events" ON public."event_log"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can manage own evidence" ON public."evidence";
CREATE POLICY "Users can manage own evidence" ON public."evidence"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users access own evidence" ON public."evidence_captures";
CREATE POLICY "Users access own evidence" ON public."evidence_captures"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "evidence_owner" ON public."evidence_reports";
CREATE POLICY "evidence_owner" ON public."evidence_reports"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id))
  WITH CHECK (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can insert own exercise domain config" ON public."exercise_domain_config";
CREATE POLICY "Users can insert own exercise domain config" ON public."exercise_domain_config"
  AS PERMISSIVE
  FOR INSERT
  TO public
  WITH CHECK (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can update own exercise domain config" ON public."exercise_domain_config";
CREATE POLICY "Users can update own exercise domain config" ON public."exercise_domain_config"
  AS PERMISSIVE
  FOR UPDATE
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can view own exercise domain config" ON public."exercise_domain_config";
CREATE POLICY "Users can view own exercise domain config" ON public."exercise_domain_config"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "exercise_prescriptions_insert" ON public."exercise_prescriptions";
CREATE POLICY "exercise_prescriptions_insert" ON public."exercise_prescriptions"
  AS PERMISSIVE
  FOR INSERT
  TO public
  WITH CHECK (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "exercise_prescriptions_select" ON public."exercise_prescriptions";
CREATE POLICY "exercise_prescriptions_select" ON public."exercise_prescriptions"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "exercise_prescriptions_update" ON public."exercise_prescriptions";
CREATE POLICY "exercise_prescriptions_update" ON public."exercise_prescriptions"
  AS PERMISSIVE
  FOR UPDATE
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can insert own exercise progressions" ON public."exercise_progressions";
CREATE POLICY "Users can insert own exercise progressions" ON public."exercise_progressions"
  AS PERMISSIVE
  FOR INSERT
  TO public
  WITH CHECK (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can view own exercise progressions" ON public."exercise_progressions";
CREATE POLICY "Users can view own exercise progressions" ON public."exercise_progressions"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can delete own exercise sessions" ON public."exercise_sessions";
CREATE POLICY "Users can delete own exercise sessions" ON public."exercise_sessions"
  AS PERMISSIVE
  FOR DELETE
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can insert own exercise sessions" ON public."exercise_sessions";
CREATE POLICY "Users can insert own exercise sessions" ON public."exercise_sessions"
  AS PERMISSIVE
  FOR INSERT
  TO public
  WITH CHECK (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can update own exercise sessions" ON public."exercise_sessions";
CREATE POLICY "Users can update own exercise sessions" ON public."exercise_sessions"
  AS PERMISSIVE
  FOR UPDATE
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can view own exercise sessions" ON public."exercise_sessions";
CREATE POLICY "Users can view own exercise sessions" ON public."exercise_sessions"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can delete own exercise streaks" ON public."exercise_streaks";
CREATE POLICY "Users can delete own exercise streaks" ON public."exercise_streaks"
  AS PERMISSIVE
  FOR DELETE
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can insert own exercise streaks" ON public."exercise_streaks";
CREATE POLICY "Users can insert own exercise streaks" ON public."exercise_streaks"
  AS PERMISSIVE
  FOR INSERT
  TO public
  WITH CHECK (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can update own exercise streaks" ON public."exercise_streaks";
CREATE POLICY "Users can update own exercise streaks" ON public."exercise_streaks"
  AS PERMISSIVE
  FOR UPDATE
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can view own exercise streaks" ON public."exercise_streaks";
CREATE POLICY "Users can view own exercise streaks" ON public."exercise_streaks"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "exposure_history_insert" ON public."exposure_history";
CREATE POLICY "exposure_history_insert" ON public."exposure_history"
  AS PERMISSIVE
  FOR INSERT
  TO public
  WITH CHECK (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "exposure_history_select" ON public."exposure_history";
CREATE POLICY "exposure_history_select" ON public."exposure_history"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "exposure_history_update" ON public."exposure_history";
CREATE POLICY "exposure_history_update" ON public."exposure_history"
  AS PERMISSIVE
  FOR UPDATE
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users own exposure mandates" ON public."exposure_mandates";
CREATE POLICY "Users own exposure mandates" ON public."exposure_mandates"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "external_content_index_delete" ON public."external_content_index";
CREATE POLICY "external_content_index_delete" ON public."external_content_index"
  AS PERMISSIVE
  FOR DELETE
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "external_content_index_insert" ON public."external_content_index";
CREATE POLICY "external_content_index_insert" ON public."external_content_index"
  AS PERMISSIVE
  FOR INSERT
  TO public
  WITH CHECK (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "external_content_index_select" ON public."external_content_index";
CREATE POLICY "external_content_index_select" ON public."external_content_index"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "external_content_index_update" ON public."external_content_index";
CREATE POLICY "external_content_index_update" ON public."external_content_index"
  AS PERMISSIVE
  FOR UPDATE
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users access own failure_mode_events" ON public."failure_mode_events";
CREATE POLICY "Users access own failure_mode_events" ON public."failure_mode_events"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "failure_recovery_events_insert" ON public."failure_recovery_events";
CREATE POLICY "failure_recovery_events_insert" ON public."failure_recovery_events"
  AS PERMISSIVE
  FOR INSERT
  TO public
  WITH CHECK (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "failure_recovery_events_select" ON public."failure_recovery_events";
CREATE POLICY "failure_recovery_events_select" ON public."failure_recovery_events"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "failure_recovery_events_update" ON public."failure_recovery_events";
CREATE POLICY "failure_recovery_events_update" ON public."failure_recovery_events"
  AS PERMISSIVE
  FOR UPDATE
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users own interactions" ON public."fan_interactions";
CREATE POLICY "Users own interactions" ON public."fan_interactions"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can manage own fan_messages" ON public."fan_messages";
CREATE POLICY "Users can manage own fan_messages" ON public."fan_messages"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Service role full access" ON public."fan_polls";
CREATE POLICY "Service role full access" ON public."fan_polls"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING ((((SELECT auth.jwt()) ->> 'role'::text) = 'service_role'::text));

DROP POLICY IF EXISTS "Users can insert own fan polls" ON public."fan_polls";
CREATE POLICY "Users can insert own fan polls" ON public."fan_polls"
  AS PERMISSIVE
  FOR INSERT
  TO public
  WITH CHECK (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can update own fan polls" ON public."fan_polls";
CREATE POLICY "Users can update own fan polls" ON public."fan_polls"
  AS PERMISSIVE
  FOR UPDATE
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can view own fan polls" ON public."fan_polls";
CREATE POLICY "Users can view own fan polls" ON public."fan_polls"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can manage own fan_profiles" ON public."fan_profiles";
CREATE POLICY "Users can manage own fan_profiles" ON public."fan_profiles"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can manage own fantasy architecture" ON public."fantasy_architecture";
CREATE POLICY "Users can manage own fantasy architecture" ON public."fantasy_architecture"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "fantasy_journal_insert" ON public."fantasy_journal";
CREATE POLICY "fantasy_journal_insert" ON public."fantasy_journal"
  AS PERMISSIVE
  FOR INSERT
  TO public
  WITH CHECK (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "fantasy_journal_select" ON public."fantasy_journal";
CREATE POLICY "fantasy_journal_select" ON public."fantasy_journal"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can manage own favorites snapshots" ON public."favorites_snapshots";
CREATE POLICY "Users can manage own favorites snapshots" ON public."favorites_snapshots"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "habit_streaks_insert" ON public."feminine_habit_streaks";
CREATE POLICY "habit_streaks_insert" ON public."feminine_habit_streaks"
  AS PERMISSIVE
  FOR INSERT
  TO public
  WITH CHECK (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "habit_streaks_select" ON public."feminine_habit_streaks";
CREATE POLICY "habit_streaks_select" ON public."feminine_habit_streaks"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "habit_streaks_update" ON public."feminine_habit_streaks";
CREATE POLICY "habit_streaks_update" ON public."feminine_habit_streaks"
  AS PERMISSIVE
  FOR UPDATE
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "feminine_self_insert_own" ON public."feminine_self";
CREATE POLICY "feminine_self_insert_own" ON public."feminine_self"
  AS PERMISSIVE
  FOR INSERT
  TO public
  WITH CHECK (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "feminine_self_select_own" ON public."feminine_self";
CREATE POLICY "feminine_self_select_own" ON public."feminine_self"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "feminine_self_service_all" ON public."feminine_self";
CREATE POLICY "feminine_self_service_all" ON public."feminine_self"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.role()) = 'service_role'::text))
  WITH CHECK (((SELECT auth.role()) = 'service_role'::text));

DROP POLICY IF EXISTS "feminine_self_update_own" ON public."feminine_self";
CREATE POLICY "feminine_self_update_own" ON public."feminine_self"
  AS PERMISSIVE
  FOR UPDATE
  TO public
  USING (((SELECT auth.uid()) = user_id))
  WITH CHECK (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users access own state_logs" ON public."feminine_state_logs";
CREATE POLICY "Users access own state_logs" ON public."feminine_state_logs"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "fbt_owner" ON public."feminization_budget_targets";
CREATE POLICY "fbt_owner" ON public."feminization_budget_targets"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id))
  WITH CHECK (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "investment_insert" ON public."feminization_investment";
CREATE POLICY "investment_insert" ON public."feminization_investment"
  AS PERMISSIVE
  FOR INSERT
  TO public
  WITH CHECK (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "investment_select" ON public."feminization_investment";
CREATE POLICY "investment_select" ON public."feminization_investment"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "investment_update" ON public."feminization_investment";
CREATE POLICY "investment_update" ON public."feminization_investment"
  AS PERMISSIVE
  FOR UPDATE
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "feminization_prescriptions_owner" ON public."feminization_prescriptions";
CREATE POLICY "feminization_prescriptions_owner" ON public."feminization_prescriptions"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id))
  WITH CHECK (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Service full feminization_purchases" ON public."feminization_purchases";
CREATE POLICY "Service full feminization_purchases" ON public."feminization_purchases"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.role()) = 'service_role'::text));

DROP POLICY IF EXISTS "Users read own purchases" ON public."feminization_purchases";
CREATE POLICY "Users read own purchases" ON public."feminization_purchases"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users manage own targets" ON public."feminization_targets";
CREATE POLICY "Users manage own targets" ON public."feminization_targets"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "financial_bleed_owner" ON public."financial_bleed_events";
CREATE POLICY "financial_bleed_owner" ON public."financial_bleed_events"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Service full access financial" ON public."financial_consequences";
CREATE POLICY "Service full access financial" ON public."financial_consequences"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.role()) = 'service_role'::text));

DROP POLICY IF EXISTS "Users read own financial" ON public."financial_consequences";
CREATE POLICY "Users read own financial" ON public."financial_consequences"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can manage own findom" ON public."findom_relationships";
CREATE POLICY "Users can manage own findom" ON public."findom_relationships"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can view own findom" ON public."findom_relationships";
CREATE POLICY "Users can view own findom" ON public."findom_relationships"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can manage own findom state" ON public."findom_state";
CREATE POLICY "Users can manage own findom state" ON public."findom_state"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can view own findom state" ON public."findom_state";
CREATE POLICY "Users can view own findom state" ON public."findom_state"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can manage own first_milestones" ON public."first_milestones";
CREATE POLICY "Users can manage own first_milestones" ON public."first_milestones"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can manage their own forced_escalations" ON public."forced_escalations";
CREATE POLICY "Users can manage their own forced_escalations" ON public."forced_escalations"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "forced_lockdown_owner" ON public."forced_lockdown_triggers";
CREATE POLICY "forced_lockdown_owner" ON public."forced_lockdown_triggers"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id))
  WITH CHECK (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users own their data" ON public."freebusy_cache";
CREATE POLICY "Users own their data" ON public."freebusy_cache"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Service full fund_transactions" ON public."fund_transactions";
CREATE POLICY "Service full fund_transactions" ON public."fund_transactions"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.role()) = 'service_role'::text));

DROP POLICY IF EXISTS "Users read own transactions" ON public."fund_transactions";
CREATE POLICY "Users read own transactions" ON public."fund_transactions"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can insert own milestones" ON public."funding_milestones";
CREATE POLICY "Users can insert own milestones" ON public."funding_milestones"
  AS PERMISSIVE
  FOR INSERT
  TO public
  WITH CHECK (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can update own milestones" ON public."funding_milestones";
CREATE POLICY "Users can update own milestones" ON public."funding_milestones"
  AS PERMISSIVE
  FOR UPDATE
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can view own milestones" ON public."funding_milestones";
CREATE POLICY "Users can view own milestones" ON public."funding_milestones"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can view own gaslighting effectiveness" ON public."gaslighting_effectiveness";
CREATE POLICY "Users can view own gaslighting effectiveness" ON public."gaslighting_effectiveness"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users own their data" ON public."generated_scripts";
CREATE POLICY "Users own their data" ON public."generated_scripts"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users own generated sessions" ON public."generated_sessions";
CREATE POLICY "Users own generated sessions" ON public."generated_sessions"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can read own generated tasks" ON public."generated_tasks";
CREATE POLICY "Users can read own generated tasks" ON public."generated_tasks"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users read own gfe_subscribers" ON public."gfe_subscribers";
CREATE POLICY "Users read own gfe_subscribers" ON public."gfe_subscribers"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "gfe_subscriptions_user" ON public."gfe_subscriptions";
CREATE POLICY "gfe_subscriptions_user" ON public."gfe_subscriptions"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users see own tokens" ON public."gina_access_tokens";
CREATE POLICY "Users see own tokens" ON public."gina_access_tokens"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users access own gina_arc_state" ON public."gina_arc_state";
CREATE POLICY "Users access own gina_arc_state" ON public."gina_arc_state"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users own grants" ON public."gina_capability_grants";
CREATE POLICY "Users own grants" ON public."gina_capability_grants"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users own comfort map" ON public."gina_comfort_map";
CREATE POLICY "Users own comfort map" ON public."gina_comfort_map"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users access own gina_commands" ON public."gina_commands";
CREATE POLICY "Users access own gina_commands" ON public."gina_commands"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users access own gina_control" ON public."gina_control_domains";
CREATE POLICY "Users access own gina_control" ON public."gina_control_domains"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can view own conversion state" ON public."gina_conversion_state";
CREATE POLICY "Users can view own conversion state" ON public."gina_conversion_state"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users access own gina_disclosure_map" ON public."gina_disclosure_map";
CREATE POLICY "Users access own gina_disclosure_map" ON public."gina_disclosure_map"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users own disclosure schedule" ON public."gina_disclosure_schedule";
CREATE POLICY "Users own disclosure schedule" ON public."gina_disclosure_schedule"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users own signals" ON public."gina_disclosure_signals";
CREATE POLICY "Users own signals" ON public."gina_disclosure_signals"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can insert their own gina discovery state" ON public."gina_discovery_state";
CREATE POLICY "Users can insert their own gina discovery state" ON public."gina_discovery_state"
  AS PERMISSIVE
  FOR INSERT
  TO public
  WITH CHECK (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can update their own gina discovery state" ON public."gina_discovery_state";
CREATE POLICY "Users can update their own gina discovery state" ON public."gina_discovery_state"
  AS PERMISSIVE
  FOR UPDATE
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can view their own gina discovery state" ON public."gina_discovery_state";
CREATE POLICY "Users can view their own gina discovery state" ON public."gina_discovery_state"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users access own gina_emergence" ON public."gina_emergence";
CREATE POLICY "Users access own gina_emergence" ON public."gina_emergence"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can manage their own gina_evidence" ON public."gina_evidence";
CREATE POLICY "Users can manage their own gina_evidence" ON public."gina_evidence"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users access own gina_influence" ON public."gina_influence_pipeline";
CREATE POLICY "Users access own gina_influence" ON public."gina_influence_pipeline"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "gina_progress_insert" ON public."gina_integration_progress";
CREATE POLICY "gina_progress_insert" ON public."gina_integration_progress"
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "gina_progress_select" ON public."gina_integration_progress";
CREATE POLICY "gina_progress_select" ON public."gina_integration_progress"
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "gina_progress_update" ON public."gina_integration_progress";
CREATE POLICY "gina_progress_update" ON public."gina_integration_progress"
  AS PERMISSIVE
  FOR UPDATE
  TO authenticated
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can insert own interactions" ON public."gina_interaction_log";
CREATE POLICY "Users can insert own interactions" ON public."gina_interaction_log"
  AS PERMISSIVE
  FOR INSERT
  TO public
  WITH CHECK (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can view own interaction log" ON public."gina_interaction_log";
CREATE POLICY "Users can view own interaction log" ON public."gina_interaction_log"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users access own gina_interactions" ON public."gina_interactions";
CREATE POLICY "Users access own gina_interactions" ON public."gina_interactions"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can insert own Gina interactions" ON public."gina_interactions";
CREATE POLICY "Users can insert own Gina interactions" ON public."gina_interactions"
  AS PERMISSIVE
  FOR INSERT
  TO public
  WITH CHECK (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can view own Gina interactions" ON public."gina_interactions";
CREATE POLICY "Users can view own Gina interactions" ON public."gina_interactions"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "gina_interactions_owner" ON public."gina_interactions";
CREATE POLICY "gina_interactions_owner" ON public."gina_interactions"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id))
  WITH CHECK (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can insert their own gina investments" ON public."gina_investments";
CREATE POLICY "Users can insert their own gina investments" ON public."gina_investments"
  AS PERMISSIVE
  FOR INSERT
  TO public
  WITH CHECK (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can update their own gina investments" ON public."gina_investments";
CREATE POLICY "Users can update their own gina investments" ON public."gina_investments"
  AS PERMISSIVE
  FOR UPDATE
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can view their own gina investments" ON public."gina_investments";
CREATE POLICY "Users can view their own gina investments" ON public."gina_investments"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users access own gina_ladder_state" ON public."gina_ladder_state";
CREATE POLICY "Users access own gina_ladder_state" ON public."gina_ladder_state"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users access own gina_measurements" ON public."gina_measurements";
CREATE POLICY "Users access own gina_measurements" ON public."gina_measurements"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users own their data" ON public."gina_micro_exposures";
CREATE POLICY "Users own their data" ON public."gina_micro_exposures"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can update own missions" ON public."gina_missions";
CREATE POLICY "Users can update own missions" ON public."gina_missions"
  AS PERMISSIVE
  FOR UPDATE
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can view own missions" ON public."gina_missions";
CREATE POLICY "Users can view own missions" ON public."gina_missions"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users access own gina_opportunities" ON public."gina_opportunities";
CREATE POLICY "Users access own gina_opportunities" ON public."gina_opportunities"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users manage own gina playbook" ON public."gina_playbook";
CREATE POLICY "Users manage own gina playbook" ON public."gina_playbook"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id))
  WITH CHECK (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users manage own gina profile" ON public."gina_profile";
CREATE POLICY "Users manage own gina profile" ON public."gina_profile"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id))
  WITH CHECK (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "gp_own" ON public."gina_profile";
CREATE POLICY "gp_own" ON public."gina_profile"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id))
  WITH CHECK (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users manage own gina reactions" ON public."gina_reactions";
CREATE POLICY "Users manage own gina reactions" ON public."gina_reactions"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id))
  WITH CHECK (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users own release windows" ON public."gina_release_windows";
CREATE POLICY "Users own release windows" ON public."gina_release_windows"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users access own gina_seed_log" ON public."gina_seed_log";
CREATE POLICY "Users access own gina_seed_log" ON public."gina_seed_log"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users manage own gina session recordings" ON public."gina_session_recordings";
CREATE POLICY "Users manage own gina session recordings" ON public."gina_session_recordings"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id))
  WITH CHECK (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can insert own Gina state" ON public."gina_state";
CREATE POLICY "Users can insert own Gina state" ON public."gina_state"
  AS PERMISSIVE
  FOR INSERT
  TO public
  WITH CHECK (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can update own Gina state" ON public."gina_state";
CREATE POLICY "Users can update own Gina state" ON public."gina_state"
  AS PERMISSIVE
  FOR UPDATE
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can view own Gina state" ON public."gina_state";
CREATE POLICY "Users can view own Gina state" ON public."gina_state"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users own timing" ON public."gina_timing_data";
CREATE POLICY "Users own timing" ON public."gina_timing_data"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users manage own gina voice samples" ON public."gina_voice_samples";
CREATE POLICY "Users manage own gina voice samples" ON public."gina_voice_samples"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id))
  WITH CHECK (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "gvs_own" ON public."gina_voice_samples";
CREATE POLICY "gvs_own" ON public."gina_voice_samples"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id))
  WITH CHECK (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users manage own gina warmup queue" ON public."gina_warmup_queue";
CREATE POLICY "Users manage own gina warmup queue" ON public."gina_warmup_queue"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id))
  WITH CHECK (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "glp1_side_effects_owner" ON public."glp1_side_effects";
CREATE POLICY "glp1_side_effects_owner" ON public."glp1_side_effects"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can delete own goals" ON public."goals";
CREATE POLICY "Users can delete own goals" ON public."goals"
  AS PERMISSIVE
  FOR DELETE
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can insert own goals" ON public."goals";
CREATE POLICY "Users can insert own goals" ON public."goals"
  AS PERMISSIVE
  FOR INSERT
  TO public
  WITH CHECK (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can manage their own goals" ON public."goals";
CREATE POLICY "Users can manage their own goals" ON public."goals"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can update own goals" ON public."goals";
CREATE POLICY "Users can update own goals" ON public."goals"
  AS PERMISSIVE
  FOR UPDATE
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can view own goals" ON public."goals";
CREATE POLICY "Users can view own goals" ON public."goals"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "good_girl_points_owner" ON public."good_girl_points";
CREATE POLICY "good_girl_points_owner" ON public."good_girl_points"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id))
  WITH CHECK (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users own guy_mode_tracking" ON public."guy_mode_tracking";
CREATE POLICY "Users own guy_mode_tracking" ON public."guy_mode_tracking"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can insert own handler action log" ON public."handler_action_log";
CREATE POLICY "Users can insert own handler action log" ON public."handler_action_log"
  AS PERMISSIVE
  FOR INSERT
  TO public
  WITH CHECK (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can view own handler action log" ON public."handler_action_log";
CREATE POLICY "Users can view own handler action log" ON public."handler_action_log"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "handler_ai_logs_insert" ON public."handler_ai_logs";
CREATE POLICY "handler_ai_logs_insert" ON public."handler_ai_logs"
  AS PERMISSIVE
  FOR INSERT
  TO public
  WITH CHECK (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "handler_ai_logs_select" ON public."handler_ai_logs";
CREATE POLICY "handler_ai_logs_select" ON public."handler_ai_logs"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users own attention queue" ON public."handler_attention";
CREATE POLICY "Users own attention queue" ON public."handler_attention"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Service role manages audit findings" ON public."handler_audit_findings";
CREATE POLICY "Service role manages audit findings" ON public."handler_audit_findings"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.role()) = 'service_role'::text));

DROP POLICY IF EXISTS "Users see their own audit findings" ON public."handler_audit_findings";
CREATE POLICY "Users see their own audit findings" ON public."handler_audit_findings"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can view own authority" ON public."handler_authority";
CREATE POLICY "Users can view own authority" ON public."handler_authority"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "handler_autonomous_actions_user" ON public."handler_autonomous_actions";
CREATE POLICY "handler_autonomous_actions_user" ON public."handler_autonomous_actions"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "handler_briefing own" ON public."handler_briefing";
CREATE POLICY "handler_briefing own" ON public."handler_briefing"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id))
  WITH CHECK (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can insert own handler budget" ON public."handler_budget";
CREATE POLICY "Users can insert own handler budget" ON public."handler_budget"
  AS PERMISSIVE
  FOR INSERT
  TO public
  WITH CHECK (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can update own handler budget" ON public."handler_budget";
CREATE POLICY "Users can update own handler budget" ON public."handler_budget"
  AS PERMISSIVE
  FOR UPDATE
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can view own handler budget" ON public."handler_budget";
CREATE POLICY "Users can view own handler budget" ON public."handler_budget"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users own calendar" ON public."handler_calendar";
CREATE POLICY "Users own calendar" ON public."handler_calendar"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users manage own commitments" ON public."handler_commitments";
CREATE POLICY "Users manage own commitments" ON public."handler_commitments"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id))
  WITH CHECK (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users own compliance" ON public."handler_compliance";
CREATE POLICY "Users own compliance" ON public."handler_compliance"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users own their data" ON public."handler_conversation_agenda";
CREATE POLICY "Users own their data" ON public."handler_conversation_agenda"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users own conversations" ON public."handler_conversations";
CREATE POLICY "Users own conversations" ON public."handler_conversations"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "agenda_insert" ON public."handler_daily_agenda";
CREATE POLICY "agenda_insert" ON public."handler_daily_agenda"
  AS PERMISSIVE
  FOR INSERT
  TO public
  WITH CHECK (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "agenda_select" ON public."handler_daily_agenda";
CREATE POLICY "agenda_select" ON public."handler_daily_agenda"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "agenda_update" ON public."handler_daily_agenda";
CREATE POLICY "agenda_update" ON public."handler_daily_agenda"
  AS PERMISSIVE
  FOR UPDATE
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users access own daily_plans" ON public."handler_daily_plans";
CREATE POLICY "Users access own daily_plans" ON public."handler_daily_plans"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users access own handler_daily_plans" ON public."handler_daily_plans";
CREATE POLICY "Users access own handler_daily_plans" ON public."handler_daily_plans"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Service full handler_decisions" ON public."handler_decisions";
CREATE POLICY "Service full handler_decisions" ON public."handler_decisions"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.role()) = 'service_role'::text));

DROP POLICY IF EXISTS "Users read own decisions" ON public."handler_decisions";
CREATE POLICY "Users read own decisions" ON public."handler_decisions"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "handler_decrees_owner" ON public."handler_decrees";
CREATE POLICY "handler_decrees_owner" ON public."handler_decrees"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id))
  WITH CHECK (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "desires_insert" ON public."handler_desires";
CREATE POLICY "desires_insert" ON public."handler_desires"
  AS PERMISSIVE
  FOR INSERT
  TO public
  WITH CHECK (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "desires_select" ON public."handler_desires";
CREATE POLICY "desires_select" ON public."handler_desires"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "desires_update" ON public."handler_desires";
CREATE POLICY "desires_update" ON public."handler_desires"
  AS PERMISSIVE
  FOR UPDATE
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can insert own directives" ON public."handler_directives";
CREATE POLICY "Users can insert own directives" ON public."handler_directives"
  AS PERMISSIVE
  FOR INSERT
  TO public
  WITH CHECK (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can update own directives" ON public."handler_directives";
CREATE POLICY "Users can update own directives" ON public."handler_directives"
  AS PERMISSIVE
  FOR UPDATE
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can view own directives" ON public."handler_directives";
CREATE POLICY "Users can view own directives" ON public."handler_directives"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users own handler_effectiveness" ON public."handler_effectiveness";
CREATE POLICY "Users own handler_effectiveness" ON public."handler_effectiveness"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users access own escalation_plans" ON public."handler_escalation_plans";
CREATE POLICY "Users access own escalation_plans" ON public."handler_escalation_plans"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users access own handler_escalation_plans" ON public."handler_escalation_plans";
CREATE POLICY "Users access own handler_escalation_plans" ON public."handler_escalation_plans"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can view own escalation plans" ON public."handler_escalation_plans";
CREATE POLICY "Users can view own escalation plans" ON public."handler_escalation_plans"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users access own experiments" ON public."handler_experiments";
CREATE POLICY "Users access own experiments" ON public."handler_experiments"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users access own handler_experiments" ON public."handler_experiments";
CREATE POLICY "Users access own handler_experiments" ON public."handler_experiments"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can view own experiments" ON public."handler_experiments";
CREATE POLICY "Users can view own experiments" ON public."handler_experiments"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can manage their own handler_initiated_sessions" ON public."handler_initiated_sessions";
CREATE POLICY "Users can manage their own handler_initiated_sessions" ON public."handler_initiated_sessions"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users access own handler_interventions" ON public."handler_interventions";
CREATE POLICY "Users access own handler_interventions" ON public."handler_interventions"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "handler_memories_insert" ON public."handler_memories";
CREATE POLICY "handler_memories_insert" ON public."handler_memories"
  AS PERMISSIVE
  FOR INSERT
  TO public
  WITH CHECK (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "handler_memories_select" ON public."handler_memories";
CREATE POLICY "handler_memories_select" ON public."handler_memories"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "handler_memories_update" ON public."handler_memories";
CREATE POLICY "handler_memories_update" ON public."handler_memories"
  AS PERMISSIVE
  FOR UPDATE
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users own memories" ON public."handler_memory";
CREATE POLICY "Users own memories" ON public."handler_memory"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users own extraction log" ON public."handler_memory_extraction_log";
CREATE POLICY "Users own extraction log" ON public."handler_memory_extraction_log"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users own messages" ON public."handler_messages";
CREATE POLICY "Users own messages" ON public."handler_messages"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Service full access narrations" ON public."handler_narrations";
CREATE POLICY "Service full access narrations" ON public."handler_narrations"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.role()) = 'service_role'::text));

DROP POLICY IF EXISTS "Users read own narrations" ON public."handler_narrations";
CREATE POLICY "Users read own narrations" ON public."handler_narrations"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users update own narrations" ON public."handler_narrations";
CREATE POLICY "Users update own narrations" ON public."handler_narrations"
  AS PERMISSIVE
  FOR UPDATE
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "handler_notes_user_policy" ON public."handler_notes";
CREATE POLICY "handler_notes_user_policy" ON public."handler_notes"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users own outreach" ON public."handler_outreach";
CREATE POLICY "Users own outreach" ON public."handler_outreach"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users own their data" ON public."handler_outreach_queue";
CREATE POLICY "Users own their data" ON public."handler_outreach_queue"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users own outreach schedule" ON public."handler_outreach_schedule";
CREATE POLICY "Users own outreach schedule" ON public."handler_outreach_schedule"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can read own handler params" ON public."handler_parameters";
CREATE POLICY "Users can read own handler params" ON public."handler_parameters"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can update own handler params" ON public."handler_parameters";
CREATE POLICY "Users can update own handler params" ON public."handler_parameters"
  AS PERMISSIVE
  FOR UPDATE
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Service role full access" ON public."handler_pending_tasks";
CREATE POLICY "Service role full access" ON public."handler_pending_tasks"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.role()) = 'service_role'::text));

DROP POLICY IF EXISTS "Users access own pending tasks" ON public."handler_pending_tasks";
CREATE POLICY "Users access own pending tasks" ON public."handler_pending_tasks"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can view own persona effectiveness" ON public."handler_persona_effectiveness";
CREATE POLICY "Users can view own persona effectiveness" ON public."handler_persona_effectiveness"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users own their data" ON public."handler_personality_state";
CREATE POLICY "Users own their data" ON public."handler_personality_state"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "service writes amendments" ON public."handler_prompt_amendments";
CREATE POLICY "service writes amendments" ON public."handler_prompt_amendments"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.role()) = 'service_role'::text))
  WITH CHECK (((SELECT auth.role()) = 'service_role'::text));

DROP POLICY IF EXISTS "user reads own amendments" ON public."handler_prompt_amendments";
CREATE POLICY "user reads own amendments" ON public."handler_prompt_amendments"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users own patches" ON public."handler_prompt_patches";
CREATE POLICY "Users own patches" ON public."handler_prompt_patches"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users own their data" ON public."handler_protocols";
CREATE POLICY "Users own their data" ON public."handler_protocols"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Service writes grades" ON public."handler_reply_grades";
CREATE POLICY "Service writes grades" ON public."handler_reply_grades"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.role()) = 'service_role'::text))
  WITH CHECK (((SELECT auth.role()) = 'service_role'::text));

DROP POLICY IF EXISTS "Users see own grades" ON public."handler_reply_grades";
CREATE POLICY "Users see own grades" ON public."handler_reply_grades"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users own audits" ON public."handler_self_audit";
CREATE POLICY "Users own audits" ON public."handler_self_audit"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can manage own standing permissions" ON public."handler_standing_permissions";
CREATE POLICY "Users can manage own standing permissions" ON public."handler_standing_permissions"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Service role manages strategic plans" ON public."handler_strategic_plans";
CREATE POLICY "Service role manages strategic plans" ON public."handler_strategic_plans"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.role()) = 'service_role'::text));

DROP POLICY IF EXISTS "Users see their own strategic plans" ON public."handler_strategic_plans";
CREATE POLICY "Users see their own strategic plans" ON public."handler_strategic_plans"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users access own handler_strategies" ON public."handler_strategies";
CREATE POLICY "Users access own handler_strategies" ON public."handler_strategies"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users access own strategies" ON public."handler_strategies";
CREATE POLICY "Users access own strategies" ON public."handler_strategies"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can view own handler data" ON public."handler_strategies";
CREATE POLICY "Users can view own handler data" ON public."handler_strategies"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Service only handler_strategy" ON public."handler_strategy";
CREATE POLICY "Service only handler_strategy" ON public."handler_strategy"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.role()) = 'service_role'::text));

DROP POLICY IF EXISTS "ht_own" ON public."handler_treasury";
CREATE POLICY "ht_own" ON public."handler_treasury"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id))
  WITH CHECK (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "hte_own" ON public."handler_treasury_events";
CREATE POLICY "hte_own" ON public."handler_treasury_events"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id))
  WITH CHECK (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users access own handler_user_model" ON public."handler_user_model";
CREATE POLICY "Users access own handler_user_model" ON public."handler_user_model"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users access own model" ON public."handler_user_model";
CREATE POLICY "Users access own model" ON public."handler_user_model"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can insert own conditioning" ON public."haptic_conditioning";
CREATE POLICY "Users can insert own conditioning" ON public."haptic_conditioning"
  AS PERMISSIVE
  FOR INSERT
  TO public
  WITH CHECK (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can view own conditioning" ON public."haptic_conditioning";
CREATE POLICY "Users can view own conditioning" ON public."haptic_conditioning"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Anyone can read system patterns" ON public."haptic_patterns";
CREATE POLICY "Anyone can read system patterns" ON public."haptic_patterns"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (((is_system = true) OR ((SELECT auth.uid()) = user_id)));

DROP POLICY IF EXISTS "Authenticated users can view patterns" ON public."haptic_patterns";
CREATE POLICY "Authenticated users can view patterns" ON public."haptic_patterns"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (((SELECT auth.role()) = 'authenticated'::text));

DROP POLICY IF EXISTS "Users can insert own patterns" ON public."haptic_patterns";
CREATE POLICY "Users can insert own patterns" ON public."haptic_patterns"
  AS PERMISSIVE
  FOR INSERT
  TO public
  WITH CHECK ((((SELECT auth.uid()) = user_id) AND (is_system = false)));

DROP POLICY IF EXISTS "Users can update own patterns" ON public."haptic_patterns";
CREATE POLICY "Users can update own patterns" ON public."haptic_patterns"
  AS PERMISSIVE
  FOR UPDATE
  TO public
  USING ((((SELECT auth.uid()) = user_id) AND (is_system = false)));

DROP POLICY IF EXISTS "Users can insert own sessions" ON public."haptic_sessions";
CREATE POLICY "Users can insert own sessions" ON public."haptic_sessions"
  AS PERMISSIVE
  FOR INSERT
  TO public
  WITH CHECK (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can update own sessions" ON public."haptic_sessions";
CREATE POLICY "Users can update own sessions" ON public."haptic_sessions"
  AS PERMISSIVE
  FOR UPDATE
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can view own sessions" ON public."haptic_sessions";
CREATE POLICY "Users can view own sessions" ON public."haptic_sessions"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can insert own settings" ON public."haptic_settings";
CREATE POLICY "Users can insert own settings" ON public."haptic_settings"
  AS PERMISSIVE
  FOR INSERT
  TO public
  WITH CHECK (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can update own settings" ON public."haptic_settings";
CREATE POLICY "Users can update own settings" ON public."haptic_settings"
  AS PERMISSIVE
  FOR UPDATE
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can view own settings" ON public."haptic_settings";
CREATE POLICY "Users can view own settings" ON public."haptic_settings"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users own transitions" ON public."hard_mode_transitions";
CREATE POLICY "Users own transitions" ON public."hard_mode_transitions"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users own their data" ON public."hidden_operations";
CREATE POLICY "Users own their data" ON public."hidden_operations"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "hookup_funnel_owner" ON public."hookup_funnel";
CREATE POLICY "hookup_funnel_owner" ON public."hookup_funnel"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "hookup_events_owner" ON public."hookup_funnel_events";
CREATE POLICY "hookup_events_owner" ON public."hookup_funnel_events"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can manage own hookup params" ON public."hookup_parameters";
CREATE POLICY "Users can manage own hookup params" ON public."hookup_parameters"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can view own hookup params" ON public."hookup_parameters";
CREATE POLICY "Users can view own hookup params" ON public."hookup_parameters"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "hrt_booking_owner" ON public."hrt_booking_attempts";
CREATE POLICY "hrt_booking_owner" ON public."hrt_booking_attempts"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id))
  WITH CHECK (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users own hrt changes" ON public."hrt_changes";
CREATE POLICY "Users own hrt changes" ON public."hrt_changes"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can delete own HRT daily logs" ON public."hrt_daily_log";
CREATE POLICY "Users can delete own HRT daily logs" ON public."hrt_daily_log"
  AS PERMISSIVE
  FOR DELETE
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can insert own HRT daily logs" ON public."hrt_daily_log";
CREATE POLICY "Users can insert own HRT daily logs" ON public."hrt_daily_log"
  AS PERMISSIVE
  FOR INSERT
  TO public
  WITH CHECK (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can update own HRT daily logs" ON public."hrt_daily_log";
CREATE POLICY "Users can update own HRT daily logs" ON public."hrt_daily_log"
  AS PERMISSIVE
  FOR UPDATE
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can view own HRT daily logs" ON public."hrt_daily_log";
CREATE POLICY "Users can view own HRT daily logs" ON public."hrt_daily_log"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "hrt_dose_log_owner" ON public."hrt_dose_log";
CREATE POLICY "hrt_dose_log_owner" ON public."hrt_dose_log"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users own hrt doses" ON public."hrt_doses";
CREATE POLICY "Users own hrt doses" ON public."hrt_doses"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "hrt_funnel_owner" ON public."hrt_funnel";
CREATE POLICY "hrt_funnel_owner" ON public."hrt_funnel"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "hrt_funnel_events_owner" ON public."hrt_funnel_events";
CREATE POLICY "hrt_funnel_events_owner" ON public."hrt_funnel_events"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "hrt_intake_drafts_owner" ON public."hrt_intake_drafts";
CREATE POLICY "hrt_intake_drafts_owner" ON public."hrt_intake_drafts"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "hrto_own" ON public."hrt_obstacles";
CREATE POLICY "hrto_own" ON public."hrt_obstacles"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id))
  WITH CHECK (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can delete own HRT pipeline" ON public."hrt_pipeline";
CREATE POLICY "Users can delete own HRT pipeline" ON public."hrt_pipeline"
  AS PERMISSIVE
  FOR DELETE
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can insert own HRT pipeline" ON public."hrt_pipeline";
CREATE POLICY "Users can insert own HRT pipeline" ON public."hrt_pipeline"
  AS PERMISSIVE
  FOR INSERT
  TO public
  WITH CHECK (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can update own HRT pipeline" ON public."hrt_pipeline";
CREATE POLICY "Users can update own HRT pipeline" ON public."hrt_pipeline"
  AS PERMISSIVE
  FOR UPDATE
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can view own HRT pipeline" ON public."hrt_pipeline";
CREATE POLICY "Users can view own HRT pipeline" ON public."hrt_pipeline"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users own hrt pipeline" ON public."hrt_pipeline";
CREATE POLICY "Users own hrt pipeline" ON public."hrt_pipeline"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "hrt_regimen_owner" ON public."hrt_regimen";
CREATE POLICY "hrt_regimen_owner" ON public."hrt_regimen"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can delete own HRT checkpoints" ON public."hrt_sober_checkpoints";
CREATE POLICY "Users can delete own HRT checkpoints" ON public."hrt_sober_checkpoints"
  AS PERMISSIVE
  FOR DELETE
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can insert own HRT checkpoints" ON public."hrt_sober_checkpoints";
CREATE POLICY "Users can insert own HRT checkpoints" ON public."hrt_sober_checkpoints"
  AS PERMISSIVE
  FOR INSERT
  TO public
  WITH CHECK (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can update own HRT checkpoints" ON public."hrt_sober_checkpoints";
CREATE POLICY "Users can update own HRT checkpoints" ON public."hrt_sober_checkpoints"
  AS PERMISSIVE
  FOR UPDATE
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can view own HRT checkpoints" ON public."hrt_sober_checkpoints";
CREATE POLICY "Users can view own HRT checkpoints" ON public."hrt_sober_checkpoints"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "hrt_urgency_owner" ON public."hrt_urgency_state";
CREATE POLICY "hrt_urgency_owner" ON public."hrt_urgency_state"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id))
  WITH CHECK (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users own hypno features" ON public."hypno_features";
CREATE POLICY "Users own hypno features" ON public."hypno_features"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "hypno_library_user" ON public."hypno_library";
CREATE POLICY "hypno_library_user" ON public."hypno_library"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users own hypno plays" ON public."hypno_plays";
CREATE POLICY "Users own hypno plays" ON public."hypno_plays"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can manage own session events" ON public."hypno_session_events";
CREATE POLICY "Users can manage own session events" ON public."hypno_session_events"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can manage own session summaries" ON public."hypno_session_summary";
CREATE POLICY "Users can manage own session summaries" ON public."hypno_session_summary"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "hypno_sessions_user" ON public."hypno_sessions";
CREATE POLICY "hypno_sessions_user" ON public."hypno_sessions"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users own hypno sources" ON public."hypno_sources";
CREATE POLICY "Users own hypno sources" ON public."hypno_sources"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users own hypno transcripts" ON public."hypno_transcripts";
CREATE POLICY "Users own hypno transcripts" ON public."hypno_transcripts"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can manage own identity_affirmations" ON public."identity_affirmations";
CREATE POLICY "Users can manage own identity_affirmations" ON public."identity_affirmations"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "identity_contracts_insert" ON public."identity_contracts";
CREATE POLICY "identity_contracts_insert" ON public."identity_contracts"
  AS PERMISSIVE
  FOR INSERT
  TO public
  WITH CHECK (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "identity_contracts_select" ON public."identity_contracts";
CREATE POLICY "identity_contracts_select" ON public."identity_contracts"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "identity_contracts_update" ON public."identity_contracts";
CREATE POLICY "identity_contracts_update" ON public."identity_contracts"
  AS PERMISSIVE
  FOR UPDATE
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "service writes displacement" ON public."identity_displacement_history";
CREATE POLICY "service writes displacement" ON public."identity_displacement_history"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.role()) = 'service_role'::text))
  WITH CHECK (((SELECT auth.role()) = 'service_role'::text));

DROP POLICY IF EXISTS "user reads own displacement" ON public."identity_displacement_history";
CREATE POLICY "user reads own displacement" ON public."identity_displacement_history"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "identity_displacement_insert" ON public."identity_displacement_log";
CREATE POLICY "identity_displacement_insert" ON public."identity_displacement_log"
  AS PERMISSIVE
  FOR INSERT
  TO public
  WITH CHECK (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "identity_displacement_select" ON public."identity_displacement_log";
CREATE POLICY "identity_displacement_select" ON public."identity_displacement_log"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "identity_displacement_update" ON public."identity_displacement_log";
CREATE POLICY "identity_displacement_update" ON public."identity_displacement_log"
  AS PERMISSIVE
  FOR UPDATE
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can view own identity erosion" ON public."identity_erosion";
CREATE POLICY "Users can view own identity erosion" ON public."identity_erosion"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "erosion_insert" ON public."identity_erosion_log";
CREATE POLICY "erosion_insert" ON public."identity_erosion_log"
  AS PERMISSIVE
  FOR INSERT
  TO public
  WITH CHECK (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "erosion_select" ON public."identity_erosion_log";
CREATE POLICY "erosion_select" ON public."identity_erosion_log"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "identity_journal_delete" ON public."identity_journal";
CREATE POLICY "identity_journal_delete" ON public."identity_journal"
  AS PERMISSIVE
  FOR DELETE
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "identity_journal_insert" ON public."identity_journal";
CREATE POLICY "identity_journal_insert" ON public."identity_journal"
  AS PERMISSIVE
  FOR INSERT
  TO public
  WITH CHECK (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "identity_journal_select" ON public."identity_journal";
CREATE POLICY "identity_journal_select" ON public."identity_journal"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "identity_journal_update" ON public."identity_journal";
CREATE POLICY "identity_journal_update" ON public."identity_journal"
  AS PERMISSIVE
  FOR UPDATE
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users access own language" ON public."identity_language_events";
CREATE POLICY "Users access own language" ON public."identity_language_events"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users own their data" ON public."identity_language_metrics";
CREATE POLICY "Users own their data" ON public."identity_language_metrics"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users own immersion" ON public."immersion_sessions";
CREATE POLICY "Users own immersion" ON public."immersion_sessions"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users access own influence_attempts" ON public."influence_attempts";
CREATE POLICY "Users access own influence_attempts" ON public."influence_attempts"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can view own influence" ON public."influence_attempts";
CREATE POLICY "Users can view own influence" ON public."influence_attempts"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can create own infractions" ON public."infractions";
CREATE POLICY "Users can create own infractions" ON public."infractions"
  AS PERMISSIVE
  FOR INSERT
  TO public
  WITH CHECK (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can update own infractions" ON public."infractions";
CREATE POLICY "Users can update own infractions" ON public."infractions"
  AS PERMISSIVE
  FOR UPDATE
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can view own infractions" ON public."infractions";
CREATE POLICY "Users can view own infractions" ON public."infractions"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Authenticated users can read inspiration_feed" ON public."inspiration_feed";
CREATE POLICY "Authenticated users can read inspiration_feed" ON public."inspiration_feed"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (((SELECT auth.role()) = 'authenticated'::text));

DROP POLICY IF EXISTS "Users can view own reality frames" ON public."installed_reality_frames";
CREATE POLICY "Users can view own reality frames" ON public."installed_reality_frames"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can view own intake_progress" ON public."intake_progress";
CREATE POLICY "Users can view own intake_progress" ON public."intake_progress"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users own intervention_outcomes" ON public."intervention_outcomes";
CREATE POLICY "Users own intervention_outcomes" ON public."intervention_outcomes"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users own intimate_journal" ON public."intimate_journal";
CREATE POLICY "Users own intimate_journal" ON public."intimate_journal"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users own seed_actions" ON public."intimate_seed_actions";
CREATE POLICY "Users own seed_actions" ON public."intimate_seed_actions"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users own intimate_seeds" ON public."intimate_seeds";
CREATE POLICY "Users own intimate_seeds" ON public."intimate_seeds"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users access own sessions" ON public."intimate_sessions";
CREATE POLICY "Users access own sessions" ON public."intimate_sessions"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can view own milestones" ON public."investment_milestones";
CREATE POLICY "Users can view own milestones" ON public."investment_milestones"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users access own investments" ON public."investments";
CREATE POLICY "Users access own investments" ON public."investments"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can manage own investments" ON public."investments";
CREATE POLICY "Users can manage own investments" ON public."investments"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can manage their own involuntary_emergence" ON public."involuntary_emergence";
CREATE POLICY "Users can manage their own involuntary_emergence" ON public."involuntary_emergence"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "irl_own" ON public."irreversibility_ledger";
CREATE POLICY "irl_own" ON public."irreversibility_ledger"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id))
  WITH CHECK (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can insert own data" ON public."irreversibility_markers";
CREATE POLICY "Users can insert own data" ON public."irreversibility_markers"
  AS PERMISSIVE
  FOR INSERT
  TO public
  WITH CHECK (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can update own data" ON public."irreversibility_markers";
CREATE POLICY "Users can update own data" ON public."irreversibility_markers"
  AS PERMISSIVE
  FOR UPDATE
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can view own data" ON public."irreversibility_markers";
CREATE POLICY "Users can view own data" ON public."irreversibility_markers"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users own their irreversibility markers" ON public."irreversibility_markers";
CREATE POLICY "Users own their irreversibility markers" ON public."irreversibility_markers"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "irreversibility_score own" ON public."irreversibility_score";
CREATE POLICY "irreversibility_score own" ON public."irreversibility_score"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id))
  WITH CHECK (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "irreversibility_score_history own" ON public."irreversibility_score_history";
CREATE POLICY "irreversibility_score_history own" ON public."irreversibility_score_history"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id))
  WITH CHECK (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can manage own key_admissions" ON public."key_admissions";
CREATE POLICY "Users can manage own key_admissions" ON public."key_admissions"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "keyholder_decisions_owner" ON public."keyholder_decisions";
CREATE POLICY "keyholder_decisions_owner" ON public."keyholder_decisions"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users own kink_inventory" ON public."kink_inventory";
CREATE POLICY "Users own kink_inventory" ON public."kink_inventory"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "language_drift_snapshots_insert" ON public."language_drift_snapshots";
CREATE POLICY "language_drift_snapshots_insert" ON public."language_drift_snapshots"
  AS PERMISSIVE
  FOR INSERT
  TO public
  WITH CHECK (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "language_drift_snapshots_select" ON public."language_drift_snapshots";
CREATE POLICY "language_drift_snapshots_select" ON public."language_drift_snapshots"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "language_drift_snapshots_update" ON public."language_drift_snapshots";
CREATE POLICY "language_drift_snapshots_update" ON public."language_drift_snapshots"
  AS PERMISSIVE
  FOR UPDATE
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users own language monitoring" ON public."language_monitoring";
CREATE POLICY "Users own language monitoring" ON public."language_monitoring"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "language_tracking_user" ON public."language_tracking";
CREATE POLICY "language_tracking_user" ON public."language_tracking"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "service writes leak_patterns" ON public."leak_patterns";
CREATE POLICY "service writes leak_patterns" ON public."leak_patterns"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.role()) = 'service_role'::text))
  WITH CHECK (((SELECT auth.role()) = 'service_role'::text));

DROP POLICY IF EXISTS "user reads own leak_patterns" ON public."leak_patterns";
CREATE POLICY "user reads own leak_patterns" ON public."leak_patterns"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users access own learned_vulnerabilities" ON public."learned_vulnerabilities";
CREATE POLICY "Users access own learned_vulnerabilities" ON public."learned_vulnerabilities"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users access own vulnerabilities" ON public."learned_vulnerabilities";
CREATE POLICY "Users access own vulnerabilities" ON public."learned_vulnerabilities"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can view own vulnerabilities" ON public."learned_vulnerabilities";
CREATE POLICY "Users can view own vulnerabilities" ON public."learned_vulnerabilities"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "service writes closer log" ON public."loophole_closer_log";
CREATE POLICY "service writes closer log" ON public."loophole_closer_log"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.role()) = 'service_role'::text))
  WITH CHECK (((SELECT auth.role()) = 'service_role'::text));

DROP POLICY IF EXISTS "user reads own closer log" ON public."loophole_closer_log";
CREATE POLICY "user reads own closer log" ON public."loophole_closer_log"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Service writes loopholes" ON public."loophole_findings";
CREATE POLICY "Service writes loopholes" ON public."loophole_findings"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.role()) = 'service_role'::text))
  WITH CHECK (((SELECT auth.role()) = 'service_role'::text));

DROP POLICY IF EXISTS "Users see own loopholes" ON public."loophole_findings";
CREATE POLICY "Users see own loopholes" ON public."loophole_findings"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can insert own commands" ON public."lovense_commands";
CREATE POLICY "Users can insert own commands" ON public."lovense_commands"
  AS PERMISSIVE
  FOR INSERT
  TO public
  WITH CHECK (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can view own commands" ON public."lovense_commands";
CREATE POLICY "Users can view own commands" ON public."lovense_commands"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can insert own connection" ON public."lovense_connections";
CREATE POLICY "Users can insert own connection" ON public."lovense_connections"
  AS PERMISSIVE
  FOR INSERT
  TO public
  WITH CHECK (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can update own connection" ON public."lovense_connections";
CREATE POLICY "Users can update own connection" ON public."lovense_connections"
  AS PERMISSIVE
  FOR UPDATE
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can view own connection" ON public."lovense_connections";
CREATE POLICY "Users can view own connection" ON public."lovense_connections"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can delete own devices" ON public."lovense_devices";
CREATE POLICY "Users can delete own devices" ON public."lovense_devices"
  AS PERMISSIVE
  FOR DELETE
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can insert own devices" ON public."lovense_devices";
CREATE POLICY "Users can insert own devices" ON public."lovense_devices"
  AS PERMISSIVE
  FOR INSERT
  TO public
  WITH CHECK (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can update own devices" ON public."lovense_devices";
CREATE POLICY "Users can update own devices" ON public."lovense_devices"
  AS PERMISSIVE
  FOR UPDATE
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can view own devices" ON public."lovense_devices";
CREATE POLICY "Users can view own devices" ON public."lovense_devices"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Service full access lovense_commands" ON public."lovense_proactive_commands";
CREATE POLICY "Service full access lovense_commands" ON public."lovense_proactive_commands"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.role()) = 'service_role'::text));

DROP POLICY IF EXISTS "Users read own lovense_commands" ON public."lovense_proactive_commands";
CREATE POLICY "Users read own lovense_commands" ON public."lovense_proactive_commands"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "mama_capability_digest_owner" ON public."mama_capability_digest";
CREATE POLICY "mama_capability_digest_owner" ON public."mama_capability_digest"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "System can insert manipulation log" ON public."manipulation_log";
CREATE POLICY "System can insert manipulation log" ON public."manipulation_log"
  AS PERMISSIVE
  FOR INSERT
  TO public
  WITH CHECK (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can view own manipulation log" ON public."manipulation_log";
CREATE POLICY "Users can view own manipulation log" ON public."manipulation_log"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "mantra_delivery_log_owner" ON public."mantra_delivery_log";
CREATE POLICY "mantra_delivery_log_owner" ON public."mantra_delivery_log"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id))
  WITH CHECK (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can insert their own marriage milestones" ON public."marriage_restructuring_milestones";
CREATE POLICY "Users can insert their own marriage milestones" ON public."marriage_restructuring_milestones"
  AS PERMISSIVE
  FOR INSERT
  TO public
  WITH CHECK (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can update their own marriage milestones" ON public."marriage_restructuring_milestones";
CREATE POLICY "Users can update their own marriage milestones" ON public."marriage_restructuring_milestones"
  AS PERMISSIVE
  FOR UPDATE
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can view their own marriage milestones" ON public."marriage_restructuring_milestones";
CREATE POLICY "Users can view their own marriage milestones" ON public."marriage_restructuring_milestones"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users own masculine_capability_tracking" ON public."masculine_capability_tracking";
CREATE POLICY "Users own masculine_capability_tracking" ON public."masculine_capability_tracking"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users own masculine contexts" ON public."masculine_contexts";
CREATE POLICY "Users own masculine contexts" ON public."masculine_contexts"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can manage their own masculine_effort_log" ON public."masculine_effort_log";
CREATE POLICY "Users can manage their own masculine_effort_log" ON public."masculine_effort_log"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users access own patterns" ON public."masculine_patterns";
CREATE POLICY "Users access own patterns" ON public."masculine_patterns"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can manage own expenses" ON public."maxy_expenses";
CREATE POLICY "Users can manage own expenses" ON public."maxy_expenses"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can view own expenses" ON public."maxy_expenses";
CREATE POLICY "Users can view own expenses" ON public."maxy_expenses"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "maxy_facts own" ON public."maxy_facts";
CREATE POLICY "maxy_facts own" ON public."maxy_facts"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id))
  WITH CHECK (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Service full maxy_fund" ON public."maxy_fund";
CREATE POLICY "Service full maxy_fund" ON public."maxy_fund"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.role()) = 'service_role'::text));

DROP POLICY IF EXISTS "Users read own fund" ON public."maxy_fund";
CREATE POLICY "Users read own fund" ON public."maxy_fund"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users own readings" ON public."maxy_readings";
CREATE POLICY "Users own readings" ON public."maxy_readings"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can manage own revenue" ON public."maxy_revenue";
CREATE POLICY "Users can manage own revenue" ON public."maxy_revenue"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can view own revenue" ON public."maxy_revenue";
CREATE POLICY "Users can view own revenue" ON public."maxy_revenue"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users own regimen" ON public."medication_regimen";
CREATE POLICY "Users own regimen" ON public."medication_regimen"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can manage own meetups" ON public."meetups";
CREATE POLICY "Users can manage own meetups" ON public."meetups"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can view own meetups" ON public."meetups";
CREATE POLICY "Users can view own meetups" ON public."meetups"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "memory_implants_owner" ON public."memory_implants";
CREATE POLICY "memory_implants_owner" ON public."memory_implants"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "memory_reframings_insert" ON public."memory_reframings";
CREATE POLICY "memory_reframings_insert" ON public."memory_reframings"
  AS PERMISSIVE
  FOR INSERT
  TO public
  WITH CHECK (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "memory_reframings_select" ON public."memory_reframings";
CREATE POLICY "memory_reframings_select" ON public."memory_reframings"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "memory_reframings_update" ON public."memory_reframings";
CREATE POLICY "memory_reframings_update" ON public."memory_reframings"
  AS PERMISSIVE
  FOR UPDATE
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "meta_frame_breaks_owner" ON public."meta_frame_breaks";
CREATE POLICY "meta_frame_breaks_owner" ON public."meta_frame_breaks"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can manage their own micro_checkins" ON public."micro_checkins";
CREATE POLICY "Users can manage their own micro_checkins" ON public."micro_checkins"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can insert own micro completions" ON public."micro_task_completions";
CREATE POLICY "Users can insert own micro completions" ON public."micro_task_completions"
  AS PERMISSIVE
  FOR INSERT
  TO public
  WITH CHECK (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can view own micro completions" ON public."micro_task_completions";
CREATE POLICY "Users can view own micro completions" ON public."micro_task_completions"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can delete own micro config" ON public."micro_task_config";
CREATE POLICY "Users can delete own micro config" ON public."micro_task_config"
  AS PERMISSIVE
  FOR DELETE
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can insert own micro config" ON public."micro_task_config";
CREATE POLICY "Users can insert own micro config" ON public."micro_task_config"
  AS PERMISSIVE
  FOR INSERT
  TO public
  WITH CHECK (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can update own micro config" ON public."micro_task_config";
CREATE POLICY "Users can update own micro config" ON public."micro_task_config"
  AS PERMISSIVE
  FOR UPDATE
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can view own micro config" ON public."micro_task_config";
CREATE POLICY "Users can view own micro config" ON public."micro_task_config"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Service role manages templates" ON public."micro_task_templates";
CREATE POLICY "Service role manages templates" ON public."micro_task_templates"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.role()) = 'service_role'::text));

DROP POLICY IF EXISTS "Templates readable by authenticated users" ON public."micro_task_templates";
CREATE POLICY "Templates readable by authenticated users" ON public."micro_task_templates"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (((SELECT auth.role()) = 'authenticated'::text));

DROP POLICY IF EXISTS "Users own moment_logs" ON public."moment_logs";
CREATE POLICY "Users own moment_logs" ON public."moment_logs"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "mommy_distortion_log_owner" ON public."mommy_distortion_log";
CREATE POLICY "mommy_distortion_log_owner" ON public."mommy_distortion_log"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "mommy_dossier_owner" ON public."mommy_dossier";
CREATE POLICY "mommy_dossier_owner" ON public."mommy_dossier"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id))
  WITH CHECK (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "mommy_mood_owner" ON public."mommy_mood";
CREATE POLICY "mommy_mood_owner" ON public."mommy_mood"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id))
  WITH CHECK (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "mommy_voice_leaks_owner" ON public."mommy_voice_leaks";
CREATE POLICY "mommy_voice_leaks_owner" ON public."mommy_voice_leaks"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id))
  WITH CHECK (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users access own mood_checkins" ON public."mood_checkins";
CREATE POLICY "Users access own mood_checkins" ON public."mood_checkins"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "mantra_subs_owner" ON public."morning_mantra_submissions";
CREATE POLICY "mantra_subs_owner" ON public."morning_mantra_submissions"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id))
  WITH CHECK (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "mantra_windows_owner" ON public."morning_mantra_windows";
CREATE POLICY "mantra_windows_owner" ON public."morning_mantra_windows"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id))
  WITH CHECK (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users manage own narrative arcs" ON public."narrative_arc_progress";
CREATE POLICY "Users manage own narrative arcs" ON public."narrative_arc_progress"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can manage own narrative_arcs" ON public."narrative_arcs";
CREATE POLICY "Users can manage own narrative_arcs" ON public."narrative_arcs"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can manage their own narrative_reflections" ON public."narrative_reflections";
CREATE POLICY "Users can manage their own narrative_reflections" ON public."narrative_reflections"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "reframe_owner" ON public."narrative_reframings";
CREATE POLICY "reframe_owner" ON public."narrative_reframings"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "gap_events_owner" ON public."neglect_gap_events";
CREATE POLICY "gap_events_owner" ON public."neglect_gap_events"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id))
  WITH CHECK (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Service full access noncompliance" ON public."noncompliance_streaks";
CREATE POLICY "Service full access noncompliance" ON public."noncompliance_streaks"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.role()) = 'service_role'::text));

DROP POLICY IF EXISTS "Users read own noncompliance" ON public."noncompliance_streaks";
CREATE POLICY "Users read own noncompliance" ON public."noncompliance_streaks"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users own notifications" ON public."notification_events";
CREATE POLICY "Users own notifications" ON public."notification_events"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Authenticated users can read notification_templates" ON public."notification_templates";
CREATE POLICY "Authenticated users can read notification_templates" ON public."notification_templates"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING ((((SELECT auth.role()) = 'authenticated'::text) AND (is_active = true)));

DROP POLICY IF EXISTS "Users access own notif_config" ON public."notifications_config";
CREATE POLICY "Users access own notif_config" ON public."notifications_config"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users access own notif_sent" ON public."notifications_sent";
CREATE POLICY "Users access own notif_sent" ON public."notifications_sent"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can read own novelty events" ON public."novelty_events";
CREATE POLICY "Users can read own novelty events" ON public."novelty_events"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users own orgasm_log" ON public."orgasm_log";
CREATE POLICY "Users own orgasm_log" ON public."orgasm_log"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "outfit_prescriptions_insert" ON public."outfit_prescriptions";
CREATE POLICY "outfit_prescriptions_insert" ON public."outfit_prescriptions"
  AS PERMISSIVE
  FOR INSERT
  TO public
  WITH CHECK (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "outfit_prescriptions_select" ON public."outfit_prescriptions";
CREATE POLICY "outfit_prescriptions_select" ON public."outfit_prescriptions"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "outfit_prescriptions_update" ON public."outfit_prescriptions";
CREATE POLICY "outfit_prescriptions_update" ON public."outfit_prescriptions"
  AS PERMISSIVE
  FOR UPDATE
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users own outfits" ON public."outfit_submissions";
CREATE POLICY "Users own outfits" ON public."outfit_submissions"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can manage their own ownership_metrics" ON public."ownership_metrics";
CREATE POLICY "Users can manage their own ownership_metrics" ON public."ownership_metrics"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users read own paid_conversations" ON public."paid_conversations";
CREATE POLICY "Users read own paid_conversations" ON public."paid_conversations"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "partner_disclosures_owner" ON public."partner_disclosures";
CREATE POLICY "partner_disclosures_owner" ON public."partner_disclosures"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can manage own partners" ON public."partners";
CREATE POLICY "Users can manage own partners" ON public."partners"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can view own partners" ON public."partners";
CREATE POLICY "Users can view own partners" ON public."partners"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "passive_voice_samples_user" ON public."passive_voice_samples";
CREATE POLICY "passive_voice_samples_user" ON public."passive_voice_samples"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "patch_eff_owner" ON public."patch_effectiveness_scores";
CREATE POLICY "patch_eff_owner" ON public."patch_effectiveness_scores"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id))
  WITH CHECK (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users access own catches" ON public."pattern_catches";
CREATE POLICY "Users access own catches" ON public."pattern_catches"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "pending_outbound own" ON public."pending_outbound";
CREATE POLICY "pending_outbound own" ON public."pending_outbound"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id))
  WITH CHECK (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can insert their own permanence acknowledgments" ON public."permanence_acknowledgments";
CREATE POLICY "Users can insert their own permanence acknowledgments" ON public."permanence_acknowledgments"
  AS PERMISSIVE
  FOR INSERT
  TO public
  WITH CHECK (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can view their own permanence acknowledgments" ON public."permanence_acknowledgments";
CREATE POLICY "Users can view their own permanence acknowledgments" ON public."permanence_acknowledgments"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can insert their own tier transitions" ON public."permanence_tier_transitions";
CREATE POLICY "Users can insert their own tier transitions" ON public."permanence_tier_transitions"
  AS PERMISSIVE
  FOR INSERT
  TO public
  WITH CHECK (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can view their own tier transitions" ON public."permanence_tier_transitions";
CREATE POLICY "Users can view their own tier transitions" ON public."permanence_tier_transitions"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "service writes persona" ON public."persona_shift_log";
CREATE POLICY "service writes persona" ON public."persona_shift_log"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.role()) = 'service_role'::text))
  WITH CHECK (((SELECT auth.role()) = 'service_role'::text));

DROP POLICY IF EXISTS "user reads own persona" ON public."persona_shift_log";
CREATE POLICY "user reads own persona" ON public."persona_shift_log"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can insert own letters" ON public."personalized_letters";
CREATE POLICY "Users can insert own letters" ON public."personalized_letters"
  AS PERMISSIVE
  FOR INSERT
  TO public
  WITH CHECK (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can update own letters" ON public."personalized_letters";
CREATE POLICY "Users can update own letters" ON public."personalized_letters"
  AS PERMISSIVE
  FOR UPDATE
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can view own letters" ON public."personalized_letters";
CREATE POLICY "Users can view own letters" ON public."personalized_letters"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "phase_grads_owner" ON public."phase_graduations";
CREATE POLICY "phase_grads_owner" ON public."phase_graduations"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id))
  WITH CHECK (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "phase_milestones_owner" ON public."phase_milestones";
CREATE POLICY "phase_milestones_owner" ON public."phase_milestones"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can manage their own physical_practice_log" ON public."physical_practice_log";
CREATE POLICY "Users can manage their own physical_practice_log" ON public."physical_practice_log"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can manage their own physical_state_log" ON public."physical_state_log";
CREATE POLICY "Users can manage their own physical_state_log" ON public."physical_state_log"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users access own planned_edge_sessions" ON public."planned_edge_sessions";
CREATE POLICY "Users access own planned_edge_sessions" ON public."planned_edge_sessions"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users access own planned_sessions" ON public."planned_edge_sessions";
CREATE POLICY "Users access own planned_sessions" ON public."planned_edge_sessions"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users own planned_edge_sessions" ON public."planned_edge_sessions";
CREATE POLICY "Users own planned_edge_sessions" ON public."planned_edge_sessions"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users access own planted_triggers" ON public."planted_triggers";
CREATE POLICY "Users access own planted_triggers" ON public."planted_triggers"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users access own triggers" ON public."planted_triggers";
CREATE POLICY "Users access own triggers" ON public."planted_triggers"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can view own triggers" ON public."planted_triggers";
CREATE POLICY "Users can view own triggers" ON public."planted_triggers"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Service full platform_accounts" ON public."platform_accounts";
CREATE POLICY "Service full platform_accounts" ON public."platform_accounts"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.role()) = 'service_role'::text));

DROP POLICY IF EXISTS "Users read own platform summary" ON public."platform_accounts";
CREATE POLICY "Users read own platform summary" ON public."platform_accounts"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users own budget" ON public."platform_engagement_budget";
CREATE POLICY "Users own budget" ON public."platform_engagement_budget"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "platform_snapshots own" ON public."platform_follower_snapshots";
CREATE POLICY "platform_snapshots own" ON public."platform_follower_snapshots"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id))
  WITH CHECK (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can manage own point_transactions" ON public."point_transactions";
CREATE POLICY "Users can manage own point_transactions" ON public."point_transactions"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users access own milestones" ON public."ponr_milestones";
CREATE POLICY "Users access own milestones" ON public."ponr_milestones"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users own their data" ON public."post_hypnotic_tracking";
CREATE POLICY "Users own their data" ON public."post_hypnotic_tracking"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can manage their own post_release_captures" ON public."post_release_captures";
CREATE POLICY "Users can manage their own post_release_captures" ON public."post_release_captures"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users access own post-release protocols" ON public."post_release_protocol";
CREATE POLICY "Users access own post-release protocols" ON public."post_release_protocol"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users own their data" ON public."predictive_interventions";
CREATE POLICY "Users own their data" ON public."predictive_interventions"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users access own profile_arousal" ON public."profile_arousal";
CREATE POLICY "Users access own profile_arousal" ON public."profile_arousal"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users access own profile_depth" ON public."profile_depth";
CREATE POLICY "Users access own profile_depth" ON public."profile_depth"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users access own profile_foundation" ON public."profile_foundation";
CREATE POLICY "Users access own profile_foundation" ON public."profile_foundation"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users access own profile_history" ON public."profile_history";
CREATE POLICY "Users access own profile_history" ON public."profile_history"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users access own profile_psychology" ON public."profile_psychology";
CREATE POLICY "Users access own profile_psychology" ON public."profile_psychology"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can manage own progression" ON public."progression_history";
CREATE POLICY "Users can manage own progression" ON public."progression_history"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "pronoun_rewrites_owner" ON public."pronoun_rewrites";
CREATE POLICY "pronoun_rewrites_owner" ON public."pronoun_rewrites"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id))
  WITH CHECK (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "pronoun_slips_owner" ON public."pronoun_slips";
CREATE POLICY "pronoun_slips_owner" ON public."pronoun_slips"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users access own pronouns" ON public."pronoun_stats";
CREATE POLICY "Users access own pronouns" ON public."pronoun_stats"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "prospects_delete" ON public."prospects";
CREATE POLICY "prospects_delete" ON public."prospects"
  AS PERMISSIVE
  FOR DELETE
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "prospects_insert" ON public."prospects";
CREATE POLICY "prospects_insert" ON public."prospects"
  AS PERMISSIVE
  FOR INSERT
  TO public
  WITH CHECK (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "prospects_select" ON public."prospects";
CREATE POLICY "prospects_select" ON public."prospects"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "prospects_update" ON public."prospects";
CREATE POLICY "prospects_update" ON public."prospects"
  AS PERMISSIVE
  FOR UPDATE
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users own punishments" ON public."punishment_queue";
CREATE POLICY "Users own punishments" ON public."punishment_queue"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can manage their own punishments" ON public."punishments";
CREATE POLICY "Users can manage their own punishments" ON public."punishments"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users access own wishlist" ON public."purchase_wishlist";
CREATE POLICY "Users access own wishlist" ON public."purchase_wishlist"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "push_own_delete" ON public."push_subscriptions";
CREATE POLICY "push_own_delete" ON public."push_subscriptions"
  AS PERMISSIVE
  FOR DELETE
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "push_own_insert" ON public."push_subscriptions";
CREATE POLICY "push_own_insert" ON public."push_subscriptions"
  AS PERMISSIVE
  FOR INSERT
  TO public
  WITH CHECK (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "push_own_read" ON public."push_subscriptions";
CREATE POLICY "push_own_read" ON public."push_subscriptions"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "push_own_update" ON public."push_subscriptions";
CREATE POLICY "push_own_update" ON public."push_subscriptions"
  AS PERMISSIVE
  FOR UPDATE
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "quit_attempts_insert" ON public."quit_attempts";
CREATE POLICY "quit_attempts_insert" ON public."quit_attempts"
  AS PERMISSIVE
  FOR INSERT
  TO public
  WITH CHECK (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "quit_attempts_select" ON public."quit_attempts";
CREATE POLICY "quit_attempts_select" ON public."quit_attempts"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "quit_attempts_update" ON public."quit_attempts";
CREATE POLICY "quit_attempts_update" ON public."quit_attempts"
  AS PERMISSIVE
  FOR UPDATE
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "rationalization_owner" ON public."rationalization_events";
CREATE POLICY "rationalization_owner" ON public."rationalization_events"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id))
  WITH CHECK (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users access own recovery_protocols" ON public."recovery_protocols";
CREATE POLICY "Users access own recovery_protocols" ON public."recovery_protocols"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "recurring_obligations_insert" ON public."recurring_obligations";
CREATE POLICY "recurring_obligations_insert" ON public."recurring_obligations"
  AS PERMISSIVE
  FOR INSERT
  TO public
  WITH CHECK (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "recurring_obligations_select" ON public."recurring_obligations";
CREATE POLICY "recurring_obligations_select" ON public."recurring_obligations"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "recurring_obligations_update" ON public."recurring_obligations";
CREATE POLICY "recurring_obligations_update" ON public."recurring_obligations"
  AS PERMISSIVE
  FOR UPDATE
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users access own regressions" ON public."regression_events";
CREATE POLICY "Users access own regressions" ON public."regression_events"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users own regression_impossibility_factors" ON public."regression_impossibility_factors";
CREATE POLICY "Users own regression_impossibility_factors" ON public."regression_impossibility_factors"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "release_events_insert" ON public."release_events";
CREATE POLICY "release_events_insert" ON public."release_events"
  AS PERMISSIVE
  FOR INSERT
  TO public
  WITH CHECK (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "release_events_select" ON public."release_events";
CREATE POLICY "release_events_select" ON public."release_events"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "release_events_update" ON public."release_events";
CREATE POLICY "release_events_update" ON public."release_events"
  AS PERMISSIVE
  FOR UPDATE
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can insert own reminder responses" ON public."reminder_responses";
CREATE POLICY "Users can insert own reminder responses" ON public."reminder_responses"
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can view own reminder responses" ON public."reminder_responses";
CREATE POLICY "Users can view own reminder responses" ON public."reminder_responses"
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can manage own reminder schedule" ON public."reminder_schedule";
CREATE POLICY "Users can manage own reminder schedule" ON public."reminder_schedule"
  AS PERMISSIVE
  FOR ALL
  TO authenticated
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can view own reminder schedule" ON public."reminder_schedule";
CREATE POLICY "Users can view own reminder schedule" ON public."reminder_schedule"
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users access own reminder_settings" ON public."reminder_settings";
CREATE POLICY "Users access own reminder_settings" ON public."reminder_settings"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can insert own reminder settings" ON public."reminder_settings";
CREATE POLICY "Users can insert own reminder settings" ON public."reminder_settings"
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can update own reminder settings" ON public."reminder_settings";
CREATE POLICY "Users can update own reminder settings" ON public."reminder_settings"
  AS PERMISSIVE
  FOR UPDATE
  TO authenticated
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can view own reminder settings" ON public."reminder_settings";
CREATE POLICY "Users can view own reminder settings" ON public."reminder_settings"
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can update own interventions" ON public."required_interventions";
CREATE POLICY "Users can update own interventions" ON public."required_interventions"
  AS PERMISSIVE
  FOR UPDATE
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can view own interventions" ON public."required_interventions";
CREATE POLICY "Users can view own interventions" ON public."required_interventions"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can manage their own resistance_costs" ON public."resistance_costs";
CREATE POLICY "Users can manage their own resistance_costs" ON public."resistance_costs"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can insert their own resistance events" ON public."resistance_events";
CREATE POLICY "Users can insert their own resistance events" ON public."resistance_events"
  AS PERMISSIVE
  FOR INSERT
  TO public
  WITH CHECK (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can read own resistance events" ON public."resistance_events";
CREATE POLICY "Users can read own resistance events" ON public."resistance_events"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can view their own resistance events" ON public."resistance_events";
CREATE POLICY "Users can view their own resistance events" ON public."resistance_events"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users access own resistance_patterns" ON public."resistance_patterns";
CREATE POLICY "Users access own resistance_patterns" ON public."resistance_patterns"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can view own resistance" ON public."resistance_patterns";
CREATE POLICY "Users can view own resistance" ON public."resistance_patterns"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users read own revenue_content_calendar" ON public."revenue_content_calendar";
CREATE POLICY "Users read own revenue_content_calendar" ON public."revenue_content_calendar"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users read own revenue_decisions" ON public."revenue_decisions";
CREATE POLICY "Users read own revenue_decisions" ON public."revenue_decisions"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Service full revenue_events" ON public."revenue_events";
CREATE POLICY "Service full revenue_events" ON public."revenue_events"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.role()) = 'service_role'::text));

DROP POLICY IF EXISTS "Users read own revenue" ON public."revenue_events";
CREATE POLICY "Users read own revenue" ON public."revenue_events"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Service role full access" ON public."revenue_log";
CREATE POLICY "Service role full access" ON public."revenue_log"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING ((((SELECT auth.jwt()) ->> 'role'::text) = 'service_role'::text));

DROP POLICY IF EXISTS "Users can insert own revenue log" ON public."revenue_log";
CREATE POLICY "Users can insert own revenue log" ON public."revenue_log"
  AS PERMISSIVE
  FOR INSERT
  TO public
  WITH CHECK (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can update own revenue log" ON public."revenue_log";
CREATE POLICY "Users can update own revenue log" ON public."revenue_log"
  AS PERMISSIVE
  FOR UPDATE
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can view own revenue log" ON public."revenue_log";
CREATE POLICY "Users can view own revenue log" ON public."revenue_log"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "revenue_plan_items_owner" ON public."revenue_plan_items";
CREATE POLICY "revenue_plan_items_owner" ON public."revenue_plan_items"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id))
  WITH CHECK (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "revenue_plans_owner" ON public."revenue_plans";
CREATE POLICY "revenue_plans_owner" ON public."revenue_plans"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id))
  WITH CHECK (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users own revenue" ON public."revenue_tracking";
CREATE POLICY "Users own revenue" ON public."revenue_tracking"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Authenticated users can read reward_content" ON public."reward_content";
CREATE POLICY "Authenticated users can read reward_content" ON public."reward_content"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING ((((SELECT auth.role()) = 'authenticated'::text) AND (is_active = true)));

DROP POLICY IF EXISTS "Users access own unlocks" ON public."reward_unlocks";
CREATE POLICY "Users access own unlocks" ON public."reward_unlocks"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can manage own ritual anchors" ON public."ritual_anchors";
CREATE POLICY "Users can manage own ritual anchors" ON public."ritual_anchors"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "safewords_owner" ON public."safewords";
CREATE POLICY "safewords_owner" ON public."safewords"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can manage their own scene_completions" ON public."scene_completions";
CREATE POLICY "Users can manage their own scene_completions" ON public."scene_completions"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users own their data" ON public."scent_conditioning";
CREATE POLICY "Users own their data" ON public."scent_conditioning"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can delete own pairings" ON public."scent_pairings";
CREATE POLICY "Users can delete own pairings" ON public."scent_pairings"
  AS PERMISSIVE
  FOR DELETE
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can insert own pairings" ON public."scent_pairings";
CREATE POLICY "Users can insert own pairings" ON public."scent_pairings"
  AS PERMISSIVE
  FOR INSERT
  TO public
  WITH CHECK (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can update own pairings" ON public."scent_pairings";
CREATE POLICY "Users can update own pairings" ON public."scent_pairings"
  AS PERMISSIVE
  FOR UPDATE
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can view own pairings" ON public."scent_pairings";
CREATE POLICY "Users can view own pairings" ON public."scent_pairings"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can delete own scents" ON public."scent_products";
CREATE POLICY "Users can delete own scents" ON public."scent_products"
  AS PERMISSIVE
  FOR DELETE
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can insert own scents" ON public."scent_products";
CREATE POLICY "Users can insert own scents" ON public."scent_products"
  AS PERMISSIVE
  FOR INSERT
  TO public
  WITH CHECK (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can update own scents" ON public."scent_products";
CREATE POLICY "Users can update own scents" ON public."scent_products"
  AS PERMISSIVE
  FOR UPDATE
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can view own scents" ON public."scent_products";
CREATE POLICY "Users can view own scents" ON public."scent_products"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users access own ambushes" ON public."scheduled_ambushes";
CREATE POLICY "Users access own ambushes" ON public."scheduled_ambushes"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can manage own scheduled_commitments" ON public."scheduled_commitments";
CREATE POLICY "Users can manage own scheduled_commitments" ON public."scheduled_commitments"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users access own scheduled_escalations" ON public."scheduled_escalations";
CREATE POLICY "Users access own scheduled_escalations" ON public."scheduled_escalations"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can view own scheduled" ON public."scheduled_escalations";
CREATE POLICY "Users can view own scheduled" ON public."scheduled_escalations"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can manage own scheduled_notifications" ON public."scheduled_notifications";
CREATE POLICY "Users can manage own scheduled_notifications" ON public."scheduled_notifications"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Service full scheduled_posts" ON public."scheduled_posts";
CREATE POLICY "Service full scheduled_posts" ON public."scheduled_posts"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.role()) = 'service_role'::text));

DROP POLICY IF EXISTS "Users read own posts summary" ON public."scheduled_posts";
CREATE POLICY "Users read own posts summary" ON public."scheduled_posts"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can update own sessions" ON public."scheduled_sessions";
CREATE POLICY "Users can update own sessions" ON public."scheduled_sessions"
  AS PERMISSIVE
  FOR UPDATE
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can view own sessions" ON public."scheduled_sessions";
CREATE POLICY "Users can view own sessions" ON public."scheduled_sessions"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "envelopes_insert" ON public."sealed_envelopes";
CREATE POLICY "envelopes_insert" ON public."sealed_envelopes"
  AS PERMISSIVE
  FOR INSERT
  TO public
  WITH CHECK (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "envelopes_select" ON public."sealed_envelopes";
CREATE POLICY "envelopes_select" ON public."sealed_envelopes"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "envelopes_update" ON public."sealed_envelopes";
CREATE POLICY "envelopes_update" ON public."sealed_envelopes"
  AS PERMISSIVE
  FOR UPDATE
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users access own letters" ON public."sealed_letters";
CREATE POLICY "Users access own letters" ON public."sealed_letters"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can manage own unlocks" ON public."sealed_unlocks";
CREATE POLICY "Users can manage own unlocks" ON public."sealed_unlocks"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can update own scripts" ON public."seed_scripts";
CREATE POLICY "Users can update own scripts" ON public."seed_scripts"
  AS PERMISSIVE
  FOR UPDATE
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can view own scripts" ON public."seed_scripts";
CREATE POLICY "Users can view own scripts" ON public."seed_scripts"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can manage their own self_reference_analysis" ON public."self_reference_analysis";
CREATE POLICY "Users can manage their own self_reference_analysis" ON public."self_reference_analysis"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users access own anchors" ON public."sensory_anchors";
CREATE POLICY "Users access own anchors" ON public."sensory_anchors"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users access own service_encounters" ON public."service_encounters";
CREATE POLICY "Users access own service_encounters" ON public."service_encounters"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can access own service_encounters" ON public."service_encounters";
CREATE POLICY "Users can access own service_encounters" ON public."service_encounters"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can delete own service log" ON public."service_log";
CREATE POLICY "Users can delete own service log" ON public."service_log"
  AS PERMISSIVE
  FOR DELETE
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can insert own service log" ON public."service_log";
CREATE POLICY "Users can insert own service log" ON public."service_log"
  AS PERMISSIVE
  FOR INSERT
  TO public
  WITH CHECK (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can view own service log" ON public."service_log";
CREATE POLICY "Users can view own service log" ON public."service_log"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users access own service_progression" ON public."service_progression";
CREATE POLICY "Users access own service_progression" ON public."service_progression"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can insert own affirmations" ON public."session_affirmations";
CREATE POLICY "Users can insert own affirmations" ON public."session_affirmations"
  AS PERMISSIVE
  FOR INSERT
  TO public
  WITH CHECK ((session_id IN ( SELECT edge_sessions.id
   FROM edge_sessions
  WHERE (edge_sessions.user_id = (SELECT auth.uid())))));

DROP POLICY IF EXISTS "Users can view own affirmations" ON public."session_affirmations";
CREATE POLICY "Users can view own affirmations" ON public."session_affirmations"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING ((session_id IN ( SELECT edge_sessions.id
   FROM edge_sessions
  WHERE (edge_sessions.user_id = (SELECT auth.uid())))));

DROP POLICY IF EXISTS "Users own session_biometrics" ON public."session_biometrics";
CREATE POLICY "Users own session_biometrics" ON public."session_biometrics"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can insert own commitments" ON public."session_commitments";
CREATE POLICY "Users can insert own commitments" ON public."session_commitments"
  AS PERMISSIVE
  FOR INSERT
  TO public
  WITH CHECK (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can update own commitments" ON public."session_commitments";
CREATE POLICY "Users can update own commitments" ON public."session_commitments"
  AS PERMISSIVE
  FOR UPDATE
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can view own commitments" ON public."session_commitments";
CREATE POLICY "Users can view own commitments" ON public."session_commitments"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users access own session_content" ON public."session_content_log";
CREATE POLICY "Users access own session_content" ON public."session_content_log"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can insert own content log" ON public."session_content_log";
CREATE POLICY "Users can insert own content log" ON public."session_content_log"
  AS PERMISSIVE
  FOR INSERT
  TO public
  WITH CHECK ((session_id IN ( SELECT edge_sessions.id
   FROM edge_sessions
  WHERE (edge_sessions.user_id = (SELECT auth.uid())))));

DROP POLICY IF EXISTS "Users can view own content log" ON public."session_content_log";
CREATE POLICY "Users can view own content log" ON public."session_content_log"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING ((session_id IN ( SELECT edge_sessions.id
   FROM edge_sessions
  WHERE (edge_sessions.user_id = (SELECT auth.uid())))));

DROP POLICY IF EXISTS "Users can manage their own session_depth" ON public."session_depth";
CREATE POLICY "Users can manage their own session_depth" ON public."session_depth"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users access own guidance" ON public."session_guidance_log";
CREATE POLICY "Users access own guidance" ON public."session_guidance_log"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Authenticated users can read session_scripts" ON public."session_scripts";
CREATE POLICY "Authenticated users can read session_scripts" ON public."session_scripts"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (((SELECT auth.role()) = 'authenticated'::text));

DROP POLICY IF EXISTS "Service only sex_work" ON public."sex_work_progression";
CREATE POLICY "Service only sex_work" ON public."sex_work_progression"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.role()) = 'service_role'::text));

DROP POLICY IF EXISTS "sexting_conversations_user" ON public."sexting_conversations";
CREATE POLICY "sexting_conversations_user" ON public."sexting_conversations"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "sexting_templates_user" ON public."sexting_templates";
CREATE POLICY "sexting_templates_user" ON public."sexting_templates"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users own shame architecture" ON public."shame_architecture";
CREATE POLICY "Users own shame architecture" ON public."shame_architecture"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users own shame exposures" ON public."shame_exposures";
CREATE POLICY "Users own shame exposures" ON public."shame_exposures"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "shame_journal_insert" ON public."shame_journal";
CREATE POLICY "shame_journal_insert" ON public."shame_journal"
  AS PERMISSIVE
  FOR INSERT
  TO public
  WITH CHECK (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "shame_journal_select" ON public."shame_journal";
CREATE POLICY "shame_journal_select" ON public."shame_journal"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "shoot_prescriptions_user" ON public."shoot_prescriptions";
CREATE POLICY "shoot_prescriptions_user" ON public."shoot_prescriptions"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "skill_domains_delete" ON public."skill_domains";
CREATE POLICY "skill_domains_delete" ON public."skill_domains"
  AS PERMISSIVE
  FOR DELETE
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "skill_domains_insert" ON public."skill_domains";
CREATE POLICY "skill_domains_insert" ON public."skill_domains"
  AS PERMISSIVE
  FOR INSERT
  TO public
  WITH CHECK (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "skill_domains_select" ON public."skill_domains";
CREATE POLICY "skill_domains_select" ON public."skill_domains"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "skill_domains_update" ON public."skill_domains";
CREATE POLICY "skill_domains_update" ON public."skill_domains"
  AS PERMISSIVE
  FOR UPDATE
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "skill_levels_insert" ON public."skill_levels";
CREATE POLICY "skill_levels_insert" ON public."skill_levels"
  AS PERMISSIVE
  FOR INSERT
  TO public
  WITH CHECK (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "skill_levels_select" ON public."skill_levels";
CREATE POLICY "skill_levels_select" ON public."skill_levels"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "skill_levels_update" ON public."skill_levels";
CREATE POLICY "skill_levels_update" ON public."skill_levels"
  AS PERMISSIVE
  FOR UPDATE
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "skip_consequences_user" ON public."skip_consequences";
CREATE POLICY "skip_consequences_user" ON public."skip_consequences"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users own sleep_conditioning_tracking" ON public."sleep_conditioning_tracking";
CREATE POLICY "Users own sleep_conditioning_tracking" ON public."sleep_conditioning_tracking"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "sleep_content_user" ON public."sleep_content";
CREATE POLICY "sleep_content_user" ON public."sleep_content"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "sleep_config_user" ON public."sleep_content_config";
CREATE POLICY "sleep_config_user" ON public."sleep_content_config"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "sleep_sessions_user" ON public."sleep_sessions";
CREATE POLICY "sleep_sessions_user" ON public."sleep_sessions"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users own slips" ON public."slip_log";
CREATE POLICY "Users own slips" ON public."slip_log"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "slg_service_all" ON public."slop_log_grades";
CREATE POLICY "slg_service_all" ON public."slop_log_grades"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING ((((SELECT auth.jwt()) ->> 'role'::text) = 'service_role'::text))
  WITH CHECK ((((SELECT auth.jwt()) ->> 'role'::text) = 'service_role'::text));

DROP POLICY IF EXISTS "slg_user_select" ON public."slop_log_grades";
CREATE POLICY "slg_user_select" ON public."slop_log_grades"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Service role full access social_inbox" ON public."social_inbox";
CREATE POLICY "Service role full access social_inbox" ON public."social_inbox"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.role()) = 'service_role'::text));

DROP POLICY IF EXISTS "Users can insert own social_inbox" ON public."social_inbox";
CREATE POLICY "Users can insert own social_inbox" ON public."social_inbox"
  AS PERMISSIVE
  FOR INSERT
  TO public
  WITH CHECK (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can read own social_inbox" ON public."social_inbox";
CREATE POLICY "Users can read own social_inbox" ON public."social_inbox"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can update own social_inbox" ON public."social_inbox";
CREATE POLICY "Users can update own social_inbox" ON public."social_inbox"
  AS PERMISSIVE
  FOR UPDATE
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users own social web" ON public."social_web";
CREATE POLICY "Users own social web" ON public."social_web"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users access own state_history" ON public."state_history";
CREATE POLICY "Users access own state_history" ON public."state_history"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can read own predictions" ON public."state_predictions";
CREATE POLICY "Users can read own predictions" ON public."state_predictions"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users access own streaks" ON public."state_streaks";
CREATE POLICY "Users access own streaks" ON public."state_streaks"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "stealth_pin_delete_own" ON public."stealth_pin";
CREATE POLICY "stealth_pin_delete_own" ON public."stealth_pin"
  AS PERMISSIVE
  FOR DELETE
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "stealth_pin_insert_own" ON public."stealth_pin";
CREATE POLICY "stealth_pin_insert_own" ON public."stealth_pin"
  AS PERMISSIVE
  FOR INSERT
  TO public
  WITH CHECK (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "stealth_pin_select_own" ON public."stealth_pin";
CREATE POLICY "stealth_pin_select_own" ON public."stealth_pin"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "stealth_pin_update_own" ON public."stealth_pin";
CREATE POLICY "stealth_pin_update_own" ON public."stealth_pin"
  AS PERMISSIVE
  FOR UPDATE
  TO public
  USING (((SELECT auth.uid()) = user_id))
  WITH CHECK (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can insert own arcs" ON public."story_arcs";
CREATE POLICY "Users can insert own arcs" ON public."story_arcs"
  AS PERMISSIVE
  FOR INSERT
  TO public
  WITH CHECK (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can update own arcs" ON public."story_arcs";
CREATE POLICY "Users can update own arcs" ON public."story_arcs"
  AS PERMISSIVE
  FOR UPDATE
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can view own arcs" ON public."story_arcs";
CREATE POLICY "Users can view own arcs" ON public."story_arcs"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can manage own streak_snapshots" ON public."streak_snapshots";
CREATE POLICY "Users can manage own streak_snapshots" ON public."streak_snapshots"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can manage their own submission_metrics" ON public."submission_metrics";
CREATE POLICY "Users can manage their own submission_metrics" ON public."submission_metrics"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "symptom_schedule_owner" ON public."suggested_symptom_schedule";
CREATE POLICY "symptom_schedule_owner" ON public."suggested_symptom_schedule"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id))
  WITH CHECK (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "supplement_log_owner" ON public."supplement_log";
CREATE POLICY "supplement_log_owner" ON public."supplement_log"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "supplement_schedule_owner" ON public."supplement_schedule";
CREATE POLICY "supplement_schedule_owner" ON public."supplement_schedule"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Authenticated users can read changelog" ON public."system_changelog";
CREATE POLICY "Authenticated users can read changelog" ON public."system_changelog"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (((SELECT auth.role()) = 'authenticated'::text));

DROP POLICY IF EXISTS "target_tributes_owner" ON public."target_tributes";
CREATE POLICY "target_tributes_owner" ON public."target_tributes"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id))
  WITH CHECK (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "task_auctions_user" ON public."task_auctions";
CREATE POLICY "task_auctions_user" ON public."task_auctions"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Task bank readable by authenticated" ON public."task_bank";
CREATE POLICY "Task bank readable by authenticated" ON public."task_bank"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (((SELECT auth.role()) = 'authenticated'::text));

DROP POLICY IF EXISTS "Users can delete own completions" ON public."task_completions";
CREATE POLICY "Users can delete own completions" ON public."task_completions"
  AS PERMISSIVE
  FOR DELETE
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can insert own completions" ON public."task_completions";
CREATE POLICY "Users can insert own completions" ON public."task_completions"
  AS PERMISSIVE
  FOR INSERT
  TO public
  WITH CHECK (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can insert own task completions" ON public."task_completions";
CREATE POLICY "Users can insert own task completions" ON public."task_completions"
  AS PERMISSIVE
  FOR INSERT
  TO public
  WITH CHECK (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can update own completions" ON public."task_completions";
CREATE POLICY "Users can update own completions" ON public."task_completions"
  AS PERMISSIVE
  FOR UPDATE
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can view own completions" ON public."task_completions";
CREATE POLICY "Users can view own completions" ON public."task_completions"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can view own task completions" ON public."task_completions";
CREATE POLICY "Users can view own task completions" ON public."task_completions"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users own task_completions" ON public."task_completions";
CREATE POLICY "Users own task_completions" ON public."task_completions"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "task_listings_user" ON public."task_listings";
CREATE POLICY "task_listings_user" ON public."task_listings"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "task_orders_user" ON public."task_orders";
CREATE POLICY "task_orders_user" ON public."task_orders"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can insert own resistance" ON public."task_resistance";
CREATE POLICY "Users can insert own resistance" ON public."task_resistance"
  AS PERMISSIVE
  FOR INSERT
  TO public
  WITH CHECK (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can update own resistance" ON public."task_resistance";
CREATE POLICY "Users can update own resistance" ON public."task_resistance"
  AS PERMISSIVE
  FOR UPDATE
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can view own resistance" ON public."task_resistance";
CREATE POLICY "Users can view own resistance" ON public."task_resistance"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users own task_resistance" ON public."task_resistance";
CREATE POLICY "Users own task_resistance" ON public."task_resistance"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Only service role can modify task resources" ON public."task_resources";
CREATE POLICY "Only service role can modify task resources" ON public."task_resources"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.role()) = 'service_role'::text));

DROP POLICY IF EXISTS "Task resources are viewable by authenticated users" ON public."task_resources";
CREATE POLICY "Task resources are viewable by authenticated users" ON public."task_resources"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (((SELECT auth.role()) = 'authenticated'::text));

DROP POLICY IF EXISTS "Task templates are viewable by authenticated users" ON public."task_templates";
CREATE POLICY "Task templates are viewable by authenticated users" ON public."task_templates"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (((SELECT auth.role()) = 'authenticated'::text));

DROP POLICY IF EXISTS "Users can insert own completion log" ON public."template_completion_log";
CREATE POLICY "Users can insert own completion log" ON public."template_completion_log"
  AS PERMISSIVE
  FOR INSERT
  TO public
  WITH CHECK (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can view own completion log" ON public."template_completion_log";
CREATE POLICY "Users can view own completion log" ON public."template_completion_log"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users access own time_capsules" ON public."time_capsules";
CREATE POLICY "Users access own time_capsules" ON public."time_capsules"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users access own timeline" ON public."timeline_events";
CREATE POLICY "Users access own timeline" ON public."timeline_events"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "service writes trajectory" ON public."trajectory_predictions";
CREATE POLICY "service writes trajectory" ON public."trajectory_predictions"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.role()) = 'service_role'::text))
  WITH CHECK (((SELECT auth.role()) = 'service_role'::text));

DROP POLICY IF EXISTS "user reads own trajectory" ON public."trajectory_predictions";
CREATE POLICY "user reads own trajectory" ON public."trajectory_predictions"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users own their data" ON public."trance_progression";
CREATE POLICY "Users own their data" ON public."trance_progression"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users access own journal" ON public."transformation_journal";
CREATE POLICY "Users access own journal" ON public."transformation_journal"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "milestones_insert" ON public."transformation_milestones";
CREATE POLICY "milestones_insert" ON public."transformation_milestones"
  AS PERMISSIVE
  FOR INSERT
  TO public
  WITH CHECK (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "milestones_select" ON public."transformation_milestones";
CREATE POLICY "milestones_select" ON public."transformation_milestones"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "phase_defs_service_write" ON public."transformation_phase_defs";
CREATE POLICY "phase_defs_service_write" ON public."transformation_phase_defs"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.role()) = 'service_role'::text))
  WITH CHECK (((SELECT auth.role()) = 'service_role'::text));

DROP POLICY IF EXISTS "tribute_links own" ON public."tribute_links";
CREATE POLICY "tribute_links own" ON public."tribute_links"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id))
  WITH CHECK (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "tribute_offers own" ON public."tribute_offers";
CREATE POLICY "tribute_offers own" ON public."tribute_offers"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id))
  WITH CHECK (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users own trigger deployments" ON public."trigger_deployments";
CREATE POLICY "Users own trigger deployments" ON public."trigger_deployments"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "turning_out_progression_delete" ON public."turning_out_progression";
CREATE POLICY "turning_out_progression_delete" ON public."turning_out_progression"
  AS PERMISSIVE
  FOR DELETE
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "turning_out_progression_insert" ON public."turning_out_progression";
CREATE POLICY "turning_out_progression_insert" ON public."turning_out_progression"
  AS PERMISSIVE
  FOR INSERT
  TO public
  WITH CHECK (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "turning_out_progression_select" ON public."turning_out_progression";
CREATE POLICY "turning_out_progression_select" ON public."turning_out_progression"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "turning_out_progression_update" ON public."turning_out_progression";
CREATE POLICY "turning_out_progression_update" ON public."turning_out_progression"
  AS PERMISSIVE
  FOR UPDATE
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users insert own follower counts" ON public."twitter_follower_counts";
CREATE POLICY "Users insert own follower counts" ON public."twitter_follower_counts"
  AS PERMISSIVE
  FOR INSERT
  TO public
  WITH CHECK (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users see own follower counts" ON public."twitter_follower_counts";
CREATE POLICY "Users see own follower counts" ON public."twitter_follower_counts"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users manage own follower snapshots" ON public."twitter_followers_snapshot";
CREATE POLICY "Users manage own follower snapshots" ON public."twitter_followers_snapshot"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users see own followers" ON public."twitter_followers_snapshot";
CREATE POLICY "Users see own followers" ON public."twitter_followers_snapshot"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users manage own follows" ON public."twitter_follows";
CREATE POLICY "Users manage own follows" ON public."twitter_follows"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users see own follows" ON public."twitter_follows";
CREATE POLICY "Users see own follows" ON public."twitter_follows"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users own twitter profile config" ON public."twitter_profile_config";
CREATE POLICY "Users own twitter profile config" ON public."twitter_profile_config"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "user own friction" ON public."ui_friction_log";
CREATE POLICY "user own friction" ON public."ui_friction_log"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id))
  WITH CHECK (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can manage own user_achievements" ON public."user_achievements";
CREATE POLICY "Users can manage own user_achievements" ON public."user_achievements"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "user_alias_owner_read" ON public."user_alias";
CREATE POLICY "user_alias_owner_read" ON public."user_alias"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING ((((SELECT auth.uid()) = canonical_user_id) OR ((SELECT auth.uid()) = alias_user_id)));

DROP POLICY IF EXISTS "Users can view own analytics" ON public."user_analytics";
CREATE POLICY "Users can view own analytics" ON public."user_analytics"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can manage own user_anchors" ON public."user_anchors";
CREATE POLICY "Users can manage own user_anchors" ON public."user_anchors"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can insert own ceremonies" ON public."user_ceremonies";
CREATE POLICY "Users can insert own ceremonies" ON public."user_ceremonies"
  AS PERMISSIVE
  FOR INSERT
  TO public
  WITH CHECK (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can update own ceremonies" ON public."user_ceremonies";
CREATE POLICY "Users can update own ceremonies" ON public."user_ceremonies"
  AS PERMISSIVE
  FOR UPDATE
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can view own ceremonies" ON public."user_ceremonies";
CREATE POLICY "Users can view own ceremonies" ON public."user_ceremonies"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users own user_ceremonies" ON public."user_ceremonies";
CREATE POLICY "Users own user_ceremonies" ON public."user_ceremonies"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users own user_commitments" ON public."user_commitments";
CREATE POLICY "Users own user_commitments" ON public."user_commitments"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "user_conditioning_state_insert" ON public."user_conditioning_state";
CREATE POLICY "user_conditioning_state_insert" ON public."user_conditioning_state"
  AS PERMISSIVE
  FOR INSERT
  TO public
  WITH CHECK (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "user_conditioning_state_select" ON public."user_conditioning_state";
CREATE POLICY "user_conditioning_state_select" ON public."user_conditioning_state"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "user_conditioning_state_update" ON public."user_conditioning_state";
CREATE POLICY "user_conditioning_state_update" ON public."user_conditioning_state"
  AS PERMISSIVE
  FOR UPDATE
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can manage own content_unlocks" ON public."user_content_unlocks";
CREATE POLICY "Users can manage own content_unlocks" ON public."user_content_unlocks"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users own user_escalation_status" ON public."user_escalation_status";
CREATE POLICY "Users own user_escalation_status" ON public."user_escalation_status"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can insert own data" ON public."user_learning_patterns";
CREATE POLICY "Users can insert own data" ON public."user_learning_patterns"
  AS PERMISSIVE
  FOR INSERT
  TO public
  WITH CHECK (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can update own data" ON public."user_learning_patterns";
CREATE POLICY "Users can update own data" ON public."user_learning_patterns"
  AS PERMISSIVE
  FOR UPDATE
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can view own data" ON public."user_learning_patterns";
CREATE POLICY "Users can view own data" ON public."user_learning_patterns"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users own their learning patterns" ON public."user_learning_patterns";
CREATE POLICY "Users own their learning patterns" ON public."user_learning_patterns"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can insert own data" ON public."user_learning_profiles";
CREATE POLICY "Users can insert own data" ON public."user_learning_profiles"
  AS PERMISSIVE
  FOR INSERT
  TO public
  WITH CHECK (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can update own data" ON public."user_learning_profiles";
CREATE POLICY "Users can update own data" ON public."user_learning_profiles"
  AS PERMISSIVE
  FOR UPDATE
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can view own data" ON public."user_learning_profiles";
CREATE POLICY "Users can view own data" ON public."user_learning_profiles"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users own their learning profile" ON public."user_learning_profiles";
CREATE POLICY "Users own their learning profile" ON public."user_learning_profiles"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can manage own notification_settings" ON public."user_notification_settings";
CREATE POLICY "Users can manage own notification_settings" ON public."user_notification_settings"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "user_profiles_all" ON public."user_profiles";
CREATE POLICY "user_profiles_all" ON public."user_profiles"
  AS PERMISSIVE
  FOR ALL
  TO authenticated
  USING (((SELECT auth.uid()) = user_id))
  WITH CHECK (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "user_progress_all" ON public."user_progress";
CREATE POLICY "user_progress_all" ON public."user_progress"
  AS PERMISSIVE
  FOR ALL
  TO authenticated
  USING (((SELECT auth.uid()) = user_id))
  WITH CHECK (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can manage own reward_state" ON public."user_reward_state";
CREATE POLICY "Users can manage own reward_state" ON public."user_reward_state"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can insert own stats" ON public."user_session_stats";
CREATE POLICY "Users can insert own stats" ON public."user_session_stats"
  AS PERMISSIVE
  FOR INSERT
  TO public
  WITH CHECK (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can update own stats" ON public."user_session_stats";
CREATE POLICY "Users can update own stats" ON public."user_session_stats"
  AS PERMISSIVE
  FOR UPDATE
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can view own stats" ON public."user_session_stats";
CREATE POLICY "Users can view own stats" ON public."user_session_stats"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users access own user_state" ON public."user_state";
CREATE POLICY "Users access own user_state" ON public."user_state"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "skip_own" ON public."user_task_skip_list";
CREATE POLICY "skip_own" ON public."user_task_skip_list"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id))
  WITH CHECK (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can insert own template history" ON public."user_template_history";
CREATE POLICY "Users can insert own template history" ON public."user_template_history"
  AS PERMISSIVE
  FOR INSERT
  TO public
  WITH CHECK (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can update own template history" ON public."user_template_history";
CREATE POLICY "Users can update own template history" ON public."user_template_history"
  AS PERMISSIVE
  FOR UPDATE
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can view own template history" ON public."user_template_history";
CREATE POLICY "Users can view own template history" ON public."user_template_history"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can insert own data" ON public."user_vector_states";
CREATE POLICY "Users can insert own data" ON public."user_vector_states"
  AS PERMISSIVE
  FOR INSERT
  TO public
  WITH CHECK (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can update own data" ON public."user_vector_states";
CREATE POLICY "Users can update own data" ON public."user_vector_states"
  AS PERMISSIVE
  FOR UPDATE
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can view own data" ON public."user_vector_states";
CREATE POLICY "Users can view own data" ON public."user_vector_states"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users own their vector states" ON public."user_vector_states";
CREATE POLICY "Users own their vector states" ON public."user_vector_states"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users own voice corpus" ON public."user_voice_corpus";
CREATE POLICY "Users own voice corpus" ON public."user_voice_corpus"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users own voice profile" ON public."user_voice_profile";
CREATE POLICY "Users own voice profile" ON public."user_voice_profile"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "service writes vac log" ON public."vacation_mode_log";
CREATE POLICY "service writes vac log" ON public."vacation_mode_log"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.role()) = 'service_role'::text))
  WITH CHECK (((SELECT auth.role()) = 'service_role'::text));

DROP POLICY IF EXISTS "user reads own vac log" ON public."vacation_mode_log";
CREATE POLICY "user reads own vac log" ON public."vacation_mode_log"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "vault_privacy_settings_owner" ON public."vault_privacy_settings";
CREATE POLICY "vault_privacy_settings_owner" ON public."vault_privacy_settings"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id))
  WITH CHECK (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can insert own data" ON public."vector_engagement_records";
CREATE POLICY "Users can insert own data" ON public."vector_engagement_records"
  AS PERMISSIVE
  FOR INSERT
  TO public
  WITH CHECK (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can update own data" ON public."vector_engagement_records";
CREATE POLICY "Users can update own data" ON public."vector_engagement_records"
  AS PERMISSIVE
  FOR UPDATE
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can view own data" ON public."vector_engagement_records";
CREATE POLICY "Users can view own data" ON public."vector_engagement_records"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users own their engagement records" ON public."vector_engagement_records";
CREATE POLICY "Users own their engagement records" ON public."vector_engagement_records"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can insert own data" ON public."vector_lock_in_status";
CREATE POLICY "Users can insert own data" ON public."vector_lock_in_status"
  AS PERMISSIVE
  FOR INSERT
  TO public
  WITH CHECK (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can update own data" ON public."vector_lock_in_status";
CREATE POLICY "Users can update own data" ON public."vector_lock_in_status"
  AS PERMISSIVE
  FOR UPDATE
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can view own data" ON public."vector_lock_in_status";
CREATE POLICY "Users can view own data" ON public."vector_lock_in_status"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users own their lock-in status" ON public."vector_lock_in_status";
CREATE POLICY "Users own their lock-in status" ON public."vector_lock_in_status"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can insert own data" ON public."vector_progress_history";
CREATE POLICY "Users can insert own data" ON public."vector_progress_history"
  AS PERMISSIVE
  FOR INSERT
  TO public
  WITH CHECK (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can update own data" ON public."vector_progress_history";
CREATE POLICY "Users can update own data" ON public."vector_progress_history"
  AS PERMISSIVE
  FOR UPDATE
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can view own data" ON public."vector_progress_history";
CREATE POLICY "Users can view own data" ON public."vector_progress_history"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users own their progress history" ON public."vector_progress_history";
CREATE POLICY "Users own their progress history" ON public."vector_progress_history"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "verification_photos_insert" ON public."verification_photos";
CREATE POLICY "verification_photos_insert" ON public."verification_photos"
  AS PERMISSIVE
  FOR INSERT
  TO public
  WITH CHECK (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "verification_photos_select" ON public."verification_photos";
CREATE POLICY "verification_photos_select" ON public."verification_photos"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "verification_photos_update" ON public."verification_photos";
CREATE POLICY "verification_photos_update" ON public."verification_photos"
  AS PERMISSIVE
  FOR UPDATE
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can insert own veto log" ON public."veto_log";
CREATE POLICY "Users can insert own veto log" ON public."veto_log"
  AS PERMISSIVE
  FOR INSERT
  TO public
  WITH CHECK (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can view own veto log" ON public."veto_log";
CREATE POLICY "Users can view own veto log" ON public."veto_log"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can manage their own visibility_acts" ON public."visibility_acts";
CREATE POLICY "Users can manage their own visibility_acts" ON public."visibility_acts"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Authenticated users can view affirmations" ON public."voice_affirmations";
CREATE POLICY "Authenticated users can view affirmations" ON public."voice_affirmations"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (((SELECT auth.role()) = 'authenticated'::text));

DROP POLICY IF EXISTS "voice_daily_aggregates_user" ON public."voice_daily_aggregates";
CREATE POLICY "voice_daily_aggregates_user" ON public."voice_daily_aggregates"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can insert own drill logs" ON public."voice_drill_logs";
CREATE POLICY "Users can insert own drill logs" ON public."voice_drill_logs"
  AS PERMISSIVE
  FOR INSERT
  TO public
  WITH CHECK (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can view own drill logs" ON public."voice_drill_logs";
CREATE POLICY "Users can view own drill logs" ON public."voice_drill_logs"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Authenticated users can view drills" ON public."voice_drills";
CREATE POLICY "Authenticated users can view drills" ON public."voice_drills"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (((SELECT auth.role()) = 'authenticated'::text));

DROP POLICY IF EXISTS "Authenticated users can view achievements" ON public."voice_game_achievements";
CREATE POLICY "Authenticated users can view achievements" ON public."voice_game_achievements"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (((SELECT auth.role()) = 'authenticated'::text));

DROP POLICY IF EXISTS "Users can insert own attempts" ON public."voice_game_attempts";
CREATE POLICY "Users can insert own attempts" ON public."voice_game_attempts"
  AS PERMISSIVE
  FOR INSERT
  TO public
  WITH CHECK ((session_id IN ( SELECT voice_game_sessions.id
   FROM voice_game_sessions
  WHERE (voice_game_sessions.user_id = (SELECT auth.uid())))));

DROP POLICY IF EXISTS "Users can view own attempts" ON public."voice_game_attempts";
CREATE POLICY "Users can view own attempts" ON public."voice_game_attempts"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING ((session_id IN ( SELECT voice_game_sessions.id
   FROM voice_game_sessions
  WHERE (voice_game_sessions.user_id = (SELECT auth.uid())))));

DROP POLICY IF EXISTS "Users can insert own progress" ON public."voice_game_progress";
CREATE POLICY "Users can insert own progress" ON public."voice_game_progress"
  AS PERMISSIVE
  FOR INSERT
  TO public
  WITH CHECK (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can update own progress" ON public."voice_game_progress";
CREATE POLICY "Users can update own progress" ON public."voice_game_progress"
  AS PERMISSIVE
  FOR UPDATE
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can view own progress" ON public."voice_game_progress";
CREATE POLICY "Users can view own progress" ON public."voice_game_progress"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can insert own sessions" ON public."voice_game_sessions";
CREATE POLICY "Users can insert own sessions" ON public."voice_game_sessions"
  AS PERMISSIVE
  FOR INSERT
  TO public
  WITH CHECK (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can update own sessions" ON public."voice_game_sessions";
CREATE POLICY "Users can update own sessions" ON public."voice_game_sessions"
  AS PERMISSIVE
  FOR UPDATE
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can view own sessions" ON public."voice_game_sessions";
CREATE POLICY "Users can view own sessions" ON public."voice_game_sessions"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can insert own settings" ON public."voice_game_settings";
CREATE POLICY "Users can insert own settings" ON public."voice_game_settings"
  AS PERMISSIVE
  FOR INSERT
  TO public
  WITH CHECK (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can update own settings" ON public."voice_game_settings";
CREATE POLICY "Users can update own settings" ON public."voice_game_settings"
  AS PERMISSIVE
  FOR UPDATE
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can view own settings" ON public."voice_game_settings";
CREATE POLICY "Users can view own settings" ON public."voice_game_settings"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can insert own achievements" ON public."voice_game_user_achievements";
CREATE POLICY "Users can insert own achievements" ON public."voice_game_user_achievements"
  AS PERMISSIVE
  FOR INSERT
  TO public
  WITH CHECK (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can view own achievements" ON public."voice_game_user_achievements";
CREATE POLICY "Users can view own achievements" ON public."voice_game_user_achievements"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "voice_interventions_user" ON public."voice_interventions";
CREATE POLICY "voice_interventions_user" ON public."voice_interventions"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users own voice levels" ON public."voice_levels";
CREATE POLICY "Users own voice levels" ON public."voice_levels"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "voice_pitch_floor_owner" ON public."voice_pitch_floor";
CREATE POLICY "voice_pitch_floor_owner" ON public."voice_pitch_floor"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id))
  WITH CHECK (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can insert own pitch logs" ON public."voice_pitch_logs";
CREATE POLICY "Users can insert own pitch logs" ON public."voice_pitch_logs"
  AS PERMISSIVE
  FOR INSERT
  TO public
  WITH CHECK (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can view own pitch logs" ON public."voice_pitch_logs";
CREATE POLICY "Users can view own pitch logs" ON public."voice_pitch_logs"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can insert own voice_pitch_samples" ON public."voice_pitch_samples";
CREATE POLICY "Users can insert own voice_pitch_samples" ON public."voice_pitch_samples"
  AS PERMISSIVE
  FOR INSERT
  TO public
  WITH CHECK (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can read own voice_pitch_samples" ON public."voice_pitch_samples";
CREATE POLICY "Users can read own voice_pitch_samples" ON public."voice_pitch_samples"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can update own voice_pitch_samples" ON public."voice_pitch_samples";
CREATE POLICY "Users can update own voice_pitch_samples" ON public."voice_pitch_samples"
  AS PERMISSIVE
  FOR UPDATE
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "voice_practice_log_insert" ON public."voice_practice_log";
CREATE POLICY "voice_practice_log_insert" ON public."voice_practice_log"
  AS PERMISSIVE
  FOR INSERT
  TO public
  WITH CHECK (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "voice_practice_log_select" ON public."voice_practice_log";
CREATE POLICY "voice_practice_log_select" ON public."voice_practice_log"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "voice_practice_log_update" ON public."voice_practice_log";
CREATE POLICY "voice_practice_log_update" ON public."voice_practice_log"
  AS PERMISSIVE
  FOR UPDATE
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can delete own recordings" ON public."voice_recordings";
CREATE POLICY "Users can delete own recordings" ON public."voice_recordings"
  AS PERMISSIVE
  FOR DELETE
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can insert own recordings" ON public."voice_recordings";
CREATE POLICY "Users can insert own recordings" ON public."voice_recordings"
  AS PERMISSIVE
  FOR INSERT
  TO public
  WITH CHECK (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can view own recordings" ON public."voice_recordings";
CREATE POLICY "Users can view own recordings" ON public."voice_recordings"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users manage own wardrobe" ON public."wardrobe_inventory";
CREATE POLICY "Users manage own wardrobe" ON public."wardrobe_inventory"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "wardrobe_delete_own" ON public."wardrobe_items";
CREATE POLICY "wardrobe_delete_own" ON public."wardrobe_items"
  AS PERMISSIVE
  FOR DELETE
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "wardrobe_insert_own" ON public."wardrobe_items";
CREATE POLICY "wardrobe_insert_own" ON public."wardrobe_items"
  AS PERMISSIVE
  FOR INSERT
  TO public
  WITH CHECK (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "wardrobe_select_own" ON public."wardrobe_items";
CREATE POLICY "wardrobe_select_own" ON public."wardrobe_items"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "wardrobe_service_all" ON public."wardrobe_items";
CREATE POLICY "wardrobe_service_all" ON public."wardrobe_items"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.role()) = 'service_role'::text))
  WITH CHECK (((SELECT auth.role()) = 'service_role'::text));

DROP POLICY IF EXISTS "wardrobe_update_own" ON public."wardrobe_items";
CREATE POLICY "wardrobe_update_own" ON public."wardrobe_items"
  AS PERMISSIVE
  FOR UPDATE
  TO public
  USING (((SELECT auth.uid()) = user_id))
  WITH CHECK (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "wardrobe_presc_settings_owner" ON public."wardrobe_prescription_settings";
CREATE POLICY "wardrobe_presc_settings_owner" ON public."wardrobe_prescription_settings"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id))
  WITH CHECK (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "wardrobe_prescriptions_owner" ON public."wardrobe_prescriptions";
CREATE POLICY "wardrobe_prescriptions_owner" ON public."wardrobe_prescriptions"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id))
  WITH CHECK (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "weekend_plans_delete" ON public."weekend_plans";
CREATE POLICY "weekend_plans_delete" ON public."weekend_plans"
  AS PERMISSIVE
  FOR DELETE
  TO authenticated
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "weekend_plans_insert" ON public."weekend_plans";
CREATE POLICY "weekend_plans_insert" ON public."weekend_plans"
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "weekend_plans_select" ON public."weekend_plans";
CREATE POLICY "weekend_plans_select" ON public."weekend_plans"
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "weekend_plans_update" ON public."weekend_plans";
CREATE POLICY "weekend_plans_update" ON public."weekend_plans"
  AS PERMISSIVE
  FOR UPDATE
  TO authenticated
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users access own weekend_plans_v2" ON public."weekend_plans_v2";
CREATE POLICY "Users access own weekend_plans_v2" ON public."weekend_plans_v2"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "weekend_sessions_delete" ON public."weekend_sessions";
CREATE POLICY "weekend_sessions_delete" ON public."weekend_sessions"
  AS PERMISSIVE
  FOR DELETE
  TO authenticated
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "weekend_sessions_insert" ON public."weekend_sessions";
CREATE POLICY "weekend_sessions_insert" ON public."weekend_sessions"
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "weekend_sessions_select" ON public."weekend_sessions";
CREATE POLICY "weekend_sessions_select" ON public."weekend_sessions"
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "weekend_sessions_update" ON public."weekend_sessions";
CREATE POLICY "weekend_sessions_update" ON public."weekend_sessions"
  AS PERMISSIVE
  FOR UPDATE
  TO authenticated
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "whoop_daily_insert" ON public."whoop_daily";
CREATE POLICY "whoop_daily_insert" ON public."whoop_daily"
  AS PERMISSIVE
  FOR INSERT
  TO public
  WITH CHECK (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "whoop_daily_select" ON public."whoop_daily";
CREATE POLICY "whoop_daily_select" ON public."whoop_daily"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "whoop_daily_update" ON public."whoop_daily";
CREATE POLICY "whoop_daily_update" ON public."whoop_daily"
  AS PERMISSIVE
  FOR UPDATE
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can read own whoop metrics" ON public."whoop_metrics";
CREATE POLICY "Users can read own whoop metrics" ON public."whoop_metrics"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can read own whoop tokens" ON public."whoop_tokens";
CREATE POLICY "Users can read own whoop tokens" ON public."whoop_tokens"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can update own whoop tokens" ON public."whoop_tokens";
CREATE POLICY "Users can update own whoop tokens" ON public."whoop_tokens"
  AS PERMISSIVE
  FOR UPDATE
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can read own whoop workouts" ON public."whoop_workouts";
CREATE POLICY "Users can read own whoop workouts" ON public."whoop_workouts"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can delete own wigs" ON public."wig_collection";
CREATE POLICY "Users can delete own wigs" ON public."wig_collection"
  AS PERMISSIVE
  FOR DELETE
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can insert own wigs" ON public."wig_collection";
CREATE POLICY "Users can insert own wigs" ON public."wig_collection"
  AS PERMISSIVE
  FOR INSERT
  TO public
  WITH CHECK (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can update own wigs" ON public."wig_collection";
CREATE POLICY "Users can update own wigs" ON public."wig_collection"
  AS PERMISSIVE
  FOR UPDATE
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can view own wigs" ON public."wig_collection";
CREATE POLICY "Users can view own wigs" ON public."wig_collection"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can manage own wishlist_archive" ON public."wishlist_archive";
CREATE POLICY "Users can manage own wishlist_archive" ON public."wishlist_archive"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can manage own wishlist" ON public."wishlist_items";
CREATE POLICY "Users can manage own wishlist" ON public."wishlist_items"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can manage own shares" ON public."wishlist_shares";
CREATE POLICY "Users can manage own shares" ON public."wishlist_shares"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users access own withdrawal" ON public."withdrawal_logs";
CREATE POLICY "Users access own withdrawal" ON public."withdrawal_logs"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "wf_own" ON public."witness_fabrications";
CREATE POLICY "wf_own" ON public."witness_fabrications"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id))
  WITH CHECK (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "witness_notif_insert" ON public."witness_notifications";
CREATE POLICY "witness_notif_insert" ON public."witness_notifications"
  AS PERMISSIVE
  FOR INSERT
  TO public
  WITH CHECK (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "witness_notif_select" ON public."witness_notifications";
CREATE POLICY "witness_notif_select" ON public."witness_notifications"
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "witnesses_owner" ON public."witnesses";
CREATE POLICY "witnesses_owner" ON public."witnesses"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users own workouts" ON public."workout_prescriptions";
CREATE POLICY "Users own workouts" ON public."workout_prescriptions"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "worn_item_skus_owner" ON public."worn_item_skus";
CREATE POLICY "worn_item_skus_owner" ON public."worn_item_skus"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (((SELECT auth.uid()) = user_id))
  WITH CHECK (((SELECT auth.uid()) = user_id));
