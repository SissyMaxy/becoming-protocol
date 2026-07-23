-- 706 — pg_cron authenticates to gated edge functions with a controllable secret.
--
-- Root cause (fully diagnosed 2026-07-23): the edge functions' platform
-- SUPABASE_SERVICE_ROLE_KEY holds an old service_role key (digest ae0a99af57d3)
-- that matches NONE of the project's current keys (legacy JWT, publishable, or
-- any of the three sb_secret_ keys) — it was rotated out of the key set but is
-- still valid for the functions' own DB access. pg_cron / invoke_edge_function
-- cannot produce a string that equals it, and SUPABASE_-prefixed secrets are
-- platform-locked from both the Management API and the CLI, so the keys cannot
-- be re-aligned from our side. Result: every requireServiceRole-gated cron
-- function has been 401ing (mig 705 narrowed it; this resolves it).
--
-- Fix: a shared secret WE control. Stored 2026-07-23 as edge-function secret
-- CRON_SHARED_SECRET (non-prefixed → settable) AND in supabase_vault
-- (name 'cron_shared_secret'). The gate (_shared/request-auth.ts) now ALSO
-- accepts it — purely additive, the real service_role check is untouched.
-- invoke_edge_function sends it instead of the unmatchable service key.

CREATE OR REPLACE FUNCTION public.invoke_edge_function(p_function_name text, p_body jsonb DEFAULT '{}'::jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE
  v_url TEXT;
  v_bearer TEXT;
BEGIN
  v_url := current_setting('app.settings.supabase_url', true)
    || '/functions/v1/' || p_function_name;
  IF v_url IS NULL OR v_url = '/functions/v1/' || p_function_name THEN
    v_url := 'https://atevwvexapiykchvqvhm.supabase.co/functions/v1/' || p_function_name;
  END IF;

  -- Cron shared secret (mig 706) is the credential the gate can actually
  -- match. Fall back to the service key only if the shared secret is absent.
  SELECT decrypted_secret INTO v_bearer
    FROM vault.decrypted_secrets WHERE name = 'cron_shared_secret' LIMIT 1;
  IF v_bearer IS NULL THEN
    v_bearer := NULLIF(current_setting('app.settings.service_role_key', true), '');
    IF v_bearer IS NULL THEN
      SELECT decrypted_secret INTO v_bearer
        FROM vault.decrypted_secrets WHERE name = 'service_role_key' LIMIT 1;
    END IF;
  END IF;

  PERFORM net.http_post(
    url := v_url,
    body := p_body,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || COALESCE(v_bearer, '')
    ),
    timeout_milliseconds := 60000
  );
END;
$function$;
