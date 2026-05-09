-- Migration: 345_consolidate_permissive_policies.sql
-- Pass-2 advisor fix §5: multiple_permissive_policies × 1654 (WARN, perf)
--
-- Top 33 tables (the 24-lint maximum group + the 18-lint cluster) collapsed
-- to exactly two policies each: one owner-only (`TO authenticated`) and one
-- service-role bypass (`TO service_role`). The redundant permissive policies
-- are dropped.
--
-- Why this preserves access semantics:
--   * Every existing user-owner policy uses the same predicate
--     `(SELECT auth.uid()) = user_id`. Replacing N copies with 1 copy on the
--     same predicate is a no-op for who-can-read-what.
--   * Existing policies are mounted on role `public`, which expands to anon +
--     authenticated + service_role. Anonymous (unauthenticated) callers
--     already failed the predicate (auth.uid() returns null on `anon`), so
--     restricting to `authenticated` only makes the *role check* explicit;
--     access semantics for actual users do not change.
--   * Service-role keeps full access via the new explicit `_service` policy.
--   * Test-runner integration suite uses authenticated client (anonClient
--     in setup-integration.ts) — verified no test relies on anon writes to
--     these per-user tables.
--
-- 1654 → ~120 expected (33 tables × ~24 lints each cleared, leaves 95 other
-- tables with the same pattern; those will be done in a follow-up migration).
--
-- ROLLBACK:
--   This migration drops named policies and creates new ones. To restore the
--   prior state you would need to re-create the exact policy names listed in
--   each `DROP POLICY IF EXISTS` below — see git blame on the originating
--   migrations. Practically, leave the consolidated policies in place; the
--   semantics are equivalent.

BEGIN;

-- ----------------------------------------------------------------------------
-- Helper: a per-table snippet that drops *all* existing policies and creates
-- the two canonical ones. Each table block below follows the same shape so
-- it's easy to audit.
-- ----------------------------------------------------------------------------

-- arousal_check_ins
DROP POLICY IF EXISTS "Users access own arousal_check_ins" ON public.arousal_check_ins;
DROP POLICY IF EXISTS "Users access own check_ins"        ON public.arousal_check_ins;
DROP POLICY IF EXISTS "Users own arousal_check_ins"       ON public.arousal_check_ins;
DROP POLICY IF EXISTS arousal_check_ins_owner             ON public.arousal_check_ins;
DROP POLICY IF EXISTS arousal_check_ins_service           ON public.arousal_check_ins;
CREATE POLICY arousal_check_ins_owner ON public.arousal_check_ins
  FOR ALL TO authenticated USING ((SELECT auth.uid()) = user_id) WITH CHECK ((SELECT auth.uid()) = user_id);
CREATE POLICY arousal_check_ins_service ON public.arousal_check_ins
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- arousal_commitment_extractions
DROP POLICY IF EXISTS "Users access own arousal_commitment_extractions" ON public.arousal_commitment_extractions;
DROP POLICY IF EXISTS "Users can access own commitments"                ON public.arousal_commitment_extractions;
DROP POLICY IF EXISTS arousal_commitment_extractions_owner              ON public.arousal_commitment_extractions;
DROP POLICY IF EXISTS arousal_commitment_extractions_service            ON public.arousal_commitment_extractions;
CREATE POLICY arousal_commitment_extractions_owner ON public.arousal_commitment_extractions
  FOR ALL TO authenticated USING ((SELECT auth.uid()) = user_id) WITH CHECK ((SELECT auth.uid()) = user_id);
CREATE POLICY arousal_commitment_extractions_service ON public.arousal_commitment_extractions
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- arousal_states
DROP POLICY IF EXISTS "Users access own arousal" ON public.arousal_states;
DROP POLICY IF EXISTS "Users own arousal_states" ON public.arousal_states;
DROP POLICY IF EXISTS arousal_states_owner       ON public.arousal_states;
DROP POLICY IF EXISTS arousal_states_service     ON public.arousal_states;
CREATE POLICY arousal_states_owner ON public.arousal_states
  FOR ALL TO authenticated USING ((SELECT auth.uid()) = user_id) WITH CHECK ((SELECT auth.uid()) = user_id);
