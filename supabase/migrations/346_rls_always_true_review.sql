-- Migration: 346_rls_always_true_review.sql
-- Pass-2 advisor fix §4: rls_policy_always_true × 22 (WARN)
--
-- Three groups:
--   §4a — Real authorization bugs (4 policies):
--     * task_bank delete/insert/update for `authenticated` with `using (true)` —
--       any signed-in user can mutate the shared task catalog. Lock writes to
--       service_role.
--     * affiliate_events insert with `with check (true)` — anyone (incl. anon)
--       can insert events. Tighten to authenticated with user_id = auth.uid().
--   §4b — Service-role bypass policies (18) — `Service manages X` policies
--     mounted on `public` role with `using(true) with check(true)`. Replace
--     with `TO service_role` so the role itself gates access (no predicate
--     needed). Companion user-read policies retained but scoped TO authenticated.
--
-- ROLLBACK:
--   Each block below shows the policy state it replaced. Restoring the prior
--   state would re-introduce the "always true" lint and (for §4a) a real bug.

BEGIN;

-- ============================================================================
-- §4a — Real bugs
-- ============================================================================

-- task_bank: lock writes to service_role; reads stay open to authenticated
-- (the existing two SELECT policies are duplicates and consolidated into one).
DROP POLICY IF EXISTS "Anyone can read active tasks"        ON public.task_bank;
DROP POLICY IF EXISTS "Task bank readable by authenticated" ON public.task_bank;
DROP POLICY IF EXISTS "Users can delete tasks"              ON public.task_bank;
DROP POLICY IF EXISTS "Users can insert tasks"              ON public.task_bank;
DROP POLICY IF EXISTS "Users can update tasks"              ON public.task_bank;
DROP POLICY IF EXISTS task_bank_read    ON public.task_bank;
DROP POLICY IF EXISTS task_bank_service ON public.task_bank;
CREATE POLICY task_bank_read ON public.task_bank
  FOR SELECT TO authenticated USING (true);
CREATE POLICY task_bank_service ON public.task_bank
  FOR ALL TO service_role USING (true) WITH CHECK (true);
COMMENT ON TABLE public.task_bank IS 'Shared task catalog. Authenticated read-only; only service_role/Handler/cron writes.';

-- affiliate_events: enforce user_id match on insert
DROP POLICY IF EXISTS "Anyone can insert affiliate events"  ON public.affiliate_events;
DROP POLICY IF EXISTS "Users can view own affiliate events" ON public.affiliate_events;
DROP POLICY IF EXISTS affiliate_events_owner   ON public.affiliate_events;
DROP POLICY IF EXISTS affiliate_events_service ON public.affiliate_events;
CREATE POLICY affiliate_events_owner ON public.affiliate_events
  FOR ALL TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);
CREATE POLICY affiliate_events_service ON public.affiliate_events
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ============================================================================
-- §4b — Service-role bypasses (18 tables)
-- For each: drop the always-true `Service manages X` policy and the
-- `Users can <verb> own X` policy(s); recreate as one owner (TO authenticated)
-- and one service (TO service_role).
-- ============================================================================

-- affiliate_links
DROP POLICY IF EXISTS "Service manages affiliate_links" ON public.affiliate_links;
DROP POLICY IF EXISTS "Users read own affiliate_links"  ON public.affiliate_links;
DROP POLICY IF EXISTS affiliate_links_owner   ON public.affiliate_links;
DROP POLICY IF EXISTS affiliate_links_service ON public.affiliate_links;
CREATE POLICY affiliate_links_owner ON public.affiliate_links
  FOR SELECT TO authenticated USING ((SELECT auth.uid()) = user_id);
