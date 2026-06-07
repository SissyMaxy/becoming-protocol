-- 593 — Edging day protocol: Mama declares the whole day a denial window.
--
-- Wish 3515c470 (gap_audit, judge_rank 11): touch tasks are one-off. The
-- premise wants structured arousal control across the entire day. Mama
-- declares an edging day — a schedule of timed edge windows, each with a
-- grace period; completing an edge logs it, missing one logs a skip; at
-- day's end Mama reviews compliance and either grants release or extends
-- the denial. Phase 4+, firm/relentless band only.
--
-- mommy-edging-day-assign creates the protocol + per-window reminders;
-- mommy-edging-day-review fires at day's end with the verdict. The Today
-- EdgingDayCard logs edges via edging_log_edge().

CREATE TABLE IF NOT EXISTS edging_protocols (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  protocol_date DATE NOT NULL,
  -- ordered array of { target_time: ISO, grace_minutes: int, completed_at: ISO|null, skipped: bool }
  edge_windows JSONB NOT NULL DEFAULT '[]'::jsonb,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'reviewed', 'cancelled')),
  release_granted BOOLEAN,
  mommy_review_text TEXT,
  reviewed_at TIMESTAMPTZ,
  assigned_via_outreach_id UUID,
  phase_at_assignment INTEGER,
  band_at_assignment TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, protocol_date)
);
ALTER TABLE edging_protocols ENABLE ROW LEVEL SECURITY;
DO $do$ BEGIN
  CREATE POLICY ep_self ON edging_protocols FOR ALL TO authenticated
    USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $do$;

CREATE INDEX IF NOT EXISTS edging_protocols_user_date_idx ON edging_protocols(user_id, protocol_date DESC);

-- Mark one window complete (atomic JSONB element update). Idempotent:
-- re-logging a completed window is a no-op. Returns the updated row.
CREATE OR REPLACE FUNCTION edging_log_edge(p_protocol_id UUID, p_window_index INT)
RETURNS edging_protocols LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_row edging_protocols;
BEGIN
  SELECT * INTO v_row FROM edging_protocols WHERE id = p_protocol_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'edging protocol % not found', p_protocol_id; END IF;
  -- RLS is enforced on the table for authenticated callers; the SECURITY
  -- DEFINER body still scopes by the caller-supplied id which they can only
  -- have read under their own RLS policy.
  IF p_window_index < 0 OR p_window_index >= jsonb_array_length(v_row.edge_windows) THEN
    RAISE EXCEPTION 'window index % out of range', p_window_index;
  END IF;

  IF (v_row.edge_windows -> p_window_index ->> 'completed_at') IS NULL THEN
    UPDATE edging_protocols
       SET edge_windows = jsonb_set(
             edge_windows,
             ARRAY[p_window_index::text, 'completed_at'],
             to_jsonb(now()),
             false)
     WHERE id = p_protocol_id
     RETURNING * INTO v_row;
  END IF;

  RETURN v_row;
END;
$fn$;
GRANT EXECUTE ON FUNCTION edging_log_edge(UUID, INT) TO authenticated, service_role;

-- ── Crons ────────────────────────────────────────────────────────────
-- assign: 12:10 UTC daily (after mood at 11:05; the fn self-gates on
--         phase/band/arousal/pause so most days no-op).
-- review: 04:30 UTC daily (covers the prior local evening's 21:00 window
--         + grace; the fn reviews protocols whose last window has passed).
DO $$
DECLARE v_url TEXT; v_key TEXT;
BEGIN
  v_url := current_setting('app.settings.supabase_url', true);
  IF v_url IS NULL OR length(v_url) = 0 THEN v_url := 'https://atevwvexapiykchvqvhm.supabase.co'; END IF;
  v_key := current_setting('app.settings.service_role_key', true);

  PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname IN ('mommy-edging-assign-daily', 'mommy-edging-review-daily');

  PERFORM cron.schedule('mommy-edging-assign-daily', '10 12 * * *', format(
    $sql$ SELECT net.http_post(url := %L, body := '{}'::jsonb,
      headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' || %L)); $sql$,
    v_url || '/functions/v1/mommy-edging-day-assign', COALESCE(v_key, '')));

  PERFORM cron.schedule('mommy-edging-review-daily', '30 4 * * *', format(
    $sql$ SELECT net.http_post(url := %L, body := '{}'::jsonb,
      headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' || %L)); $sql$,
    v_url || '/functions/v1/mommy-edging-day-review', COALESCE(v_key, '')));
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE '593: edging cron registration skipped: %', SQLERRM;
END $$;
