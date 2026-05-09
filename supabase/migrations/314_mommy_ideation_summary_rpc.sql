-- 314 — RPC for the operator-visibility "Mommy Ideation" Today card.
--
-- Both source tables (mommy_ideation_log, mommy_code_wishes) are service-role
-- only by design — the user shouldn't audit Mama's plotting before it ships.
-- But the operator card needs *some* signal so Maxy can see at a glance that
-- the cross-model panel is firing on schedule and that wishes are flowing
-- downstream. This RPC returns the bare-minimum read: last run timestamp,
-- per-provider success summary, the most-recent judged blob (parsed
-- client-side), and aggregate wish-status counts.
--
-- SECURITY DEFINER lets the authenticated browser client read across these
-- service-role tables without weakening their RLS for any other path.

CREATE OR REPLACE FUNCTION public.mommy_ideation_summary()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  last_run RECORD;
  wish_counts JSONB;
  total_runs_7d INT;
BEGIN
  SELECT created_at, panel_summary, judged
    INTO last_run
    FROM mommy_ideation_log
    ORDER BY created_at DESC
    LIMIT 1;

  -- Wish status counts — last 30 days, grouped by status. Scoped to wishes
  -- whose source is panel_ideation so the card reflects ideate→builder flow
  -- specifically (other sources have their own surfaces).
  SELECT jsonb_object_agg(status, n)
    INTO wish_counts
    FROM (
      SELECT status, COUNT(*) AS n
        FROM mommy_code_wishes
       WHERE source = 'panel_ideation'
         AND created_at > now() - interval '30 days'
       GROUP BY status
    ) s;

  -- Run frequency over last 7 days (cadence sanity check)
  SELECT COUNT(*) INTO total_runs_7d
    FROM mommy_ideation_log
   WHERE created_at > now() - interval '7 days';

  RETURN jsonb_build_object(
    'last_run_at', last_run.created_at,
    'panel_summary', last_run.panel_summary,
    'judged_raw', last_run.judged,
    'wish_counts', COALESCE(wish_counts, '{}'::jsonb),
    'runs_7d', total_runs_7d
  );
END
$$;

REVOKE ALL ON FUNCTION public.mommy_ideation_summary() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mommy_ideation_summary() TO authenticated, service_role;
