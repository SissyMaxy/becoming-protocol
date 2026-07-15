-- 671 - security audit remediation: RPC privilege boundaries and OAuth secrets.

BEGIN;

-- Client-callable functions must execute with the caller's role so table RLS
-- remains authoritative even when a caller supplies a UUID argument.
ALTER FUNCTION public.add_to_fund(uuid, numeric, text, text, uuid) SECURITY INVOKER;
ALTER FUNCTION public.can_use_haptics(uuid) SECURITY INVOKER;
ALTER FUNCTION public.complete_ambush(uuid, text, boolean, integer) SECURITY INVOKER;
ALTER FUNCTION public.end_current_streak(uuid, text, uuid) SECURITY INVOKER;
ALTER FUNCTION public.get_haptic_stats(uuid) SECURITY INVOKER;
ALTER FUNCTION public.get_next_brief_number(uuid) SECURITY INVOKER;
ALTER FUNCTION public.get_pending_ambushes(uuid, timestamptz) SECURITY INVOKER;
ALTER FUNCTION public.get_prescribable_templates(uuid, integer, public.task_domain[], public.task_difficulty, integer) SECURITY INVOKER;
ALTER FUNCTION public.increment_session_count(uuid, text) SECURITY INVOKER;
ALTER FUNCTION public.initialize_gina_ladder(uuid) SECURITY INVOKER;
ALTER FUNCTION public.log_service(uuid, text, text, integer, text) SECURITY INVOKER;
ALTER FUNCTION public.record_engagement(uuid) SECURITY INVOKER;
ALTER FUNCTION public.record_gina_milestone(uuid, text) SECURITY INVOKER;
ALTER FUNCTION public.record_template_completion(uuid, uuid, uuid, integer, integer, text) SECURITY INVOKER;
ALTER FUNCTION public.reset_weekly_sessions(uuid) SECURITY INVOKER;
ALTER FUNCTION public.schedule_daily_ambushes(uuid, date) SECURITY INVOKER;
ALTER FUNCTION public.snooze_ambush(uuid) SECURITY INVOKER;
ALTER FUNCTION public.start_new_streak(uuid) SECURITY INVOKER;
ALTER FUNCTION public.pause_ego_mechanic(uuid, text, integer) SECURITY INVOKER;

REVOKE EXECUTE ON FUNCTION public.initialize_autonomous_system(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.reset_gfe_daily_flags() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_noncompliance_streak(uuid, text, boolean) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enqueue_ego_outreach(uuid, text, text, text, text, integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.pause_all_ego_mechanics(uuid, integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.file_obligation(uuid, text, uuid, text, text, text, timestamptz, integer, text, text, text) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.initialize_autonomous_system(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.reset_gfe_daily_flags() TO service_role;
GRANT EXECUTE ON FUNCTION public.update_noncompliance_streak(uuid, text, boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.enqueue_ego_outreach(uuid, text, text, text, text, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.pause_all_ego_mechanics(uuid, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.file_obligation(uuid, text, uuid, text, text, text, timestamptz, integer, text, text, text) TO service_role;

-- OAuth credential rows contain decryptable secrets and must never be readable
-- or writable from the browser, even for the owning user. The authenticated
-- API surfaces only safe status/settings fields.
DROP POLICY IF EXISTS "Users can read own whoop tokens" ON public.whoop_tokens;
DROP POLICY IF EXISTS "Users can update own whoop tokens" ON public.whoop_tokens;
DROP POLICY IF EXISTS "Users own their data" ON public.calendar_credentials;
DROP POLICY IF EXISTS "Users own their data" ON public.outreach_credentials;

REVOKE ALL ON TABLE public.whoop_tokens FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.calendar_credentials FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.outreach_credentials FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.whoop_tokens TO service_role;
GRANT ALL ON TABLE public.calendar_credentials TO service_role;
GRANT ALL ON TABLE public.outreach_credentials TO service_role;

-- Legacy Whoop rows may contain plaintext access and refresh tokens. They
-- cannot be transformed without the application encryption key, so invalidate
-- and erase them. Users reconnect once; all new tokens are AES-256-GCM values.
UPDATE public.whoop_tokens
SET access_token = '',
    refresh_token = '',
    disconnected_at = COALESCE(disconnected_at, now()),
    updated_at = now()
WHERE access_token <> '' OR refresh_token <> '';

COMMIT;

NOTIFY pgrst, 'reload schema';
