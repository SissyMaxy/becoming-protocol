-- 280 — Resolve wishes shipped 2026-05-06 and 2026-05-07.
-- The meta-system's status workflow expects wishes get marked when shipped;
-- otherwise the queue accumulates ghosts and the next session re-considers
-- already-completed work.

-- Wishes from 272 (round 1) — shipped in last session except #2 (user_alias)
-- which remains queued because it's cross-cutting.
UPDATE mommy_code_wishes
SET status = 'shipped',
    shipped_at = '2026-05-06T22:00:00Z',
    shipped_in_commit = 'pending-commit-round1',
    ship_notes = 'Closed in last session: meet evidence loop (273+274+275+meet-evidence-cron). Action chaining schema (273 columns) shipped; response-capture worker shipped 2026-05-07.'
WHERE wish_title IN (
  'Cron + decree generator: meet evidence loop',
  'Compounding actions: parent_action_id + response capture'
)
  AND status = 'queued';

-- Wishes from 277 (round 2) — these all ship in this same session
UPDATE mommy_code_wishes
SET status = 'shipped',
    shipped_at = now(),
    shipped_in_commit = 'pending-commit-round2',
    ship_notes = 'Shipped 2026-05-07: response-capture-cron, surface-guarantor-cron, ambient_check path on mommy-fast-react with 15-min cron, hrt-booking-worker with 9am daily cron.'
WHERE wish_title IN (
  'Response-capture worker: close the action-chain loop',
  'Always-on Mommy: ambient_check every 15 min',
  'HRT booking closer: Plume / Folx / Queermd helper',
  'Today-card surface guarantor: visible-before-penalized enforcer'
)
  AND status = 'queued';

-- The two carryovers (Cross-platform Mommy presence, Voice-pitch lockdown)
-- remain queued at priority='normal' — next session ships them.
-- The user_alias bridge (from 272) also remains queued at priority='high'.
