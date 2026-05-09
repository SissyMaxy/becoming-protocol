-- Migration: 344_security_definer_views_to_invoker.sql
-- Pass-2 advisor fix §2: security_definer_view × 16 (ERROR)
--
-- Each public.* view owned by `postgres` was running as the definer, which
-- bypasses caller RLS — anyone with SELECT on the view sees the postgres
-- view of all underlying rows joined together. That was a bug, not intent.
--
-- All 16 views reference tables that have RLS enabled (and after migration 343,
-- the few that didn't now do). Switching to `security_invoker = true` makes
-- each view inherit the caller's RLS context, so a `select * from state_logs`
-- run by user U sees only U's rows.
--
-- View → underlying-table reference map (verified via pg_get_viewdef):
--   bambi_session_summary       → bambi_states                                       (RLS owner)
--   cross_domain_status         → domain_escalation_state                            (RLS owner)
--   effective_gaslight_intensity→ user_state                                          (RLS owner)
--   escalation_overview         → dynamic_levels, domain_escalation_state            (RLS owner)
--   gina_investment_summary     → gina_investments                                   (RLS owner)
--   gina_state_now              → gina_interactions                                  (RLS owner)
--   hrt_progress_summary        → hrt_daily_log, hrt_sober_checkpoints, hrt_pipeline (RLS owner)
--   hrt_state_now               → hrt_booking_attempts                               (RLS owner)
--   penalty_pending_rows        → handler_decrees, handler_outreach_queue,           (RLS owner)
--                                 arousal_touch_tasks
--   permanence_summary          → content_permanence                                 (RLS owner)
--   resistance_effectiveness    → resistance_events                                  (RLS owner)
--   revenue_analytics           → revenue_log                                        (RLS owner)
--   state_logs                  → feminine_state_logs                                (RLS owner)
--   time_ratchets               → user_profiles, service_log                         (RLS owner)
--   trigger_effectiveness       → conditioning_triggers                              (RLS owner)
--   user_autonomous_summary     → content_briefs, content_library, revenue_events,   (RLS owner)
--                                 scheduled_posts, compliance_state, maxy_fund
--
-- ROLLBACK:
--   For each view below:
--     ALTER VIEW public.<viewname> SET (security_invoker = false);
--   That restores the SECURITY DEFINER behaviour (and re-introduces the lint).

BEGIN;

ALTER VIEW public.bambi_session_summary        SET (security_invoker = true);
ALTER VIEW public.cross_domain_status          SET (security_invoker = true);
ALTER VIEW public.effective_gaslight_intensity SET (security_invoker = true);
ALTER VIEW public.escalation_overview          SET (security_invoker = true);
ALTER VIEW public.gina_investment_summary      SET (security_invoker = true);
ALTER VIEW public.gina_state_now               SET (security_invoker = true);
ALTER VIEW public.hrt_progress_summary         SET (security_invoker = true);
ALTER VIEW public.hrt_state_now                SET (security_invoker = true);
ALTER VIEW public.penalty_pending_rows         SET (security_invoker = true);
ALTER VIEW public.permanence_summary           SET (security_invoker = true);
ALTER VIEW public.resistance_effectiveness     SET (security_invoker = true);
ALTER VIEW public.revenue_analytics            SET (security_invoker = true);
ALTER VIEW public.state_logs                   SET (security_invoker = true);
ALTER VIEW public.time_ratchets                SET (security_invoker = true);
ALTER VIEW public.trigger_effectiveness        SET (security_invoker = true);
ALTER VIEW public.user_autonomous_summary      SET (security_invoker = true);

COMMIT;