CREATE POLICY arousal_states_service ON public.arousal_states
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- body_measurements (had 5 per-cmd + ALL policies)
DROP POLICY IF EXISTS "Users can delete own body measurements" ON public.body_measurements;
DROP POLICY IF EXISTS "Users can insert own body measurements" ON public.body_measurements;
DROP POLICY IF EXISTS "Users can update own body measurements" ON public.body_measurements;
DROP POLICY IF EXISTS "Users can view own body measurements"   ON public.body_measurements;
DROP POLICY IF EXISTS body_measurements_owner                  ON public.body_measurements;
DROP POLICY IF EXISTS body_measurements_service                ON public.body_measurements;
CREATE POLICY body_measurements_owner ON public.body_measurements
  FOR ALL TO authenticated USING ((SELECT auth.uid()) = user_id) WITH CHECK ((SELECT auth.uid()) = user_id);
CREATE POLICY body_measurements_service ON public.body_measurements
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- boundary_dissolution
DROP POLICY IF EXISTS "Users access own boundary_dissolution"     ON public.boundary_dissolution;
DROP POLICY IF EXISTS "Users can access own boundary_dissolution" ON public.boundary_dissolution;
DROP POLICY IF EXISTS boundary_dissolution_owner                  ON public.boundary_dissolution;
DROP POLICY IF EXISTS boundary_dissolution_service                ON public.boundary_dissolution;
CREATE POLICY boundary_dissolution_owner ON public.boundary_dissolution
  FOR ALL TO authenticated USING ((SELECT auth.uid()) = user_id) WITH CHECK ((SELECT auth.uid()) = user_id);
CREATE POLICY boundary_dissolution_service ON public.boundary_dissolution
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- chastity_milestones
DROP POLICY IF EXISTS "Users access own chastity_milestones" ON public.chastity_milestones;
DROP POLICY IF EXISTS "Users access own milestones"          ON public.chastity_milestones;
DROP POLICY IF EXISTS "Users own chastity_milestones"        ON public.chastity_milestones;
DROP POLICY IF EXISTS "Users own milestones"                 ON public.chastity_milestones;
DROP POLICY IF EXISTS chastity_milestones_owner              ON public.chastity_milestones;
DROP POLICY IF EXISTS chastity_milestones_service            ON public.chastity_milestones;
CREATE POLICY chastity_milestones_owner ON public.chastity_milestones
  FOR ALL TO authenticated USING ((SELECT auth.uid()) = user_id) WITH CHECK ((SELECT auth.uid()) = user_id);
CREATE POLICY chastity_milestones_service ON public.chastity_milestones
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- chastity_sessions
DROP POLICY IF EXISTS "Users access own chastity" ON public.chastity_sessions;
DROP POLICY IF EXISTS "Users own chastity"        ON public.chastity_sessions;
DROP POLICY IF EXISTS chastity_sessions_owner     ON public.chastity_sessions;
DROP POLICY IF EXISTS chastity_sessions_service   ON public.chastity_sessions;
CREATE POLICY chastity_sessions_owner ON public.chastity_sessions
  FOR ALL TO authenticated USING ((SELECT auth.uid()) = user_id) WITH CHECK ((SELECT auth.uid()) = user_id);
CREATE POLICY chastity_sessions_service ON public.chastity_sessions
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- content_calendar
DROP POLICY IF EXISTS "Users can manage own content_calendar" ON public.content_calendar;
DROP POLICY IF EXISTS "Users own calendar"                    ON public.content_calendar;
DROP POLICY IF EXISTS content_calendar_owner                  ON public.content_calendar;
DROP POLICY IF EXISTS content_calendar_service                ON public.content_calendar;
CREATE POLICY content_calendar_owner ON public.content_calendar
  FOR ALL TO authenticated USING ((SELECT auth.uid()) = user_id) WITH CHECK ((SELECT auth.uid()) = user_id);
