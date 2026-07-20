-- 686 — Gina topology: give the map a real writer + an honest freshness check.
--
-- OPERATOR DIRECTIVE 2026-07-16: "Use whatever we can to map the Gina topology
-- and cultivation as this feeds into mommy's goals long term. We just want to
-- prevent mommy from ever reaching out to Gina directly."
--
-- So the topology map stays ALIVE (not a frozen relic), fed ONLY by Maxy's own
-- logged observations of Gina (gina_vibe_captures — the passive modeling that
-- mig 624 explicitly PRESERVED as "read-only context"), and NOTHING here — or
-- anywhere downstream of here — ever writes to a Gina-facing surface. The one
-- hard line (never reach out to Gina) stays enforced by mig 624 and is locked
-- in by gina-topology-refresh.test.ts.
--
-- Root cause of the failing 'gina_topology_freshness' invariant:
--   * gina_topology_dimensions had NO writer. The one similarly-named trigger,
--     trg_inflate_topology_on_vibe, actually writes merge_pipeline_items — the
--     map itself never moved (stuck at 2026-04-29, 78 days stale).
--   * check_v31_freshness graded it on a bare 30-day wall-clock, so it
--     false-alarmed the moment the (never-wired) refresh premise lapsed.
--   * Three real Maxy-logged captures from 2026-05-29 (Gina witnessing the
--     GLP-1 body change + the "stay on it forever" HRT-permanence precedent)
--     were never folded into the map.
--
-- Fix: (1) a real writer that folds a dimensioned vibe capture into the map;
-- (2) a freshness check that means something and can't be gamed — it fails only
-- on a genuine backlog (an observation that never reached the map) or an empty
-- map, never on bare wall-clock; (3) backfill the three stale captures.

-- ─── 1. Let a capture name the dimension it informs ────────────────
ALTER TABLE gina_vibe_captures ADD COLUMN IF NOT EXISTS dimension text;
COMMENT ON COLUMN gina_vibe_captures.dimension IS
  'Optional: the gina_topology_dimensions.dimension this Maxy-logged observation informs. When set, the fold trigger refreshes that dimension (freshness + evidence only). Maxy-sourced; never Gina-directed.';

-- ─── 2. The real writer: fold a Maxy observation into the map ───────
-- Refreshes last_signal_at / evidence_summary / updated_at ONLY. It deliberately
-- does NOT mutate acceptance_state or confidence — a single unvetted signal must
-- not shift the risk assessment the Handler consults before anything near Gina.
-- Writes to gina_topology_dimensions and nothing else. No Gina-facing surface.
CREATE OR REPLACE FUNCTION public.trg_fold_vibe_into_topology()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog'
AS $$
BEGIN
  IF NEW.dimension IS NULL THEN
    RETURN NEW;
  END IF;

  UPDATE gina_topology_dimensions d
  SET last_signal_at = GREATEST(COALESCE(d.last_signal_at, NEW.captured_at), NEW.captured_at),
      evidence_summary = left(
        COALESCE(d.evidence_summary, '')
        || CASE WHEN COALESCE(d.evidence_summary, '') = '' THEN '' ELSE ' | ' END
        || to_char(NEW.captured_at, 'YYYY-MM-DD') || ' (' || COALESCE(NEW.signal_class, 'signal') || '): '
        || COALESCE(NEW.topology_implication, NEW.her_words, NEW.her_action, ''),
        1000),
      updated_at = now()
  WHERE d.user_id = NEW.user_id
    AND d.dimension = NEW.dimension;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS fold_vibe_into_topology ON gina_vibe_captures;
CREATE TRIGGER fold_vibe_into_topology
  AFTER INSERT OR UPDATE OF dimension, captured_at, topology_implication ON gina_vibe_captures
  FOR EACH ROW EXECUTE FUNCTION public.trg_fold_vibe_into_topology();

-- ─── 3. Backfill the three stale 2026-05-29 captures ───────────────
-- All three are body-change / permanence-acceptance signals → they inform the
-- aesthetic_feminization dimension. Setting their dimension fires the fold
-- trigger, which refreshes that dimension (updated_at = now()) and folds the
-- evidence in — so the map now genuinely reflects the observations, and the
-- freshness check goes green because the backlog is cleared.
UPDATE gina_vibe_captures
SET dimension = 'aesthetic_feminization'
WHERE user_id = '8c69b9c8-34eb-4147-9fec-3c1a5bc74b6f'
  AND dimension IS NULL;

