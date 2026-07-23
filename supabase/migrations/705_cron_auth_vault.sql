-- 705 — cron auth: invoke_edge_function reads the vault; the 401s end.
--
-- Found 2026-07-23: app.settings.service_role_key was NEVER SET at the
-- database level (and the Management API role cannot ALTER DATABASE SET it),
-- so invoke_edge_function has been sending `Authorization: Bearer ` — empty —
-- on every call. Unguarded functions shrugged (the 792 daily 200s); every
-- requireServiceRole-gated function 401'd silently: pg_cron reports
-- 'succeeded' because the SQL enqueued the HTTP call — the 401 lives only in
-- net._http_response, which nothing watched. Mig 700's outreach-auto restore
-- was 401ing hourly since it shipped.
--
-- LESSON (pairs with the mig 696/700 class): cron 'succeeded' proves the
-- ENQUEUE, not the delivery. Verification of an http cron means reading
-- net._http_response.
--
-- Fix: the service key now lives in supabase_vault (stored 2026-07-23,
-- secret name 'service_role_key'); invoke_edge_function falls back to it
-- when the GUC is absent. SECURITY DEFINER (postgres) may read the vault;
-- callers never see the key — the function returns void.

CREATE OR REPLACE FUNCTION public.invoke_edge_function(p_function_name text, p_body jsonb DEFAULT '{}'::jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE
  v_url TEXT;
  v_service_key TEXT;
BEGIN
  v_url := current_setting('app.settings.supabase_url', true)
    || '/functions/v1/' || p_function_name;

  IF v_url IS NULL OR v_url = '/functions/v1/' || p_function_name THEN
    v_url := 'https://atevwvexapiykchvqvhm.supabase.co/functions/v1/' || p_function_name;
  END IF;

  -- GUC first (the original design), vault as the durable fallback (mig 705).
  v_service_key := NULLIF(current_setting('app.settings.service_role_key', true), '');
  IF v_service_key IS NULL THEN
    SELECT decrypted_secret INTO v_service_key
      FROM vault.decrypted_secrets WHERE name = 'service_role_key' LIMIT 1;
  END IF;

  PERFORM net.http_post(
    url := v_url,
    body := p_body,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || COALESCE(v_service_key, '')
    ),
    timeout_milliseconds := 60000
  );
END;
$function$;

-- Same authenticated-POST capability for EXTERNAL urls (the Whoop cron posts
-- to the Vercel API). Internal-only: only the cron/definer context may run it.
CREATE OR REPLACE FUNCTION public.invoke_authed_url(p_url text, p_body jsonb DEFAULT '{}'::jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE v_service_key TEXT;
BEGIN
  v_service_key := NULLIF(current_setting('app.settings.service_role_key', true), '');
  IF v_service_key IS NULL THEN
    SELECT decrypted_secret INTO v_service_key
      FROM vault.decrypted_secrets WHERE name = 'service_role_key' LIMIT 1;
  END IF;
  PERFORM net.http_post(
    url := p_url,
    body := p_body,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || COALESCE(v_service_key, '')
    ),
    timeout_milliseconds := 60000
  );
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.invoke_authed_url(text, jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.invoke_authed_url(text, jsonb) FROM anon;
REVOKE EXECUTE ON FUNCTION public.invoke_authed_url(text, jsonb) FROM authenticated;