CREATE POLICY content_calendar_service ON public.content_calendar
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- content_escalation
DROP POLICY IF EXISTS "Users access own content_escalation"     ON public.content_escalation;
DROP POLICY IF EXISTS "Users can access own content_escalation" ON public.content_escalation;
DROP POLICY IF EXISTS content_escalation_owner                  ON public.content_escalation;
DROP POLICY IF EXISTS content_escalation_service                ON public.content_escalation;
CREATE POLICY content_escalation_owner ON public.content_escalation
  FOR ALL TO authenticated USING ((SELECT auth.uid()) = user_id) WITH CHECK ((SELECT auth.uid()) = user_id);
CREATE POLICY content_escalation_service ON public.content_escalation
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- daily_arousal_plans
DROP POLICY IF EXISTS "Users access own daily_arousal_plans" ON public.daily_arousal_plans;
DROP POLICY IF EXISTS "Users access own plans"               ON public.daily_arousal_plans;
DROP POLICY IF EXISTS "Users own daily_arousal_plans"        ON public.daily_arousal_plans;
DROP POLICY IF EXISTS daily_arousal_plans_owner              ON public.daily_arousal_plans;
DROP POLICY IF EXISTS daily_arousal_plans_service            ON public.daily_arousal_plans;
CREATE POLICY daily_arousal_plans_owner ON public.daily_arousal_plans
  FOR ALL TO authenticated USING ((SELECT auth.uid()) = user_id) WITH CHECK ((SELECT auth.uid()) = user_id);
CREATE POLICY daily_arousal_plans_service ON public.daily_arousal_plans
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- daily_tasks
DROP POLICY IF EXISTS "Users can delete own daily tasks" ON public.daily_tasks;
DROP POLICY IF EXISTS "Users can insert own daily tasks" ON public.daily_tasks;
DROP POLICY IF EXISTS "Users can update own daily tasks" ON public.daily_tasks;
DROP POLICY IF EXISTS "Users can view own daily tasks"   ON public.daily_tasks;
DROP POLICY IF EXISTS "Users own daily_tasks"            ON public.daily_tasks;
DROP POLICY IF EXISTS daily_tasks_owner                  ON public.daily_tasks;
DROP POLICY IF EXISTS daily_tasks_service                ON public.daily_tasks;
CREATE POLICY daily_tasks_owner ON public.daily_tasks
  FOR ALL TO authenticated USING ((SELECT auth.uid()) = user_id) WITH CHECK ((SELECT auth.uid()) = user_id);
CREATE POLICY daily_tasks_service ON public.daily_tasks
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- escalation_events
DROP POLICY IF EXISTS "Users access own escalation_events"     ON public.escalation_events;
DROP POLICY IF EXISTS "Users can access own escalation_events" ON public.escalation_events;
DROP POLICY IF EXISTS escalation_events_owner                  ON public.escalation_events;
DROP POLICY IF EXISTS escalation_events_service                ON public.escalation_events;
CREATE POLICY escalation_events_owner ON public.escalation_events
  FOR ALL TO authenticated USING ((SELECT auth.uid()) = user_id) WITH CHECK ((SELECT auth.uid()) = user_id);
CREATE POLICY escalation_events_service ON public.escalation_events
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- escalation_state
DROP POLICY IF EXISTS "Users access own escalation_state"     ON public.escalation_state;
DROP POLICY IF EXISTS "Users can access own escalation_state" ON public.escalation_state;
DROP POLICY IF EXISTS escalation_state_owner                  ON public.escalation_state;
DROP POLICY IF EXISTS escalation_state_service                ON public.escalation_state;
CREATE POLICY escalation_state_owner ON public.escalation_state
  FOR ALL TO authenticated USING ((SELECT auth.uid()) = user_id) WITH CHECK ((SELECT auth.uid()) = user_id);