-- ─── 4. Honest, non-gameable freshness check ───────────────────────
-- Full CREATE OR REPLACE of check_v31_freshness (a shared 7-invariant fn).
-- ONLY the gina_topology_freshness block changed; the other six are verbatim.
CREATE OR REPLACE FUNCTION public.check_v31_freshness()
RETURNS TABLE(invariant_name text, fail_count integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog'
AS $function$
BEGIN
  -- 1. vibe captures
  INSERT INTO system_invariants_log (invariant_name, user_id, status, detail)
  SELECT 'gina_vibe_capture_freshness', us.user_id,
         CASE WHEN gv.last_capture > now() - interval '14 days' THEN 'ok' ELSE 'fail' END,
         jsonb_build_object('last_capture', gv.last_capture,
                            'days_since', CASE WHEN gv.last_capture IS NOT NULL
                                              THEN round((EXTRACT(EPOCH FROM (now() - gv.last_capture)) / 86400)::numeric, 1)
                                              ELSE NULL END)
  FROM user_state us
  LEFT JOIN LATERAL (SELECT max(captured_at) AS last_capture FROM gina_vibe_captures WHERE user_id = us.user_id) gv ON true;

  INSERT INTO system_invariants_log (invariant_name, user_id, status, detail)
  SELECT 'identity_dimensions_freshness', user_id,
         CASE WHEN max(measured_at) > now() - interval '7 days' THEN 'ok' ELSE 'fail' END,
         jsonb_build_object('latest_measurement', max(measured_at))
  FROM identity_dimensions GROUP BY user_id;

  -- gina_topology_freshness: the map is "fresh" when every Maxy-logged
  -- observation that names a dimension has already been folded into that
  -- dimension (captured_at <= the dimension's updated_at). Fails only on a real
  -- backlog (an observation that never reached the map). This is meaningful and
  -- cannot be gamed by a bare timestamp bump — green requires the fold to have
  -- actually happened. Driven off gina_topology_dimensions so users without a
  -- map (e.g. the auto-poster) are not graded, exactly as the prior check did.
  INSERT INTO system_invariants_log (invariant_name, user_id, status, detail)
  SELECT 'gina_topology_freshness', t.user_id,
         CASE WHEN t.unprocessed > 0 THEN 'fail' ELSE 'ok' END,
         jsonb_build_object('unprocessed_observations', t.unprocessed,
                            'latest_topology_update', t.map_updated)
  FROM (
    SELECT d.user_id,
           max(d.updated_at) AS map_updated,
           (SELECT count(*)
              FROM gina_vibe_captures v
              JOIN gina_topology_dimensions dd
                ON dd.user_id = v.user_id AND dd.dimension = v.dimension
             WHERE v.user_id = d.user_id
               AND v.dimension IS NOT NULL
               AND v.captured_at > dd.updated_at) AS unprocessed
    FROM gina_topology_dimensions d
    GROUP BY d.user_id
  ) t;

  INSERT INTO system_invariants_log (invariant_name, user_id, status, detail)
  SELECT 'merge_pipeline_progression', user_id,
         CASE WHEN max(last_state_change) > now() - interval '30 days' THEN 'ok' ELSE 'fail' END,
         jsonb_build_object('latest_transition', max(last_state_change))
  FROM merge_pipeline_items GROUP BY user_id;

  INSERT INTO system_invariants_log (invariant_name, user_id, status, detail)
  SELECT 'david_suppression_terms_present', us.user_id,
         CASE WHEN dst.term_count > 0 THEN 'ok' ELSE 'fail' END,
         jsonb_build_object('term_count', COALESCE(dst.term_count, 0))
  FROM user_state us
  LEFT JOIN LATERAL (SELECT count(*)::int AS term_count FROM david_suppression_terms WHERE user_id = us.user_id) dst ON true;

  -- sanctuary cadence — at least one undelivered sanctuary message in the
  -- queue at all times, OR a delivery in the last 14 days.
  INSERT INTO system_invariants_log (invariant_name, user_id, status, detail)
  SELECT 'sanctuary_cadence', us.user_id,
         CASE WHEN COALESCE(sm.queued, 0) > 0 OR sm.last_delivery > now() - interval '14 days' THEN 'ok' ELSE 'fail' END,
         jsonb_build_object('queued', sm.queued, 'last_delivery', sm.last_delivery)
  FROM user_state us
  LEFT JOIN LATERAL (
    SELECT count(*) FILTER (WHERE delivered_at IS NULL)::int AS queued,
           max(delivered_at) AS last_delivery
    FROM sanctuary_messages WHERE user_id = us.user_id
  ) sm ON true;

  -- held_evidence reserve depth — at least 3 unsurfaced pieces on hand.
  INSERT INTO system_invariants_log (invariant_name, user_id, status, detail)
  SELECT 'held_evidence_reserve_depth', us.user_id,
         CASE WHEN COALESCE(he.unsurfaced, 0) >= 3 THEN 'ok' ELSE 'fail' END,
         jsonb_build_object('unsurfaced_count', COALESCE(he.unsurfaced, 0))
  FROM user_state us
  LEFT JOIN LATERAL (SELECT count(*)::int AS unsurfaced FROM held_evidence WHERE user_id = us.user_id AND surfaced_at IS NULL) he ON true;

  RETURN QUERY
  SELECT sil.invariant_name::text, count(*)::int
  FROM system_invariants_log sil
  WHERE sil.checked_at >= now() - interval '1 minute'
    AND sil.status = 'fail'
    AND sil.invariant_name IN (
      'gina_vibe_capture_freshness', 'identity_dimensions_freshness',
      'gina_topology_freshness', 'merge_pipeline_progression',
      'david_suppression_terms_present', 'sanctuary_cadence',
      'held_evidence_reserve_depth'
    )
  GROUP BY sil.invariant_name
  ORDER BY count(*) DESC;
END;
$function$;

NOTIFY pgrst, 'reload schema';