CREATE POLICY affiliate_links_service ON public.affiliate_links
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ai_generated_content
DROP POLICY IF EXISTS "Service manages ai_generated_content" ON public.ai_generated_content;
DROP POLICY IF EXISTS "Users read own ai_generated_content"  ON public.ai_generated_content;
DROP POLICY IF EXISTS ai_generated_content_owner   ON public.ai_generated_content;
DROP POLICY IF EXISTS ai_generated_content_service ON public.ai_generated_content;
CREATE POLICY ai_generated_content_owner ON public.ai_generated_content
  FOR SELECT TO authenticated USING ((SELECT auth.uid()) = user_id);
CREATE POLICY ai_generated_content_service ON public.ai_generated_content
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- assigned_tasks
DROP POLICY IF EXISTS "Service can manage tasks"     ON public.assigned_tasks;
DROP POLICY IF EXISTS "Users can update own tasks"   ON public.assigned_tasks;
DROP POLICY IF EXISTS "Users can view own tasks"     ON public.assigned_tasks;
DROP POLICY IF EXISTS assigned_tasks_owner   ON public.assigned_tasks;
DROP POLICY IF EXISTS assigned_tasks_service ON public.assigned_tasks;
CREATE POLICY assigned_tasks_owner ON public.assigned_tasks
  FOR ALL TO authenticated
  USING ((SELECT auth.uid()) = user_id) WITH CHECK ((SELECT auth.uid()) = user_id);
CREATE POLICY assigned_tasks_service ON public.assigned_tasks
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- automatic_commitments
DROP POLICY IF EXISTS "Service can manage commitments" ON public.automatic_commitments;
DROP POLICY IF EXISTS "Users can update own commitments" ON public.automatic_commitments;
DROP POLICY IF EXISTS "Users can view own commitments"   ON public.automatic_commitments;
DROP POLICY IF EXISTS automatic_commitments_owner   ON public.automatic_commitments;
DROP POLICY IF EXISTS automatic_commitments_service ON public.automatic_commitments;
CREATE POLICY automatic_commitments_owner ON public.automatic_commitments
  FOR ALL TO authenticated
  USING ((SELECT auth.uid()) = user_id) WITH CHECK ((SELECT auth.uid()) = user_id);
CREATE POLICY automatic_commitments_service ON public.automatic_commitments
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- automatic_decisions
DROP POLICY IF EXISTS "Service can manage decisions"   ON public.automatic_decisions;
DROP POLICY IF EXISTS "Users can view own decisions"   ON public.automatic_decisions;
DROP POLICY IF EXISTS automatic_decisions_owner   ON public.automatic_decisions;
DROP POLICY IF EXISTS automatic_decisions_service ON public.automatic_decisions;
CREATE POLICY automatic_decisions_owner ON public.automatic_decisions
  FOR SELECT TO authenticated USING ((SELECT auth.uid()) = user_id);
CREATE POLICY automatic_decisions_service ON public.automatic_decisions
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- behavioral_directives
DROP POLICY IF EXISTS "Service manages directives"      ON public.behavioral_directives;
DROP POLICY IF EXISTS "Users can view own directives"   ON public.behavioral_directives;
DROP POLICY IF EXISTS behavioral_directives_owner   ON public.behavioral_directives;
DROP POLICY IF EXISTS behavioral_directives_service ON public.behavioral_directives;
CREATE POLICY behavioral_directives_owner ON public.behavioral_directives
  FOR SELECT TO authenticated USING ((SELECT auth.uid()) = user_id);
CREATE POLICY behavioral_directives_service ON public.behavioral_directives
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- engagement_targets
DROP POLICY IF EXISTS "Service manages engagement_targets" ON public.engagement_targets;
DROP POLICY IF EXISTS "Users read own engagement_targets"  ON public.engagement_targets;
DROP POLICY IF EXISTS engagement_targets_owner   ON public.engagement_targets;
DROP POLICY IF EXISTS engagement_targets_service ON public.engagement_targets;
CREATE POLICY engagement_targets_owner ON public.engagement_targets
  FOR SELECT TO authenticated USING ((SELECT auth.uid()) = user_id);
