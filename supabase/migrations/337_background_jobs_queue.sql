-- 337_background_jobs_queue.sql
-- Generic background job queue for the enqueue-and-return-fast refactor of the
-- six edge functions hitting the 150s timeout cap (handler-autonomous,
-- conditioning-engine, send-notifications, device-control, force-processor,
-- handler-revenue). The entrypoints insert a row and return 202; the
-- `job-worker` edge function (driven by a 1-min GitHub Actions cron) drains
-- the queue with a 25s per-handler cap and a 30s overall cap.
--
-- Idempotent. Safe to re-run. Rollback drops the table + RPCs + views.

CREATE TABLE IF NOT EXISTS public.background_jobs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at    timestamptz NOT NULL DEFAULT now(),
  claimed_at    timestamptz,
  completed_at  timestamptz,
  failed_at     timestamptz,
  kind          text NOT NULL,
  payload       jsonb NOT NULL DEFAULT '{}'::jsonb,
  priority      int  NOT NULL DEFAULT 5,
  attempts      int  NOT NULL DEFAULT 0,
  max_attempts  int  NOT NULL DEFAULT 3,
  error         text,
  result        jsonb
);

-- Worker claim path. Partial index over still-queued rows ordered the way the
-- claim CTE selects them; concurrent workers walk the head of this index with
-- FOR UPDATE SKIP LOCKED so they never duplicate claims.
CREATE INDEX IF NOT EXISTS idx_background_jobs_claim
  ON public.background_jobs (priority DESC, created_at)
  WHERE claimed_at IS NULL AND completed_at IS NULL AND failed_at IS NULL;

-- Retention path. Hits when prune_background_jobs() sweeps terminal rows.
CREATE INDEX IF NOT EXISTS idx_background_jobs_terminal
  ON public.background_jobs (COALESCE(completed_at, failed_at))
  WHERE completed_at IS NOT NULL OR failed_at IS NOT NULL;

-- Service-role only: producers (entrypoints) and the consumer (worker) both
-- run as service_role. The UI never reads this table directly — operators look
-- through the views below.
ALTER TABLE public.background_jobs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_role_only_background_jobs" ON public.background_jobs;
CREATE POLICY "service_role_only_background_jobs"
  ON public.background_jobs
  FOR ALL TO public
  USING ((SELECT auth.role()) = 'service_role')
  WITH CHECK ((SELECT auth.role()) = 'service_role');

-- ── RPCs ─────────────────────────────────────────────────────────────────

-- Atomic batch claim. Increments attempts at claim time so retry counts are
-- visible even mid-flight. Workers route by `kind`; on success they call
-- complete_background_job; on transient failure release_background_job (which
-- clears claimed_at so the next worker picks it up); on terminal failure
-- fail_background_job.
CREATE OR REPLACE FUNCTION public.claim_background_jobs(p_limit int DEFAULT 5)
RETURNS SETOF public.background_jobs
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  WITH claimed AS (
    SELECT id
    FROM public.background_jobs
    WHERE claimed_at IS NULL
      AND completed_at IS NULL
      AND failed_at IS NULL
    ORDER BY priority DESC, created_at
    LIMIT p_limit
    FOR UPDATE SKIP LOCKED
  )
  UPDATE public.background_jobs j
  SET claimed_at = now(),
      attempts   = j.attempts + 1
  FROM claimed
  WHERE j.id = claimed.id
  RETURNING j.*;
$$;

CREATE OR REPLACE FUNCTION public.complete_background_job(
  p_id uuid,
  p_result jsonb DEFAULT NULL
) RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  UPDATE public.background_jobs
  SET completed_at = now(),
      result       = p_result,
      error        = NULL
  WHERE id = p_id;
$$;

-- Transient failure: release for retry. Caller should only invoke this when
-- attempts < max_attempts AND the error is recoverable. Clears claimed_at so
-- the next worker can pick the row up.
CREATE OR REPLACE FUNCTION public.release_background_job(
  p_id uuid,
  p_error text
) RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  UPDATE public.background_jobs
  SET claimed_at = NULL,
      error      = p_error
  WHERE id = p_id;
$$;

-- Terminal failure. The row stays out of the queue.
CREATE OR REPLACE FUNCTION public.fail_background_job(
  p_id uuid,
  p_error text
) RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  UPDATE public.background_jobs
  SET failed_at = now(),
      error     = p_error
  WHERE id = p_id;
$$;