CREATE POLICY escalation_state_service ON public.escalation_state
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- gina_interactions
DROP POLICY IF EXISTS "Users access own gina_interactions"     ON public.gina_interactions;
DROP POLICY IF EXISTS "Users can insert own Gina interactions" ON public.gina_interactions;
DROP POLICY IF EXISTS "Users can view own Gina interactions"   ON public.gina_interactions;
DROP POLICY IF EXISTS gina_interactions_owner                  ON public.gina_interactions;
DROP POLICY IF EXISTS gina_interactions_service                ON public.gina_interactions;
CREATE POLICY gina_interactions_owner ON public.gina_interactions
  FOR ALL TO authenticated USING ((SELECT auth.uid()) = user_id) WITH CHECK ((SELECT auth.uid()) = user_id);
CREATE POLICY gina_interactions_service ON public.gina_interactions
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- gina_profile
DROP POLICY IF EXISTS "Users manage own gina profile" ON public.gina_profile;
DROP POLICY IF EXISTS gp_own                          ON public.gina_profile;
DROP POLICY IF EXISTS gina_profile_owner              ON public.gina_profile;
DROP POLICY IF EXISTS gina_profile_service            ON public.gina_profile;
CREATE POLICY gina_profile_owner ON public.gina_profile
  FOR ALL TO authenticated USING ((SELECT auth.uid()) = user_id) WITH CHECK ((SELECT auth.uid()) = user_id);
CREATE POLICY gina_profile_service ON public.gina_profile
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- gina_voice_samples
DROP POLICY IF EXISTS "Users manage own gina voice samples" ON public.gina_voice_samples;
DROP POLICY IF EXISTS gvs_own                               ON public.gina_voice_samples;
DROP POLICY IF EXISTS gina_voice_samples_owner              ON public.gina_voice_samples;
DROP POLICY IF EXISTS gina_voice_samples_service            ON public.gina_voice_samples;
CREATE POLICY gina_voice_samples_owner ON public.gina_voice_samples
  FOR ALL TO authenticated USING ((SELECT auth.uid()) = user_id) WITH CHECK ((SELECT auth.uid()) = user_id);
CREATE POLICY gina_voice_samples_service ON public.gina_voice_samples
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- goals
DROP POLICY IF EXISTS "Users can delete own goals"        ON public.goals;
DROP POLICY IF EXISTS "Users can insert own goals"        ON public.goals;
DROP POLICY IF EXISTS "Users can manage their own goals"  ON public.goals;
DROP POLICY IF EXISTS "Users can update own goals"        ON public.goals;
DROP POLICY IF EXISTS "Users can view own goals"          ON public.goals;
DROP POLICY IF EXISTS goals_owner                         ON public.goals;
DROP POLICY IF EXISTS goals_service                       ON public.goals;
CREATE POLICY goals_owner ON public.goals
  FOR ALL TO authenticated USING ((SELECT auth.uid()) = user_id) WITH CHECK ((SELECT auth.uid()) = user_id);
CREATE POLICY goals_service ON public.goals
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- handler_daily_plans
DROP POLICY IF EXISTS "Users access own daily_plans"         ON public.handler_daily_plans;
DROP POLICY IF EXISTS "Users access own handler_daily_plans" ON public.handler_daily_plans;
DROP POLICY IF EXISTS handler_daily_plans_owner              ON public.handler_daily_plans;
DROP POLICY IF EXISTS handler_daily_plans_service            ON public.handler_daily_plans;
CREATE POLICY handler_daily_plans_owner ON public.handler_daily_plans
  FOR ALL TO authenticated USING ((SELECT auth.uid()) = user_id) WITH CHECK ((SELECT auth.uid()) = user_id);
