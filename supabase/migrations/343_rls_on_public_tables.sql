-- Migration: 343_rls_on_public_tables.sql
-- Pass-2 advisor fix §1: rls_disabled_in_public × 20 (ERROR)
--
-- Each table in public.* with RLS turned off gets:
--   * USER-OWNED   — ENABLE RLS + owner policy on user_id (TO authenticated)
--   * REFERENCE    — ENABLE RLS + read-only policy for all signed-in users
--   * SERVICE-ONLY — ENABLE RLS + service_role policy + COMMENT
--
-- Classification was done by querying the live schema for user_id presence and
-- cross-checking against the design_assets/supabase-advisor-review-2026-04-30.md
-- intent column. Three tables flagged as reference in the doc actually have
-- user_id (david_suppression_terms, gina_topology_dimensions, system_invariants_log)
-- and are scoped owner-only here.
--
-- ROLLBACK:
--   For each table below:
--     ALTER TABLE public.<table> DISABLE ROW LEVEL SECURITY;
--     DROP POLICY IF EXISTS "<policy_name>" ON public.<table>;
--   The previous state was "RLS disabled, no policies" — applying both lines
--   restores it. Note: this re-introduces the advisor lint.

BEGIN;

-- ============================================================================
-- USER-OWNED TABLES (13)
-- Owner-only access for authenticated callers; service_role policy for
-- Handler/cron writes.
-- ============================================================================

-- body_evidence_snapshots — voice/body evidence captures keyed to user_id
ALTER TABLE public.body_evidence_snapshots ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS body_evidence_snapshots_owner ON public.body_evidence_snapshots;
DROP POLICY IF EXISTS body_evidence_snapshots_service ON public.body_evidence_snapshots;
CREATE POLICY body_evidence_snapshots_owner ON public.body_evidence_snapshots
  FOR ALL TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);
CREATE POLICY body_evidence_snapshots_service ON public.body_evidence_snapshots
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- david_suppression_terms — per-user suppression list (has user_id)
ALTER TABLE public.david_suppression_terms ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS david_suppression_terms_owner ON public.david_suppression_terms;
DROP POLICY IF EXISTS david_suppression_terms_service ON public.david_suppression_terms;
CREATE POLICY david_suppression_terms_owner ON public.david_suppression_terms
  FOR ALL TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);
CREATE POLICY david_suppression_terms_service ON public.david_suppression_terms
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- defection_risk_scores — analytic scores per user
ALTER TABLE public.defection_risk_scores ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS defection_risk_scores_owner ON public.defection_risk_scores;
DROP POLICY IF EXISTS defection_risk_scores_service ON public.defection_risk_scores;
CREATE POLICY defection_risk_scores_owner ON public.defection_risk_scores
  FOR ALL TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);
CREATE POLICY defection_risk_scores_service ON public.defection_risk_scores
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- gina_topology_dimensions — per-user dimension state
ALTER TABLE public.gina_topology_dimensions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS gina_topology_dimensions_owner ON public.gina_topology_dimensions;
DROP POLICY IF EXISTS gina_topology_dimensions_service ON public.gina_topology_dimensions;
CREATE POLICY gina_topology_dimensions_owner ON public.gina_topology_dimensions
  FOR ALL TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);
CREATE POLICY gina_topology_dimensions_service ON public.gina_topology_dimensions
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- gina_vibe_captures — per-user qualitative captures
ALTER TABLE public.gina_vibe_captures ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS gina_vibe_captures_owner ON public.gina_vibe_captures;
DROP POLICY IF EXISTS gina_vibe_captures_service ON public.gina_vibe_captures;
CREATE POLICY gina_vibe_captures_owner ON public.gina_vibe_captures
  FOR ALL TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);
CREATE POLICY gina_vibe_captures_service ON public.gina_vibe_captures
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- held_evidence — sensitive admissions/quotes per user
ALTER TABLE public.held_evidence ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS held_evidence_owner ON public.held_evidence;
DROP POLICY IF EXISTS held_evidence_service ON public.held_evidence;
CREATE POLICY held_evidence_owner ON public.held_evidence
  FOR ALL TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);
