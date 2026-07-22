-- 704 — obligations: probe fixtures never file costs, orphans purged.
--
-- Found 2026-07-22 during the live-UI validation sweep: PlanView's "what it
-- will cost" rail was showing "denial +5d / not shown yet / overdue" rows —
-- 284 orphaned obligations. Chain: every regression-suite run inserts probe
-- handler_commitments (category 'regression_fixture', consequence 'denial
-- +5d'); the mig-601 auto-file trigger dutifully filed an obligation for
-- each; the suite's cleanup deleted the commitment but (before today's
-- surfaceObligation fix) never knew about the obligations table. Weeks of
-- CI runs = 284 ghost costs on a user surface. No penalty ever fired from
-- them (penalty_may_apply requires surfaced_at, which they lack) — the
-- floor held; the surface leaked.
--
-- Two fixes, per the standing rule (feedback_test_pollution_never_surfaces:
-- skip probe markers AT THE SOURCE, don't rely on cleanup):
--   1. The auto-filer skips regression fixtures.
--   2. Purge existing orphans (obligations whose source row is gone) for
--      both commitment and decree sources.

-- ── 1. Source-level skip ──────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.trg_oblig_file_commitment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Regression fixtures never file a cost (mig 704): the suite's probe
  -- commitments tag themselves category='regression_fixture'; an obligation
  -- filed for one outlives the fixture's cleanup and haunts the cost rail.
  IF NEW.category = 'regression_fixture' THEN RETURN NEW; END IF;

  IF COALESCE(NEW.status, 'pending') = 'pending'
     AND NEW.by_when IS NOT NULL
     AND NEW.consequence IS NOT NULL AND length(trim(NEW.consequence)) > 0 THEN
    PERFORM file_obligation(NEW.user_id, 'handler_commitments', NEW.id, 'commitment',
      NEW.what, NEW.consequence, NEW.by_when, 30, 'internal', 'handler_commitments_autofile', 'normal');
  END IF;
  RETURN NEW;
END;
$function$;

-- ── 2. Orphan purge ───────────────────────────────────────────────────────
DO $$
DECLARE v_commitments int; v_decrees int;
BEGIN
  DELETE FROM public.obligations o
   WHERE o.source_table = 'handler_commitments'
     AND NOT EXISTS (SELECT 1 FROM public.handler_commitments c WHERE c.id = o.source_id);
  GET DIAGNOSTICS v_commitments = ROW_COUNT;

  DELETE FROM public.obligations o
   WHERE o.source_table = 'handler_decrees'
     AND NOT EXISTS (SELECT 1 FROM public.handler_decrees d WHERE d.id = o.source_id);
  GET DIAGNOSTICS v_decrees = ROW_COUNT;

  RAISE NOTICE 'purged orphaned obligations: % commitment-sourced, % decree-sourced', v_commitments, v_decrees;
END $$;