CREATE POLICY handler_daily_plans_service ON public.handler_daily_plans
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- handler_escalation_plans
DROP POLICY IF EXISTS "Users access own escalation_plans"         ON public.handler_escalation_plans;
DROP POLICY IF EXISTS "Users access own handler_escalation_plans" ON public.handler_escalation_plans;
DROP POLICY IF EXISTS "Users can view own escalation plans"       ON public.handler_escalation_plans;
DROP POLICY IF EXISTS handler_escalation_plans_owner              ON public.handler_escalation_plans;
DROP POLICY IF EXISTS handler_escalation_plans_service            ON public.handler_escalation_plans;
CREATE POLICY handler_escalation_plans_owner ON public.handler_escalation_plans
  FOR ALL TO authenticated USING ((SELECT auth.uid()) = user_id) WITH CHECK ((SELECT auth.uid()) = user_id);
CREATE POLICY handler_escalation_plans_service ON public.handler_escalation_plans
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- handler_experiments
DROP POLICY IF EXISTS "Users access own experiments"         ON public.handler_experiments;
DROP POLICY IF EXISTS "Users access own handler_experiments" ON public.handler_experiments;
DROP POLICY IF EXISTS "Users can view own experiments"       ON public.handler_experiments;
DROP POLICY IF EXISTS handler_experiments_owner              ON public.handler_experiments;
DROP POLICY IF EXISTS handler_experiments_service            ON public.handler_experiments;
CREATE POLICY handler_experiments_owner ON public.handler_experiments
  FOR ALL TO authenticated USING ((SELECT auth.uid()) = user_id) WITH CHECK ((SELECT auth.uid()) = user_id);
CREATE POLICY handler_experiments_service ON public.handler_experiments
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- handler_pending_tasks
DROP POLICY IF EXISTS "Service role full access"     ON public.handler_pending_tasks;
DROP POLICY IF EXISTS "Users access own pending tasks" ON public.handler_pending_tasks;
DROP POLICY IF EXISTS handler_pending_tasks_owner    ON public.handler_pending_tasks;
DROP POLICY IF EXISTS handler_pending_tasks_service  ON public.handler_pending_tasks;
CREATE POLICY handler_pending_tasks_owner ON public.handler_pending_tasks
  FOR ALL TO authenticated USING ((SELECT auth.uid()) = user_id) WITH CHECK ((SELECT auth.uid()) = user_id);
CREATE POLICY handler_pending_tasks_service ON public.handler_pending_tasks
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- handler_strategies
DROP POLICY IF EXISTS "Users access own handler_strategies" ON public.handler_strategies;
DROP POLICY IF EXISTS "Users access own strategies"         ON public.handler_strategies;
DROP POLICY IF EXISTS "Users can view own handler data"     ON public.handler_strategies;
DROP POLICY IF EXISTS handler_strategies_owner              ON public.handler_strategies;
DROP POLICY IF EXISTS handler_strategies_service            ON public.handler_strategies;
CREATE POLICY handler_strategies_owner ON public.handler_strategies
  FOR ALL TO authenticated USING ((SELECT auth.uid()) = user_id) WITH CHECK ((SELECT auth.uid()) = user_id);
CREATE POLICY handler_strategies_service ON public.handler_strategies
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- handler_user_model
DROP POLICY IF EXISTS "Users access own handler_user_model" ON public.handler_user_model;
DROP POLICY IF EXISTS "Users access own model"              ON public.handler_user_model;
DROP POLICY IF EXISTS handler_user_model_owner              ON public.handler_user_model;
DROP POLICY IF EXISTS handler_user_model_service            ON public.handler_user_model;
CREATE POLICY handler_user_model_owner ON public.handler_user_model
  FOR ALL TO authenticated USING ((SELECT auth.uid()) = user_id) WITH CHECK ((SELECT auth.uid()) = user_id);
CREATE POLICY handler_user_model_service ON public.handler_user_model
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- hrt_pipeline
DROP POLICY IF EXISTS "Users can delete own HRT pipeline" ON public.hrt_pipeline;
DROP POLICY IF EXISTS "Users can insert own HRT pipeline" ON public.hrt_pipeline;
DROP POLICY IF EXISTS "Users can update own HRT pipeline" ON public.hrt_pipeline;
DROP POLICY IF EXISTS "Users can view own HRT pipeline"   ON public.hrt_pipeline;
DROP POLICY IF EXISTS "Users own hrt pipeline"            ON public.hrt_pipeline;
DROP POLICY IF EXISTS hrt_pipeline_owner                  ON public.hrt_pipeline;
DROP POLICY IF EXISTS hrt_pipeline_service                ON public.hrt_pipeline;
CREATE POLICY hrt_pipeline_owner ON public.hrt_pipeline
  FOR ALL TO authenticated USING ((SELECT auth.uid()) = user_id) WITH CHECK ((SELECT auth.uid()) = user_id);
