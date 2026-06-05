-- 609 — Adaptive loop hypothesis panel (SAFE slice only).
--
-- Follow-up to mig 599 (adaptive_loop_friction). 599 captures UX friction
-- signals into mommy_ux_signal_log + a hypotheses/outcomes log
-- (mommy_adaptation_log). This slice wires the PANEL that reads an unhandled
-- signal and proposes designs:
--
--   * edge fn `adaptation-hypothesis-panel` — for an unhandled signal, an LLM
--     panel (anthropic + openai) proposes 2-3 alternative designs, ranks them,
--     and RECORDS hypotheses + selected into mommy_adaptation_log. In-scope
--     ideas file a mommy_code_wishes row (source=panel_ideation) at
--     normal/high; large/cross-cutting ideas file a queued wish with a
--     needs-review note in the body.
--   * a scan cron (every 6h) over unhandled signals.
--   * `adaptation_panel_summary()` — SECURITY DEFINER read for the Today card.
--
-- DEFERRED (intentionally NOT built — human-gated): auto-ship-to-mommy-builder.
-- The panel proposes/records/files only; nothing here mutates the builder
-- pipeline. A human/Claude session actions the filed wishes.

-- Helpful index for the "unhandled signal" scan (signals with no adaptation
-- row yet are found by anti-join; keep the adaptation log's signal lookup fast).
CREATE INDEX IF NOT EXISTS mommy_adaptation_log_signal_idx
  ON mommy_adaptation_log(signal_id);

-- ── Today-card summary RPC ──────────────────────────────────────────────
-- SECURITY DEFINER so the single authenticated operator can read the
-- service-role adaptation/wish tables for the pulse card without weakening
-- their RLS. Same pattern as mommy_ideation_summary (mig 314).
CREATE OR REPLACE FUNCTION adaptation_panel_summary()
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_last       TIMESTAMPTZ;
  v_runs_7d    INT;
  v_pending    INT;
  v_unhandled  INT;
  v_recent     JSONB;
  v_wish_counts JSONB;
BEGIN
  SELECT max(created_at) INTO v_last FROM mommy_adaptation_log;

  SELECT count(*) INTO v_runs_7d
    FROM mommy_adaptation_log WHERE created_at > now() - interval '7 days';

  -- Unhandled = UX signals with no adaptation row yet (the panel's backlog).
  SELECT count(*) INTO v_unhandled
    FROM mommy_ux_signal_log s
   WHERE NOT EXISTS (
     SELECT 1 FROM mommy_adaptation_log a WHERE a.signal_id = s.id
   );

  -- Adaptations whose fix hasn't shipped yet (outcome still pending).
  SELECT count(*) INTO v_pending
    FROM mommy_adaptation_log
   WHERE selected_hypothesis IS NOT NULL AND outcome IS NULL;

  -- Most recent 3 proposals (design + scope + whether a wish was filed).
  SELECT COALESCE(jsonb_agg(r ORDER BY (r->>'at') DESC), '[]'::jsonb) INTO v_recent
  FROM (
    SELECT jsonb_build_object(
             'at', a.created_at,
             'design', COALESCE(a.selected_hypothesis->>'design', '(no proposal)'),
             'scope', a.selected_hypothesis->>'scope',
             'needs_review', COALESCE((a.selected_hypothesis->>'needs_review')::boolean, false),
             'wish_filed', a.fix_wish_id IS NOT NULL,
             'outcome', a.outcome
           ) AS r
      FROM mommy_adaptation_log a
     ORDER BY a.created_at DESC
     LIMIT 3
  ) sub;

  -- Status counts for panel_ideation wishes (30d) — same shape the ideation
  -- card uses, so the surfaces read consistently.
  SELECT COALESCE(jsonb_object_agg(status, n), '{}'::jsonb) INTO v_wish_counts
  FROM (
    SELECT status, count(*) AS n
      FROM mommy_code_wishes
     WHERE source = 'panel_ideation' AND created_at > now() - interval '30 days'
     GROUP BY status
  ) wc;

  RETURN jsonb_build_object(
    'last_run_at', v_last,
    'runs_7d', v_runs_7d,
    'unhandled_signals', v_unhandled,
    'pending_adaptations', v_pending,
    'recent', v_recent,
    'wish_counts', v_wish_counts
  );
END;
$fn$;
GRANT EXECUTE ON FUNCTION adaptation_panel_summary() TO authenticated, service_role;

-- ── Scan cron — every 6h, sweep unhandled signals through the panel ─────
DO $$
DECLARE v_url TEXT; v_key TEXT;
BEGIN
  v_url := current_setting('app.settings.supabase_url', true);
  IF v_url IS NULL OR length(v_url) = 0 THEN v_url := 'https://atevwvexapiykchvqvhm.supabase.co'; END IF;
  v_key := current_setting('app.settings.service_role_key', true);

  PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'adaptation-hypothesis-panel-6h';

  PERFORM cron.schedule('adaptation-hypothesis-panel-6h', '20 */6 * * *', format(
    $sql$ SELECT net.http_post(url := %L, body := '{}'::jsonb,
      headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' || %L)); $sql$,
    v_url || '/functions/v1/adaptation-hypothesis-panel', COALESCE(v_key, '')));
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE '609: adaptation panel cron registration skipped: %', SQLERRM;
END $$;