-- ── Views ────────────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW public.background_jobs_active AS
SELECT
  id,
  kind,
  priority,
  attempts,
  max_attempts,
  created_at,
  claimed_at,
  CASE WHEN claimed_at IS NULL THEN 'queued' ELSE 'claimed' END AS state,
  EXTRACT(EPOCH FROM (now() - created_at))::int AS age_seconds,
  payload
FROM public.background_jobs
WHERE completed_at IS NULL AND failed_at IS NULL
ORDER BY priority DESC, created_at;

CREATE OR REPLACE VIEW public.background_jobs_failed_24h AS
SELECT
  id,
  kind,
  attempts,
  max_attempts,
  error,
  failed_at,
  created_at,
  payload
FROM public.background_jobs
WHERE failed_at IS NOT NULL
  AND failed_at > now() - interval '24 hours'
ORDER BY failed_at DESC;

GRANT SELECT ON public.background_jobs_active     TO service_role;
GRANT SELECT ON public.background_jobs_failed_24h TO service_role;

-- ── Operator alert ───────────────────────────────────────────────────────
-- Worker calls this after each drain. If failures exceed 10 in 24h the auto-
-- healer (deploy_health_log severity=high) gets alerted and surfaces the
-- backlog to the operator.
CREATE OR REPLACE FUNCTION public.check_background_jobs_health()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_failed_24h int;
  v_active     int;
  v_oldest_age int;
  v_hash       text;
BEGIN
  SELECT count(*) INTO v_failed_24h FROM public.background_jobs_failed_24h;
  SELECT count(*),
         coalesce(max(EXTRACT(EPOCH FROM (now() - created_at)))::int, 0)
    INTO v_active, v_oldest_age
    FROM public.background_jobs
   WHERE completed_at IS NULL AND failed_at IS NULL;

  IF v_failed_24h > 10 THEN
    -- Hash bucketed by date — one alert row per day, not per drain. The unique
    -- index on deploy_health_log is (user_id, hash) and user_id is NULL here
    -- (operator-scoped alert), which makes ON CONFLICT unreliable; explicit
    -- existence check is the durable way to dedup.
    v_hash := 'background_jobs_failed_24h:' || to_char(now(), 'YYYY-MM-DD');
    IF NOT EXISTS (
      SELECT 1 FROM public.deploy_health_log
      WHERE source = 'background_jobs' AND hash = v_hash
    ) THEN
      INSERT INTO public.deploy_health_log (
        source, severity, status, title, detail, hash, raw
      ) VALUES (
        'background_jobs',
        'high',
        'open',
        format('background_jobs failed_24h=%s exceeds threshold (10)', v_failed_24h),
        format('Active queue: %s. Oldest queued: %ss.', v_active, v_oldest_age),
        v_hash,
        jsonb_build_object(
          'failed_24h',         v_failed_24h,
          'active',             v_active,
          'oldest_age_seconds', v_oldest_age
        )
      );
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'failed_24h',         v_failed_24h,
    'active',             v_active,
    'oldest_age_seconds', v_oldest_age
  );
END;
$$;

-- ── Retention ────────────────────────────────────────────────────────────
-- Worker can call this opportunistically; pg_cron registration is left to a
-- subsequent migration to keep this one focused on schema.
CREATE OR REPLACE FUNCTION public.prune_background_jobs()
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE v_deleted int;
BEGIN
  DELETE FROM public.background_jobs
  WHERE (completed_at IS NOT NULL AND completed_at < now() - interval '7 days')
     OR (failed_at    IS NOT NULL AND failed_at    < now() - interval '14 days');
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;

GRANT EXECUTE ON FUNCTION public.claim_background_jobs(int)               TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_background_job(uuid, jsonb)     TO service_role;
GRANT EXECUTE ON FUNCTION public.release_background_job(uuid, text)       TO service_role;
GRANT EXECUTE ON FUNCTION public.fail_background_job(uuid, text)          TO service_role;
GRANT EXECUTE ON FUNCTION public.check_background_jobs_health()           TO service_role;
GRANT EXECUTE ON FUNCTION public.prune_background_jobs()                  TO service_role;

COMMENT ON TABLE public.background_jobs IS
  'Generic queue for enqueue-and-return-fast pattern. Producers (edge entrypoints) insert; consumer (job-worker) claims via claim_background_jobs(N), routes by kind, completes/releases/fails via the matching RPCs.';
COMMENT ON FUNCTION public.claim_background_jobs(int) IS
  'Atomic batch claim. Concurrent workers safe via FOR UPDATE SKIP LOCKED. Increments attempts on claim.';