CREATE POLICY engagement_targets_service ON public.engagement_targets
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- gfe_subscribers
DROP POLICY IF EXISTS "Service manages gfe_subscribers" ON public.gfe_subscribers;
DROP POLICY IF EXISTS "Users read own gfe_subscribers"  ON public.gfe_subscribers;
DROP POLICY IF EXISTS gfe_subscribers_owner   ON public.gfe_subscribers;
DROP POLICY IF EXISTS gfe_subscribers_service ON public.gfe_subscribers;
CREATE POLICY gfe_subscribers_owner ON public.gfe_subscribers
  FOR SELECT TO authenticated USING ((SELECT auth.uid()) = user_id);
CREATE POLICY gfe_subscribers_service ON public.gfe_subscribers
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- gina_conversion_state
DROP POLICY IF EXISTS "Service manages conversion state"     ON public.gina_conversion_state;
DROP POLICY IF EXISTS "Users can view own conversion state"  ON public.gina_conversion_state;
DROP POLICY IF EXISTS gina_conversion_state_owner   ON public.gina_conversion_state;
DROP POLICY IF EXISTS gina_conversion_state_service ON public.gina_conversion_state;
CREATE POLICY gina_conversion_state_owner ON public.gina_conversion_state
  FOR SELECT TO authenticated USING ((SELECT auth.uid()) = user_id);
CREATE POLICY gina_conversion_state_service ON public.gina_conversion_state
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- gina_interaction_log
DROP POLICY IF EXISTS "Service manages interaction log"      ON public.gina_interaction_log;
DROP POLICY IF EXISTS "Users can insert own interactions"    ON public.gina_interaction_log;
DROP POLICY IF EXISTS "Users can view own interaction log"   ON public.gina_interaction_log;
DROP POLICY IF EXISTS gina_interaction_log_owner   ON public.gina_interaction_log;
DROP POLICY IF EXISTS gina_interaction_log_service ON public.gina_interaction_log;
CREATE POLICY gina_interaction_log_owner ON public.gina_interaction_log
  FOR ALL TO authenticated
  USING ((SELECT auth.uid()) = user_id) WITH CHECK ((SELECT auth.uid()) = user_id);
CREATE POLICY gina_interaction_log_service ON public.gina_interaction_log
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- gina_missions
DROP POLICY IF EXISTS "Service manages missions"        ON public.gina_missions;
DROP POLICY IF EXISTS "Users can update own missions"   ON public.gina_missions;
DROP POLICY IF EXISTS "Users can view own missions"     ON public.gina_missions;
DROP POLICY IF EXISTS gina_missions_owner   ON public.gina_missions;
DROP POLICY IF EXISTS gina_missions_service ON public.gina_missions;
CREATE POLICY gina_missions_owner ON public.gina_missions
  FOR ALL TO authenticated
  USING ((SELECT auth.uid()) = user_id) WITH CHECK ((SELECT auth.uid()) = user_id);
CREATE POLICY gina_missions_service ON public.gina_missions
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- handler_authority
DROP POLICY IF EXISTS "Service can manage authority"   ON public.handler_authority;
DROP POLICY IF EXISTS "Users can view own authority"   ON public.handler_authority;
DROP POLICY IF EXISTS handler_authority_owner   ON public.handler_authority;
DROP POLICY IF EXISTS handler_authority_service ON public.handler_authority;
CREATE POLICY handler_authority_owner ON public.handler_authority
  FOR SELECT TO authenticated USING ((SELECT auth.uid()) = user_id);
CREATE POLICY handler_authority_service ON public.handler_authority
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- paid_conversations
DROP POLICY IF EXISTS "Service manages paid_conversations" ON public.paid_conversations;
DROP POLICY IF EXISTS "Users read own paid_conversations"  ON public.paid_conversations;
DROP POLICY IF EXISTS paid_conversations_owner   ON public.paid_conversations;
DROP POLICY IF EXISTS paid_conversations_service ON public.paid_conversations;
CREATE POLICY paid_conversations_owner ON public.paid_conversations
  FOR SELECT TO authenticated USING ((SELECT auth.uid()) = user_id);
