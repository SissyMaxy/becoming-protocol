-- 581 — gap_audit wish dedup (stop the mommy-self-audit self-flood).
--
-- mommy-self-audit (daily) + capability-gap-aggregator + self-improvement-
-- detector all write source='gap_audit' infra wishes. Their only dedup is a
-- SOFT prompt instruction ("skip overlaps"), so the LLM rewords the same six
-- signals each run and the queue floods — 68 near-duplicate self_strengthening
-- wishes over 16 days (5/10–5/26), zero shipped. Manually rejecting them is
-- futile; they regenerate. This is the architectural backstop (same pattern as
-- mig 314 outreach body-hash and mig 579 source-throttle): a BEFORE INSERT
-- trigger collapses every gap_audit infra wish to ONE OPEN row per canonical
-- theme. A repeat detection bumps resignal_count on the existing open wish
-- instead of inserting a duplicate — so a still-firing real signal accumulates
-- a count (the honest "this is real, fix it" signal) rather than 15 rows.
--
-- Content wishes tagged wish_class='arousal_feature' (the protocol's actual
-- kink mechanics) are NEVER collapsed — only the self-strengthening / redesign
-- infra classes that flood.

ALTER TABLE mommy_code_wishes ADD COLUMN IF NOT EXISTS theme_signature TEXT;
ALTER TABLE mommy_code_wishes ADD COLUMN IF NOT EXISTS resignal_count INT NOT NULL DEFAULT 0;
ALTER TABLE mommy_code_wishes ADD COLUMN IF NOT EXISTS last_resignal_at TIMESTAMPTZ;

-- Canonical theme from an LLM-worded title/body. Keyword-matched, specific
-- before general, so "never-run cron job resurrection system", "cron cascade
-- restart with dependency", and "[REDESIGN] Evaluate cron job architecture"
-- all collapse to 'cron_health'. Unmatched titles fall back to a normalized
-- prefix so at least exact/near rewordings still bound.
CREATE OR REPLACE FUNCTION derive_gap_audit_theme(p_title TEXT, p_body TEXT)
RETURNS TEXT LANGUAGE plpgsql IMMUTABLE AS $fn$
DECLARE t TEXT := lower(coalesce(p_title,'') || ' ' || coalesce(p_body,''));
BEGIN
  IF t ~ '(ci test|test failure|test signature|typecheck|preflight|pattern.?lint|signature auto|auto.?quarantine|auto.?bypass|auto.?skip)' THEN RETURN 'ci_failures'; END IF;
  IF t ~ '(drafter|null.?return|builder run|builder drafter)' THEN RETURN 'builder_drafter'; END IF;
  IF t ~ '(cron|never.?run|bootstrap detector|cascade restart|job resurrection|schedule conflict)' THEN RETURN 'cron_health'; END IF;
  IF t ~ '(supervisor|nudge)' THEN RETURN 'supervisor'; END IF;
  IF t ~ '(stale wish|wish queue|wish auto|queue stagnation|eligibility classif)' THEN RETURN 'stale_wishes'; END IF;
  IF t ~ '(outreach.*(deliver|expire|drain|throttle))' THEN RETURN 'outreach'; END IF;
  IF t ~ '(immersion|clinical leak|voice leak)' THEN RETURN 'immersion'; END IF;
  RETURN 'misc:' || left(regexp_replace(lower(coalesce(p_title,'')), '[^a-z]+', '', 'g'), 24);
END $fn$;

CREATE OR REPLACE FUNCTION dedup_gap_audit_wish()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_theme TEXT;
  v_existing UUID;
BEGIN
  -- Only dedup gap_audit INFRA wishes. arousal_feature content is never
  -- collapsed (those are distinct kink mechanics, not signal duplicates).
  IF NEW.source <> 'gap_audit'
     OR NEW.wish_class IS NOT DISTINCT FROM 'arousal_feature' THEN
    RETURN NEW;
  END IF;

  v_theme := derive_gap_audit_theme(NEW.wish_title, NEW.wish_body);
  NEW.theme_signature := v_theme;

  SELECT id INTO v_existing
    FROM mommy_code_wishes
   WHERE source = 'gap_audit'
     AND theme_signature = v_theme
     AND status IN ('queued','in_progress','needs_review')
   ORDER BY created_at ASC
   LIMIT 1;

  IF v_existing IS NOT NULL THEN
    -- Already an open wish for this theme — bump its resignal counter and
    -- skip the duplicate insert. resignal_count is the "still firing" signal.
    UPDATE mommy_code_wishes
       SET resignal_count = resignal_count + 1,
           last_resignal_at = now()
     WHERE id = v_existing;
    RETURN NULL;
  END IF;

  RETURN NEW;
END $fn$;

DROP TRIGGER IF EXISTS trg_dedup_gap_audit_wish ON mommy_code_wishes;
CREATE TRIGGER trg_dedup_gap_audit_wish
BEFORE INSERT ON mommy_code_wishes
FOR EACH ROW EXECUTE FUNCTION dedup_gap_audit_wish();

-- Hard backstop against concurrent inserts racing past the EXISTS check:
-- at most one OPEN gap_audit wish per theme.
CREATE UNIQUE INDEX IF NOT EXISTS uq_open_gap_audit_theme
  ON mommy_code_wishes (theme_signature)
  WHERE source = 'gap_audit'
    AND theme_signature IS NOT NULL
    AND status IN ('queued','in_progress','needs_review');