CREATE POLICY held_evidence_service ON public.held_evidence
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- identity_dimensions — per-user identity scores
ALTER TABLE public.identity_dimensions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS identity_dimensions_owner ON public.identity_dimensions;
DROP POLICY IF EXISTS identity_dimensions_service ON public.identity_dimensions;
CREATE POLICY identity_dimensions_owner ON public.identity_dimensions
  FOR ALL TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);
CREATE POLICY identity_dimensions_service ON public.identity_dimensions
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- journal_entries — sensitive user content
ALTER TABLE public.journal_entries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS journal_entries_owner ON public.journal_entries;
DROP POLICY IF EXISTS journal_entries_service ON public.journal_entries;
CREATE POLICY journal_entries_owner ON public.journal_entries
  FOR ALL TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);
CREATE POLICY journal_entries_service ON public.journal_entries
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- merge_pipeline_items — per-user pipeline state
ALTER TABLE public.merge_pipeline_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS merge_pipeline_items_owner ON public.merge_pipeline_items;
DROP POLICY IF EXISTS merge_pipeline_items_service ON public.merge_pipeline_items;
CREATE POLICY merge_pipeline_items_owner ON public.merge_pipeline_items
  FOR ALL TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);
CREATE POLICY merge_pipeline_items_service ON public.merge_pipeline_items
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- receptive_window_states — per-user receptivity tracking
ALTER TABLE public.receptive_window_states ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS receptive_window_states_owner ON public.receptive_window_states;
DROP POLICY IF EXISTS receptive_window_states_service ON public.receptive_window_states;
CREATE POLICY receptive_window_states_owner ON public.receptive_window_states
  FOR ALL TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);
CREATE POLICY receptive_window_states_service ON public.receptive_window_states
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- sanctuary_messages — per-user generated messages
ALTER TABLE public.sanctuary_messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS sanctuary_messages_owner ON public.sanctuary_messages;
DROP POLICY IF EXISTS sanctuary_messages_service ON public.sanctuary_messages;
CREATE POLICY sanctuary_messages_owner ON public.sanctuary_messages
  FOR ALL TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);
CREATE POLICY sanctuary_messages_service ON public.sanctuary_messages
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- subscriber_polls — per-user content
ALTER TABLE public.subscriber_polls ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS subscriber_polls_owner ON public.subscriber_polls;
DROP POLICY IF EXISTS subscriber_polls_service ON public.subscriber_polls;
CREATE POLICY subscriber_polls_owner ON public.subscriber_polls
  FOR ALL TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);
CREATE POLICY subscriber_polls_service ON public.subscriber_polls
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- system_invariants_log — system audit log keyed to user_id; user can read
-- their own entries, only service_role can write.
ALTER TABLE public.system_invariants_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS system_invariants_log_owner_read ON public.system_invariants_log;
DROP POLICY IF EXISTS system_invariants_log_service ON public.system_invariants_log;
CREATE POLICY system_invariants_log_owner_read ON public.system_invariants_log
  FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id);
CREATE POLICY system_invariants_log_service ON public.system_invariants_log
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ============================================================================
-- REFERENCE TABLES (6)
-- No user_id; intentionally world-readable to authenticated callers.
-- Writes locked to service_role.
-- ============================================================================

-- denial_cycle_shoots — denial-day shoot catalog (reference)
ALTER TABLE public.denial_cycle_shoots ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS denial_cycle_shoots_read ON public.denial_cycle_shoots;
DROP POLICY IF EXISTS denial_cycle_shoots_service ON public.denial_cycle_shoots;
CREATE POLICY denial_cycle_shoots_read ON public.denial_cycle_shoots
  FOR SELECT TO authenticated USING (true);
CREATE POLICY denial_cycle_shoots_service ON public.denial_cycle_shoots
  FOR ALL TO service_role USING (true) WITH CHECK (true);