CREATE POLICY paid_conversations_service ON public.paid_conversations
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- required_interventions
DROP POLICY IF EXISTS "Service can manage interventions"     ON public.required_interventions;
DROP POLICY IF EXISTS "Users can update own interventions"   ON public.required_interventions;
DROP POLICY IF EXISTS "Users can view own interventions"     ON public.required_interventions;
DROP POLICY IF EXISTS required_interventions_owner   ON public.required_interventions;
DROP POLICY IF EXISTS required_interventions_service ON public.required_interventions;
CREATE POLICY required_interventions_owner ON public.required_interventions
  FOR ALL TO authenticated
  USING ((SELECT auth.uid()) = user_id) WITH CHECK ((SELECT auth.uid()) = user_id);
CREATE POLICY required_interventions_service ON public.required_interventions
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- revenue_content_calendar
DROP POLICY IF EXISTS "Service manages revenue_content_calendar" ON public.revenue_content_calendar;
DROP POLICY IF EXISTS "Users read own revenue_content_calendar"  ON public.revenue_content_calendar;
DROP POLICY IF EXISTS revenue_content_calendar_owner   ON public.revenue_content_calendar;
DROP POLICY IF EXISTS revenue_content_calendar_service ON public.revenue_content_calendar;
CREATE POLICY revenue_content_calendar_owner ON public.revenue_content_calendar
  FOR SELECT TO authenticated USING ((SELECT auth.uid()) = user_id);
CREATE POLICY revenue_content_calendar_service ON public.revenue_content_calendar
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- revenue_decisions
DROP POLICY IF EXISTS "Service manages revenue_decisions" ON public.revenue_decisions;
DROP POLICY IF EXISTS "Users read own revenue_decisions"  ON public.revenue_decisions;
DROP POLICY IF EXISTS revenue_decisions_owner   ON public.revenue_decisions;
DROP POLICY IF EXISTS revenue_decisions_service ON public.revenue_decisions;
CREATE POLICY revenue_decisions_owner ON public.revenue_decisions
  FOR SELECT TO authenticated USING ((SELECT auth.uid()) = user_id);
CREATE POLICY revenue_decisions_service ON public.revenue_decisions
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- scheduled_sessions
DROP POLICY IF EXISTS "Service can manage sessions"   ON public.scheduled_sessions;
DROP POLICY IF EXISTS "Users can update own sessions" ON public.scheduled_sessions;
DROP POLICY IF EXISTS "Users can view own sessions"   ON public.scheduled_sessions;
DROP POLICY IF EXISTS scheduled_sessions_owner   ON public.scheduled_sessions;
DROP POLICY IF EXISTS scheduled_sessions_service ON public.scheduled_sessions;
CREATE POLICY scheduled_sessions_owner ON public.scheduled_sessions
  FOR ALL TO authenticated
  USING ((SELECT auth.uid()) = user_id) WITH CHECK ((SELECT auth.uid()) = user_id);
CREATE POLICY scheduled_sessions_service ON public.scheduled_sessions
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- seed_scripts
DROP POLICY IF EXISTS "Service manages scripts"        ON public.seed_scripts;
DROP POLICY IF EXISTS "Users can update own scripts"   ON public.seed_scripts;
DROP POLICY IF EXISTS "Users can view own scripts"     ON public.seed_scripts;
DROP POLICY IF EXISTS seed_scripts_owner   ON public.seed_scripts;
DROP POLICY IF EXISTS seed_scripts_service ON public.seed_scripts;
CREATE POLICY seed_scripts_owner ON public.seed_scripts
  FOR ALL TO authenticated
  USING ((SELECT auth.uid()) = user_id) WITH CHECK ((SELECT auth.uid()) = user_id);
CREATE POLICY seed_scripts_service ON public.seed_scripts
  FOR ALL TO service_role USING (true) WITH CHECK (true);

COMMIT;
