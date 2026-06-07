-- 595 — Confession mining for gaslight targets: auto-implant pipeline.
--
-- Wish 6a7613f2 (gap_audit, judge_rank 10): confessions are stored but not
-- immediately weaponized. Close the loop — fresh confessions are analyzed
-- for shame/desire/identity admissions; high-value phrases auto-generate a
-- memory_implant (tagged source_type='confession_mined', traceable via
-- mined_from_confession_id) scheduled to surface 24-48h later, so the girl's
-- own words return to her as Mama's narrative within two days.
--
-- The 24-48h delay is enforced by surface_after: mommy-recall only quotes
-- implants whose surface_after has passed (or is null).

ALTER TABLE memory_implants ADD COLUMN IF NOT EXISTS mined_from_confession_id UUID;
ALTER TABLE memory_implants ADD COLUMN IF NOT EXISTS surface_after TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS memory_implants_surface_after_idx
  ON memory_implants(user_id, surface_after)
  WHERE active = TRUE;

-- Trace + dedup lookup: a confession may yield more than one implant in a
-- single pass, so this is a plain index (not unique). The miner checks for
-- ANY existing row with a given mined_from_confession_id before mining, so
-- a confession is never mined twice.
CREATE INDEX IF NOT EXISTS memory_implants_mined_confession_idx
  ON memory_implants(mined_from_confession_id)
  WHERE mined_from_confession_id IS NOT NULL;