COMMENT ON TABLE public.denial_cycle_shoots IS 'Reference data — denial-day shoot catalog. World-readable to authenticated; writes service_role only.';

-- denial_day_content_map — day → content mapping (reference)
ALTER TABLE public.denial_day_content_map ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS denial_day_content_map_read ON public.denial_day_content_map;
DROP POLICY IF EXISTS denial_day_content_map_service ON public.denial_day_content_map;
CREATE POLICY denial_day_content_map_read ON public.denial_day_content_map
  FOR SELECT TO authenticated USING (true);
CREATE POLICY denial_day_content_map_service ON public.denial_day_content_map
  FOR ALL TO service_role USING (true) WITH CHECK (true);
COMMENT ON TABLE public.denial_day_content_map IS 'Reference data — denial day to content type mapping. World-readable to authenticated; writes service_role only.';

-- hrt_provider_directory — provider listing (reference)
ALTER TABLE public.hrt_provider_directory ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS hrt_provider_directory_read ON public.hrt_provider_directory;
DROP POLICY IF EXISTS hrt_provider_directory_service ON public.hrt_provider_directory;
CREATE POLICY hrt_provider_directory_read ON public.hrt_provider_directory
  FOR SELECT TO authenticated USING (true);
CREATE POLICY hrt_provider_directory_service ON public.hrt_provider_directory
  FOR ALL TO service_role USING (true) WITH CHECK (true);
COMMENT ON TABLE public.hrt_provider_directory IS 'Reference data — HRT provider directory. World-readable to authenticated; writes service_role only.';

-- scene_templates — scene template catalog (reference)
ALTER TABLE public.scene_templates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS scene_templates_read ON public.scene_templates;
DROP POLICY IF EXISTS scene_templates_service ON public.scene_templates;
CREATE POLICY scene_templates_read ON public.scene_templates
  FOR SELECT TO authenticated USING (true);
CREATE POLICY scene_templates_service ON public.scene_templates
  FOR ALL TO service_role USING (true) WITH CHECK (true);
COMMENT ON TABLE public.scene_templates IS 'Reference data — scene template catalog. World-readable to authenticated; writes service_role only.';

-- shoot_reference_images — pose/shoot reference images (reference)
ALTER TABLE public.shoot_reference_images ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS shoot_reference_images_read ON public.shoot_reference_images;
DROP POLICY IF EXISTS shoot_reference_images_service ON public.shoot_reference_images;
CREATE POLICY shoot_reference_images_read ON public.shoot_reference_images
  FOR SELECT TO authenticated USING (true);
CREATE POLICY shoot_reference_images_service ON public.shoot_reference_images
  FOR ALL TO service_role USING (true) WITH CHECK (true);
COMMENT ON TABLE public.shoot_reference_images IS 'Reference data — pose reference catalog. World-readable to authenticated; writes service_role only.';

-- skill_level_definitions — skill ladder definitions (reference)
ALTER TABLE public.skill_level_definitions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS skill_level_definitions_read ON public.skill_level_definitions;
DROP POLICY IF EXISTS skill_level_definitions_service ON public.skill_level_definitions;
CREATE POLICY skill_level_definitions_read ON public.skill_level_definitions
  FOR SELECT TO authenticated USING (true);
CREATE POLICY skill_level_definitions_service ON public.skill_level_definitions
  FOR ALL TO service_role USING (true) WITH CHECK (true);
COMMENT ON TABLE public.skill_level_definitions IS 'Reference data — skill ladder definitions. World-readable to authenticated; writes service_role only.';

-- ============================================================================
-- SERVICE-ONLY TABLES (1)
-- ============================================================================

-- cron_paused_during_emergency — internal cron pause audit; no end-user value
ALTER TABLE public.cron_paused_during_emergency ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS cron_paused_during_emergency_service ON public.cron_paused_during_emergency;
CREATE POLICY cron_paused_during_emergency_service ON public.cron_paused_during_emergency
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);
COMMENT ON TABLE public.cron_paused_during_emergency IS 'Internal cron-pause audit log. service_role only.';

COMMIT;
