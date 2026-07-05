-- 669 — self_ref_drift: close the last unshipped indicator gap in the
-- reconditioning engine (DESIGN_RECONDITIONING_ENGINE_2026-07-02.md §5.2).
-- Same honesty-spine trap migs 656/667/668 closed for belief_slider,
-- assoc_latency, and the SM-2 rep scheduler — this time for self_ref_drift.
--
-- `the_man_is_the_costume` (mig 648 seed target) has used indicator_kind =
-- 'self_ref_drift' since the target spine shipped, but nothing has ever
-- computed it: recon-measure's own header comment says so ("self_ref_drift
-- needs an NLP delta over corpus text and is still unshipped — no baseline,
-- no claim"). No baseline means the target can never leave 'proposed' —
-- it has been stuck since the day it was seeded.
--
-- self_reference_analysis (mig 039) already has the exact per-sample shape
-- this indicator needs (maxy_first_person / david_first_person / *_third_person
-- / feminine_pronouns / masculine_pronouns) but no edge function has ever
-- written to it. This migration adds the two dedup columns a scorer needs to
-- run repeatedly without re-scoring the same corpus row twice; the scorer
-- itself (recon-self-ref-scorer) and recon-measure's new self_ref_drift branch
-- ship alongside in this same change, wired into pgcron-setup's JOBS list.

ALTER TABLE self_reference_analysis
  ADD COLUMN IF NOT EXISTS source_table TEXT,
  ADD COLUMN IF NOT EXISTS source_id UUID;

CREATE UNIQUE INDEX IF NOT EXISTS uq_self_reference_analysis_source
  ON self_reference_analysis (user_id, source_table, source_id)
  WHERE source_id IS NOT NULL;