CREATE POLICY hrt_pipeline_service ON public.hrt_pipeline
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- investments
DROP POLICY IF EXISTS "Users access own investments"     ON public.investments;
DROP POLICY IF EXISTS "Users can manage own investments" ON public.investments;
DROP POLICY IF EXISTS investments_owner                  ON public.investments;
DROP POLICY IF EXISTS investments_service                ON public.investments;
CREATE POLICY investments_owner ON public.investments
  FOR ALL TO authenticated USING ((SELECT auth.uid()) = user_id) WITH CHECK ((SELECT auth.uid()) = user_id);
CREATE POLICY investments_service ON public.investments
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- learned_vulnerabilities
DROP POLICY IF EXISTS "Users access own learned_vulnerabilities" ON public.learned_vulnerabilities;
DROP POLICY IF EXISTS "Users access own vulnerabilities"         ON public.learned_vulnerabilities;
DROP POLICY IF EXISTS "Users can view own vulnerabilities"       ON public.learned_vulnerabilities;
DROP POLICY IF EXISTS learned_vulnerabilities_owner              ON public.learned_vulnerabilities;
DROP POLICY IF EXISTS learned_vulnerabilities_service            ON public.learned_vulnerabilities;
CREATE POLICY learned_vulnerabilities_owner ON public.learned_vulnerabilities
  FOR ALL TO authenticated USING ((SELECT auth.uid()) = user_id) WITH CHECK ((SELECT auth.uid()) = user_id);
CREATE POLICY learned_vulnerabilities_service ON public.learned_vulnerabilities
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- planned_edge_sessions
DROP POLICY IF EXISTS "Users access own planned_edge_sessions" ON public.planned_edge_sessions;
DROP POLICY IF EXISTS "Users access own planned_sessions"      ON public.planned_edge_sessions;
DROP POLICY IF EXISTS "Users own planned_edge_sessions"        ON public.planned_edge_sessions;
DROP POLICY IF EXISTS planned_edge_sessions_owner              ON public.planned_edge_sessions;
DROP POLICY IF EXISTS planned_edge_sessions_service            ON public.planned_edge_sessions;
CREATE POLICY planned_edge_sessions_owner ON public.planned_edge_sessions
  FOR ALL TO authenticated USING ((SELECT auth.uid()) = user_id) WITH CHECK ((SELECT auth.uid()) = user_id);
CREATE POLICY planned_edge_sessions_service ON public.planned_edge_sessions
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- planted_triggers
DROP POLICY IF EXISTS "Users access own planted_triggers" ON public.planted_triggers;
DROP POLICY IF EXISTS "Users access own triggers"         ON public.planted_triggers;
DROP POLICY IF EXISTS "Users can view own triggers"       ON public.planted_triggers;
DROP POLICY IF EXISTS planted_triggers_owner              ON public.planted_triggers;
DROP POLICY IF EXISTS planted_triggers_service            ON public.planted_triggers;
CREATE POLICY planted_triggers_owner ON public.planted_triggers
  FOR ALL TO authenticated USING ((SELECT auth.uid()) = user_id) WITH CHECK ((SELECT auth.uid()) = user_id);
CREATE POLICY planted_triggers_service ON public.planted_triggers
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- service_encounters
DROP POLICY IF EXISTS "Users access own service_encounters"     ON public.service_encounters;
DROP POLICY IF EXISTS "Users can access own service_encounters" ON public.service_encounters;
DROP POLICY IF EXISTS service_encounters_owner                  ON public.service_encounters;
DROP POLICY IF EXISTS service_encounters_service                ON public.service_encounters;
CREATE POLICY service_encounters_owner ON public.service_encounters
  FOR ALL TO authenticated USING ((SELECT auth.uid()) = user_id) WITH CHECK ((SELECT auth.uid()) = user_id);
