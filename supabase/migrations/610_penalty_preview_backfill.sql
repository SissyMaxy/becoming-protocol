-- 610 — Penalty Preview Rail: backfill previews for pre-601 rows.
--
-- REGRESSION FIX. mig 601's auto-preview triggers fire only on INSERT, and
-- penalty_may_apply() is fail-closed (no preview → FALSE). With no backfill,
-- every handler_commitments / handler_decrees / confession_queue row that
-- existed BEFORE 601 deployed would have its penalty silently gated off
-- forever once enforced. These rows were created + surfaced under the old
-- rules, so grandfather them: insert a preview with surfaced_at = created_at
-- (already past grace) → penalty_may_apply() returns TRUE for them, exactly
-- restoring pre-601 enforcement. Idempotent (ON CONFLICT + the unique
-- (source_table, source_id) constraint).

-- Commitments still pending — consequence is the cost.
INSERT INTO penalty_previews (user_id, source_table, source_id, penalty_kind, penalty_copy, deadline, grace_minutes, surfaced_at)
SELECT c.user_id, 'handler_commitments', c.id, 'commitment', c.consequence, c.by_when, 30, c.created_at
  FROM handler_commitments c
 WHERE c.status = 'pending'
   AND c.consequence IS NOT NULL AND length(trim(c.consequence)) > 0
ON CONFLICT (source_table, source_id) DO NOTHING;

-- Decrees still active.
INSERT INTO penalty_previews (user_id, source_table, source_id, penalty_kind, penalty_copy, deadline, grace_minutes, surfaced_at)
SELECT d.user_id, 'handler_decrees', d.id, 'decree', d.consequence, d.deadline, 30, d.created_at
  FROM handler_decrees d
 WHERE d.status = 'active'
   AND d.consequence IS NOT NULL AND length(trim(d.consequence)) > 0
ON CONFLICT (source_table, source_id) DO NOTHING;

-- Confessions not yet answered/missed — miss penalty is a slip.
INSERT INTO penalty_previews (user_id, source_table, source_id, penalty_kind, penalty_copy, deadline, grace_minutes, surfaced_at)
SELECT q.user_id, 'confession_queue', q.id, 'slip', 'miss this confession and it''s a slip on your record.', q.deadline, 30, q.created_at
  FROM confession_queue q
 WHERE q.confessed_at IS NULL AND COALESCE(q.missed, false) = false
   AND q.deadline IS NOT NULL
ON CONFLICT (source_table, source_id) DO NOTHING;