CREATE POLICY service_encounters_service ON public.service_encounters
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- task_completions
DROP POLICY IF EXISTS "Users can delete own completions"      ON public.task_completions;
DROP POLICY IF EXISTS "Users can insert own completions"      ON public.task_completions;
DROP POLICY IF EXISTS "Users can insert own task completions" ON public.task_completions;
DROP POLICY IF EXISTS "Users can update own completions"      ON public.task_completions;
DROP POLICY IF EXISTS "Users can view own completions"        ON public.task_completions;
DROP POLICY IF EXISTS "Users can view own task completions"   ON public.task_completions;
DROP POLICY IF EXISTS "Users own task_completions"            ON public.task_completions;
DROP POLICY IF EXISTS task_completions_owner                  ON public.task_completions;
DROP POLICY IF EXISTS task_completions_service                ON public.task_completions;
CREATE POLICY task_completions_owner ON public.task_completions
  FOR ALL TO authenticated USING ((SELECT auth.uid()) = user_id) WITH CHECK ((SELECT auth.uid()) = user_id);
CREATE POLICY task_completions_service ON public.task_completions
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- twitter_followers_snapshot
DROP POLICY IF EXISTS "Users manage own follower snapshots" ON public.twitter_followers_snapshot;
DROP POLICY IF EXISTS "Users see own followers"             ON public.twitter_followers_snapshot;
DROP POLICY IF EXISTS twitter_followers_snapshot_owner      ON public.twitter_followers_snapshot;
DROP POLICY IF EXISTS twitter_followers_snapshot_service    ON public.twitter_followers_snapshot;
CREATE POLICY twitter_followers_snapshot_owner ON public.twitter_followers_snapshot
  FOR ALL TO authenticated USING ((SELECT auth.uid()) = user_id) WITH CHECK ((SELECT auth.uid()) = user_id);
CREATE POLICY twitter_followers_snapshot_service ON public.twitter_followers_snapshot
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- twitter_follows
DROP POLICY IF EXISTS "Users manage own follows" ON public.twitter_follows;
DROP POLICY IF EXISTS "Users see own follows"    ON public.twitter_follows;
DROP POLICY IF EXISTS twitter_follows_owner      ON public.twitter_follows;
DROP POLICY IF EXISTS twitter_follows_service    ON public.twitter_follows;
CREATE POLICY twitter_follows_owner ON public.twitter_follows
  FOR ALL TO authenticated USING ((SELECT auth.uid()) = user_id) WITH CHECK ((SELECT auth.uid()) = user_id);
CREATE POLICY twitter_follows_service ON public.twitter_follows
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- wardrobe_items (had per-cmd + a service-role auth.role()-check policy)
DROP POLICY IF EXISTS wardrobe_delete_own  ON public.wardrobe_items;
DROP POLICY IF EXISTS wardrobe_insert_own  ON public.wardrobe_items;
DROP POLICY IF EXISTS wardrobe_select_own  ON public.wardrobe_items;
DROP POLICY IF EXISTS wardrobe_update_own  ON public.wardrobe_items;
DROP POLICY IF EXISTS wardrobe_service_all ON public.wardrobe_items;
DROP POLICY IF EXISTS wardrobe_items_owner   ON public.wardrobe_items;
DROP POLICY IF EXISTS wardrobe_items_service ON public.wardrobe_items;
CREATE POLICY wardrobe_items_owner ON public.wardrobe_items
  FOR ALL TO authenticated USING ((SELECT auth.uid()) = user_id) WITH CHECK ((SELECT auth.uid()) = user_id);
CREATE POLICY wardrobe_items_service ON public.wardrobe_items
  FOR ALL TO service_role USING (true) WITH CHECK (true);

COMMIT;
